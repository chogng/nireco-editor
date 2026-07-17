import type { IContentHasher } from './content-hasher.js';
import {
  createCanonicalHashPreimage,
  HASH_PREIMAGE_PREFIX,
  type CanonicalHashResult,
  type HashDomain,
} from './hash-preimage.js';
import { parseContentHash, type ContentHash } from '../ids/identifiers.js';
import { isWellFormedUnicodeString } from '../serialization/canonical-json.js';

const INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

interface Utf8Encoder {
  encode(value: string): Uint8Array;
  encodeInto?(
    value: string,
    destination: Uint8Array,
  ): {
    readonly read: number;
    readonly written: number;
  };
}

type Utf8EncoderConstructor = new () => Utf8Encoder;

declare const TextEncoder: Utf8EncoderConstructor;

const UTF8_ENCODER = new TextEncoder();
const MAX_HASH_ENCODE_INTO_UTF16_UNITS = 16 * 1_024 * 1_024;

declare const trustedCanonicalUtf8TextBrand: unique symbol;

/**
 * Opaque process-local pairing of canonical text with its exact UTF-8 bytes.
 * The backing bytes never leave this module and therefore cannot be mutated by
 * callers after the text has crossed a trusted verification boundary.
 */
export interface TrustedCanonicalUtf8Text {
  readonly [trustedCanonicalUtf8TextBrand]: true;
  readonly utf16Length: number;
  readonly utf8ByteLength: number;
}

export interface TrustedCanonicalTextReplacement {
  readonly startUtf16Offset: number;
  readonly endUtf16Offset: number;
  readonly replacement: string;
  /** Optional fast-path proof previously issued for this exact source handle and UTF-16 range. */
  readonly startUtf8Offset?: number;
  readonly endUtf8Offset?: number;
}

export interface AppliedTrustedCanonicalTextReplacement {
  readonly sourceStartUtf8Offset: number;
  readonly sourceEndUtf8Offset: number;
  readonly nextStartUtf8Offset: number;
  readonly nextEndUtf8Offset: number;
}

export interface PatchedTrustedCanonicalUtf8Text {
  readonly canonicalText: string;
  readonly utf8: TrustedCanonicalUtf8Text;
  readonly replacements: readonly AppliedTrustedCanonicalTextReplacement[];
}

interface TrustedCanonicalUtf8Record {
  readonly canonicalText: string;
  readonly bytes: Uint8Array;
}

const TRUSTED_CANONICAL_UTF8 = new WeakMap<TrustedCanonicalUtf8Text, TrustedCanonicalUtf8Record>();
const TRUSTED_CANONICAL_UTF8_RANGES = new WeakMap<TrustedCanonicalUtf8Text, ReadonlySet<string>>();

export class PortableSha256ContentHasher implements IContentHasher {
  async hashUtf8(value: string): Promise<ContentHash> {
    const digest = sha256Utf8(value);
    const parsed = parseContentHash(`sha256:${digest}`);
    if (parsed.type === 'invalid') {
      throw new Error('Portable SHA-256 produced an invalid content hash.');
    }
    return parsed.value;
  }
}

export function hashCanonicalJsonPortable(
  domain: HashDomain,
  payload: unknown,
): CanonicalHashResult {
  const preimage = createCanonicalHashPreimage(domain, payload);
  if (preimage.type === 'error') {
    return preimage;
  }

  return hashCanonicalJsonTextPortable(domain, preimage.canonicalJson);
}

/**
 * Hashes canonical JSON that was already produced by the canonical serializer.
 * Callers must not pass unvalidated JSON text from an external boundary.
 */
export function hashCanonicalJsonTextPortable(
  domain: HashDomain,
  canonicalJson: string,
): CanonicalHashResult {
  const preimage = `${HASH_PREIMAGE_PREFIX}${domain}\0${canonicalJson}`;

  const parsed = parseContentHash(`sha256:${sha256Utf8(preimage)}`);
  if (parsed.type === 'invalid') {
    throw new Error('Portable SHA-256 produced an invalid content hash.');
  }

  return {
    type: 'ok',
    hash: parsed.value,
    canonicalJson,
    preimage,
  };
}

/**
 * Creates an opaque UTF-8 cache only for canonical text already produced and
 * verified by a trusted caller. External input must use the canonical JSON
 * serializer and ordinary hash path first.
 */
export function createTrustedCanonicalUtf8Text(canonicalText: string): TrustedCanonicalUtf8Text {
  return installTrustedCanonicalUtf8Text(canonicalText, UTF8_ENCODER.encode(canonicalText));
}

/**
 * Applies sorted, non-overlapping replacements to trusted canonical text while
 * deriving the exact UTF-8 bytes from the source cache. Invalid ranges fail
 * closed so callers can fall back to full canonical serialization and hashing.
 */
export function patchTrustedCanonicalUtf8Text(
  source: TrustedCanonicalUtf8Text,
  replacements: readonly TrustedCanonicalTextReplacement[],
): PatchedTrustedCanonicalUtf8Text | undefined {
  const record = TRUSTED_CANONICAL_UTF8.get(source);
  if (record === undefined) {
    return undefined;
  }

  const preparation = prepareTrustedUtf8Replacements(source, record, replacements);
  if (preparation === undefined) {
    return undefined;
  }

  const textParts: string[] = [];
  const nextBytes = new Uint8Array(preparation.nextUtf8Length);
  let sourceUtf16Cursor = 0;
  let sourceUtf8Cursor = 0;
  let nextUtf8Cursor = 0;
  let nextUtf16Cursor = 0;
  const appliedReplacements: AppliedTrustedCanonicalTextReplacement[] = [];
  const nextTrustedRanges = new Set<string>();
  for (const replacement of preparation.replacements) {
    const unchangedText = record.canonicalText.slice(
      sourceUtf16Cursor,
      replacement.startUtf16Offset,
    );
    textParts.push(unchangedText, replacement.replacement);
    nextUtf16Cursor += unchangedText.length;
    const nextStartUtf16Offset = nextUtf16Cursor;
    nextUtf16Cursor += replacement.replacement.length;
    const nextEndUtf16Offset = nextUtf16Cursor;
    const unchanged = record.bytes.subarray(sourceUtf8Cursor, replacement.startUtf8Offset);
    nextBytes.set(unchanged, nextUtf8Cursor);
    nextUtf8Cursor += unchanged.length;
    const nextStartUtf8Offset = nextUtf8Cursor;
    nextBytes.set(replacement.replacementUtf8, nextUtf8Cursor);
    nextUtf8Cursor += replacement.replacementUtf8.length;
    appliedReplacements.push({
      sourceStartUtf8Offset: replacement.startUtf8Offset,
      sourceEndUtf8Offset: replacement.endUtf8Offset,
      nextStartUtf8Offset,
      nextEndUtf8Offset: nextUtf8Cursor,
    });
    nextTrustedRanges.add(
      trustedRangeKey(
        nextStartUtf16Offset,
        nextEndUtf16Offset,
        nextStartUtf8Offset,
        nextUtf8Cursor,
      ),
    );
    sourceUtf16Cursor = replacement.endUtf16Offset;
    sourceUtf8Cursor = replacement.endUtf8Offset;
  }
  textParts.push(record.canonicalText.slice(sourceUtf16Cursor));
  nextBytes.set(record.bytes.subarray(sourceUtf8Cursor), nextUtf8Cursor);
  const canonicalText = textParts.join('');
  const utf8 = installTrustedCanonicalUtf8Text(canonicalText, nextBytes);
  TRUSTED_CANONICAL_UTF8_RANGES.set(utf8, nextTrustedRanges);
  return {
    canonicalText,
    utf8,
    replacements: appliedReplacements,
  };
}

/**
 * Hashes a module-issued trusted UTF-8 cache with the exact canonical preimage.
 * A forged or retired-looking handle fails closed instead of accepting bytes
 * supplied by the caller.
 */
export function hashTrustedCanonicalJsonTextPortable(
  domain: HashDomain,
  trusted: TrustedCanonicalUtf8Text,
): CanonicalHashResult | undefined {
  const record = TRUSTED_CANONICAL_UTF8.get(trusted);
  if (record === undefined) {
    return undefined;
  }
  const prefix = `${HASH_PREIMAGE_PREFIX}${domain}\0`;
  const prefixBytes = UTF8_ENCODER.encode(prefix);
  const preimageBytes = new Uint8Array(prefixBytes.length + record.bytes.length);
  preimageBytes.set(prefixBytes);
  preimageBytes.set(record.bytes, prefixBytes.length);
  const parsed = parseContentHash(`sha256:${bytesToHex(sha256Bytes(preimageBytes))}`);
  if (parsed.type === 'invalid') {
    throw new Error('Portable SHA-256 produced an invalid content hash.');
  }
  return {
    type: 'ok',
    hash: parsed.value,
    canonicalJson: record.canonicalText,
    preimage: `${prefix}${record.canonicalText}`,
  };
}

export function sha256Utf8(value: string): string {
  return bytesToHex(sha256Bytes(encodeUtf8ForHash(value)));
}

export function sha256Utf8Bytes(value: string): Uint8Array {
  return sha256Bytes(encodeUtf8ForHash(value));
}

export function encodeUtf8(value: string): Uint8Array {
  return UTF8_ENCODER.encode(value);
}

function encodeUtf8ForHash(value: string): Uint8Array {
  if (UTF8_ENCODER.encodeInto === undefined || value.length > MAX_HASH_ENCODE_INTO_UTF16_UNITS) {
    return UTF8_ENCODER.encode(value);
  }
  const encoded = new Uint8Array(value.length * 2);
  const result = UTF8_ENCODER.encodeInto(value, encoded);
  return result.read === value.length
    ? encoded.subarray(0, result.written)
    : UTF8_ENCODER.encode(value);
}

interface PreparedUtf8Replacement extends TrustedCanonicalTextReplacement {
  readonly startUtf8Offset: number;
  readonly endUtf8Offset: number;
  readonly replacementUtf8: Uint8Array;
}

interface PreparedTrustedUtf8Replacements {
  readonly replacements: readonly PreparedUtf8Replacement[];
  readonly nextUtf8Length: number;
}

function prepareTrustedUtf8Replacements(
  source: TrustedCanonicalUtf8Text,
  record: TrustedCanonicalUtf8Record,
  replacements: readonly TrustedCanonicalTextReplacement[],
): PreparedTrustedUtf8Replacements | undefined {
  const prepared: PreparedUtf8Replacement[] = [];
  let sourceUtf16Cursor = 0;
  let sourceUtf8Cursor = 0;
  let nextUtf8Length = record.bytes.length;
  for (const replacement of replacements) {
    if (!isValidTrustedReplacement(replacement, sourceUtf16Cursor, record.canonicalText)) {
      return undefined;
    }
    const previous = UTF8_ENCODER.encode(
      record.canonicalText.slice(replacement.startUtf16Offset, replacement.endUtf16Offset),
    );
    const replacementUtf8 = UTF8_ENCODER.encode(replacement.replacement);
    const offsets = resolveTrustedReplacementUtf8Offsets(
      source,
      record,
      replacement,
      previous,
      sourceUtf16Cursor,
      sourceUtf8Cursor,
    );
    if (offsets === undefined) {
      return undefined;
    }
    prepared.push({
      ...replacement,
      startUtf8Offset: offsets.start,
      endUtf8Offset: offsets.end,
      replacementUtf8,
    });
    nextUtf8Length += replacementUtf8.length - previous.length;
    sourceUtf16Cursor = replacement.endUtf16Offset;
    sourceUtf8Cursor = offsets.end;
  }
  return {
    replacements: prepared,
    nextUtf8Length,
  };
}

function resolveTrustedReplacementUtf8Offsets(
  source: TrustedCanonicalUtf8Text,
  record: TrustedCanonicalUtf8Record,
  replacement: TrustedCanonicalTextReplacement,
  previousUtf8: Uint8Array,
  sourceUtf16Cursor: number,
  sourceUtf8Cursor: number,
): { readonly start: number; readonly end: number } | undefined {
  const supplied = readSuppliedUtf8Offsets(replacement);
  if (supplied === false) {
    return undefined;
  }
  if (
    supplied !== undefined &&
    !TRUSTED_CANONICAL_UTF8_RANGES.get(source)?.has(
      trustedRangeKey(
        replacement.startUtf16Offset,
        replacement.endUtf16Offset,
        supplied.start,
        supplied.end,
      ),
    )
  ) {
    return undefined;
  }
  const start =
    supplied?.start ??
    sourceUtf8Cursor +
      UTF8_ENCODER.encode(
        record.canonicalText.slice(sourceUtf16Cursor, replacement.startUtf16Offset),
      ).length;
  const end = start + previousUtf8.length;
  return start >= sourceUtf8Cursor &&
    (supplied === undefined || supplied.end === end) &&
    bytesEqualAt(record.bytes, previousUtf8, start)
    ? { start, end }
    : undefined;
}

function installTrustedCanonicalUtf8Text(
  canonicalText: string,
  bytes: Uint8Array,
): TrustedCanonicalUtf8Text {
  const handle = Object.freeze({
    utf16Length: canonicalText.length,
    utf8ByteLength: bytes.length,
  }) as TrustedCanonicalUtf8Text;
  TRUSTED_CANONICAL_UTF8.set(handle, { canonicalText, bytes });
  return handle;
}

function isValidTrustedReplacement(
  replacement: TrustedCanonicalTextReplacement,
  minimumStart: number,
  source: string,
): boolean {
  return (
    Number.isSafeInteger(replacement.startUtf16Offset) &&
    Number.isSafeInteger(replacement.endUtf16Offset) &&
    replacement.startUtf16Offset >= minimumStart &&
    replacement.endUtf16Offset >= replacement.startUtf16Offset &&
    replacement.endUtf16Offset <= source.length &&
    isUtf16ScalarBoundary(source, replacement.startUtf16Offset) &&
    isUtf16ScalarBoundary(source, replacement.endUtf16Offset) &&
    isWellFormedUnicodeString(replacement.replacement)
  );
}

function isUtf16ScalarBoundary(value: string, offset: number): boolean {
  if (offset <= 0 || offset >= value.length) {
    return true;
  }
  const previous = value.charCodeAt(offset - 1);
  const current = value.charCodeAt(offset);
  return !(previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff);
}

function trustedRangeKey(
  startUtf16Offset: number,
  endUtf16Offset: number,
  startUtf8Offset: number,
  endUtf8Offset: number,
): string {
  return `${startUtf16Offset}:${endUtf16Offset}:${startUtf8Offset}:${endUtf8Offset}`;
}

function readSuppliedUtf8Offsets(
  replacement: TrustedCanonicalTextReplacement,
): { readonly start: number; readonly end: number } | undefined | false {
  if (replacement.startUtf8Offset === undefined && replacement.endUtf8Offset === undefined) {
    return undefined;
  }
  return Number.isSafeInteger(replacement.startUtf8Offset) &&
    Number.isSafeInteger(replacement.endUtf8Offset) &&
    (replacement.startUtf8Offset ?? -1) >= 0 &&
    (replacement.endUtf8Offset ?? -1) >= (replacement.startUtf8Offset ?? 0)
    ? {
        start: replacement.startUtf8Offset ?? 0,
        end: replacement.endUtf8Offset ?? 0,
      }
    : false;
}

function bytesEqualAt(source: Uint8Array, expected: Uint8Array, offset: number): boolean {
  if (offset < 0 || offset + expected.length > source.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (source[offset + index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function sha256Bytes(message: Uint8Array): Uint8Array {
  const state = INITIAL_HASH.slice();
  const words = new Uint32Array(16);
  const completeByteLength = message.length - (message.length % 64);
  compressBlocks(message, completeByteLength, state, words);

  const remainderLength = message.length - completeByteLength;
  const tail = new Uint8Array(remainderLength < 56 ? 64 : 128);
  tail.set(message.subarray(completeByteLength));
  tail[remainderLength] = 0x80;
  const bitLength = message.length * 8;
  writeUint32BigEndian(tail, tail.length - 8, Math.floor(bitLength / 0x1_0000_0000));
  writeUint32BigEndian(tail, tail.length - 4, bitLength >>> 0);
  compressBlocks(tail, tail.length, state, words);
  return stateToBytes(state);
}

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Every access is bounded by the fixed SHA-256 block and schedule loops; assertions keep this hot path branch-free. */
function compressBlocks(
  input: Uint8Array,
  byteLength: number,
  state: Uint32Array,
  words: Uint32Array,
): void {
  let hash0 = state[0]!;
  let hash1 = state[1]!;
  let hash2 = state[2]!;
  let hash3 = state[3]!;
  let hash4 = state[4]!;
  let hash5 = state[5]!;
  let hash6 = state[6]!;
  let hash7 = state[7]!;

  for (let offset = 0; offset < byteLength; offset += 64) {
    let a = hash0;
    let b = hash1;
    let c = hash2;
    let d = hash3;
    let e = hash4;
    let f = hash5;
    let g = hash6;
    let h = hash7;
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      const word =
        ((input[start]! << 24) |
          (input[start + 1]! << 16) |
          (input[start + 2]! << 8) |
          input[start + 3]!) >>>
        0;
      words[index] = word;
      const sigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choice = g ^ (e & (f ^ g));
      const temporary1 = (h + sigma1 + choice + ROUND_CONSTANTS[index]! + word) | 0;
      const sigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) | (c & (a | b));
      const temporary2 = (sigma0 + majority) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporary1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) | 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const scheduleIndex = index & 15;
      const word15 = words[(index + 1) & 15]!;
      const word2 = words[(index + 14) & 15]!;
      const scheduleSigma0 =
        ((word15 >>> 7) | (word15 << 25)) ^ ((word15 >>> 18) | (word15 << 14)) ^ (word15 >>> 3);
      const scheduleSigma1 =
        ((word2 >>> 17) | (word2 << 15)) ^ ((word2 >>> 19) | (word2 << 13)) ^ (word2 >>> 10);
      const word =
        (words[scheduleIndex]! + scheduleSigma0 + words[(index + 9) & 15]! + scheduleSigma1) >>> 0;
      words[scheduleIndex] = word;
      const sigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choice = g ^ (e & (f ^ g));
      const temporary1 = (h + sigma1 + choice + ROUND_CONSTANTS[index]! + word) | 0;
      const sigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) | (c & (a | b));
      const temporary2 = (sigma0 + majority) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporary1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) | 0;
    }
    hash0 = (hash0 + a) | 0;
    hash1 = (hash1 + b) | 0;
    hash2 = (hash2 + c) | 0;
    hash3 = (hash3 + d) | 0;
    hash4 = (hash4 + e) | 0;
    hash5 = (hash5 + f) | 0;
    hash6 = (hash6 + g) | 0;
    hash7 = (hash7 + h) | 0;
  }

  state[0] = hash0;
  state[1] = hash1;
  state[2] = hash2;
  state[3] = hash3;
  state[4] = hash4;
  state[5] = hash5;
  state[6] = hash6;
  state[7] = hash7;
}
/* eslint-enable @typescript-eslint/no-non-null-assertion */

function stateToBytes(state: Uint32Array): Uint8Array {
  const digest = new Uint8Array(32);
  for (let index = 0; index < state.length; index += 1) {
    writeUint32BigEndian(digest, index * 4, state[index] ?? 0);
  }
  return digest;
}

function writeUint32BigEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value >>> 24;
  target[offset + 1] = value >>> 16;
  target[offset + 2] = value >>> 8;
  target[offset + 3] = value;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
