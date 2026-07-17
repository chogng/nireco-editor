import type { Result } from '../base/errors/nireco-error.js';
import type { RevisionId } from '../base/ids/identifiers.js';
import type { JsonValue } from '../base/serialization/canonical-json.js';
import { isDocumentUri, type DocumentUri } from '../base/uri/resource-uri.js';
import type { Revision } from '../model/revision/revision.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
import {
  prepareKernelTransaction,
  TRANSACTION_REPLAY_PROFILE,
} from '../model/transaction/transaction-kernel.js';
import type { Transaction } from '../model/transaction/transaction.js';
import { decodeStrictTransactionV1 } from '../model/transaction/transaction-runtime.js';
import type { WalCommitRecord } from '../workspace/document-authority/durability-ports.js';

export type TransactionReplayErrorReason =
  'history-mismatch' | 'invalid-replay-input' | 'kernel-replay-failed' | 'replay-hash-mismatch';

export interface TransactionReplayError {
  readonly reason: TransactionReplayErrorReason;
  readonly safeMessage: string;
}

export interface ReplayedTransactionCommit {
  readonly revision: Revision;
  readonly snapshot: DocumentSnapshot;
}

export function replayTransactionCommit(
  snapshot: DocumentSnapshot,
  headRevision: Revision,
  record: WalCommitRecord,
): Result<ReplayedTransactionCommit, TransactionReplayError> {
  const decoded = decodeReplayTransaction(record.replayInput);
  if (decoded.type === 'error') {
    return decoded;
  }
  const transaction = decoded.value;
  if (!matchesReplayHistory(snapshot, headRevision, record, transaction)) {
    return replayError(
      'history-mismatch',
      'The WAL replay input does not match its Revision history envelope.',
    );
  }

  const prepared = prepareKernelTransaction({
    transaction,
    headRevision,
    headSnapshot: snapshot,
    nextRevisionId: record.revisionId,
  });
  if (prepared.type === 'error') {
    return replayError('kernel-replay-failed', prepared.error.safeMessage);
  }
  if (
    prepared.value.transactionHash !== record.transactionHash ||
    prepared.value.snapshot.documentHash !== record.documentHash
  ) {
    return replayError(
      'replay-hash-mismatch',
      'The replayed Transaction or document hash does not match the WAL record.',
    );
  }
  return {
    type: 'ok',
    value: {
      revision: {
        id: record.revisionId,
        uri: record.uri,
        parentRevisionId: record.parentRevisionId,
        transactionId: record.transactionId,
        sequence: record.sequence,
        documentHash: record.documentHash,
        actor: transaction.actor,
        createdAt: transaction.createdAt,
        durability: 'wal',
      },
      snapshot: prepared.value.snapshot,
    },
  };
}

function matchesReplayHistory(
  snapshot: DocumentSnapshot,
  headRevision: Revision,
  record: WalCommitRecord,
  transaction: Transaction,
): record is ReplayableWalRecord {
  return (
    record.parentRevisionId !== null &&
    record.revisionId !== record.parentRevisionId &&
    record.sequence >= 1 &&
    snapshot.revisionId === record.parentRevisionId &&
    snapshot.revisionId === headRevision.id &&
    snapshot.documentHash === headRevision.documentHash &&
    headRevision.uri === record.uri &&
    headRevision.sequence + 1 === record.sequence &&
    transaction.id === record.transactionId &&
    transaction.target.baseRevisionId === record.parentRevisionId &&
    transaction.target.uri === record.uri &&
    isDocumentUri(record.uri)
  );
}

type ReplayableWalRecord = WalCommitRecord & {
  readonly uri: DocumentUri;
  readonly parentRevisionId: RevisionId;
};

function decodeReplayTransaction(value: JsonValue): Result<Transaction, TransactionReplayError> {
  const envelope = asClosedReplayEnvelope(value);
  if (envelope?.profile !== TRANSACTION_REPLAY_PROFILE) {
    return invalidReplayInput();
  }
  const transaction = decodeStrictTransactionV1(envelope.transaction);
  return transaction.type === 'error'
    ? invalidReplayInput()
    : {
        type: 'ok',
        value: transaction.value,
      };
}

function asClosedReplayEnvelope(
  value: JsonValue,
): Readonly<Record<'profile' | 'transaction', JsonValue>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const keys = Object.keys(value);
  return keys.length === 2 && keys.includes('profile') && keys.includes('transaction')
    ? (value as Readonly<Record<'profile' | 'transaction', JsonValue>>)
    : undefined;
}

function invalidReplayInput(): Result<never, TransactionReplayError> {
  return replayError(
    'invalid-replay-input',
    'The WAL record does not contain a valid canonical Transaction replay input.',
  );
}

function replayError(
  reason: TransactionReplayErrorReason,
  safeMessage: string,
): Result<never, TransactionReplayError> {
  return {
    type: 'error',
    error: {
      reason,
      safeMessage,
    },
  };
}
