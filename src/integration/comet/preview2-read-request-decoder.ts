import { encodeUtf8 } from '../../base/hashing/portable-sha-256.js';
import {
  parseNodeId,
  parseRevisionId,
  parseSessionId,
  type NodeId,
  type RevisionId,
  type SessionId,
} from '../../base/ids/identifiers.js';
import {
  isWellFormedUnicodeString,
  serializeCanonicalJson,
} from '../../base/serialization/canonical-json.js';
import { isDocumentUri } from '../../base/uri/resource-uri.js';
import type { DocumentRef } from '../../model/resource-ref.js';
import type {
  GetDocumentChangesSinceRequest as GeneratedGetDocumentChangesSinceRequest,
  GetDocumentDiagnosticsRequest as GeneratedGetDocumentDiagnosticsRequest,
  GetDocumentHeadRequest as GeneratedGetDocumentHeadRequest,
  GetDocumentOutlineRequest as GeneratedGetDocumentOutlineRequest,
  GetDocumentSnapshotRequest as GeneratedGetDocumentSnapshotRequest,
  ReadDocumentNodeNeighborhoodRequest as GeneratedReadDocumentNodeNeighborhoodRequest,
  ReadDocumentNodesRequest as GeneratedReadDocumentNodesRequest,
  ResolveModelRequest as GeneratedResolveModelRequest,
  SearchDocumentRequest as GeneratedSearchDocumentRequest,
} from '../../../contracts/comet-integration/generated-types/integration.js';

export const DEFAULT_PREVIEW2_READ_HARD_MAX_REQUEST_BYTES = 1_048_576;

export type Preview2ReadRequestDecodeReason = 'schema-invalid' | 'request-too-large';

export type Preview2ReadRequestDecodeResult<TRequest> =
  | {
      readonly type: 'ok';
      readonly value: TRequest;
    }
  | {
      readonly type: 'error';
      readonly reason: Preview2ReadRequestDecodeReason;
    };

export interface Preview2ReadRequestDecoderOptions {
  /** Hard in-process limit over the canonical UTF-8 request representation. */
  readonly hardMaxRequestBytes?: number;
}

type DeepReadonly<TValue> = TValue extends (...arguments_: never[]) => unknown
  ? TValue
  : TValue extends readonly (infer TItem)[]
    ? readonly DeepReadonly<TItem>[]
    : TValue extends object
      ? { readonly [TKey in keyof TValue]: DeepReadonly<TValue[TKey]> }
      : TValue;

interface DecodedDocumentContext {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
}

type DecodedResolveModelRequest = Readonly<
  Omit<DeepReadonly<GeneratedResolveModelRequest>, 'document'> & {
    readonly document: DocumentRef;
  }
>;

type DecodedGetDocumentHeadRequest = Readonly<
  Omit<DeepReadonly<GeneratedGetDocumentHeadRequest>, 'sessionId' | 'document'> &
    DecodedDocumentContext
>;

type DecodedGetDocumentSnapshotRequest = Readonly<
  Omit<DeepReadonly<GeneratedGetDocumentSnapshotRequest>, 'sessionId' | 'document'> &
    DecodedDocumentContext
>;

type DecodedGetDocumentOutlineRequest = Readonly<
  Omit<DeepReadonly<GeneratedGetDocumentOutlineRequest>, 'sessionId' | 'document'> &
    DecodedDocumentContext
>;

type DecodedReadDocumentNodesRequest = Readonly<
  Omit<DeepReadonly<GeneratedReadDocumentNodesRequest>, 'sessionId' | 'document' | 'nodeIds'> &
    DecodedDocumentContext & {
      readonly nodeIds: readonly NodeId[];
    }
>;

type DecodedReadDocumentNodeNeighborhoodRequest = Readonly<
  Omit<
    DeepReadonly<GeneratedReadDocumentNodeNeighborhoodRequest>,
    'sessionId' | 'document' | 'nodeId'
  > &
    DecodedDocumentContext & {
      readonly nodeId: NodeId;
    }
>;

type DecodedSearchDocumentRequest = Readonly<
  Omit<DeepReadonly<GeneratedSearchDocumentRequest>, 'sessionId' | 'document' | 'sectionIds'> &
    DecodedDocumentContext & {
      readonly sectionIds?: readonly NodeId[];
    }
>;

type DecodedGetDocumentChangesSinceRequest = Readonly<
  Omit<
    DeepReadonly<GeneratedGetDocumentChangesSinceRequest>,
    'sessionId' | 'document' | 'sinceRevisionId'
  > &
    DecodedDocumentContext & {
      readonly sinceRevisionId: RevisionId;
    }
>;

type DecodedGetDocumentDiagnosticsRequest = Readonly<
  Omit<DeepReadonly<GeneratedGetDocumentDiagnosticsRequest>, 'sessionId' | 'document'> &
    DecodedDocumentContext
>;

type CapturedRecord = ReadonlyMap<string, unknown>;

type CapturedArray =
  | { readonly type: 'ok'; readonly values: readonly unknown[] }
  | { readonly type: 'invalid' }
  | { readonly type: 'too-large' };

type OptionalValue<TValue> =
  | { readonly type: 'absent' }
  | { readonly type: 'invalid' }
  | { readonly type: 'absolute-too-large' }
  | { readonly type: 'too-large' }
  | { readonly type: 'present'; readonly value: TValue };

interface DecodedPageOptions {
  readonly cursor?: string;
  readonly maxResults?: number;
}

type DecodedSearchFilters = Pick<DecodedSearchDocumentRequest, 'sectionIds' | 'kinds'>;
type DecodedDiagnosticFilters = Pick<DecodedGetDocumentDiagnosticsRequest, 'severities' | 'codes'>;

const SCHEMA_INVALID = Object.freeze({
  type: 'error' as const,
  reason: 'schema-invalid' as const,
});
const REQUEST_TOO_LARGE = Object.freeze({
  type: 'error' as const,
  reason: 'request-too-large' as const,
});
const REQUEST_TOO_LARGE_SENTINEL = Symbol('preview2-field-too-large');
const ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL = Symbol('preview2-absolute-too-large');
type DecodedValue<TValue> =
  | TValue
  | undefined
  | typeof REQUEST_TOO_LARGE_SENTINEL
  | typeof ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const DIAGNOSTIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const ABSOLUTE_PREAUTH_ARRAY_ITEMS = 4_096;
const ABSOLUTE_PREAUTH_QUERY_UTF16_UNITS = 16_384;
const SEARCH_KINDS = new Set(['text', 'citation', 'claim', 'heading'] as const);
const DIAGNOSTIC_SEVERITIES = new Set(['info', 'warning', 'error'] as const);

/**
 * Trusted Preview.2 request boundary for the nine read services.
 *
 * Every public method accepts `unknown`, captures caller-owned objects exactly
 * once through inert own data descriptors, and returns a detached frozen value.
 * A runtime must run this complete decode before Session lookup, capability
 * checks, or any other authorization-sensitive work. Inside the bounded capture
 * window, malformed elements take `schema-invalid` precedence over a field's
 * count limit. Inputs beyond the absolute pre-auth array/string ceiling use
 * `request-too-large` size precedence without enumerating the whole value.
 * Cancellation is deliberately absent from every accepted wire shape and must
 * be supplied to execution out-of-band.
 *
 * This class has no Session/auth dependency by design. Negotiated per-Session
 * limits belong after authorization; `hardMaxRequestBytes` is only the global
 * pre-auth resource ceiling for this in-process boundary.
 */
export class Preview2ReadRequestDecoder {
  readonly #hardMaxRequestBytes: number;

  constructor(options: Preview2ReadRequestDecoderOptions = {}) {
    const hardMaxRequestBytes =
      options.hardMaxRequestBytes ?? DEFAULT_PREVIEW2_READ_HARD_MAX_REQUEST_BYTES;
    if (!Number.isSafeInteger(hardMaxRequestBytes) || hardMaxRequestBytes < 1) {
      throw new RangeError('hardMaxRequestBytes must be a positive safe integer.');
    }
    this.#hardMaxRequestBytes = hardMaxRequestBytes;
  }

  resolveModel(value: unknown): Preview2ReadRequestDecodeResult<DecodedResolveModelRequest> {
    return this.#finish(decodeResolveModel(value));
  }

  getHead(value: unknown): Preview2ReadRequestDecodeResult<DecodedGetDocumentHeadRequest> {
    return this.#finish(decodeGetDocumentHead(value));
  }

  getSnapshot(value: unknown): Preview2ReadRequestDecodeResult<DecodedGetDocumentSnapshotRequest> {
    return this.#finish(decodeGetDocumentSnapshot(value));
  }

  getOutline(value: unknown): Preview2ReadRequestDecodeResult<DecodedGetDocumentOutlineRequest> {
    return this.#finish(decodeGetDocumentOutline(value));
  }

  readNodes(value: unknown): Preview2ReadRequestDecodeResult<DecodedReadDocumentNodesRequest> {
    return this.#finish(decodeReadDocumentNodes(value));
  }

  readNodeNeighborhood(
    value: unknown,
  ): Preview2ReadRequestDecodeResult<DecodedReadDocumentNodeNeighborhoodRequest> {
    return this.#finish(decodeReadDocumentNodeNeighborhood(value));
  }

  search(value: unknown): Preview2ReadRequestDecodeResult<DecodedSearchDocumentRequest> {
    return this.#finish(decodeSearchDocument(value));
  }

  getChangesSince(
    value: unknown,
  ): Preview2ReadRequestDecodeResult<DecodedGetDocumentChangesSinceRequest> {
    return this.#finish(decodeGetDocumentChangesSince(value));
  }

  getDiagnostics(
    value: unknown,
  ): Preview2ReadRequestDecodeResult<DecodedGetDocumentDiagnosticsRequest> {
    return this.#finish(decodeGetDocumentDiagnostics(value));
  }

  #finish<TRequest>(value: DecodedValue<TRequest>): Preview2ReadRequestDecodeResult<TRequest> {
    if (value === REQUEST_TOO_LARGE_SENTINEL || value === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL) {
      return REQUEST_TOO_LARGE;
    }
    if (value === undefined) {
      return SCHEMA_INVALID;
    }
    const serialized = serializeCanonicalJson(value);
    if (serialized.type === 'error') {
      return SCHEMA_INVALID;
    }
    if (encodeUtf8(serialized.value).length > this.#hardMaxRequestBytes) {
      return REQUEST_TOO_LARGE;
    }
    return Object.freeze({ type: 'ok' as const, value });
  }
}

function decodeResolveModel(value: unknown): DecodedResolveModelRequest | undefined {
  const record = captureClosedRecord(value, ['document']);
  const document = record === undefined ? undefined : decodeDocumentRef(record.get('document'));
  return document === undefined ? undefined : Object.freeze({ document });
}

function decodeGetDocumentHead(value: unknown): DecodedGetDocumentHeadRequest | undefined {
  const context = decodeContextRequest(value);
  return context === undefined ? undefined : Object.freeze({ ...context });
}

function decodeGetDocumentSnapshot(value: unknown): DecodedGetDocumentSnapshotRequest | undefined {
  const context = decodeContextRequest(value);
  return context === undefined ? undefined : Object.freeze({ ...context });
}

function decodeContextRequest(value: unknown): DecodedDocumentContext | undefined {
  const record = captureClosedRecord(value, ['sessionId', 'document']);
  return record === undefined ? undefined : decodeDocumentContext(record);
}

function decodeGetDocumentOutline(value: unknown): DecodedValue<DecodedGetDocumentOutlineRequest> {
  const record = captureClosedRecord(
    value,
    ['sessionId', 'document'],
    ['maxDepth', 'cursor', 'maxResults'],
  );
  if (record === undefined) {
    return undefined;
  }
  const context = decodeDocumentContext(record);
  const page = decodePageOptions(record);
  const maxDepth = decodeOptional(record, 'maxDepth', (item) => decodeInteger(item, 0, 256));
  if (page === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (context === undefined || page === undefined || maxDepth.type === 'invalid') {
    return undefined;
  }
  if (page === REQUEST_TOO_LARGE_SENTINEL) {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({
    ...context,
    ...page,
    ...(maxDepth.type === 'present' ? { maxDepth: maxDepth.value } : {}),
  });
}

function decodeReadDocumentNodes(value: unknown): DecodedValue<DecodedReadDocumentNodesRequest> {
  const record = captureClosedRecord(
    value,
    ['sessionId', 'document', 'nodeIds'],
    ['cursor', 'maxResults'],
  );
  if (record === undefined) {
    return undefined;
  }
  const context = decodeDocumentContext(record);
  const page = decodePageOptions(record);
  const nodeIds = decodeUniqueStringArray(record.get('nodeIds'), 1, 1_000, decodeNodeId);
  if (
    page === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL ||
    nodeIds === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL
  ) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (context === undefined || page === undefined || nodeIds === undefined) {
    return undefined;
  }
  if (page === REQUEST_TOO_LARGE_SENTINEL || nodeIds === REQUEST_TOO_LARGE_SENTINEL) {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({ ...context, nodeIds, ...page });
}

function decodeReadDocumentNodeNeighborhood(
  value: unknown,
): DecodedValue<DecodedReadDocumentNodeNeighborhoodRequest> {
  const record = captureClosedRecord(
    value,
    ['sessionId', 'document', 'nodeId', 'beforeBlocks', 'afterBlocks'],
    ['cursor', 'maxResults'],
  );
  if (record === undefined) {
    return undefined;
  }
  const context = decodeDocumentContext(record);
  const page = decodePageOptions(record);
  const nodeId = decodeNodeId(record.get('nodeId'));
  const beforeBlocks = decodeInteger(record.get('beforeBlocks'), 0, 100);
  const afterBlocks = decodeInteger(record.get('afterBlocks'), 0, 100);
  if (page === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (
    context === undefined ||
    page === undefined ||
    nodeId === undefined ||
    beforeBlocks === undefined ||
    afterBlocks === undefined
  ) {
    return undefined;
  }
  if (page === REQUEST_TOO_LARGE_SENTINEL) {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({ ...context, nodeId, beforeBlocks, afterBlocks, ...page });
}

function decodeSearchDocument(value: unknown): DecodedValue<DecodedSearchDocumentRequest> {
  const record = captureClosedRecord(
    value,
    ['sessionId', 'document', 'query'],
    ['sectionIds', 'kinds', 'cursor', 'maxResults'],
  );
  if (record === undefined) {
    return undefined;
  }
  const context = decodeDocumentContext(record);
  const page = decodePageOptions(record);
  const query = decodeSearchQuery(record.get('query'));
  const sectionIds = decodeOptional(record, 'sectionIds', (item) =>
    decodeUniqueStringArray(item, 0, 256, decodeNodeId),
  );
  const kinds = decodeOptional(record, 'kinds', (item) =>
    decodeUniqueStringArray(item, 0, 4, decodeSearchKind),
  );
  const filters = decodeSearchFilters(sectionIds, kinds);
  if (
    page === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL ||
    query === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL ||
    filters === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL
  ) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (context === undefined || page === undefined || query === undefined || filters === undefined) {
    return undefined;
  }
  if (
    page === REQUEST_TOO_LARGE_SENTINEL ||
    query === REQUEST_TOO_LARGE_SENTINEL ||
    filters === REQUEST_TOO_LARGE_SENTINEL
  ) {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({
    ...context,
    query,
    ...filters,
    ...page,
  });
}

function decodeGetDocumentChangesSince(
  value: unknown,
): DecodedValue<DecodedGetDocumentChangesSinceRequest> {
  const record = captureClosedRecord(
    value,
    ['sessionId', 'document', 'sinceRevisionId'],
    ['cursor', 'maxResults'],
  );
  if (record === undefined) {
    return undefined;
  }
  const context = decodeDocumentContext(record);
  const page = decodePageOptions(record);
  const sinceRevisionId = decodeRevisionId(record.get('sinceRevisionId'));
  if (page === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (context === undefined || page === undefined || sinceRevisionId === undefined) {
    return undefined;
  }
  if (page === REQUEST_TOO_LARGE_SENTINEL) {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({ ...context, sinceRevisionId, ...page });
}

function decodeGetDocumentDiagnostics(
  value: unknown,
): DecodedValue<DecodedGetDocumentDiagnosticsRequest> {
  const record = captureClosedRecord(
    value,
    ['sessionId', 'document'],
    ['severities', 'codes', 'cursor', 'maxResults'],
  );
  if (record === undefined) {
    return undefined;
  }
  const context = decodeDocumentContext(record);
  const page = decodePageOptions(record);
  const severities = decodeOptional(record, 'severities', (item) =>
    decodeUniqueStringArray(item, 0, 3, decodeDiagnosticSeverity),
  );
  const codes = decodeOptional(record, 'codes', (item) =>
    decodeUniqueStringArray(item, 0, 256, decodeDiagnosticCode),
  );
  const filters = decodeDiagnosticFilters(severities, codes);
  if (
    page === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL ||
    filters === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL
  ) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (context === undefined || page === undefined || filters === undefined) {
    return undefined;
  }
  if (page === REQUEST_TOO_LARGE_SENTINEL || filters === REQUEST_TOO_LARGE_SENTINEL) {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({
    ...context,
    ...filters,
    ...page,
  });
}

function decodeDocumentContext(record: CapturedRecord): DecodedDocumentContext | undefined {
  const sessionId = decodeSessionId(record.get('sessionId'));
  const document = decodeDocumentRef(record.get('document'));
  return sessionId === undefined || document === undefined
    ? undefined
    : Object.freeze({ sessionId, document });
}

function decodeDocumentRef(value: unknown): DocumentRef | undefined {
  const record = captureClosedRecord(value, ['uri', 'revisionId']);
  if (record === undefined) {
    return undefined;
  }
  const uri = record.get('uri');
  const revisionId = decodeRevisionId(record.get('revisionId'));
  return typeof uri !== 'string' || !isDocumentUri(uri) || revisionId === undefined
    ? undefined
    : Object.freeze({ uri, revisionId });
}

function decodePageOptions(record: CapturedRecord): DecodedValue<DecodedPageOptions> {
  const cursor = decodeOptional(record, 'cursor', decodeCursor);
  const maxResults = decodeOptional(record, 'maxResults', decodeMaxResults);
  if (cursor.type === 'absolute-too-large' || maxResults.type === 'absolute-too-large') {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (cursor.type === 'invalid' || maxResults.type === 'invalid') {
    return undefined;
  }
  if (cursor.type === 'too-large' || maxResults.type === 'too-large') {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({
    ...(cursor.type === 'present' ? { cursor: cursor.value } : {}),
    ...(maxResults.type === 'present' ? { maxResults: maxResults.value } : {}),
  });
}

function decodeOptional<TValue>(
  record: CapturedRecord,
  key: string,
  decode: (value: unknown) => DecodedValue<TValue>,
): OptionalValue<TValue> {
  if (!record.has(key)) {
    return { type: 'absent' };
  }
  const value = decode(record.get(key));
  if (value === ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL) {
    return { type: 'absolute-too-large' };
  }
  if (value === REQUEST_TOO_LARGE_SENTINEL) {
    return { type: 'too-large' };
  }
  return value === undefined ? { type: 'invalid' } : { type: 'present', value };
}

function optionalValuesHaveType(
  type: 'invalid' | 'too-large' | 'absolute-too-large',
  values: readonly OptionalValue<unknown>[],
): boolean {
  return values.some((value) => value.type === type);
}

function decodeSearchFilters(
  sectionIds: OptionalValue<NonNullable<DecodedSearchFilters['sectionIds']>>,
  kinds: OptionalValue<NonNullable<DecodedSearchFilters['kinds']>>,
): DecodedValue<DecodedSearchFilters> {
  if (optionalValuesHaveType('absolute-too-large', [sectionIds, kinds])) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (optionalValuesHaveType('invalid', [sectionIds, kinds])) {
    return undefined;
  }
  if (optionalValuesHaveType('too-large', [sectionIds, kinds])) {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({
    ...(sectionIds.type === 'present' ? { sectionIds: sectionIds.value } : {}),
    ...(kinds.type === 'present' ? { kinds: kinds.value } : {}),
  });
}

function decodeDiagnosticFilters(
  severities: OptionalValue<NonNullable<DecodedDiagnosticFilters['severities']>>,
  codes: OptionalValue<NonNullable<DecodedDiagnosticFilters['codes']>>,
): DecodedValue<DecodedDiagnosticFilters> {
  if (optionalValuesHaveType('absolute-too-large', [severities, codes])) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (optionalValuesHaveType('invalid', [severities, codes])) {
    return undefined;
  }
  if (optionalValuesHaveType('too-large', [severities, codes])) {
    return REQUEST_TOO_LARGE_SENTINEL;
  }
  return Object.freeze({
    ...(severities.type === 'present' ? { severities: severities.value } : {}),
    ...(codes.type === 'present' ? { codes: codes.value } : {}),
  });
}

function decodeSessionId(value: unknown): SessionId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseSessionId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function decodeRevisionId(value: unknown): RevisionId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseRevisionId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function decodeNodeId(value: unknown): NodeId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseNodeId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function decodeInteger(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

function decodeMaxResults(value: unknown): DecodedValue<number> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return undefined;
  }
  return value > 1_000 ? REQUEST_TOO_LARGE_SENTINEL : value;
}

function decodeSearchQuery(value: unknown): DecodedValue<string> {
  if (typeof value !== 'string' || value.length < 1) {
    return undefined;
  }
  if (value.length > ABSOLUTE_PREAUTH_QUERY_UTF16_UNITS) {
    return ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL;
  }
  if (!isWellFormedUnicodeString(value)) {
    return undefined;
  }
  return countUnicodeCodePoints(value) > 4_096 ? REQUEST_TOO_LARGE_SENTINEL : value;
}

function countUnicodeCodePoints(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) >= 0xd800 && value.charCodeAt(index) <= 0xdbff) {
      index += 1;
    }
    count += 1;
  }
  return count;
}

function decodeBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string | undefined {
  return typeof value === 'string' &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    isWellFormedUnicodeString(value)
    ? value
    : undefined;
}

function decodeCursor(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 1_024 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    return undefined;
  }
  const remainder = value.length % 4;
  if (remainder === 1) {
    return undefined;
  }
  const finalCharacter = value.at(-1);
  const finalIndex = finalCharacter === undefined ? -1 : BASE64URL_ALPHABET.indexOf(finalCharacter);
  const hasCanonicalPaddingBits =
    remainder === 0 || (remainder === 2 ? (finalIndex & 15) === 0 : (finalIndex & 3) === 0);
  return finalIndex >= 0 && hasCanonicalPaddingBits ? value : undefined;
}

function decodeSearchKind(
  value: unknown,
): NonNullable<DecodedSearchDocumentRequest['kinds']>[number] | undefined {
  return typeof value === 'string' && SEARCH_KINDS.has(value as never)
    ? (value as NonNullable<DecodedSearchDocumentRequest['kinds']>[number])
    : undefined;
}

function decodeDiagnosticSeverity(
  value: unknown,
): NonNullable<DecodedGetDocumentDiagnosticsRequest['severities']>[number] | undefined {
  return typeof value === 'string' && DIAGNOSTIC_SEVERITIES.has(value as never)
    ? (value as NonNullable<DecodedGetDocumentDiagnosticsRequest['severities']>[number])
    : undefined;
}

function decodeDiagnosticCode(value: unknown): string | undefined {
  const code = decodeBoundedString(value, 1, 128);
  return code !== undefined && DIAGNOSTIC_CODE_PATTERN.test(code) ? code : undefined;
}

function decodeUniqueStringArray<TValue extends string>(
  value: unknown,
  minimumItems: number,
  maximumItems: number,
  decodeItem: (item: unknown) => TValue | undefined,
): DecodedValue<readonly TValue[]> {
  const captured = captureDenseArray(value);
  if (captured.type === 'invalid' || captured.type === 'too-large') {
    return captured.type === 'too-large' ? ABSOLUTE_REQUEST_TOO_LARGE_SENTINEL : undefined;
  }
  const items = captured.values;
  if (items.length < minimumItems) {
    return undefined;
  }
  const decoded: TValue[] = [];
  const unique = new Set<TValue>();
  for (const item of items) {
    const decodedItem = decodeItem(item);
    if (decodedItem === undefined || unique.has(decodedItem)) {
      return undefined;
    }
    unique.add(decodedItem);
    decoded.push(decodedItem);
  }
  return items.length > maximumItems ? REQUEST_TOO_LARGE_SENTINEL : Object.freeze(decoded);
}

function captureClosedRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): CapturedRecord | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  try {
    if (Array.isArray(value)) {
      return undefined;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
    if (keys.some((key) => typeof key !== 'string' || !allowedKeys.has(key))) {
      return undefined;
    }
    const captured = captureRecordDescriptors(value, keys);
    return captured !== undefined && requiredKeys.every((key) => captured.has(key))
      ? captured
      : undefined;
  } catch {
    return undefined;
  }
}

function captureRecordDescriptors(
  value: object,
  keys: readonly PropertyKey[],
): CapturedRecord | undefined {
  const captured = new Map<string, unknown>();
  for (const key of keys) {
    if (typeof key !== 'string') {
      return undefined;
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return undefined;
    }
    captured.set(key, descriptor.value);
  }
  return captured;
}

function captureDenseArray(value: unknown): CapturedArray {
  try {
    if (!Array.isArray(value)) {
      return { type: 'invalid' };
    }
    if (Reflect.getPrototypeOf(value) !== Array.prototype) {
      return { type: 'invalid' };
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
    const length =
      lengthDescriptor !== undefined && !lengthDescriptor.enumerable && 'value' in lengthDescriptor
        ? lengthDescriptor.value
        : -1;
    if (!Number.isSafeInteger(length) || length < 0) {
      return { type: 'invalid' };
    }
    if (length > ABSOLUTE_PREAUTH_ARRAY_ITEMS) {
      return { type: 'too-large' };
    }
    const keys = Reflect.ownKeys(value);
    if (!arrayKeysAreExact(keys, length)) {
      return { type: 'invalid' };
    }
    const captured = captureArrayDescriptors(value, length);
    return captured === undefined ? { type: 'invalid' } : { type: 'ok', values: captured };
  } catch {
    return { type: 'invalid' };
  }
}

function arrayKeysAreExact(keys: readonly PropertyKey[], length: number): boolean {
  return (
    keys.length === length + 1 &&
    keys.includes('length') &&
    keys.every((key) => key === 'length' || isArrayIndexInRange(key, length))
  );
}

function isArrayIndexInRange(key: PropertyKey, length: number): boolean {
  return (
    typeof key === 'string' &&
    /^(?:0|[1-9]\d*)$/u.test(key) &&
    Number.isSafeInteger(Number(key)) &&
    Number(key) < length
  );
}

function captureArrayDescriptors(
  value: readonly unknown[],
  length: number,
): readonly unknown[] | undefined {
  const captured: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return undefined;
    }
    captured.push(descriptor.value);
  }
  return captured;
}
