import {
  parseContentHash,
  parseNodeId,
  parseRevisionId,
  parseSessionId,
  type ContentHash,
  type NodeId,
  type RevisionId,
  type SessionId,
} from '../../base/ids/identifiers.js';
import { serializeCanonicalJson, type JsonValue } from '../../base/serialization/canonical-json.js';
import { encodeUtf8, sha256Utf8 } from '../../base/hashing/portable-sha-256.js';
import { parseIsoTimestamp, type IClock } from '../../base/time/clock.js';
import {
  MAX_DOCUMENT_READ_CONTEXT_DISTANCE,
  MAX_DOCUMENT_READ_SCOPE_IDS,
} from './document-read-types.js';

export const DEFAULT_DOCUMENT_READ_CURSOR_TTL_SECONDS = 900;
export const MAX_DOCUMENT_READ_CURSOR_TTL_SECONDS = 86_400;
export const MAX_DOCUMENT_READ_CURSOR_CHARACTERS = 1_024;
export const MAX_DOCUMENT_READ_CURSOR_SCOPE_IDS = MAX_DOCUMENT_READ_SCOPE_IDS;
export const MAX_DOCUMENT_READ_CURSOR_CONTEXT_DISTANCE = MAX_DOCUMENT_READ_CONTEXT_DISTANCE;

export const DOCUMENT_READ_CURSOR_SERVICES = [
  'document.get_snapshot',
  'document.get_outline',
  'document.read_nodes',
  'document.read_node_neighborhood',
  'document.search',
  'document.get_changes_since',
  'document.get_diagnostics',
] as const;

export type DocumentReadCursorService = (typeof DOCUMENT_READ_CURSOR_SERVICES)[number];

const MINIMUM_SIGNING_KEY_BYTES = 32;
const MAXIMUM_SIGNING_KEY_BYTES = 128;
const CURSOR_VERSION = 1;
const SIGNATURE_BYTES = 32;
const KEYED_HASH_PREFIX = 'NIRECO\0DOCUMENT_READ_CURSOR\0V1\0';
const BASE64_URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/u;

export interface DocumentReadCursorScope {
  readonly allowedSectionIds?: readonly NodeId[];
  readonly allowedNodeIds?: readonly NodeId[];
  readonly allowReadOutsideScopeForContext?: boolean;
  readonly maxContextDistance?: number;
}

export interface DocumentReadCursorBinding {
  readonly sessionId: SessionId;
  readonly revisionId: RevisionId;
  readonly service: DocumentReadCursorService;
  readonly scope: DocumentReadCursorScope;
  readonly queryHash: ContentHash;
}

export interface DocumentReadCursorIssueInput extends DocumentReadCursorBinding {
  /** A logical page offset, never a storage row identifier. */
  readonly position: number;
}

export type DocumentReadCursorIssueResult =
  | {
      readonly type: 'ok';
      readonly cursor: string;
    }
  | {
      readonly type: 'error';
      readonly reason: 'invalid-binding' | 'clock-invalid' | 'cursor-too-large';
    };

export type DocumentReadCursorDecodeResult =
  | {
      readonly type: 'ok';
      readonly position: number;
    }
  | {
      readonly type: 'error';
      readonly reason: 'cursor-too-large' | 'invalid-cursor' | 'cursor-expired' | 'clock-invalid';
    };

export interface DocumentReadCursorAdapter {
  issue(input: DocumentReadCursorIssueInput): DocumentReadCursorIssueResult;
  decode(cursor: unknown, expected: DocumentReadCursorBinding): DocumentReadCursorDecodeResult;
}

export interface PortableDocumentReadCursorCodecOptions {
  readonly clock: IClock;
  /** Server-held, cryptographically random key material. It is copied and never serialized. */
  readonly signingKey: Uint8Array;
  readonly ttlSeconds?: number;
}

interface ParsedIssueInput {
  readonly bindingCanonicalJson: string;
  readonly position: number;
}

interface CursorPayload {
  readonly b: string;
  readonly e: number;
  readonly p: number;
  readonly v: typeof CURSOR_VERSION;
}

type ParsedCursorPayloadResult =
  | {
      readonly type: 'ok';
      readonly value: CursorPayload;
    }
  | {
      readonly type: 'error';
    };

type PlainRecordCaptureResult =
  | {
      readonly type: 'ok';
      readonly values: ReadonlyMap<string, unknown>;
    }
  | {
      readonly type: 'error';
    };

type NormalizedScopeResult =
  | {
      readonly type: 'ok';
      readonly value: JsonValue;
    }
  | {
      readonly type: 'error';
    };

type NodeIdListResult =
  | {
      readonly type: 'ok';
      readonly value: readonly NodeId[];
    }
  | {
      readonly type: 'error';
    };

type Base64UrlDecodeResult =
  | {
      readonly type: 'ok';
      readonly value: Uint8Array;
    }
  | {
      readonly type: 'error';
    };

type DataPropertyCaptureResult =
  | {
      readonly type: 'ok';
      readonly value: unknown;
    }
  | {
      readonly type: 'error';
    };

/**
 * Portable authenticated cursor codec for revision-bound document reads.
 *
 * The token is one canonical base64url value. Its authenticated body contains
 * only a keyed digest of Session, Revision, service, Scope and query hash, plus the
 * logical page position and expiry. Consequently a decoded token cannot expose
 * a storage primary key or the caller's authorized node set.
 *
 * The existing portable SHA-256 implementation does not expose HMAC. This codec
 * therefore freezes a dedicated, double-hash keyed profile with independent
 * BINDING and AUTHENTICATION domains and explicit UTF-8 length prefixes. This
 * prevents prefix/suffix ambiguity and SHA-256 length-extension attacks. On
 * verification, the exact received body is authenticated first and the parsed
 * payload must then reproduce that same canonical body. Appending SHA-256
 * padding or attacker-chosen suffix bytes therefore cannot produce an accepted
 * preimage. The server-held key must contain at least 256 bits of key material.
 */
export class PortableDocumentReadCursorCodec implements DocumentReadCursorAdapter {
  readonly #clock: IClock;
  readonly #keyHex: string;
  readonly #ttlMilliseconds: number;

  constructor(options: PortableDocumentReadCursorCodecOptions) {
    this.#clock = options.clock;
    this.#keyHex = captureSigningKey(options.signingKey);
    this.#ttlMilliseconds = parseTtlMilliseconds(options.ttlSeconds);
  }

  issue(input: unknown): DocumentReadCursorIssueResult {
    const parsed = parseIssueInput(input);
    if (parsed.type === 'error') {
      return issueError('invalid-binding');
    }

    const now = readClockMilliseconds(this.#clock);
    if (now === undefined) {
      return issueError('clock-invalid');
    }
    const expiresAt = now + this.#ttlMilliseconds;
    if (!Number.isSafeInteger(expiresAt)) {
      return issueError('clock-invalid');
    }

    const body = serializeCanonicalJson({
      b: keyedSha256('BINDING', this.#keyHex, parsed.value.bindingCanonicalJson),
      e: expiresAt,
      p: parsed.value.position,
      v: CURSOR_VERSION,
    });
    if (body.type === 'error') {
      return issueError('invalid-binding');
    }

    const bodyBytes = encodeAscii(body.value);
    if (bodyBytes === undefined) {
      return issueError('invalid-binding');
    }
    const signature = hexToBytes(keyedSha256('AUTHENTICATION', this.#keyHex, body.value));
    const framed = new Uint8Array(signature.length + bodyBytes.length);
    framed.set(signature);
    framed.set(bodyBytes, signature.length);
    const cursor = encodeBase64Url(framed);
    return cursor.length <= MAX_DOCUMENT_READ_CURSOR_CHARACTERS
      ? { type: 'ok', cursor }
      : issueError('cursor-too-large');
  }

  decode(cursor: unknown, expected: DocumentReadCursorBinding): DocumentReadCursorDecodeResult {
    if (typeof cursor !== 'string') {
      return decodeError('invalid-cursor');
    }
    if (cursor.length > MAX_DOCUMENT_READ_CURSOR_CHARACTERS) {
      return decodeError('cursor-too-large');
    }

    const framed = decodeBase64Url(cursor);
    if (framed.type === 'error' || framed.value.length <= SIGNATURE_BYTES) {
      return decodeError('invalid-cursor');
    }
    const signature = framed.value.slice(0, SIGNATURE_BYTES);
    const body = decodeAscii(framed.value.subarray(SIGNATURE_BYTES));
    if (body === undefined) {
      return decodeError('invalid-cursor');
    }
    const expectedSignature = hexToBytes(keyedSha256('AUTHENTICATION', this.#keyHex, body));
    if (!constantTimeEqual(signature, expectedSignature)) {
      return decodeError('invalid-cursor');
    }

    const payload = parseCursorPayload(body);
    if (payload.type === 'error') {
      return decodeError('invalid-cursor');
    }
    const binding = canonicalizeBinding(expected);
    if (binding === undefined) {
      return decodeError('invalid-cursor');
    }
    const expectedBindingDigest = keyedSha256('BINDING', this.#keyHex, binding);
    if (!constantTimeEqual(hexToBytes(payload.value.b), hexToBytes(expectedBindingDigest))) {
      return decodeError('invalid-cursor');
    }

    const now = readClockMilliseconds(this.#clock);
    if (now === undefined) {
      return decodeError('clock-invalid');
    }
    if (now >= payload.value.e) {
      return decodeError('cursor-expired');
    }

    return {
      type: 'ok',
      position: payload.value.p,
    };
  }
}

function parseIssueInput(
  input: unknown,
): { readonly type: 'ok'; readonly value: ParsedIssueInput } | { readonly type: 'error' } {
  const record = capturePlainRecord(
    input,
    ['position', 'queryHash', 'revisionId', 'scope', 'service', 'sessionId'],
    ['position', 'queryHash', 'revisionId', 'scope', 'service', 'sessionId'],
  );
  if (record.type === 'error') {
    return { type: 'error' };
  }
  const position = record.values.get('position');
  if (!isSafeNonnegativeInteger(position)) {
    return { type: 'error' };
  }
  const binding = canonicalizeCapturedBinding(record.values);
  return binding === undefined
    ? { type: 'error' }
    : {
        type: 'ok',
        value: {
          bindingCanonicalJson: binding,
          position,
        },
      };
}

function canonicalizeBinding(binding: unknown): string | undefined {
  const record = capturePlainRecord(
    binding,
    ['queryHash', 'revisionId', 'scope', 'service', 'sessionId'],
    ['queryHash', 'revisionId', 'scope', 'service', 'sessionId'],
  );
  return record.type === 'error' ? undefined : canonicalizeCapturedBinding(record.values);
}

function canonicalizeCapturedBinding(values: ReadonlyMap<string, unknown>): string | undefined {
  const sessionId = parseExpectedSessionId(values.get('sessionId'));
  const revisionId = parseExpectedRevisionId(values.get('revisionId'));
  const queryHash = parseExpectedContentHash(values.get('queryHash'));
  const service = parseExpectedService(values.get('service'));
  const scope = normalizeScope(values.get('scope'));
  if (
    sessionId === undefined ||
    revisionId === undefined ||
    queryHash === undefined ||
    service === undefined ||
    scope.type === 'error'
  ) {
    return undefined;
  }

  const canonical = serializeCanonicalJson({
    queryHash,
    revisionId,
    service,
    scope: scope.value,
    sessionId,
  });
  return canonical.type === 'ok' ? canonical.value : undefined;
}

function normalizeScope(value: unknown): NormalizedScopeResult {
  const record = capturePlainRecord(
    value,
    [
      'allowReadOutsideScopeForContext',
      'allowedNodeIds',
      'allowedSectionIds',
      'maxContextDistance',
    ],
    [],
  );
  if (record.type === 'error') {
    return { type: 'error' };
  }

  const lists = normalizeScopeLists(record.values);
  const scalars = normalizeScopeScalars(record.values);
  if (lists === undefined || scalars === undefined) {
    return { type: 'error' };
  }

  const normalized: Record<string, JsonValue> = {};
  if (scalars.allowOutside !== undefined) {
    normalized['allowReadOutsideScopeForContext'] = scalars.allowOutside;
  }
  if (lists.nodeIds !== undefined) {
    normalized['allowedNodeIds'] = lists.nodeIds;
  }
  if (lists.sectionIds !== undefined) {
    normalized['allowedSectionIds'] = lists.sectionIds;
  }
  if (scalars.maxDistance !== undefined) {
    normalized['maxContextDistance'] = scalars.maxDistance;
  }
  return {
    type: 'ok',
    value: normalized,
  };
}

function normalizeScopeLists(values: ReadonlyMap<string, unknown>):
  | {
      readonly nodeIds: readonly NodeId[] | undefined;
      readonly sectionIds: readonly NodeId[] | undefined;
    }
  | undefined {
  const sectionIds = normalizeOptionalNodeIdList(values, 'allowedSectionIds');
  const nodeIds = normalizeOptionalNodeIdList(values, 'allowedNodeIds');
  if (sectionIds.type === 'error' || nodeIds.type === 'error') {
    return undefined;
  }
  const totalIds = (sectionIds.value?.length ?? 0) + (nodeIds.value?.length ?? 0);
  return totalIds <= MAX_DOCUMENT_READ_CURSOR_SCOPE_IDS
    ? { nodeIds: nodeIds.value, sectionIds: sectionIds.value }
    : undefined;
}

function normalizeScopeScalars(values: ReadonlyMap<string, unknown>):
  | {
      readonly allowOutside: boolean | undefined;
      readonly maxDistance: number | undefined;
    }
  | undefined {
  const allowOutside = values.get('allowReadOutsideScopeForContext');
  if (values.has('allowReadOutsideScopeForContext') && typeof allowOutside !== 'boolean') {
    return undefined;
  }
  const maxDistance = values.get('maxContextDistance');
  if (
    values.has('maxContextDistance') &&
    (!isSafeNonnegativeInteger(maxDistance) ||
      maxDistance > MAX_DOCUMENT_READ_CURSOR_CONTEXT_DISTANCE)
  ) {
    return undefined;
  }
  return {
    allowOutside: typeof allowOutside === 'boolean' ? allowOutside : undefined,
    maxDistance: typeof maxDistance === 'number' ? maxDistance : undefined,
  };
}

function normalizeOptionalNodeIdList(
  values: ReadonlyMap<string, unknown>,
  key: 'allowedNodeIds' | 'allowedSectionIds',
):
  | { readonly type: 'ok'; readonly value: readonly NodeId[] | undefined }
  | { readonly type: 'error' } {
  if (!values.has(key)) {
    return { type: 'ok', value: undefined };
  }
  return captureNodeIdList(values.get(key));
}

function captureNodeIdList(value: unknown): NodeIdListResult {
  try {
    const array = capturePlainArray(value);
    if (array === undefined) {
      return { type: 'error' };
    }
    const ids: NodeId[] = [];
    for (let index = 0; index < array.length; index += 1) {
      const property = captureDataProperty(array.value, String(index));
      const parsed = property.type === 'ok' ? parseExpectedNodeId(property.value) : undefined;
      if (parsed === undefined) {
        return { type: 'error' };
      }
      ids.push(parsed);
    }
    ids.sort(compareStrings);
    if (hasAdjacentDuplicate(ids)) {
      return { type: 'error' };
    }
    return { type: 'ok', value: ids };
  } catch {
    return { type: 'error' };
  }
}

function capturePlainArray(
  value: unknown,
): { readonly value: readonly unknown[]; readonly length: number } | undefined {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return undefined;
  }
  const lengthProperty = captureDataProperty(value, 'length', false);
  const length = lengthProperty.type === 'ok' ? lengthProperty.value : undefined;
  if (!isSafeNonnegativeInteger(length) || length > MAX_DOCUMENT_READ_CURSOR_SCOPE_IDS) {
    return undefined;
  }
  const keys = Reflect.ownKeys(value);
  return keys.length === length + 1 && keys.every((key) => isAllowedArrayKey(key, length))
    ? { value, length }
    : undefined;
}

function capturePlainRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): PlainRecordCaptureResult {
  try {
    if (value === null || typeof value !== 'object') {
      return { type: 'error' };
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { type: 'error' };
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > allowedKeys.length) {
      return { type: 'error' };
    }

    const allowed = new Set(allowedKeys);
    const values = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== 'string' || !allowed.has(key)) {
        return { type: 'error' };
      }
      const property = captureDataProperty(value, key);
      if (property.type === 'error') {
        return { type: 'error' };
      }
      values.set(key, property.value);
    }
    return requiredKeys.every((key) => values.has(key))
      ? { type: 'ok', values }
      : { type: 'error' };
  } catch {
    return { type: 'error' };
  }
}

function captureDataProperty(
  value: object,
  key: string,
  mustBeEnumerable = true,
): DataPropertyCaptureResult {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (
    descriptor === undefined ||
    !('value' in descriptor) ||
    (mustBeEnumerable && !descriptor.enumerable)
  ) {
    return { type: 'error' };
  }
  return { type: 'ok', value: descriptor.value };
}

function parseCursorPayload(body: string): ParsedCursorPayloadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { type: 'error' };
  }
  const record = capturePlainRecord(parsed, ['b', 'e', 'p', 'v'], ['b', 'e', 'p', 'v']);
  if (record.type === 'error') {
    return { type: 'error' };
  }

  const bindingDigest = record.values.get('b');
  const expiresAt = record.values.get('e');
  const position = record.values.get('p');
  const version = record.values.get('v');
  if (
    typeof bindingDigest !== 'string' ||
    !SHA_256_HEX_PATTERN.test(bindingDigest) ||
    !isSafeNonnegativeInteger(expiresAt) ||
    !isSafeNonnegativeInteger(position) ||
    version !== CURSOR_VERSION
  ) {
    return { type: 'error' };
  }

  const value: CursorPayload = {
    b: bindingDigest,
    e: expiresAt,
    p: position,
    v: CURSOR_VERSION,
  };
  const canonical = serializeCanonicalJson(value);
  return canonical.type === 'ok' && canonical.value === body
    ? { type: 'ok', value }
    : { type: 'error' };
}

function keyedSha256(
  purpose: 'BINDING' | 'AUTHENTICATION',
  keyHex: string,
  message: string,
): string {
  const keyByteLength = encodeUtf8(keyHex).length;
  const messageByteLength = encodeUtf8(message).length;
  const inner = sha256Utf8(
    `${KEYED_HASH_PREFIX}${purpose}\0INNER\0${keyByteLength}:${keyHex}\0${messageByteLength}:${message}`,
  );
  const innerByteLength = encodeUtf8(inner).length;
  return sha256Utf8(
    `${KEYED_HASH_PREFIX}${purpose}\0OUTER\0${keyByteLength}:${keyHex}\0${innerByteLength}:${inner}`,
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function captureSigningKey(key: Uint8Array): string {
  if (
    Reflect.getPrototypeOf(key) !== Uint8Array.prototype ||
    key.byteLength < MINIMUM_SIGNING_KEY_BYTES ||
    key.byteLength > MAXIMUM_SIGNING_KEY_BYTES
  ) {
    throw new TypeError('Document read cursor signing key must contain 32 to 128 bytes.');
  }
  const copy = new Uint8Array(key);
  return bytesToHex(copy);
}

function parseTtlMilliseconds(ttlSeconds: number | undefined): number {
  const value = ttlSeconds ?? DEFAULT_DOCUMENT_READ_CURSOR_TTL_SECONDS;
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_DOCUMENT_READ_CURSOR_TTL_SECONDS) {
    throw new TypeError('Document read cursor TTL is outside the supported range.');
  }
  return value * 1_000;
}

function readClockMilliseconds(clock: IClock): number | undefined {
  let timestamp: unknown;
  try {
    timestamp = clock.now();
  } catch {
    return undefined;
  }
  if (
    typeof timestamp !== 'string' ||
    timestamp.length > 64 ||
    parseIsoTimestamp(timestamp).type === 'invalid'
  ) {
    return undefined;
  }
  return parseUtcTimestampMilliseconds(timestamp);
}

function parseUtcTimestampMilliseconds(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/u.exec(value);
  if (match === null) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? '';
  const millisecond = Number(
    `${fraction.slice(0, 3)}${'0'.repeat(Math.max(0, 3 - fraction.length))}`,
  );
  const days = daysSinceUnixEpoch(year, month, day);
  const result =
    days * 86_400_000 + hour * 3_600_000 + minute * 60_000 + second * 1_000 + millisecond;
  return Number.isSafeInteger(result) ? result : undefined;
}

function daysSinceUnixEpoch(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset] ?? 0;
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    result += BASE64_URL_ALPHABET[first >>> 2] ?? '';
    result += BASE64_URL_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >>> 4)] ?? '';
    if (second !== undefined) {
      result += BASE64_URL_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >>> 6)] ?? '';
    }
    if (third !== undefined) {
      result += BASE64_URL_ALPHABET[third & 0x3f] ?? '';
    }
  }
  return result;
}

function decodeBase64Url(value: string): Base64UrlDecodeResult {
  if (value.length === 0 || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    return { type: 'error' };
  }
  const length = Math.floor((value.length * 6) / 8);
  const bytes = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let outputOffset = 0;
  for (const character of value) {
    const digit = BASE64_URL_ALPHABET.indexOf(character);
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[outputOffset] = (buffer >>> bits) & 0xff;
      outputOffset += 1;
      buffer &= (1 << bits) - 1;
    }
  }
  return buffer === 0 && outputOffset === bytes.length && encodeBase64Url(bytes) === value
    ? { type: 'ok', value: bytes }
    : { type: 'error' };
}

function encodeAscii(value: string): Uint8Array | undefined {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) {
      return undefined;
    }
    bytes[index] = code;
  }
  return bytes;
}

function decodeAscii(bytes: Uint8Array): string | undefined {
  let value = '';
  for (const byte of bytes) {
    if (byte > 0x7f) {
      return undefined;
    }
    value += String.fromCharCode(byte);
  }
  return value;
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function isAllowedArrayKey(key: PropertyKey, length: number): boolean {
  if (key === 'length') {
    return true;
  }
  if (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function hasAdjacentDuplicate(values: readonly string[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] === values[index - 1]) {
      return true;
    }
  }
  return false;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseExpectedSessionId(value: unknown): SessionId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseSessionId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function parseExpectedRevisionId(value: unknown): RevisionId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseRevisionId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function parseExpectedNodeId(value: unknown): NodeId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseNodeId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function parseExpectedContentHash(value: unknown): ContentHash | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseContentHash(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function parseExpectedService(value: unknown): DocumentReadCursorService | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  for (const service of DOCUMENT_READ_CURSOR_SERVICES) {
    if (service === value) {
      return service;
    }
  }
  return undefined;
}

function issueError(
  reason: Extract<DocumentReadCursorIssueResult, { readonly type: 'error' }>['reason'],
): DocumentReadCursorIssueResult {
  return { type: 'error', reason };
}

function decodeError(
  reason: Extract<DocumentReadCursorDecodeResult, { readonly type: 'error' }>['reason'],
): DocumentReadCursorDecodeResult {
  return { type: 'error', reason };
}
