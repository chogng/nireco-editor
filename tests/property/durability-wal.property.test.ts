import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  parseContentHash,
  parseRevisionId,
  parseTransactionId,
  type ContentHash,
  type RevisionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import { canonicalizeResourceUri, type ResourceUri } from '../../src/base/uri/resource-uri.js';
import { crc32, encodeUtf8, PortableWalRecordCodec } from '../../src/storage/wal-record-codec.js';
import type { WalCommitRecord } from '../../src/workspace/document-authority/durability-ports.js';

describe('WAL record framing properties', () => {
  it('round-trips canonical JSON UTF-8 payloads with a stable checksum', () => {
    const codec = new PortableWalRecordCodec();

    fc.assert(
      fc.property(fc.string(), fc.nat(1_000_000), (text, sequence) => {
        const record = createRecord({
          sequence,
          replayText: text,
        });

        const encoded = codec.encode(record);
        expect(encoded.type).toBe('ok');
        if (encoded.type === 'error') {
          return;
        }

        expect(codec.decode(encoded.value)).toEqual({
          type: 'ok',
          records: [record],
          validByteLength: encoded.value.byteLength,
          truncatedTail: false,
        });
      }),
      {
        numRuns: 100,
      },
    );
  });

  it('truncates every incomplete suffix of the final frame at the prior valid boundary', () => {
    const codec = new PortableWalRecordCodec();
    const first = encodeOrThrow(codec, createRecord({ sequence: 1, replayText: 'first' }));
    const second = encodeOrThrow(
      codec,
      createRecord({
        sequence: 2,
        replayText: 'second 🌍',
        revisionId: productionRevisionId('018f0000-0000-7000-8000-000000000002'),
        parentRevisionId: productionRevisionId('018f0000-0000-7000-8000-000000000001'),
        transactionId: productionTransactionId('018f0000-0001-7000-8000-000000000002'),
      }),
    );

    fc.assert(
      fc.property(fc.integer({ min: 1, max: second.byteLength - 1 }), (partialLength) => {
        const bytes = concatenate(first, second.subarray(0, partialLength));
        const decoded = codec.decode(bytes);

        expect(decoded).toMatchObject({
          type: 'ok',
          validByteLength: first.byteLength,
          truncatedTail: true,
        });
        if (decoded.type === 'ok') {
          expect(decoded.records).toHaveLength(1);
        }
      }),
      {
        numRuns: 100,
      },
    );
  });

  it('classifies a corrupted middle length header as corruption when a later frame is complete', () => {
    const codec = new PortableWalRecordCodec();
    const first = encodeOrThrow(codec, createRecord({ sequence: 1, replayText: 'first' }));
    const second = encodeOrThrow(
      codec,
      createRecord({
        sequence: 2,
        replayText: 'second',
        revisionId: productionRevisionId('018f0000-0000-7000-8000-000000000002'),
        parentRevisionId: productionRevisionId('018f0000-0000-7000-8000-000000000001'),
        transactionId: productionTransactionId('018f0000-0001-7000-8000-000000000002'),
      }),
    );
    const third = encodeOrThrow(
      codec,
      createRecord({
        sequence: 3,
        replayText: 'third',
        revisionId: productionRevisionId('018f0000-0000-7000-8000-000000000003'),
        parentRevisionId: productionRevisionId('018f0000-0000-7000-8000-000000000002'),
        transactionId: productionTransactionId('018f0000-0001-7000-8000-000000000003'),
      }),
    );
    const corruptedSecond = second.slice();
    writeUint32BigEndian(corruptedSecond, 0, readUint32BigEndian(second, 0) + third.byteLength + 1);

    expect(codec.decode(concatenate(concatenate(first, corruptedSecond), third))).toMatchObject({
      type: 'corrupt',
      validByteLength: first.byteLength,
      corruptionOffset: first.byteLength,
      reason: 'invalid-length',
    });
  });

  it('rejects valid JSON WAL payloads that are not the exact canonical serialization', () => {
    const codec = new PortableWalRecordCodec();
    const record = createRecord({
      sequence: 1,
      replayText: 'non-canonical',
    });
    const nonCanonicalPayload = encodeUtf8(JSON.stringify(record, undefined, 2));

    expect(codec.decode(framePayload(nonCanonicalPayload))).toMatchObject({
      type: 'corrupt',
      corruptionOffset: 0,
      reason: 'non-canonical-payload',
    });
  });
});

interface RecordOverrides {
  readonly sequence: number;
  readonly replayText: string;
  readonly revisionId?: RevisionId;
  readonly parentRevisionId?: RevisionId | null;
  readonly transactionId?: TransactionId;
}

function createRecord(overrides: RecordOverrides): WalCommitRecord {
  return {
    recordVersion: 1,
    recordType: 'commit',
    uri: productionUri(),
    revisionId:
      overrides.revisionId ?? productionRevisionId('018f0000-0000-7000-8000-000000000001'),
    parentRevisionId:
      overrides.parentRevisionId ?? productionRevisionId('018f0000-0000-7000-8000-000000000000'),
    transactionId:
      overrides.transactionId ?? productionTransactionId('018f0000-0001-7000-8000-000000000001'),
    sequence: overrides.sequence,
    transactionHash: contentHash('1'),
    documentHash: contentHash('0'),
    replayInput: {
      text: overrides.replayText,
    },
  };
}

function encodeOrThrow(codec: PortableWalRecordCodec, record: WalCommitRecord): Uint8Array {
  const encoded = codec.encode(record);
  if (encoded.type === 'error') {
    throw new Error('Expected the WAL record to encode.');
  }
  return encoded.value;
}

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left, 0);
  result.set(right, left.byteLength);
  return result;
}

function framePayload(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(8 + payload.byteLength);
  writeUint32BigEndian(frame, 0, payload.byteLength);
  writeUint32BigEndian(frame, 4, crc32(payload));
  frame.set(payload, 8);
  return frame;
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

function productionUri(): ResourceUri {
  const parsed = canonicalizeResourceUri('nireco://workspace-01/document/recovery');
  if (parsed.type === 'invalid') {
    throw new Error('Expected a valid test URI.');
  }
  return parsed.value;
}

function productionRevisionId(value: string): RevisionId {
  const parsed = parseRevisionId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a production Revision UUIDv7.');
  }
  return parsed.value;
}

function productionTransactionId(value: string): TransactionId {
  const parsed = parseTransactionId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a production Transaction UUIDv7.');
  }
  return parsed.value;
}

function contentHash(digit: string): ContentHash {
  const parsed = parseContentHash(`sha256:${digit.repeat(64)}`);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a valid SHA-256 content hash.');
  }
  return parsed.value;
}
