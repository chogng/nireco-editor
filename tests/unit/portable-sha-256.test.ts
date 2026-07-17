import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import {
  createTrustedCanonicalUtf8Text,
  encodeUtf8,
  hashCanonicalJsonTextPortable,
  hashTrustedCanonicalJsonTextPortable,
  patchTrustedCanonicalUtf8Text,
  sha256Utf8,
  sha256Utf8Bytes,
} from '../../src/base/hashing/portable-sha-256.js';

describe('portable SHA-256 byte boundaries', () => {
  it.each([0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129])(
    'matches Node crypto for an ASCII input of %i UTF-8 bytes',
    (byteLength) => {
      expectPortableHash('a'.repeat(byteLength));
    },
  );

  it.each([
    ['CJK', '正文、引文与证据。'.repeat(257)],
    ['emoji and ZWJ', '🌍👩‍🔬🧑🏽‍💻'.repeat(193)],
    ['combining and RTL', 'e\u0301 مرحبا שָׁלוֹם '.repeat(173)],
    ['mixed canonical-like text', '{"claim":"证据 🌍","title":"e\u0301"}'.repeat(311)],
  ])('matches Node crypto for %s text', (_label, value) => {
    expectPortableHash(value);
  });

  it('matches Node crypto for deterministic multi-megabyte mixed and CJK inputs', () => {
    expectPortableHash('A中🌍e\u0301'.repeat(250_000));
    expectPortableHash('界'.repeat(1_000_000));
  });

  it('preserves the exact canonical hash preimage across trusted UTF-8 patches', () => {
    const source = '{"a":"中🌍","b":"old","c":"tail"}';
    const firstStart = source.indexOf('中');
    const firstEnd = firstStart + '中🌍'.length;
    const secondStart = source.indexOf('old');
    const secondEnd = secondStart + 'old'.length;
    const trustedSource = createTrustedCanonicalUtf8Text(source);
    const patched = patchTrustedCanonicalUtf8Text(trustedSource, [
      {
        startUtf16Offset: firstStart,
        endUtf16Offset: firstEnd,
        replacement: 'e\u0301',
      },
      {
        startUtf16Offset: secondStart,
        endUtf16Offset: secondEnd,
        replacement: 'new 🌍',
      },
    ]);
    expect(patched).toBeDefined();
    if (patched === undefined) {
      return;
    }
    const expectedText = `${source.slice(0, firstStart)}e\u0301${source.slice(
      firstEnd,
      secondStart,
    )}new 🌍${source.slice(secondEnd)}`;
    const ordinary = hashCanonicalJsonTextPortable(HASH_DOMAINS.documentContent, expectedText);
    const accelerated = hashTrustedCanonicalJsonTextPortable(
      HASH_DOMAINS.documentContent,
      patched.utf8,
    );

    expect(patched.canonicalText).toBe(expectedText);
    expect(patched.utf8.utf16Length).toBe(expectedText.length);
    expect(patched.utf8.utf8ByteLength).toBe(Buffer.byteLength(expectedText, 'utf8'));
    expect(accelerated).toEqual(ordinary);

    const firstApplied = patched.replacements[0];
    expect(firstApplied).toBeDefined();
    if (firstApplied === undefined) {
      return;
    }
    const restored = patchTrustedCanonicalUtf8Text(patched.utf8, [
      {
        startUtf16Offset: firstStart,
        endUtf16Offset: firstStart + 'e\u0301'.length,
        replacement: '中🌍',
        startUtf8Offset: firstApplied.nextStartUtf8Offset,
        endUtf8Offset: firstApplied.nextEndUtf8Offset,
      },
    ]);
    const restoredText = `${source.slice(0, secondStart)}new 🌍${source.slice(secondEnd)}`;
    expect(restored?.canonicalText).toBe(restoredText);
    expect(
      restored === undefined
        ? undefined
        : hashTrustedCanonicalJsonTextPortable(HASH_DOMAINS.documentContent, restored.utf8),
    ).toEqual(hashCanonicalJsonTextPortable(HASH_DOMAINS.documentContent, restoredText));

    expect(
      patchTrustedCanonicalUtf8Text(patched.utf8, [
        {
          startUtf16Offset: firstStart,
          endUtf16Offset: firstStart + 'e\u0301'.length,
          replacement: 'x',
          startUtf8Offset: firstApplied.nextStartUtf8Offset + 1,
          endUtf8Offset: firstApplied.nextEndUtf8Offset + 1,
        },
      ]),
    ).toBeUndefined();
  });

  it('fails closed for overlapping replacements and forged UTF-8 handles', () => {
    const trusted = createTrustedCanonicalUtf8Text('abcdef');
    expect(
      patchTrustedCanonicalUtf8Text(trusted, [
        { startUtf16Offset: 1, endUtf16Offset: 4, replacement: 'x' },
        { startUtf16Offset: 3, endUtf16Offset: 5, replacement: 'y' },
      ]),
    ).toBeUndefined();

    const forged = Object.freeze({
      utf16Length: 6,
      utf8ByteLength: 6,
    });
    // @ts-expect-error Deliberately exercises the runtime boundary with a forged handle.
    expect(hashTrustedCanonicalJsonTextPortable(HASH_DOMAINS.documentContent, forged)).toBe(
      undefined,
    );
    // @ts-expect-error Deliberately exercises the runtime boundary with a forged handle.
    expect(patchTrustedCanonicalUtf8Text(forged, [])).toBeUndefined();
  });

  it('fails closed for unauthenticated UTF-8 offsets and surrogate midpoints', () => {
    const repeated = patchTrustedCanonicalUtf8Text(createTrustedCanonicalUtf8Text('bc'), [
      { startUtf16Offset: 0, endUtf16Offset: 1, replacement: 'a' },
      { startUtf16Offset: 1, endUtf16Offset: 2, replacement: 'a' },
    ]);
    expect(repeated?.canonicalText).toBe('aa');
    const secondRepeatedRange = repeated?.replacements[1];
    expect(secondRepeatedRange).toBeDefined();
    expect(
      repeated === undefined || secondRepeatedRange === undefined
        ? undefined
        : patchTrustedCanonicalUtf8Text(repeated.utf8, [
            {
              startUtf16Offset: 0,
              endUtf16Offset: 1,
              replacement: 'X',
              startUtf8Offset: secondRepeatedRange.nextStartUtf8Offset,
              endUtf8Offset: secondRepeatedRange.nextEndUtf8Offset,
            },
          ]),
    ).toBeUndefined();

    const insertion = patchTrustedCanonicalUtf8Text(createTrustedCanonicalUtf8Text('ab'), [
      { startUtf16Offset: 0, endUtf16Offset: 0, replacement: '' },
      { startUtf16Offset: 2, endUtf16Offset: 2, replacement: '' },
    ]);
    expect(insertion?.canonicalText).toBe('ab');
    const secondInsertionRange = insertion?.replacements[1];
    expect(secondInsertionRange).toBeDefined();
    expect(
      insertion === undefined || secondInsertionRange === undefined
        ? undefined
        : patchTrustedCanonicalUtf8Text(insertion.utf8, [
            {
              startUtf16Offset: 0,
              endUtf16Offset: 0,
              replacement: 'X',
              startUtf8Offset: secondInsertionRange.nextStartUtf8Offset,
              endUtf8Offset: secondInsertionRange.nextEndUtf8Offset,
            },
          ]),
    ).toBeUndefined();

    const supplementaryScalar = createTrustedCanonicalUtf8Text('🌍');
    expect(
      patchTrustedCanonicalUtf8Text(supplementaryScalar, [
        {
          startUtf16Offset: 1,
          endUtf16Offset: 1,
          replacement: 'X',
        },
      ]),
    ).toBeUndefined();
    expect(
      patchTrustedCanonicalUtf8Text(supplementaryScalar, [
        {
          startUtf16Offset: 0,
          endUtf16Offset: 2,
          replacement: '\ud800',
        },
      ]),
    ).toBeUndefined();
  });
});

function expectPortableHash(value: string): void {
  const expectedBytes = createHash('sha256').update(value, 'utf8').digest();
  const expectedHex = expectedBytes.toString('hex');

  expect(sha256Utf8(value)).toBe(expectedHex);
  expect(Buffer.from(sha256Utf8Bytes(value))).toEqual(expectedBytes);
  expect(Buffer.from(encodeUtf8(value)).equals(Buffer.from(value, 'utf8'))).toBe(true);
}
