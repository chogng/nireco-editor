import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  parseNodeId,
  parseOperationId,
  parsePreviewFixtureNodeId,
  parseProposalChangeGroupId,
} from '../../src/base/ids/identifiers.js';
import {
  UuidV7IdAllocator,
  createUuidV7,
  type IUuidV7SeedSource,
  type UuidV7Seed,
} from '../../src/base/ids/uuid-v7-allocator.js';

describe('trusted ID production profile', () => {
  it('freezes lowercase UUIDv7 allocation and UUIDv8 derivation parsing', () => {
    expect(parseNodeId('018f0000-0000-7000-8000-000000000001').type).toBe('valid');
    expect(parseOperationId('018f0000-0000-7000-8000-000000000002').type).toBe('valid');
    expect(parseProposalChangeGroupId('1a35d9ac-7ac5-8cca-b888-9d038e9cae19').type).toBe('valid');

    expect(parseNodeId('018f0000-0000-8000-8000-000000000001')).toMatchObject({
      type: 'invalid',
      reason: 'wrong-uuid-version',
    });
    expect(parseNodeId('018F0000-0000-7000-8000-000000000001')).toMatchObject({
      type: 'invalid',
      reason: 'not-canonical-uuid',
    });
    expect(parseProposalChangeGroupId('018f0000-0000-7000-8000-000000000001')).toMatchObject({
      type: 'invalid',
      reason: 'wrong-uuid-version',
    });
  });

  it('keeps readable preview IDs behind an explicit compatibility parser', () => {
    expect(parseNodeId('node-fixture-1').type).toBe('invalid');
    expect(parsePreviewFixtureNodeId('node-fixture-1').type).toBe('valid');
  });

  it('encodes a byte-level UUIDv7 vector', () => {
    expect(
      createUuidV7({
        unixMilliseconds: 0x0123_4567_89ab,
        randomBytes: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
      }),
    ).toBe('01234567-89ab-7001-8203-040506070809');
  });

  it('allocates monotonic IDs when clock values repeat or move backwards', () => {
    const source = new SequenceSeedSource([seed(10, 0), seed(10, 0xff), seed(9, 0xff)]);
    const allocator = new UuidV7IdAllocator(source);
    const values = [
      allocator.allocateNodeId(),
      allocator.allocateOperationId(),
      allocator.allocateRevisionId(),
    ];

    expect(values).toEqual([...values].sort());
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => parseNodeId(value).type === 'valid')).toBe(true);
    expect(values).toEqual([
      '00000000-000a-7000-8000-000000000000',
      '00000000-000a-7000-8000-000000000001',
      '00000000-000a-7000-8000-000000000002',
    ]);
  });

  it('round-trips generated UUIDv7 values across randomized timestamp and entropy seeds', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: 0,
          max: 0xffff_ffff,
        }),
        fc.uint8Array({
          minLength: 10,
          maxLength: 10,
        }),
        (unixMilliseconds, randomBytes) => {
          const value = createUuidV7({
            unixMilliseconds,
            randomBytes,
          });
          expect(parseOperationId(value).type).toBe('valid');
          expect(value).toBe(value.toLowerCase());
        },
      ),
      {
        numRuns: 1000,
        seed: 20_260_716,
      },
    );
  });
});

class SequenceSeedSource implements IUuidV7SeedSource {
  readonly #seeds: readonly UuidV7Seed[];
  #index = 0;

  constructor(seeds: readonly UuidV7Seed[]) {
    this.#seeds = seeds;
  }

  nextSeed(): UuidV7Seed {
    const value = this.#seeds[this.#index];
    if (value === undefined) {
      throw new Error('Test UUIDv7 seed sequence was exhausted.');
    }
    this.#index += 1;
    return value;
  }
}

function seed(unixMilliseconds: number, byte: number): UuidV7Seed {
  return {
    unixMilliseconds,
    randomBytes: new Uint8Array(10).fill(byte),
  };
}
