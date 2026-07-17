import { describe, expect, it } from 'vitest';

import type { JsonValue } from '../../src/base/serialization/canonical-json.js';
import type { DocumentUri } from '../../src/base/uri/resource-uri.js';
import { createDocumentIndexFromValidatedSnapshot } from '../../src/model/node/document-index.js';
import type { Revision } from '../../src/model/revision/revision.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import { prepareKernelTransaction } from '../../src/model/transaction/transaction-kernel.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import { replayTransactionCommit } from '../../src/storage/transaction-replay.js';
import type { WalCommitRecord } from '../../src/workspace/document-authority/durability-ports.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  MINIMAL_FIXTURE_IDS,
  validContentHash,
  validDocumentUri,
  validIsoTimestamp,
  validTransactionId,
  validUtf16Offset,
} from '../test-support/fixtures.js';

describe('replayTransactionCommit', () => {
  it('replays an ordered multi-ReplaceText WAL input through the same Transaction Kernel', () => {
    const fixture = createReplayFixture();

    const replayed = replayTransactionCommit(
      fixture.initialSnapshot,
      fixture.initialRevision,
      fixture.record,
    );

    expect(replayed).toEqual({
      type: 'ok',
      value: {
        revision: fixture.expectedRevision,
        snapshot: fixture.expectedSnapshot,
      },
    });
    if (replayed.type === 'error') {
      throw new Error(replayed.error.safeMessage);
    }
    expect(readMinimalText(replayed.value.snapshot)).toBe('Hello, Kernel replay.');
    expect(replayed.value.revision.documentHash).toBe(fixture.record.documentHash);
    expect(replayed.value.snapshot.documentHash).toBe(fixture.record.documentHash);
  });

  it('fails closed when the replay envelope or recorded hashes are tampered', () => {
    const fixture = createReplayFixture();
    const replayEnvelope = requiredJsonRecord(fixture.record.replayInput);
    const replayTransaction = requiredJsonRecord(replayEnvelope['transaction']);
    const invalidEnvelope: WalCommitRecord = {
      ...fixture.record,
      replayInput: {
        profile: 'unknown-replay-profile',
        transaction: {},
      },
    };
    const unknownTransactionField: WalCommitRecord = {
      ...fixture.record,
      replayInput: {
        ...replayEnvelope,
        transaction: {
          ...replayTransaction,
          futureProtocolField: true,
        },
      },
    };
    const wrongTransactionHash: WalCommitRecord = {
      ...fixture.record,
      transactionHash: validContentHash(
        'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      ),
    };
    const wrongDocumentHash: WalCommitRecord = {
      ...fixture.record,
      documentHash: validContentHash(
        'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      ),
    };

    expect(
      replayTransactionCommit(fixture.initialSnapshot, fixture.initialRevision, invalidEnvelope),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'invalid-replay-input',
      },
    });
    expect(
      replayTransactionCommit(
        fixture.initialSnapshot,
        fixture.initialRevision,
        unknownTransactionField,
      ),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'invalid-replay-input',
      },
    });
    expect(
      replayTransactionCommit(
        fixture.initialSnapshot,
        fixture.initialRevision,
        wrongTransactionHash,
      ),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'replay-hash-mismatch',
      },
    });
    expect(
      replayTransactionCommit(fixture.initialSnapshot, fixture.initialRevision, wrongDocumentHash),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'replay-hash-mismatch',
      },
    });
  });

  it('rejects replay input bound to another parent Revision', () => {
    const fixture = createReplayFixture();
    const wrongParent: WalCommitRecord = {
      ...fixture.record,
      parentRevisionId: fixture.record.revisionId,
    };

    expect(
      replayTransactionCommit(fixture.initialSnapshot, fixture.initialRevision, wrongParent),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'history-mismatch',
      },
    });
  });
});

interface ReplayFixture {
  readonly initialRevision: Revision;
  readonly initialSnapshot: DocumentSnapshot;
  readonly expectedRevision: Revision;
  readonly expectedSnapshot: DocumentSnapshot;
  readonly record: WalCommitRecord;
}

function createReplayFixture(): ReplayFixture {
  const uri = validDocumentUri('nireco://workspace-01/document/replay');
  const ids = new DeterministicIdAllocator();
  const initialSnapshot = createMinimalSnapshot();
  const transaction: Transaction = {
    id: ids.allocateTransactionId(),
    target: {
      uri,
      baseRevisionId: initialSnapshot.revisionId,
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
        startUtf16Offset: validUtf16Offset(7),
        endUtf16Offset: validUtf16Offset(13),
        replacement: 'Kernel runtime',
      },
      {
        id: ids.allocateOperationId(),
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        // This range is beyond the base text and is valid only after the first ordered edit.
        startUtf16Offset: validUtf16Offset(14),
        endUtf16Offset: validUtf16Offset(21),
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
        expected: initialSnapshot.documentHash,
      },
    ],
    metadata: {
      source: 'human-input',
      undoGroupId: 'typing-replay',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
  const nextRevisionId = ids.allocateRevisionId();
  const initialRevision = createInitialRevision(uri, initialSnapshot);
  const prepared = prepareKernelTransaction({
    transaction,
    headRevision: initialRevision,
    headSnapshot: initialSnapshot,
    nextRevisionId,
  });
  if (prepared.type === 'error') {
    throw new Error(prepared.error.safeMessage);
  }
  return {
    initialRevision,
    initialSnapshot,
    expectedRevision: {
      id: nextRevisionId,
      uri,
      parentRevisionId: initialRevision.id,
      transactionId: transaction.id,
      sequence: 1,
      documentHash: prepared.value.snapshot.documentHash,
      actor: transaction.actor,
      createdAt: transaction.createdAt,
      durability: 'wal',
    },
    expectedSnapshot: prepared.value.snapshot,
    record: {
      recordVersion: 1,
      recordType: 'commit',
      uri,
      revisionId: nextRevisionId,
      parentRevisionId: initialSnapshot.revisionId,
      transactionId: transaction.id,
      sequence: 1,
      transactionHash: prepared.value.transactionHash,
      documentHash: prepared.value.snapshot.documentHash,
      replayInput: prepared.value.replayInput,
    },
  };
}

function createInitialRevision(uri: DocumentUri, snapshot: DocumentSnapshot): Revision {
  return {
    id: snapshot.revisionId,
    uri,
    parentRevisionId: null,
    transactionId: validTransactionId('tx-replay-genesis'),
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

function requiredJsonRecord(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON object in the replay fixture.');
  }
  return value as Readonly<Record<string, JsonValue>>;
}

function readMinimalText(snapshot: DocumentSnapshot): string {
  const node = createDocumentIndexFromValidatedSnapshot(snapshot).getNode(MINIMAL_FIXTURE_IDS.text);
  if (node?.type !== 'text') {
    throw new Error('Expected the minimal fixture TextNode.');
  }
  return node.value;
}
