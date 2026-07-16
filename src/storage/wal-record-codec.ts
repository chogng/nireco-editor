import { parseContentHash, parseRevisionId, parseTransactionId } from '../base/ids/identifiers.js';
import type { JsonValue } from '../base/serialization/canonical-json.js';
import { serializeCanonicalJson } from '../base/serialization/canonical-json.js';
import { canonicalizeResourceUri } from '../base/uri/resource-uri.js';
import type {
  IWalRecordCodec,
  WalCommitRecord,
  WalDecodeCorruptionReason,
  WalDecodeResult,
  WalEncodeResult,
} from '../workspace/document-authority/durability-ports.js';

const HEADER_BYTE_LENGTH = 8;
const DEFAULT_MAX_PAYLOAD_BYTE_LENGTH = 16 * 1024 * 1024;
const WAL_RECORD_KEYS = new Set([
  'documentHash',
  'parentRevisionId',
  'recordType',
  'recordVersion',
  'replayInput',
  'revisionId',
  'sequence',
  'transactionHash',
  'transactionId',
  'uri',
]);

export interface PortableWalRecordCodecOptions {
  readonly maxPayloadByteLength?: number;
}

export class PortableWalRecordCodec implements IWalRecordCodec {
  readonly #maxPayloadByteLength: number;

  constructor(options: PortableWalRecordCodecOptions = {}) {
    this.#maxPayloadByteLength = options.maxPayloadByteLength ?? DEFAULT_MAX_PAYLOAD_BYTE_LENGTH;
  }

  encode(record: WalCommitRecord): WalEncodeResult {
    const serialized = serializeCanonicalJson(record);
    if (serialized.type === 'error') {
      return {
        type: 'error',
        error: {
          reason: 'canonicalization-failed',
        },
      };
    }

    const payload = encodeUtf8(serialized.value);
    if (payload.byteLength > this.#maxPayloadByteLength) {
      return {
        type: 'error',
        error: {
          reason: 'record-too-large',
        },
      };
    }

    const framed = new Uint8Array(HEADER_BYTE_LENGTH + payload.byteLength);
    writeUint32BigEndian(framed, 0, payload.byteLength);
    writeUint32BigEndian(framed, 4, crc32(payload));
    framed.set(payload, HEADER_BYTE_LENGTH);

    return {
      type: 'ok',
      value: framed,
    };
  }

  decode(bytes: Uint8Array): WalDecodeResult {
    const records: WalCommitRecord[] = [];
    let offset = 0;

    while (offset < bytes.byteLength) {
      const remaining = bytes.byteLength - offset;
      if (remaining < HEADER_BYTE_LENGTH) {
        return tailResult(records, offset);
      }

      const payloadLength = readUint32BigEndian(bytes, offset);
      if (payloadLength > this.#maxPayloadByteLength) {
        return corruptResult(records, offset, 'invalid-length');
      }

      const recordEnd = offset + HEADER_BYTE_LENGTH + payloadLength;
      if (recordEnd > bytes.byteLength) {
        if (
          remaining >= HEADER_BYTE_LENGTH &&
          hasCompleteCanonicalFrameAfter(
            bytes,
            offset + HEADER_BYTE_LENGTH,
            this.#maxPayloadByteLength,
          )
        ) {
          return corruptResult(records, offset, 'invalid-length');
        }
        return tailResult(records, offset);
      }

      const expectedChecksum = readUint32BigEndian(bytes, offset + 4);
      const payload = bytes.subarray(offset + HEADER_BYTE_LENGTH, recordEnd);
      if (crc32(payload) !== expectedChecksum) {
        return corruptResult(records, offset, 'checksum-mismatch');
      }

      const decoded = decodePayload(payload);
      if (decoded.type === 'error') {
        return corruptResult(records, offset, decoded.reason);
      }

      records.push(decoded.record);
      offset = recordEnd;
    }

    return {
      type: 'ok',
      records,
      validByteLength: offset,
      truncatedTail: false,
    };
  }
}

type DecodedPayloadResult =
  | {
      readonly type: 'ok';
      readonly record: WalCommitRecord;
    }
  | {
      readonly type: 'error';
      readonly reason: Extract<
        WalDecodeCorruptionReason,
        'invalid-utf8' | 'invalid-json' | 'invalid-record' | 'non-canonical-payload'
      >;
    };

function decodePayload(payload: Uint8Array): DecodedPayloadResult {
  const decoded = decodeUtf8(payload);
  if (decoded.type === 'error') {
    return {
      type: 'error',
      reason: 'invalid-utf8',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.value) as unknown;
  } catch {
    return {
      type: 'error',
      reason: 'invalid-json',
    };
  }

  const record = parseWalCommitRecord(parsed);
  if (record === undefined) {
    return {
      type: 'error',
      reason: 'invalid-record',
    };
  }
  const canonical = serializeCanonicalJson(record);
  if (canonical.type === 'error' || canonical.value !== decoded.value) {
    return {
      type: 'error',
      reason: 'non-canonical-payload',
    };
  }

  return {
    type: 'ok',
    record,
  };
}

function hasCompleteCanonicalFrameAfter(
  bytes: Uint8Array,
  startOffset: number,
  maxPayloadByteLength: number,
): boolean {
  for (
    let candidateOffset = startOffset;
    candidateOffset + HEADER_BYTE_LENGTH <= bytes.byteLength;
    candidateOffset += 1
  ) {
    const payloadLength = readUint32BigEndian(bytes, candidateOffset);
    if (payloadLength > maxPayloadByteLength) {
      continue;
    }
    const recordEnd = candidateOffset + HEADER_BYTE_LENGTH + payloadLength;
    if (recordEnd > bytes.byteLength) {
      continue;
    }
    const expectedChecksum = readUint32BigEndian(bytes, candidateOffset + 4);
    const payload = bytes.subarray(candidateOffset + HEADER_BYTE_LENGTH, recordEnd);
    if (crc32(payload) !== expectedChecksum) {
      continue;
    }
    if (decodePayload(payload).type === 'ok') {
      return true;
    }
  }
  return false;
}

function parseWalCommitRecord(value: unknown): WalCommitRecord | undefined {
  if (!isPlainRecord(value) || !hasExactKeys(value, WAL_RECORD_KEYS)) {
    return undefined;
  }
  if (value['recordVersion'] !== 1 || value['recordType'] !== 'commit') {
    return undefined;
  }
  if (!isNonNegativeSafeInteger(value['sequence']) || !isJsonValue(value['replayInput'])) {
    return undefined;
  }

  const identity = parseWalIdentityFields(value);
  if (identity === undefined) {
    return undefined;
  }

  return {
    recordVersion: 1,
    recordType: 'commit',
    ...identity,
    sequence: value['sequence'],
    replayInput: value['replayInput'],
  };
}

type WalIdentityFields = Pick<
  WalCommitRecord,
  'uri' | 'revisionId' | 'parentRevisionId' | 'transactionId' | 'transactionHash' | 'documentHash'
>;

function parseWalIdentityFields(value: Record<string, unknown>): WalIdentityFields | undefined {
  const uri = parseCanonicalUri(value['uri']);
  const revisionId = parseRequiredRevisionId(value['revisionId']);
  const parentRevisionId = parseOptionalRevisionId(value['parentRevisionId']);
  const transactionId = parseRequiredTransactionId(value['transactionId']);
  const transactionHash = parseRequiredContentHash(value['transactionHash']);
  const documentHash = parseRequiredContentHash(value['documentHash']);

  if (
    uri === undefined ||
    revisionId === undefined ||
    parentRevisionId.type === 'invalid' ||
    transactionId === undefined ||
    transactionHash === undefined ||
    documentHash === undefined
  ) {
    return undefined;
  }

  return {
    uri,
    revisionId,
    parentRevisionId: parentRevisionId.value,
    transactionId,
    transactionHash,
    documentHash,
  };
}

function parseCanonicalUri(value: unknown): WalCommitRecord['uri'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = canonicalizeResourceUri(value);
  return parsed.type === 'valid' && parsed.value === value ? parsed.value : undefined;
}

function parseRequiredRevisionId(value: unknown): WalCommitRecord['revisionId'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseRevisionId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

type OptionalRevisionIdResult =
  | {
      readonly type: 'valid';
      readonly value: WalCommitRecord['parentRevisionId'];
    }
  | {
      readonly type: 'invalid';
    };

function parseOptionalRevisionId(value: unknown): OptionalRevisionIdResult {
  if (value === null) {
    return {
      type: 'valid',
      value: null,
    };
  }
  const parsed = parseRequiredRevisionId(value);
  return parsed === undefined
    ? {
        type: 'invalid',
      }
    : {
        type: 'valid',
        value: parsed,
      };
}

function parseRequiredTransactionId(value: unknown): WalCommitRecord['transactionId'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseTransactionId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function parseRequiredContentHash(value: unknown): WalCommitRecord['documentHash'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseContentHash(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function tailResult(records: readonly WalCommitRecord[], validByteLength: number): WalDecodeResult {
  return {
    type: 'ok',
    records,
    validByteLength,
    truncatedTail: true,
  };
}

function corruptResult(
  records: readonly WalCommitRecord[],
  corruptionOffset: number,
  reason: WalDecodeCorruptionReason,
): WalDecodeResult {
  return {
    type: 'corrupt',
    records,
    validByteLength: corruptionOffset,
    corruptionOffset,
    reason,
  };
}

export function encodeUtf8(value: string): Uint8Array {
  const output: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    appendCodePointUtf8(output, codePoint);
  }
  return Uint8Array.from(output);
}

function appendCodePointUtf8(output: number[], codePoint: number): void {
  if (codePoint <= 0x7f) {
    output.push(codePoint);
  } else if (codePoint <= 0x7ff) {
    output.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
  } else if (codePoint <= 0xffff) {
    output.push(
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    );
  } else {
    output.push(
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    );
  }
}

export type Utf8DecodeResult =
  | {
      readonly type: 'ok';
      readonly value: string;
    }
  | {
      readonly type: 'error';
    };

export function decodeUtf8(bytes: Uint8Array): Utf8DecodeResult {
  const codePoints: number[] = [];
  let offset = 0;

  while (offset < bytes.byteLength) {
    const decoded = decodeUtf8CodePoint(bytes, offset);
    if (decoded === undefined) {
      return {
        type: 'error',
      };
    }
    codePoints.push(decoded.codePoint);
    offset += decoded.byteLength;
  }

  return {
    type: 'ok',
    value: codePoints.map((codePoint) => String.fromCodePoint(codePoint)).join(''),
  };
}

interface DecodedCodePoint {
  readonly codePoint: number;
  readonly byteLength: number;
}

function decodeUtf8CodePoint(bytes: Uint8Array, offset: number): DecodedCodePoint | undefined {
  const first = bytes[offset];
  if (first === undefined) {
    return undefined;
  }
  if (first <= 0x7f) {
    return {
      codePoint: first,
      byteLength: 1,
    };
  }
  if (first >= 0xc2 && first <= 0xdf) {
    return decodeTwoByteCodePoint(bytes, offset, first);
  }
  if (first >= 0xe0 && first <= 0xef) {
    return decodeThreeByteCodePoint(bytes, offset, first);
  }
  if (first >= 0xf0 && first <= 0xf4) {
    return decodeFourByteCodePoint(bytes, offset, first);
  }
  return undefined;
}

function decodeTwoByteCodePoint(
  bytes: Uint8Array,
  offset: number,
  first: number,
): DecodedCodePoint | undefined {
  const second = continuationByte(bytes, offset + 1);
  if (second === undefined) {
    return undefined;
  }
  return {
    codePoint: ((first & 0x1f) << 6) | second,
    byteLength: 2,
  };
}

function decodeThreeByteCodePoint(
  bytes: Uint8Array,
  offset: number,
  first: number,
): DecodedCodePoint | undefined {
  const secondByte = bytes[offset + 1];
  const second = continuationByte(bytes, offset + 1);
  const third = continuationByte(bytes, offset + 2);
  if (
    secondByte === undefined ||
    second === undefined ||
    third === undefined ||
    (first === 0xe0 && secondByte < 0xa0) ||
    (first === 0xed && secondByte >= 0xa0)
  ) {
    return undefined;
  }
  return {
    codePoint: ((first & 0x0f) << 12) | (second << 6) | third,
    byteLength: 3,
  };
}

function decodeFourByteCodePoint(
  bytes: Uint8Array,
  offset: number,
  first: number,
): DecodedCodePoint | undefined {
  const secondByte = bytes[offset + 1];
  const second = continuationByte(bytes, offset + 1);
  const third = continuationByte(bytes, offset + 2);
  const fourth = continuationByte(bytes, offset + 3);
  if (
    secondByte === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    (first === 0xf0 && secondByte < 0x90) ||
    (first === 0xf4 && secondByte >= 0x90)
  ) {
    return undefined;
  }
  return {
    codePoint: ((first & 0x07) << 18) | (second << 12) | (third << 6) | fourth,
    byteLength: 4,
  };
}

function continuationByte(bytes: Uint8Array, offset: number): number | undefined {
  const value = bytes[offset];
  return value !== undefined && (value & 0xc0) === 0x80 ? value & 0x3f : undefined;
}

export function crc32(bytes: Uint8Array): number {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
