import type { IContentHasher } from './content-hasher.js';
import { parseContentHash, type ContentHash } from '../ids/identifiers.js';

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

export function sha256Utf8(value: string): string {
  return bytesToHex(sha256Bytes(encodeUtf8(value)));
}

export function sha256Utf8Bytes(value: string): Uint8Array {
  return sha256Bytes(encodeUtf8(value));
}

export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    appendCodePointUtf8(bytes, character.codePointAt(0) ?? 0);
  }
  return Uint8Array.from(bytes);
}

function appendCodePointUtf8(bytes: number[], rawCodePoint: number): void {
  const codePoint = rawCodePoint >= 0xd800 && rawCodePoint <= 0xdfff ? 0xfffd : rawCodePoint;
  if (codePoint <= 0x7f) {
    bytes.push(codePoint);
    return;
  }
  if (codePoint <= 0x7ff) {
    bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    return;
  }
  if (codePoint <= 0xffff) {
    bytes.push(
      0xe0 | (codePoint >>> 12),
      0x80 | ((codePoint >>> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    );
    return;
  }
  bytes.push(
    0xf0 | (codePoint >>> 18),
    0x80 | ((codePoint >>> 12) & 0x3f),
    0x80 | ((codePoint >>> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  );
}

function sha256Bytes(message: Uint8Array): Uint8Array {
  const padded = padMessage(message);
  const state = INITIAL_HASH.slice();
  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    prepareMessageSchedule(padded, offset, words);
    compressChunk(state, words);
  }

  return stateToBytes(state);
}

function padMessage(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  writeUint32BigEndian(padded, paddedLength - 8, high);
  writeUint32BigEndian(padded, paddedLength - 4, low);
  return padded;
}

function prepareMessageSchedule(chunk: Uint8Array, offset: number, words: Uint32Array): void {
  for (let index = 0; index < 16; index += 1) {
    const start = offset + index * 4;
    words[index] =
      (((chunk[start] ?? 0) << 24) |
        ((chunk[start + 1] ?? 0) << 16) |
        ((chunk[start + 2] ?? 0) << 8) |
        (chunk[start + 3] ?? 0)) >>>
      0;
  }
  for (let index = 16; index < 64; index += 1) {
    const word15 = words[index - 15] ?? 0;
    const word2 = words[index - 2] ?? 0;
    const sigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
    const sigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
    words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0;
  }
}

function compressChunk(state: Uint32Array, words: Uint32Array): void {
  const working = state.slice();
  for (let index = 0; index < 64; index += 1) {
    applyRound(working, words[index] ?? 0, ROUND_CONSTANTS[index] ?? 0);
  }
  for (let index = 0; index < state.length; index += 1) {
    state[index] = ((state[index] ?? 0) + (working[index] ?? 0)) >>> 0;
  }
}

function applyRound(working: Uint32Array, word: number, constant: number): void {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = working;
  const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
  const choice = (e & f) ^ (~e & g);
  const temporary1 = (h + sigma1 + choice + constant + word) >>> 0;
  const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
  const majority = (a & b) ^ (a & c) ^ (b & c);
  const temporary2 = (sigma0 + majority) >>> 0;

  working[7] = g;
  working[6] = f;
  working[5] = e;
  working[4] = (d + temporary1) >>> 0;
  working[3] = c;
  working[2] = b;
  working[1] = a;
  working[0] = (temporary1 + temporary2) >>> 0;
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

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
