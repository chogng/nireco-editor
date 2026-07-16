import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { Result } from '../../src/base/errors/nireco-error.js';
import {
  parseContentHash,
  parseRevisionId,
  parseTransactionId,
  type ContentHash,
  type RevisionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import { isDocumentUri, type DocumentUri } from '../../src/base/uri/resource-uri.js';
import type { Revision } from '../../src/model/revision/revision.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import { InMemoryDurableStorage } from '../../src/storage/in-memory-durable-storage.js';
import { recoverDocument } from '../../src/storage/recovery.js';
import {
  AtomicSnapshotStore,
  CanonicalSnapshotCodec,
  type IDocumentSnapshotDecoder,
} from '../../src/storage/snapshot-store.js';
import { PortableWalRecordCodec } from '../../src/storage/wal-record-codec.js';
import { InMemoryAuthorityLeaseCoordinator } from '../../src/workspace/document-authority/authority-lease.js';
import type {
  AuthorityFence,
  WalCommitRecord,
} from '../../src/workspace/document-authority/durability-ports.js';
import { createMinimalSnapshot, validIsoTimestamp } from '../test-support/fixtures.js';

describe('Snapshot + WAL recovery conformance', () => {
  it('truncates an incomplete tail and replays only the complete prefix', async () => {
    const fixture = await loadRecoveryFixture('recovery-tail-truncation.json');
    if (fixture.fault.kind !== 'truncate-final-frame') {
      throw new Error('Expected the tail-truncation fixture.');
    }
    const harness = createRecoveryHarness(fixture);
    const frames = fixture.records.map((record) => encodeOrThrow(harness.codec, record));
    const completeBytes = concatenateAll(frames);
    harness.storage.seedDurableWal(
      fixture.uri,
      completeBytes.slice(0, completeBytes.byteLength - fixture.fault.bytesRemoved),
    );

    const recovered = await recoverFixture(harness, fixture);

    expect(recovered).toMatchObject({
      type: 'ok',
      value: {
        headRevisionId: fixture.expected.headRevisionId,
        headSequence: fixture.expected.headSequence,
        appliedRecordCount: fixture.expected.appliedRecordCount,
        truncatedTail: true,
      },
    });
    expect(harness.storage.durableWalBytes(fixture.uri).byteLength).toBe(frames[0]?.byteLength);
  });

  it('enters recovery-required mode on middle corruption without truncating it', async () => {
    const fixture = await loadRecoveryFixture('recovery-middle-corruption.json');
    if (fixture.fault.kind !== 'xor-middle-frame-payload-byte') {
      throw new Error('Expected the middle-corruption fixture.');
    }
    const harness = createRecoveryHarness(fixture);
    const frames = fixture.records.map((record) => encodeOrThrow(harness.codec, record));
    const completeBytes = concatenateAll(frames);
    const corruptionOffset =
      sumByteLengths(frames.slice(0, fixture.fault.recordIndex)) +
      8 +
      fixture.fault.payloadByteOffset;
    const corrupted = completeBytes.slice();
    corrupted[corruptionOffset] = (corrupted[corruptionOffset] ?? 0) ^ fixture.fault.xorMask;
    harness.storage.seedDurableWal(fixture.uri, corrupted);

    const recovered = await recoverFixture(harness, fixture);

    expect(recovered).toMatchObject({
      type: 'error',
      error: {
        code: 'RECOVERY_REQUIRED',
        reason: 'wal-corrupt',
      },
    });
    expect(harness.storage.durableWalBytes(fixture.uri)).toEqual(corrupted);
  });

  it('does not truncate a corrupted middle length header when a later frame is complete', async () => {
    const fixture = await loadRecoveryFixture('recovery-middle-length-corruption.json');
    if (fixture.fault.kind !== 'inflate-middle-frame-length') {
      throw new Error('Expected the middle-length-corruption fixture.');
    }
    const harness = createRecoveryHarness(fixture);
    const frames = fixture.records.map((record) => encodeOrThrow(harness.codec, record));
    const corrupted = concatenateAll(frames);
    const corruptionOffset = sumByteLengths(frames.slice(0, fixture.fault.recordIndex));
    writeUint32BigEndian(
      corrupted,
      corruptionOffset,
      readUint32BigEndian(corrupted, corruptionOffset) + fixture.fault.additionalBytes,
    );
    harness.storage.seedDurableWal(fixture.uri, corrupted);

    const recovered = await recoverFixture(harness, fixture);

    expect(recovered).toMatchObject({
      type: 'error',
      error: {
        code: 'RECOVERY_REQUIRED',
        reason: 'wal-corrupt',
        corruptionOffset,
      },
    });
    expect(harness.storage.durableWalBytes(fixture.uri)).toEqual(corrupted);
  });

  it.each([
    {
      name: 'duplicate sequence',
      mutate: (records: readonly WalCommitRecord[]) => {
        const first = requiredWalRecord(records, 0);
        return [
          first,
          {
            ...requiredWalRecord(records, 1),
            sequence: first.sequence,
          },
        ];
      },
    },
    {
      name: 'backward sequence',
      mutate: (records: readonly WalCommitRecord[]) => [
        requiredWalRecord(records, 0),
        {
          ...requiredWalRecord(records, 1),
          sequence: 0,
        },
      ],
    },
  ])('rejects $name in WAL records already covered by the Snapshot', async ({ mutate }) => {
    const fixture = await loadRecoveryFixture('recovery-tail-truncation.json');
    const coveredHead = requiredWalRecord(fixture.records, 1);
    const coveredFixture: RecoveryFixture = {
      ...fixture,
      base: {
        ...fixture.base,
        revisionId: coveredHead.revisionId,
        sequence: coveredHead.sequence,
      },
      records: mutate(fixture.records),
    };
    const harness = createRecoveryHarness(coveredFixture);
    harness.storage.seedDurableWal(
      coveredFixture.uri,
      concatenateAll(coveredFixture.records.map((record) => encodeOrThrow(harness.codec, record))),
    );

    await expect(recoverFixture(harness, coveredFixture)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'RECOVERY_REQUIRED',
        reason: 'history-discontinuous',
      },
    });
  });

  it('rejects a duplicate Revision ID even when sequence and parent links are otherwise continuous', async () => {
    const fixture = await loadRecoveryFixture('recovery-middle-corruption.json');
    const duplicateRevisionId = requiredWalRecord(fixture.records, 0).revisionId;
    const duplicateRevisionRecords = fixture.records.map((record, index) =>
      index === 2
        ? {
            ...record,
            revisionId: duplicateRevisionId,
          }
        : record,
    );
    const duplicateFixture: RecoveryFixture = {
      ...fixture,
      records: duplicateRevisionRecords,
    };
    const harness = createRecoveryHarness(duplicateFixture);
    harness.storage.seedDurableWal(
      duplicateFixture.uri,
      concatenateAll(
        duplicateFixture.records.map((record) => encodeOrThrow(harness.codec, record)),
      ),
    );

    await expect(recoverFixture(harness, duplicateFixture)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'RECOVERY_REQUIRED',
        reason: 'history-discontinuous',
      },
    });
  });

  it('uses the observed WAL byte length as a compare-and-truncate precondition', async () => {
    const fixture = await loadRecoveryFixture('recovery-tail-truncation.json');
    const harness = createRecoveryHarness(fixture);
    const durable = Uint8Array.of(1, 2, 3, 4);
    harness.storage.seedDurableWal(fixture.uri, durable);

    await expect(
      harness.storage.truncateDurable(harness.fence, durable.byteLength + 1, 2),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        stage: 'wal-truncate',
        reason: 'length-conflict',
      },
    });
    expect(harness.storage.durableWalBytes(fixture.uri)).toEqual(durable);
  });
});

interface RecoveryFixture {
  readonly uri: DocumentUri;
  readonly base: {
    readonly revisionId: RevisionId;
    readonly sequence: number;
    readonly documentHash: ContentHash;
  };
  readonly records: readonly WalCommitRecord[];
  readonly fault:
    | {
        readonly kind: 'truncate-final-frame';
        readonly bytesRemoved: number;
      }
    | {
        readonly kind: 'xor-middle-frame-payload-byte';
        readonly recordIndex: number;
        readonly payloadByteOffset: number;
        readonly xorMask: number;
      }
    | {
        readonly kind: 'inflate-middle-frame-length';
        readonly recordIndex: number;
        readonly additionalBytes: number;
      };
  readonly expected: {
    readonly headRevisionId?: RevisionId;
    readonly headSequence?: number;
    readonly appliedRecordCount?: number;
  };
}

interface RecoveryHarness {
  readonly storage: InMemoryDurableStorage;
  readonly snapshots: AtomicSnapshotStore;
  readonly codec: PortableWalRecordCodec;
  readonly fence: ReturnType<typeof acquireFence>;
}

function createRecoveryHarness(fixture: RecoveryFixture): RecoveryHarness {
  const leases = new InMemoryAuthorityLeaseCoordinator();
  const fence = acquireFence(leases, fixture.uri);
  const storage = new InMemoryDurableStorage({
    isFenceCurrent: (candidate) => leases.isFenceCurrent(candidate),
  });
  return {
    storage,
    snapshots: new AtomicSnapshotStore({
      bytes: storage,
      codec: new CanonicalSnapshotCodec(new FixtureSnapshotDecoder()),
    }),
    codec: new PortableWalRecordCodec(),
    fence,
  };
}

async function recoverFixture(
  harness: RecoveryHarness,
  fixture: RecoveryFixture,
): Promise<Awaited<ReturnType<typeof recoverDocument>>> {
  const snapshot = createMinimalSnapshot(fixture.base.revisionId);
  const revision: Revision = {
    id: fixture.base.revisionId,
    uri: fixture.uri,
    parentRevisionId: null,
    transactionId: productionTransactionId('018f0000-0001-7000-8000-000000000000'),
    sequence: fixture.base.sequence,
    documentHash: fixture.base.documentHash,
    actor: {
      type: 'system',
      id: 'recovery',
      role: 'recovery',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
    durability: 'snapshot',
  };
  return recoverDocument({
    uri: fixture.uri,
    fence: harness.fence,
    wal: harness.storage,
    walCodec: harness.codec,
    snapshots: harness.snapshots,
    fallback: {
      revision,
      snapshot,
    },
    validateRecord: () => ok(),
    validateSnapshot: (candidate) =>
      candidate.documentHash === fixture.base.documentHash
        ? ok()
        : validationError('The document hash is not expected by this recovery vector.'),
    replay: (current, record) => ({
      type: 'ok',
      value: {
        ...current,
        revisionId: record.revisionId,
        documentHash: record.documentHash,
      },
    }),
  });
}

async function loadRecoveryFixture(fileName: string): Promise<RecoveryFixture> {
  const source = await readFile(
    new URL(`../../contracts/comet-integration/recovery-fixtures/${fileName}`, import.meta.url),
    'utf8',
  );
  const parsed: unknown = JSON.parse(source);
  const root = requiredRecord(parsed, 'fixture');
  const base = requiredRecord(root['base'], 'base');
  const recordValues = requiredArray(root['records'], 'records');
  const records = recordValues.map(parseFixtureRecord);
  if (records.length === 0) {
    throw new Error('Recovery fixtures require at least one WAL record.');
  }
  const uri = records[0]?.uri;
  if (uri === undefined || !isDocumentUri(uri)) {
    throw new Error('Recovery fixture records require one canonical document URI.');
  }

  return {
    uri,
    base: {
      revisionId: productionRevisionId(requiredString(base['revisionId'], 'base.revisionId')),
      sequence: requiredNonNegativeInteger(base['sequence'], 'base.sequence'),
      documentHash: contentHash(base['documentHash'], 'base.documentHash'),
    },
    records,
    fault: parseFault(root['fault']),
    expected: parseExpected(root['expected']),
  };
}

function parseFixtureRecord(value: unknown): WalCommitRecord {
  const record = requiredRecord(value, 'record');
  const uri = requiredString(record['uri'], 'record.uri');
  if (!isDocumentUri(uri)) {
    throw new Error('record.uri must be a canonical document URI.');
  }
  const replayInput = requiredRecord(record['replayInput'], 'record.replayInput');
  return {
    recordVersion: 1,
    recordType: 'commit',
    uri,
    revisionId: productionRevisionId(requiredString(record['revisionId'], 'record.revisionId')),
    parentRevisionId:
      record['parentRevisionId'] === null
        ? null
        : productionRevisionId(
            requiredString(record['parentRevisionId'], 'record.parentRevisionId'),
          ),
    transactionId: productionTransactionId(
      requiredString(record['transactionId'], 'record.transactionId'),
    ),
    sequence: requiredNonNegativeInteger(record['sequence'], 'record.sequence'),
    transactionHash: contentHash(record['transactionHash'], 'record.transactionHash'),
    documentHash: contentHash(record['documentHash'], 'record.documentHash'),
    replayInput: {
      nextRevisionId: requiredString(
        replayInput['nextRevisionId'],
        'record.replayInput.nextRevisionId',
      ),
    },
  };
}

function parseFault(value: unknown): RecoveryFixture['fault'] {
  const fault = requiredRecord(value, 'fault');
  const kind = requiredString(fault['kind'], 'fault.kind');
  if (kind === 'truncate-final-frame') {
    return {
      kind,
      bytesRemoved: requiredPositiveInteger(fault['bytesRemoved'], 'fault.bytesRemoved'),
    };
  }
  if (kind === 'xor-middle-frame-payload-byte') {
    return {
      kind,
      recordIndex: requiredNonNegativeInteger(fault['recordIndex'], 'fault.recordIndex'),
      payloadByteOffset: requiredNonNegativeInteger(
        fault['payloadByteOffset'],
        'fault.payloadByteOffset',
      ),
      xorMask: requiredPositiveInteger(fault['xorMask'], 'fault.xorMask'),
    };
  }
  if (kind === 'inflate-middle-frame-length') {
    return {
      kind,
      recordIndex: requiredNonNegativeInteger(fault['recordIndex'], 'fault.recordIndex'),
      additionalBytes: requiredPositiveInteger(fault['additionalBytes'], 'fault.additionalBytes'),
    };
  }
  throw new Error('Unknown recovery fixture fault.');
}

function parseExpected(value: unknown): RecoveryFixture['expected'] {
  const expected = requiredRecord(value, 'expected');
  return {
    ...(typeof expected['headRevisionId'] === 'string'
      ? {
          headRevisionId: productionRevisionId(expected['headRevisionId']),
        }
      : {}),
    ...(typeof expected['headSequence'] === 'number'
      ? {
          headSequence: requiredNonNegativeInteger(
            expected['headSequence'],
            'expected.headSequence',
          ),
        }
      : {}),
    ...(typeof expected['appliedRecordCount'] === 'number'
      ? {
          appliedRecordCount: requiredNonNegativeInteger(
            expected['appliedRecordCount'],
            'expected.appliedRecordCount',
          ),
        }
      : {}),
  };
}

function acquireFence(leases: InMemoryAuthorityLeaseCoordinator, uri: DocumentUri): AuthorityFence {
  const acquired = leases.acquire(uri, 'recovery-authority');
  if (acquired.type === 'unavailable') {
    throw new Error('Expected the recovery Authority lease.');
  }
  return acquired.lease.fence;
}

function encodeOrThrow(codec: PortableWalRecordCodec, record: WalCommitRecord): Uint8Array {
  const encoded = codec.encode(record);
  if (encoded.type === 'error') {
    throw new Error('Expected the recovery WAL record to encode.');
  }
  return encoded.value;
}

function concatenateAll(parts: readonly Uint8Array[]): Uint8Array {
  const combined = new Uint8Array(sumByteLengths(parts));
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined;
}

function sumByteLengths(parts: readonly Uint8Array[]): number {
  return parts.reduce((sum, part) => sum + part.byteLength, 0);
}

function requiredWalRecord(records: readonly WalCommitRecord[], index: number): WalCommitRecord {
  const record = records[index];
  if (record === undefined) {
    throw new Error(`Expected WAL record ${index}.`);
  }
  return record;
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

function contentHash(value: unknown, label: string): ContentHash {
  const parsed = parseContentHash(requiredString(value, label));
  if (parsed.type === 'invalid') {
    throw new Error(`${label} must be a SHA-256 content hash.`);
  }
  return parsed.value;
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

function requiredNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  const parsed = requiredNonNegativeInteger(value, label);
  if (parsed === 0) {
    throw new Error(`${label} must be positive.`);
  }
  return parsed;
}

function ok(): Result<void, { safeMessage: string }> {
  return {
    type: 'ok',
    value: undefined,
  };
}

function validationError(safeMessage: string): Result<never, { safeMessage: string }> {
  return {
    type: 'error',
    error: {
      safeMessage,
    },
  };
}

class FixtureSnapshotDecoder implements IDocumentSnapshotDecoder {
  decode(
    value: unknown,
  ): Result<DocumentSnapshot, { reason: 'schema-invalid'; safeMessage: string }> {
    return isDocumentSnapshot(value)
      ? {
          type: 'ok',
          value,
        }
      : {
          type: 'error',
          error: {
            reason: 'schema-invalid',
            safeMessage: 'The recovery Snapshot does not have the expected protocol shape.',
          },
        };
  }
}

function isDocumentSnapshot(value: unknown): value is DocumentSnapshot {
  const record = value as Partial<DocumentSnapshot> | null;
  return (
    record !== null &&
    typeof record === 'object' &&
    record.format === 'nireco-document' &&
    typeof record.revisionId === 'string' &&
    typeof record.documentHash === 'string' &&
    record.root !== undefined
  );
}
