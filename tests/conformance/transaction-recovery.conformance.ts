import { describe, expect, it } from 'vitest';

import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../../src/base/hashing/portable-sha-256.js';
import type { Result } from '../../src/base/errors/nireco-error.js';
import { parseTransactionId, type TransactionId } from '../../src/base/ids/identifiers.js';
import type { DocumentUri } from '../../src/base/uri/resource-uri.js';
import { createDocumentIndexFromValidatedSnapshot } from '../../src/model/node/document-index.js';
import type { Revision } from '../../src/model/revision/revision.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import { validateDocumentSnapshot } from '../../src/model/schema/manuscript-validator.js';
import { InMemoryDurableStorage } from '../../src/storage/in-memory-durable-storage.js';
import { recoverDocument } from '../../src/storage/recovery.js';
import {
  AtomicSnapshotStore,
  CanonicalSnapshotCodec,
  type IDocumentSnapshotDecoder,
  type SnapshotCodecError,
} from '../../src/storage/snapshot-store.js';
import { replayTransactionCommit } from '../../src/storage/transaction-replay.js';
import { PortableWalRecordCodec } from '../../src/storage/wal-record-codec.js';
import {
  InMemoryAuthorityLeaseCoordinator,
  type AuthorityLease,
} from '../../src/workspace/document-authority/authority-lease.js';
import type { SnapshotManifest } from '../../src/workspace/document-authority/durability-ports.js';
import { SingleDocumentAuthority } from '../../src/workspace/document-authority/single-document-authority.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  MINIMAL_FIXTURE_IDS,
  validDocumentUri,
  validIsoTimestamp,
  validUtf16Offset,
} from '../test-support/fixtures.js';

describe('Transaction WAL recovery conformance', () => {
  it('preserves full Revision provenance across Snapshot compaction, tail replay and reopen', async () => {
    const uri = validDocumentUri('nireco://workspace-01/document/recovery-kernel');
    const ids = new DeterministicIdAllocator();
    const initialSnapshot = createMinimalSnapshot();
    const initialRevision = createInitialRevision(uri, initialSnapshot);
    const leases = new InMemoryAuthorityLeaseCoordinator();
    const initialLease = acquireLease(leases, uri, 'authority-before-compaction');
    const storage = new InMemoryDurableStorage({
      isFenceCurrent: (fence) => leases.isFenceCurrent(fence),
    });
    const walCodec = new PortableWalRecordCodec();
    const snapshots = new AtomicSnapshotStore({
      bytes: storage,
      codec: new CanonicalSnapshotCodec(new ProductionSnapshotDecoder()),
    });
    const authority = new SingleDocumentAuthority({
      uri,
      initialRevision,
      initialSnapshot,
      lease: initialLease,
      wal: storage,
      walCodec,
      snapshots,
      ids,
    });

    const snapshotCommit = await applyOrThrow(
      authority,
      createTransaction(uri, initialSnapshot, ids),
    );
    expect(readMinimalText(snapshotCommit.snapshot)).toBe('Hello, Nireco. replay-stage');
    await expect(
      authority.whenDurable(uri, snapshotCommit.revisionId, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'snapshot',
      },
    });
    const compactedRevision = readRevision(authority, snapshotCommit.revisionId);
    expect(compactedRevision.sequence).toBe(1);
    expect(compactedRevision.durability).toBe('snapshot');
    expect(storage.currentManifest(uri)).toEqual(manifestForRevision(compactedRevision, 1));

    // Compaction retains the Snapshot manifest and removes the covered WAL prefix.
    storage.seedDurableWal(uri, new Uint8Array());
    const tailCommit = await applyOrThrow(
      authority,
      createTransaction(uri, snapshotCommit.snapshot, ids),
    );
    await expect(authority.whenDurable(uri, tailCommit.revisionId, 'wal')).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'wal',
      },
    });
    const tailRevision = readRevision(authority, tailCommit.revisionId);
    expect(tailRevision.sequence).toBe(2);
    expect(tailRevision.parentRevisionId).toBe(compactedRevision.id);
    expect(readMinimalText(tailCommit.snapshot)).toBe('Hello, Nireco. replay-stage replay-stage');
    expect(storage.durableWalBytes(uri).byteLength).toBeGreaterThan(0);

    storage.crash();
    await authority.dispose();
    const recoveryLease = acquireLease(leases, uri, 'authority-after-tail-recovery');
    const recovered = await recoverDocument({
      uri,
      fence: recoveryLease.fence,
      wal: storage,
      walCodec,
      snapshots,
      fallback: {
        revision: initialRevision,
        snapshot: initialSnapshot,
      },
      validateRecord: () => ({
        type: 'ok',
        value: undefined,
      }),
      validateSnapshot,
      replay: replayTransactionCommit,
    });
    if (recovered.type === 'error') {
      throw new Error(recovered.error.safeMessage);
    }
    expect(recovered.value.headRevision.documentHash).toBe(tailCommit.snapshot.documentHash);
    expect(recovered.value.snapshot.documentHash).toBe(tailCommit.snapshot.documentHash);
    expect(readMinimalText(recovered.value.snapshot)).toBe(
      'Hello, Nireco. replay-stage replay-stage',
    );
    expect(recovered).toEqual({
      type: 'ok',
      value: {
        headRevision: tailRevision,
        headRevisionId: tailRevision.id,
        headSequence: 2,
        appliedRecordCount: 1,
        truncatedTail: false,
        truncatedByteCount: 0,
        snapshot: tailCommit.snapshot,
      },
    });

    const reopened = new SingleDocumentAuthority({
      uri,
      initialRevision: recovered.value.headRevision,
      initialSnapshot: recovered.value.snapshot,
      lease: recoveryLease,
      wal: storage,
      walCodec,
      snapshots,
      ids,
    });
    const duplicateTransaction: Transaction = {
      ...createTransaction(uri, recovered.value.snapshot, ids),
      id: recovered.value.headRevision.transactionId,
    };
    await expect(reopened.apply(duplicateTransaction)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
      },
    });

    const reopenedCommit = await applyOrThrow(
      reopened,
      createTransaction(uri, recovered.value.snapshot, ids),
    );
    await expect(
      reopened.whenDurable(uri, reopenedCommit.revisionId, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'snapshot',
      },
    });
    const reopenedRevision = readRevision(reopened, reopenedCommit.revisionId);
    expect(reopenedRevision).toMatchObject({
      parentRevisionId: tailRevision.id,
      sequence: 3,
      durability: 'snapshot',
    });
    expect(storage.currentManifest(uri)).toEqual(manifestForRevision(reopenedRevision, 2));

    // A second recovery from only the compacted Snapshot must produce a directly reopenable head.
    storage.seedDurableWal(uri, new Uint8Array());
    storage.crash();
    await reopened.dispose();
    const snapshotRecoveryLease = acquireLease(leases, uri, 'authority-after-snapshot-recovery');
    const recoveredAgain = await recoverDocument({
      uri,
      fence: snapshotRecoveryLease.fence,
      wal: storage,
      walCodec,
      snapshots,
      fallback: {
        revision: initialRevision,
        snapshot: initialSnapshot,
      },
      validateRecord: () => ({
        type: 'ok',
        value: undefined,
      }),
      validateSnapshot,
      replay: replayTransactionCommit,
    });
    expect(recoveredAgain).toEqual({
      type: 'ok',
      value: {
        headRevision: reopenedRevision,
        headRevisionId: reopenedRevision.id,
        headSequence: 3,
        snapshot: reopenedCommit.snapshot,
        appliedRecordCount: 0,
        truncatedTail: false,
        truncatedByteCount: 0,
      },
    });
    snapshotRecoveryLease.release();
  });

  it('rejects a non-closed Snapshot Revision identity before publishing a manifest', async () => {
    const uri = validDocumentUri('nireco://workspace-01/document/recovery-manifest-invalid');
    const snapshot = createMinimalSnapshot();
    const revision = createInitialRevision(uri, snapshot);
    const leases = new InMemoryAuthorityLeaseCoordinator();
    const lease = acquireLease(leases, uri, 'authority-invalid-manifest');
    const storage = new InMemoryDurableStorage({
      isFenceCurrent: (fence) => leases.isFenceCurrent(fence),
    });
    const snapshots = new AtomicSnapshotStore({
      bytes: storage,
      codec: new CanonicalSnapshotCodec(new ProductionSnapshotDecoder()),
    });
    const invalidActor: unknown = {
      ...revision.actor,
      futureProtocolField: true,
    };
    const invalidRevision: Revision = {
      ...revision,
      actor: invalidActor as Revision['actor'],
    };

    await expect(
      snapshots.commit({
        fence: lease.fence,
        revision: invalidRevision,
        snapshot,
      }),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        stage: 'snapshot-validate-temporary',
        reason: 'corrupt',
      },
    });
    expect(storage.currentManifest(uri)).toBeUndefined();
    lease.release();
  });
});

function acquireLease(
  leases: InMemoryAuthorityLeaseCoordinator,
  uri: DocumentUri,
  ownerId: string,
): AuthorityLease {
  const acquired = leases.acquire(uri, ownerId);
  if (acquired.type !== 'acquired') {
    throw new Error(`Expected the Authority lease for ${ownerId}.`);
  }
  return acquired.lease;
}

async function applyOrThrow(authority: SingleDocumentAuthority, transaction: Transaction) {
  const committed = await authority.apply(transaction);
  if (committed.type === 'error') {
    throw new Error(committed.error.safeMessage);
  }
  return committed.value;
}

function readRevision(authority: SingleDocumentAuthority, revisionId: Revision['id']): Revision {
  const revision = authority.getRevision(revisionId);
  if (revision.type === 'error') {
    throw new Error(revision.error.safeMessage);
  }
  return revision.value;
}

function manifestForRevision(revision: Revision, generation: number): SnapshotManifest {
  return {
    manifestVersion: 1,
    uri: revision.uri,
    revisionId: revision.id,
    parentRevisionId: revision.parentRevisionId,
    transactionId: revision.transactionId,
    sequence: revision.sequence,
    documentHash: revision.documentHash,
    actor: revision.actor,
    createdAt: revision.createdAt,
    snapshotKey: `snapshot:${revision.id}`,
    generation,
  };
}

function createTransaction(
  uri: DocumentUri,
  snapshot: DocumentSnapshot,
  ids: DeterministicIdAllocator,
): Transaction {
  const textLength = readMinimalText(snapshot).length;
  return {
    id: ids.allocateTransactionId(),
    target: {
      uri,
      baseRevisionId: snapshot.revisionId,
    },
    actor: {
      type: 'human',
      id: 'human-1',
    },
    operations: [
      {
        id: ids.allocateOperationId(),
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(textLength),
        endUtf16Offset: validUtf16Offset(textLength),
        replacement: ' WAL-stage',
      },
      {
        id: ids.allocateOperationId(),
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        // This range exists only after the preceding append has been applied to the draft.
        startUtf16Offset: validUtf16Offset(textLength + 1),
        endUtf16Offset: validUtf16Offset(textLength + 4),
        replacement: 'replay',
      },
    ],
    preconditions: [
      {
        kind: 'node-exists',
        nodeId: MINIMAL_FIXTURE_IDS.text,
      },
      {
        kind: 'document-hash',
        expected: snapshot.documentHash,
      },
    ],
    metadata: {
      source: 'human-input',
      undoGroupId: 'typing-recovery',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

function createInitialRevision(uri: DocumentUri, snapshot: DocumentSnapshot): Revision {
  return {
    id: snapshot.revisionId,
    uri,
    parentRevisionId: null,
    transactionId: productionTransactionId('018f0000-0000-7000-8000-00000000a002'),
    sequence: 0,
    documentHash: snapshot.documentHash,
    actor: {
      type: 'system',
      id: 'recovery',
      role: 'recovery',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
    durability: 'snapshot',
  };
}

function productionTransactionId(value: string): TransactionId {
  const parsed = parseTransactionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected a production Transaction ID: ${value}`);
  }
  return parsed.value;
}

function readMinimalText(snapshot: DocumentSnapshot): string {
  const node = createDocumentIndexFromValidatedSnapshot(snapshot).getNode(MINIMAL_FIXTURE_IDS.text);
  if (node?.type !== 'text') {
    throw new Error('Expected the minimal fixture TextNode.');
  }
  return node.value;
}

function validateSnapshot(
  snapshot: DocumentSnapshot,
): Result<void, { readonly safeMessage: string }> {
  const shape = validateDocumentSnapshot(snapshot);
  if (shape.type === 'error') {
    return {
      type: 'error',
      error: {
        safeMessage: shape.error.safeMessage,
      },
    };
  }
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(snapshot),
  );
  return hashed.type === 'ok' && hashed.hash === snapshot.documentHash
    ? {
        type: 'ok',
        value: undefined,
      }
    : {
        type: 'error',
        error: {
          safeMessage: 'The recovery Snapshot document hash is invalid.',
        },
      };
}

class ProductionSnapshotDecoder implements IDocumentSnapshotDecoder {
  decode(value: unknown): Result<DocumentSnapshot, SnapshotCodecError> {
    const validated = validateDocumentSnapshot(value);
    return validated.type === 'error'
      ? {
          type: 'error',
          error: {
            reason: 'schema-invalid',
            safeMessage: validated.error.safeMessage,
          },
        }
      : {
          type: 'ok',
          value: value as DocumentSnapshot,
        };
  }
}
