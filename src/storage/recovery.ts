import type { Result } from '../base/errors/nireco-error.js';
import type { ResourceUri } from '../base/uri/resource-uri.js';
import type { TransactionId } from '../base/ids/identifiers.js';
import type { Revision } from '../model/revision/revision.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
import type {
  AuthorityFence,
  IAtomicSnapshotStore,
  IWalRecordCodec,
  IWriteAheadLog,
  WalCommitRecord,
} from '../workspace/document-authority/durability-ports.js';

export interface RecoveryValidationError {
  readonly safeMessage: string;
}

export type RecoveryRecordValidator = (
  record: WalCommitRecord,
) => Result<void, RecoveryValidationError>;

export type RecoverySnapshotValidator = (
  snapshot: DocumentSnapshot,
) => Result<void, RecoveryValidationError>;

export type RecoveryReplay = (
  snapshot: DocumentSnapshot,
  headRevision: Revision,
  record: WalCommitRecord,
) => Result<RecoveryReplayResult, RecoveryValidationError>;

export interface RecoveryReplayResult {
  readonly revision: Revision;
  readonly snapshot: DocumentSnapshot;
}

export interface RecoveryBase {
  readonly revision: Revision;
  readonly snapshot: DocumentSnapshot;
}

export interface RecoverDocumentOptions {
  readonly uri: ResourceUri;
  readonly fence: AuthorityFence;
  readonly wal: IWriteAheadLog;
  readonly walCodec: IWalRecordCodec;
  readonly snapshots: IAtomicSnapshotStore;
  readonly fallback: RecoveryBase;
  readonly validateRecord: RecoveryRecordValidator;
  readonly validateSnapshot: RecoverySnapshotValidator;
  readonly replay: RecoveryReplay;
}

export interface RecoverySuccess {
  readonly headRevision: Revision;
  readonly headRevisionId: Revision['id'];
  readonly headSequence: number;
  readonly snapshot: DocumentSnapshot;
  readonly appliedRecordCount: number;
  readonly truncatedTail: boolean;
  readonly truncatedByteCount: number;
}

export interface RecoveryFailure {
  readonly code: 'RECOVERY_REQUIRED';
  readonly reason:
    | 'storage-read-failed'
    | 'snapshot-invalid'
    | 'wal-corrupt'
    | 'wal-truncate-failed'
    | 'record-invalid'
    | 'history-discontinuous'
    | 'replay-failed'
    | 'document-hash-mismatch';
  readonly safeMessage: string;
  readonly corruptionOffset?: number;
}

export async function recoverDocument(
  options: RecoverDocumentOptions,
): Promise<Result<RecoverySuccess, RecoveryFailure>> {
  const base = await readRecoveryBase(options);
  if (base.type === 'error') {
    return base;
  }

  const baseValidation = options.validateSnapshot(base.value.snapshot);
  if (baseValidation.type === 'error') {
    return recoveryFailure('snapshot-invalid', baseValidation.error.safeMessage);
  }

  const durableWal = await options.wal.readDurable(options.uri);
  if (durableWal.type === 'error') {
    return recoveryFailure('storage-read-failed', durableWal.error.safeMessage);
  }

  const decoded = options.walCodec.decode(durableWal.value);
  if (decoded.type === 'corrupt') {
    return {
      type: 'error',
      error: {
        code: 'RECOVERY_REQUIRED',
        reason: 'wal-corrupt',
        safeMessage: `The WAL is corrupt at byte ${decoded.corruptionOffset}: ${decoded.reason}.`,
        corruptionOffset: decoded.corruptionOffset,
      },
    };
  }

  const truncated = await truncateIncompleteTail(options, durableWal.value.byteLength, decoded);
  if (truncated.type === 'error') {
    return truncated;
  }

  return replayRecords(options, base.value, decoded.records, {
    truncatedTail: decoded.truncatedTail,
    truncatedByteCount: durableWal.value.byteLength - decoded.validByteLength,
  });
}

interface ResolvedRecoveryBase {
  readonly revision: Revision;
  readonly snapshot: DocumentSnapshot;
}

async function readRecoveryBase(
  options: RecoverDocumentOptions,
): Promise<Result<ResolvedRecoveryBase, RecoveryFailure>> {
  const latest = await options.snapshots.readLatest(options.uri);
  if (latest.type === 'error') {
    return recoveryFailure(
      latest.error.reason === 'corrupt' ? 'snapshot-invalid' : 'storage-read-failed',
      latest.error.safeMessage,
    );
  }
  if (latest.value === undefined) {
    if (
      options.fallback.revision.uri !== options.uri ||
      options.fallback.snapshot.revisionId !== options.fallback.revision.id ||
      options.fallback.snapshot.documentHash !== options.fallback.revision.documentHash ||
      options.fallback.revision.durability === 'memory' ||
      !hasValidLinearRevisionShape(options.fallback.revision)
    ) {
      return recoveryFailure(
        'snapshot-invalid',
        'The fallback Revision and Snapshot do not agree.',
      );
    }
    return {
      type: 'ok',
      value: {
        revision: options.fallback.revision,
        snapshot: options.fallback.snapshot,
      },
    };
  }

  return {
    type: 'ok',
    value: {
      revision: latest.value.revision,
      snapshot: latest.value.snapshot,
    },
  };
}

async function truncateIncompleteTail(
  options: RecoverDocumentOptions,
  originalByteLength: number,
  decoded: Extract<ReturnType<IWalRecordCodec['decode']>, { type: 'ok' }>,
): Promise<Result<void, RecoveryFailure>> {
  if (!decoded.truncatedTail) {
    return {
      type: 'ok',
      value: undefined,
    };
  }
  if (decoded.validByteLength >= originalByteLength) {
    return recoveryFailure(
      'wal-truncate-failed',
      'The WAL decoder reported a tail without a shorter valid boundary.',
    );
  }
  const truncated = await options.wal.truncateDurable(
    options.fence,
    originalByteLength,
    decoded.validByteLength,
  );
  return truncated.type === 'error'
    ? recoveryFailure('wal-truncate-failed', truncated.error.safeMessage)
    : {
        type: 'ok',
        value: undefined,
      };
}

interface TailRecoveryState {
  readonly truncatedTail: boolean;
  readonly truncatedByteCount: number;
}

function replayRecords(
  options: RecoverDocumentOptions,
  base: ResolvedRecoveryBase,
  records: readonly WalCommitRecord[],
  tail: TailRecoveryState,
): Result<RecoverySuccess, RecoveryFailure> {
  const streamValidation = validateWalStream(options.uri, base, records);
  if (streamValidation.type === 'error') {
    return streamValidation;
  }

  let currentRevision = base.revision;
  let currentSnapshot = base.snapshot;
  let appliedRecordCount = 0;

  for (const record of records) {
    const recordValidation = options.validateRecord(record);
    if (recordValidation.type === 'error') {
      return recoveryFailure('record-invalid', recordValidation.error.safeMessage);
    }
    if (record.sequence < currentRevision.sequence) {
      continue;
    }
    if (record.sequence === currentRevision.sequence) {
      continue;
    }
    const continuity = validateContinuity(options.uri, currentRevision, record);
    if (continuity.type === 'error') {
      return continuity;
    }

    const replayed = options.replay(currentSnapshot, currentRevision, record);
    if (replayed.type === 'error') {
      return recoveryFailure('replay-failed', replayed.error.safeMessage);
    }
    if (
      !replayedRevisionMatchesRecord(replayed.value.revision, record) ||
      replayed.value.snapshot.revisionId !== replayed.value.revision.id ||
      replayed.value.snapshot.documentHash !== replayed.value.revision.documentHash
    ) {
      return recoveryFailure(
        'document-hash-mismatch',
        'Replay output does not match the WAL Revision identity and document hash.',
      );
    }
    const snapshotValidation = options.validateSnapshot(replayed.value.snapshot);
    if (snapshotValidation.type === 'error') {
      return recoveryFailure('snapshot-invalid', snapshotValidation.error.safeMessage);
    }

    currentRevision = replayed.value.revision;
    currentSnapshot = replayed.value.snapshot;
    appliedRecordCount += 1;
  }

  return {
    type: 'ok',
    value: {
      headRevision: currentRevision,
      headRevisionId: currentRevision.id,
      headSequence: currentRevision.sequence,
      snapshot: currentSnapshot,
      appliedRecordCount,
      truncatedTail: tail.truncatedTail,
      truncatedByteCount: tail.truncatedByteCount,
    },
  };
}

function validateWalStream(
  uri: ResourceUri,
  base: ResolvedRecoveryBase,
  records: readonly WalCommitRecord[],
): Result<void, RecoveryFailure> {
  const identityState: WalRevisionIdentityState = {
    revisionIds: new Set([base.revision.id]),
    transactionIds: new Set([base.revision.transactionId]),
    matchedBaseRecord: false,
  };
  let previous: WalCommitRecord | undefined;

  for (const record of records) {
    if (record.uri !== uri) {
      return recoveryFailure(
        'history-discontinuous',
        'Every WAL record must use the recovered canonical document URI.',
      );
    }
    const identity = validateWalRevisionIdentity(base, record, identityState);
    if (identity.type === 'error') {
      return identity;
    }

    if (
      previous !== undefined &&
      (record.sequence !== previous.sequence + 1 || record.parentRevisionId !== previous.revisionId)
    ) {
      return recoveryFailure(
        'history-discontinuous',
        'WAL records must have strictly increasing sequence and exact parent continuity.',
      );
    }
    previous = record;
  }

  const boundary = validateBaseWalBoundary(base, records);
  if (boundary.type === 'error') {
    return boundary;
  }

  return {
    type: 'ok',
    value: undefined,
  };
}

function validateBaseWalBoundary(
  base: ResolvedRecoveryBase,
  records: readonly WalCommitRecord[],
): Result<void, RecoveryFailure> {
  const baseRecord = records.find((record) => record.sequence === base.revision.sequence);
  if (baseRecord !== undefined && !walRecordMatchesRevision(baseRecord, base.revision)) {
    return recoveryFailure(
      'history-discontinuous',
      'The WAL record at the Snapshot sequence does not match the recovery base.',
    );
  }
  if (base.revision.sequence === 0) {
    return recoverySuccess();
  }
  const parentRecord = records.find((record) => record.sequence === base.revision.sequence - 1);
  if (parentRecord !== undefined && parentRecord.revisionId !== base.revision.parentRevisionId) {
    return recoveryFailure(
      'history-discontinuous',
      'The WAL predecessor at the Snapshot boundary does not match its parent Revision.',
    );
  }
  return recoverySuccess();
}

function recoverySuccess(): Result<void, RecoveryFailure> {
  return {
    type: 'ok',
    value: undefined,
  };
}

interface WalRevisionIdentityState {
  readonly revisionIds: Set<Revision['id']>;
  readonly transactionIds: Set<TransactionId>;
  matchedBaseRecord: boolean;
}

function validateWalRevisionIdentity(
  base: ResolvedRecoveryBase,
  record: WalCommitRecord,
  state: WalRevisionIdentityState,
): Result<void, RecoveryFailure> {
  const isExactBaseRecord =
    record.sequence === base.revision.sequence && walRecordMatchesRevision(record, base.revision);
  if (isExactBaseRecord && !state.matchedBaseRecord) {
    state.matchedBaseRecord = true;
    return {
      type: 'ok',
      value: undefined,
    };
  }
  if (state.transactionIds.has(record.transactionId)) {
    return recoveryFailure(
      'history-discontinuous',
      'A Transaction ID occurs more than once in the Snapshot and WAL history.',
    );
  }
  state.transactionIds.add(record.transactionId);
  if (state.revisionIds.has(record.revisionId)) {
    return recoveryFailure(
      'history-discontinuous',
      'A Revision ID occurs more than once in the Snapshot and WAL history.',
    );
  }
  state.revisionIds.add(record.revisionId);
  return {
    type: 'ok',
    value: undefined,
  };
}

function validateContinuity(
  uri: ResourceUri,
  currentRevision: Revision,
  record: WalCommitRecord,
): Result<void, RecoveryFailure> {
  return record.uri === uri &&
    record.parentRevisionId === currentRevision.id &&
    record.sequence === currentRevision.sequence + 1
    ? {
        type: 'ok',
        value: undefined,
      }
    : recoveryFailure(
        'history-discontinuous',
        'WAL URI, parent Revision, or sequence is not continuous.',
      );
}

function walRecordMatchesRevision(record: WalCommitRecord, revision: Revision): boolean {
  return (
    record.uri === revision.uri &&
    record.revisionId === revision.id &&
    record.parentRevisionId === revision.parentRevisionId &&
    record.transactionId === revision.transactionId &&
    record.sequence === revision.sequence &&
    record.documentHash === revision.documentHash
  );
}

function replayedRevisionMatchesRecord(revision: Revision, record: WalCommitRecord): boolean {
  return walRecordMatchesRevision(record, revision) && revision.durability === 'wal';
}

function hasValidLinearRevisionShape(revision: Revision): boolean {
  return (
    Number.isSafeInteger(revision.sequence) &&
    revision.sequence >= 0 &&
    (revision.sequence === 0) === (revision.parentRevisionId === null) &&
    revision.id !== revision.parentRevisionId
  );
}

function recoveryFailure(
  reason: RecoveryFailure['reason'],
  safeMessage: string,
): Result<never, RecoveryFailure> {
  return {
    type: 'error',
    error: {
      code: 'RECOVERY_REQUIRED',
      reason,
      safeMessage,
    },
  };
}
