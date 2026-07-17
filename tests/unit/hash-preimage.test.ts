import { describe, expect, it } from 'vitest';

import {
  HASH_DOMAINS,
  HASH_PREIMAGE_PREFIX,
  createCanonicalHashPreimage,
  hashCanonicalJson,
} from '../../src/base/hashing/hash-preimage.js';
import {
  PortableSha256ContentHasher,
  encodeUtf8,
  hashCanonicalJsonPortable,
  hashCanonicalJsonTextPortable,
  sha256Utf8,
} from '../../src/base/hashing/portable-sha-256.js';

describe('domain-separated SHA-256 preimages', () => {
  it('matches standard SHA-256 and UTF-8 vectors without Node or browser APIs', () => {
    expect(sha256Utf8('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(Array.from(encodeUtf8('A🌍'))).toEqual([0x41, 0xf0, 0x9f, 0x8c, 0x8d]);
  });

  it('freezes the exact domain, separator, and canonical JSON ordering', () => {
    expect(createCanonicalHashPreimage(HASH_DOMAINS.node, { z: 1, a: '🌍' })).toEqual({
      type: 'ok',
      canonicalJson: '{"a":"🌍","z":1}',
      preimage: `${HASH_PREIMAGE_PREFIX}${HASH_DOMAINS.node}\0{"a":"🌍","z":1}`,
    });
  });

  it('produces different hashes for the same payload in different domains', async () => {
    const hasher = new PortableSha256ContentHasher();
    const payload = {
      value: 'same canonical payload',
    };
    const nodeHash = await hashCanonicalJson(hasher, HASH_DOMAINS.node, payload);
    const transactionHash = await hashCanonicalJson(hasher, HASH_DOMAINS.transaction, payload);

    expect(nodeHash.type).toBe('ok');
    expect(transactionHash.type).toBe('ok');
    if (nodeHash.type === 'ok' && transactionHash.type === 'ok') {
      expect(nodeHash.hash).not.toBe(transactionHash.hash);
    }
  });

  it('hashes trusted canonical text with the exact full-serializer byte oracle', () => {
    const payload = {
      nested: ['A🌍', { combining: 'e\u0301' }],
      value: '\u0000 canonical separators stay escaped',
    };
    const full = hashCanonicalJsonPortable(HASH_DOMAINS.documentContent, payload);
    expect(full.type).toBe('ok');
    if (full.type === 'error') {
      return;
    }

    expect(hashCanonicalJsonTextPortable(HASH_DOMAINS.documentContent, full.canonicalJson)).toEqual(
      full,
    );
  });
});
