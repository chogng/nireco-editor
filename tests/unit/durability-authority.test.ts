import { describe, expect, it } from 'vitest';

import type { Result } from '../../src/base/errors/nireco-error.js';
import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../../src/base/hashing/portable-sha-256.js';
import {
  parseOperationId,
  parseTransactionId,
  type OperationId,
  type RevisionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import type { DocumentUri } from '../../src/base/uri/resource-uri.js';
import type { Revision } from '../../src/model/revision/revision.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import { MAX_TRANSACTION_CANONICAL_UTF8_BYTES } from '../../src/model/transaction/transaction-runtime.js';
import {
  InMemoryDurableStorage,
  type DurabilityFaultPoint,
} from '../../src/storage/in-memory-durable-storage.js';
import {
  AtomicSnapshotStore,
  CanonicalSnapshotCodec,
  type IDocumentSnapshotDecoder,
} from '../../src/storage/snapshot-store.js';
import { PortableWalRecordCodec } from '../../src/storage/wal-record-codec.js';
import {
  InMemoryAuthorityLeaseCoordinator,
  type AuthorityLease,
} from '../../src/workspace/document-authority/authority-lease.js';
import {
  SingleDocumentAuthority,
  type PreparedCommit,
} from '../../src/workspace/document-authority/single-document-authority.js';
import { createKernelCommitPreparer } from '../../src/workspace/document-authority/kernel-commit-preparer.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  MINIMAL_FIXTURE_IDS,
  validDocumentUri,
  validIsoTimestamp,
  validRevisionId,
  validUtf16Offset,
} from '../test-support/fixtures.js';

const FIXTURE_TRANSACTION_IDS = {
  genesis: '018f0000-0000-7000-8000-000000000900',
  'tx-1': '018f0000-0000-7000-8000-000000000901',
  'tx-2': '018f0000-0000-7000-8000-000000000902',
} as const;
const FIXTURE_OPERATION_IDS = {
  'tx-1': '018f0000-0000-7000-8000-000000000911',
  'tx-2': '018f0000-0000-7000-8000-000000000912',
} as const;

describe('SingleDocumentAuthority durability', () => {
  it('rejects an oversized Transaction before changing head or WAL state', async () => {
    const harness = createHarness();
    const transaction = createTransaction(harness.uri, harness.initialRevision.id, 'tx-1');
    const operation = transaction.operations[0];
    const oversized = {
      ...transaction,
      operations: [
        {
          ...operation,
          replacement: 'x'.repeat(MAX_TRANSACTION_CANONICAL_UTF8_BYTES),
        },
      ],
    } as Transaction;

    await expect(harness.authority.apply(oversized)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'REQUEST_TOO_LARGE',
        category: 'validation',
        retryable: false,
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: harness.initialRevision.id,
    });
    expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
  });

  it('separates memory commit from WAL acknowledgment and permits no second volatile head', async () => {
    const harness = createHarness();
    const fsyncPause = harness.storage.pauseAt('wal.fsync');
    const transaction = createTransaction(harness.uri, harness.initialRevision.id, 'tx-1');

    const committed = await harness.authority.apply(transaction);

    expect(committed).toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'memory',
      },
    });
    if (committed.type === 'error') {
      throw new Error('Expected the memory commit to succeed.');
    }
    expect(Object.keys(committed.value).sort()).toEqual([
      'achievedDurability',
      'inverse',
      'positionMap',
      'revisionId',
      'snapshot',
      'transactionHash',
    ]);
    expect(harness.authority.getDurability(harness.uri, committed.value.revisionId)).toEqual({
      type: 'ok',
      value: 'memory',
    });

    const blocked = await harness.authority.apply(
      createTransaction(harness.uri, committed.value.revisionId, 'tx-2'),
    );
    expect(blocked).toMatchObject({
      type: 'error',
      error: {
        code: 'TEMPORARY_UNAVAILABLE',
      },
    });

    const durable = harness.authority.whenDurable(harness.uri, committed.value.revisionId, 'wal');
    fsyncPause.release();

    await expect(durable).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'wal',
        authorityMode: 'read-write',
      },
    });
  });

  it('drives a Snapshot waiter to completion after WAL durability without an external checkpoint call', async () => {
    const harness = createHarness();
    const committed = await harness.authority.apply(
      createTransaction(harness.uri, harness.initialRevision.id, 'tx-1'),
    );
    if (committed.type === 'error') {
      throw new Error('Expected the memory commit to succeed.');
    }
    const revisionId = committed.value.revisionId;

    await expect(
      harness.authority.whenDurable(harness.uri, revisionId, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'ok',
      value: {
        revisionId,
        achievedDurability: 'snapshot',
        authorityMode: 'read-write',
      },
    });
    expect(harness.storage.currentManifest(harness.uri)).toMatchObject({
      revisionId,
    });
  });

  it('rejects an invalid runtime durability target without registering a waiter', async () => {
    const harness = createHarness();

    await expect(
      harness.authority.whenDurable(harness.uri, harness.initialRevision.id, 'remote' as never),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
        category: 'validation',
        retryable: false,
      },
    });
  });

  it('drains a registered Snapshot waiter while disposal seals new durability calls', async () => {
    const harness = createHarness();
    const revisionId = await commitAndWaitForWal(harness, harness.initialRevision.id, 'tx-1');
    const snapshotPause = harness.storage.pauseAt('snapshot.write-temporary');
    const snapshotDurability = harness.authority.whenDurable(harness.uri, revisionId, 'snapshot');

    const disposing = harness.authority.dispose();

    await expect(
      harness.authority.whenDurable(harness.uri, revisionId, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    snapshotPause.release();

    await expect(snapshotDurability).resolves.toMatchObject({
      type: 'ok',
      value: {
        revisionId,
        achievedDurability: 'snapshot',
        authorityMode: 'read-only',
      },
    });
    await expect(disposing).resolves.toBeUndefined();
    expect(harness.storage.currentManifest(harness.uri)).toMatchObject({
      revisionId,
    });
  });

  it('rejects a Snapshot waiter that cannot start before disposal drains WAL', async () => {
    const harness = createHarness();
    const fsyncPause = harness.storage.pauseAt('wal.fsync');
    const committed = await harness.authority.apply(
      createTransaction(harness.uri, harness.initialRevision.id, 'tx-1'),
    );
    if (committed.type === 'error') {
      throw new Error('Expected the memory commit to succeed.');
    }
    const snapshotDurability = harness.authority.whenDurable(
      harness.uri,
      committed.value.revisionId,
      'snapshot',
    );

    const disposing = harness.authority.dispose();

    await expect(snapshotDurability).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    fsyncPause.release();
    await expect(disposing).resolves.toBeUndefined();
    expect(harness.storage.currentManifest(harness.uri)).toBeUndefined();
  });

  it.each([
    {
      fault: 'wal.append',
      expectedCode: 'WAL_APPEND_FAILED',
    },
    {
      fault: 'wal.fsync',
      expectedCode: 'WAL_FSYNC_FAILED',
    },
  ] satisfies readonly {
    readonly fault: DurabilityFaultPoint;
    readonly expectedCode: 'WAL_APPEND_FAILED' | 'WAL_FSYNC_FAILED';
  }[])(
    'keeps the memory Revision but fails closed after $fault failure',
    async ({ fault, expectedCode }) => {
      const harness = createHarness();
      harness.storage.failNext(fault);
      const transaction = createTransaction(harness.uri, harness.initialRevision.id, 'tx-1');

      const committed = await harness.authority.apply(transaction);
      if (committed.type === 'error') {
        throw new Error('Expected the memory commit to succeed before WAL persistence fails.');
      }
      const durable = await harness.authority.whenDurable(
        harness.uri,
        committed.value.revisionId,
        'wal',
      );

      expect(durable).toMatchObject({
        type: 'error',
        error: {
          code: expectedCode,
        },
      });
      expect(harness.authority.mode).toBe('read-only');
      await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
        type: 'ok',
        value: committed.value.revisionId,
      });
      expect(harness.authority.getDurability(harness.uri, committed.value.revisionId)).toEqual({
        type: 'ok',
        value: 'memory',
      });

      const rejected = await harness.authority.apply(
        createTransaction(harness.uri, committed.value.revisionId, 'tx-2'),
      );
      expect(rejected).toMatchObject({
        type: 'error',
        error: {
          code: 'DURABILITY_UNREACHABLE',
        },
      });

      harness.storage.crash();
      expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
    },
  );

  it('does not start a Snapshot write after a terminal WAL failure', async () => {
    const harness = createHarness();
    const walSafeRevision = await commitAndWaitForWal(harness, harness.initialRevision.id, 'tx-1');
    harness.storage.failNext('wal.fsync');
    const failed = await harness.authority.apply(
      createTransaction(harness.uri, walSafeRevision, 'tx-2'),
    );
    if (failed.type === 'error') {
      throw new Error('Expected the second memory commit before its WAL failure.');
    }
    await expect(
      harness.authority.whenDurable(harness.uri, failed.value.revisionId, 'wal'),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'WAL_FSYNC_FAILED',
      },
    });

    await expect(harness.authority.checkpoint(walSafeRevision)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'DURABILITY_UNREACHABLE',
      },
    });
    await expect(
      harness.authority.whenDurable(harness.uri, walSafeRevision, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'DURABILITY_UNREACHABLE',
      },
    });
    expect(harness.storage.currentManifest(harness.uri)).toBeUndefined();
  });

  it('retains the previous manifest when the atomic switch fails and allows Snapshot retry', async () => {
    const harness = createHarness();
    const first = await commitAndWaitForWal(harness, harness.initialRevision.id, 'tx-1');
    await expect(harness.authority.checkpoint(first)).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'snapshot',
      },
    });
    const firstManifest = harness.storage.currentManifest(harness.uri);
    expect(firstManifest?.revisionId).toBe(first);
    if (firstManifest === undefined) {
      throw new Error('Expected the first Snapshot manifest.');
    }
    await expect(
      harness.storage.switchManifest(harness.lease.fence, 0, {
        manifestVersion: firstManifest.manifestVersion,
        uri: firstManifest.uri,
        revisionId: firstManifest.revisionId,
        parentRevisionId: firstManifest.parentRevisionId,
        transactionId: firstManifest.transactionId,
        sequence: firstManifest.sequence,
        documentHash: firstManifest.documentHash,
        actor: firstManifest.actor,
        createdAt: firstManifest.createdAt,
        snapshotKey: firstManifest.snapshotKey,
      }),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        reason: 'generation-conflict',
      },
    });
    expect(harness.storage.currentManifest(harness.uri)).toEqual(firstManifest);

    const second = await commitAndWaitForWal(harness, first, 'tx-2');
    harness.storage.failNext('snapshot.switch-manifest');

    await expect(harness.authority.checkpoint(second)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SNAPSHOT_COMMIT_FAILED',
      },
    });
    expect(harness.storage.currentManifest(harness.uri)).toEqual(firstManifest);
    expect(harness.authority.getDurability(harness.uri, second)).toEqual({
      type: 'ok',
      value: 'wal',
    });
    expect(harness.authority.mode).toBe('read-write');
    await expect(
      harness.authority.whenDurable(harness.uri, second, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SNAPSHOT_COMMIT_FAILED',
      },
    });

    await expect(harness.authority.checkpoint(second)).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'snapshot',
      },
    });
    expect(harness.storage.currentManifest(harness.uri)).toMatchObject({
      revisionId: second,
      generation: 2,
    });
  });

  it('fences a stale Authority before durable acknowledgment', async () => {
    const harness = createHarness();
    const fsyncPause = harness.storage.pauseAt('wal.fsync');
    const committed = await harness.authority.apply(
      createTransaction(harness.uri, harness.initialRevision.id, 'tx-1'),
    );
    if (committed.type === 'error') {
      throw new Error('Expected the memory commit to succeed.');
    }

    harness.lease.release();
    const replacement = harness.leases.acquire(harness.uri, 'authority-2');
    expect(replacement.type).toBe('acquired');
    fsyncPause.release();

    await expect(
      harness.authority.whenDurable(harness.uri, committed.value.revisionId, 'wal'),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'DURABILITY_UNREACHABLE',
      },
    });
    expect(harness.authority.mode).toBe('read-only');
  });

  it('becomes read-only when the Authority fence is lost during Snapshot persistence', async () => {
    const harness = createHarness();
    const revisionId = await commitAndWaitForWal(harness, harness.initialRevision.id, 'tx-1');

    const snapshotDurability = harness.authority.whenDurable(harness.uri, revisionId, 'snapshot');
    harness.lease.release();
    const replacement = harness.leases.acquire(harness.uri, 'authority-2');
    expect(replacement.type).toBe('acquired');

    await expect(snapshotDurability).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'DURABILITY_UNREACHABLE',
        retryable: false,
      },
    });
    expect(harness.authority.mode).toBe('read-only');
    expect(harness.authority.getDurability(harness.uri, revisionId)).toEqual({
      type: 'ok',
      value: 'wal',
    });
  });

  it('rejects a second live Authority lease and preserves atomicity on invalid prepared input', async () => {
    const harness = createHarness();
    expect(harness.leases.acquire(harness.uri, 'authority-2')).toMatchObject({
      type: 'unavailable',
      currentOwnerId: 'authority-1',
    });
    const transaction = createTransaction(harness.uri, harness.initialRevision.id, 'tx-1');
    const prepared = harness.prepare(transaction, harness.initialRevision, harness.initialSnapshot);
    if (prepared.type === 'error') {
      throw new Error('Expected the test commit preparer to succeed.');
    }
    const invalid: PreparedCommit = {
      ...prepared.value,
      revision: {
        ...prepared.value.revision,
        parentRevisionId: validRevisionId('rev-wrong-parent'),
      },
    };

    const rejected = await harness.authority.applyPrepared(transaction, invalid);

    expect(rejected).toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: harness.initialRevision.id,
    });
    expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
  });

  it('rejects a prepared commit that reuses an existing Revision ID', async () => {
    const harness = createHarness();
    const transaction = createTransaction(harness.uri, harness.initialRevision.id, 'tx-1');
    const prepared = harness.prepare(transaction, harness.initialRevision, harness.initialSnapshot);
    if (prepared.type === 'error') {
      throw new Error('Expected the test commit preparer to succeed.');
    }
    const duplicate: PreparedCommit = {
      ...prepared.value,
      revision: {
        ...prepared.value.revision,
        id: harness.initialRevision.id,
      },
      snapshot: {
        ...prepared.value.snapshot,
        revisionId: harness.initialRevision.id,
      },
    };

    await expect(harness.authority.applyPrepared(transaction, duplicate)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: harness.initialRevision.id,
    });
    expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
  });

  it('rejects prepared replay input that cannot reproduce the committed Transaction', async () => {
    const harness = createHarness();
    const transaction = createTransaction(harness.uri, harness.initialRevision.id, 'tx-1');
    const prepared = harness.prepare(transaction, harness.initialRevision, harness.initialSnapshot);
    if (prepared.type === 'error') {
      throw new Error('Expected the production commit preparer to succeed.');
    }
    const invalid: PreparedCommit = {
      ...prepared.value,
      replayInput: {
        profile: 'nireco-transaction-replay-1',
        transaction: {
          futureField: true,
        },
      },
    };

    await expect(harness.authority.applyPrepared(transaction, invalid)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: harness.initialRevision.id,
    });
    expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
  });

  it('rejects a valid but transaction-divergent prepared Snapshot', async () => {
    const harness = createHarness();
    const transaction = createTransaction(harness.uri, harness.initialRevision.id, 'tx-1');
    const prepared = harness.prepare(transaction, harness.initialRevision, harness.initialSnapshot);
    if (prepared.type === 'error') {
      throw new Error('Expected the production commit preparer to succeed.');
    }
    const divergentSnapshot: DocumentSnapshot = {
      ...prepared.value.snapshot,
      metadata: {
        ...prepared.value.snapshot.metadata,
        title: 'Content not produced by the persisted Transaction',
      },
    };
    const hashed = hashCanonicalJsonPortable(
      HASH_DOMAINS.documentContent,
      createDocumentHashPayload(divergentSnapshot),
    );
    if (hashed.type === 'error') {
      throw new Error('Expected the divergent Snapshot to remain canonical.');
    }
    const invalid: PreparedCommit = {
      ...prepared.value,
      revision: {
        ...prepared.value.revision,
        documentHash: hashed.hash,
      },
      snapshot: {
        ...divergentSnapshot,
        documentHash: hashed.hash,
      },
    };

    await expect(harness.authority.applyPrepared(transaction, invalid)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: harness.initialRevision.id,
    });
    expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
  });

  it('rejects a memory-only Revision as an Authority recovery base', () => {
    expect(() =>
      createHarness({
        initialDurability: 'memory',
      }),
    ).toThrow(/must agree and be durable/);
  });

  it('fails closed for durability and Revision reads after disposal', async () => {
    const harness = createHarness();

    await harness.authority.dispose();

    expect(harness.authority.getDurability(harness.uri, harness.initialRevision.id)).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    await expect(
      harness.authority.whenDurable(harness.uri, harness.initialRevision.id, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    expect(harness.authority.getRevision(harness.initialRevision.id)).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    await expect(harness.authority.checkpoint(harness.initialRevision.id)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
  });
});

interface Harness {
  readonly uri: DocumentUri;
  readonly initialRevision: Revision;
  readonly initialSnapshot: DocumentSnapshot;
  readonly leases: InMemoryAuthorityLeaseCoordinator;
  readonly lease: AuthorityLease;
  readonly storage: InMemoryDurableStorage;
  readonly authority: SingleDocumentAuthority;
  readonly prepare: (
    transaction: Transaction,
    headRevision: Revision,
    headSnapshot: DocumentSnapshot,
  ) => Result<PreparedCommit>;
}

interface HarnessOptions {
  readonly initialDurability?: Revision['durability'];
}

function createHarness(options: HarnessOptions = {}): Harness {
  const uri = validDocumentUri('nireco://workspace-01/document/durability');
  const initialSnapshot = createMinimalSnapshot();
  const initialRevision = createInitialRevision(
    uri,
    initialSnapshot,
    options.initialDurability ?? 'snapshot',
  );
  const leases = new InMemoryAuthorityLeaseCoordinator();
  const acquired = leases.acquire(uri, 'authority-1');
  if (acquired.type === 'unavailable') {
    throw new Error('Expected the Authority lease to be available.');
  }
  const storage = new InMemoryDurableStorage({
    isFenceCurrent: (fence) => leases.isFenceCurrent(fence),
  });
  const snapshotStore = new AtomicSnapshotStore({
    bytes: storage,
    codec: new CanonicalSnapshotCodec(new FixtureSnapshotDecoder()),
  });
  const ids = new DeterministicIdAllocator();
  const prepare = createKernelCommitPreparer({
    ids,
  });
  const authority = new SingleDocumentAuthority({
    uri,
    initialRevision,
    initialSnapshot,
    lease: acquired.lease,
    wal: storage,
    walCodec: new PortableWalRecordCodec(),
    snapshots: snapshotStore,
    ids,
  });

  return {
    uri,
    initialRevision,
    initialSnapshot,
    leases,
    lease: acquired.lease,
    storage,
    authority,
    prepare,
  };
}

function createInitialRevision(
  uri: DocumentUri,
  snapshot: DocumentSnapshot,
  durability: Revision['durability'],
): Revision {
  return {
    id: snapshot.revisionId,
    uri,
    parentRevisionId: null,
    transactionId: productionTransactionId(FIXTURE_TRANSACTION_IDS.genesis),
    sequence: 0,
    documentHash: snapshot.documentHash,
    actor: {
      type: 'system',
      id: 'recovery',
      role: 'recovery',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
    durability,
  };
}

function createTransaction(
  uri: DocumentUri,
  baseRevisionId: RevisionId,
  transactionLabel: keyof typeof FIXTURE_OPERATION_IDS,
): Transaction {
  return {
    id: productionTransactionId(FIXTURE_TRANSACTION_IDS[transactionLabel]),
    target: {
      uri,
      baseRevisionId,
    },
    actor: {
      type: 'human',
      id: 'human-1',
    },
    operations: [
      {
        id: productionOperationId(FIXTURE_OPERATION_IDS[transactionLabel]),
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(0),
        endUtf16Offset: validUtf16Offset(0),
        replacement: `${transactionLabel} `,
      },
    ],
    preconditions: [],
    metadata: {
      source: 'command',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

async function commitAndWaitForWal(
  harness: Harness,
  baseRevisionId: RevisionId,
  transactionId: keyof typeof FIXTURE_OPERATION_IDS,
): Promise<RevisionId> {
  const committed = await harness.authority.apply(
    createTransaction(harness.uri, baseRevisionId, transactionId),
  );
  if (committed.type === 'error') {
    throw new Error('Expected the memory commit to succeed.');
  }
  const durable = await harness.authority.whenDurable(
    harness.uri,
    committed.value.revisionId,
    'wal',
  );
  if (durable.type === 'error') {
    throw new Error('Expected the Revision to reach WAL durability.');
  }
  return committed.value.revisionId;
}

function productionTransactionId(value: string): TransactionId {
  const parsed = parseTransactionId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a production Transaction ID.');
  }
  return parsed.value;
}

function productionOperationId(value: string): OperationId {
  const parsed = parseOperationId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a production Operation ID.');
  }
  return parsed.value;
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
            safeMessage: 'The test Snapshot does not have the expected protocol shape.',
          },
        };
  }
}

function isDocumentSnapshot(value: unknown): value is DocumentSnapshot {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value['format'] === 'nireco-document' &&
    value['formatVersion'] === '1.0.0-preview.1' &&
    value['schemaId'] === 'nireco.manuscript' &&
    value['schemaVersion'] === '1.0.0-preview.1' &&
    typeof value['revisionId'] === 'string' &&
    typeof value['documentHash'] === 'string' &&
    isRecord(value['metadata']) &&
    isRecord(value['root']) &&
    isRecord(value['academicGraph']) &&
    isRecord(value['settings'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
