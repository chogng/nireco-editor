import type { Result } from '../base/errors/nireco-error.js';
import type { ResourceUri } from '../base/uri/resource-uri.js';
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
  record: WalCommitRecord,
) => Result<DocumentSnapshot, RecoveryValidationError>;

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
  readonly revisionId: Revision['id'];
  readonly sequence: number;
  readonly snapshot: DocumentSnapshot;
}

async function readRecoveryBase(
  options: RecoverDocumentOptions,
): Promise<Result<ResolvedRecoveryBase, RecoveryFailure>> {
  const latest = await options.snapshots.readLatest(options.uri);
  if (latest.type === 'error') {
    return recoveryFailure('storage-read-failed', latest.error.safeMessage);
  }
  if (latest.value === undefined) {
    if (
      options.fallback.revision.uri !== options.uri ||
      options.fallback.snapshot.revisionId !== options.fallback.revision.id ||
      options.fallback.snapshot.documentHash !== options.fallback.revision.documentHash
    ) {
      return recoveryFailure(
        'snapshot-invalid',
        'The fallback Revision and Snapshot do not agree.',
      );
    }
    return {
      type: 'ok',
      value: {
        revisionId: options.fallback.revision.id,
        sequence: options.fallback.revision.sequence,
        snapshot: options.fallback.snapshot,
      },
    };
  }

  return {
    type: 'ok',
    value: {
      revisionId: latest.value.manifest.revisionId,
      sequence: latest.value.manifest.sequence,
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

  let currentRevisionId = base.revisionId;
  let currentSequence = base.sequence;
  let currentSnapshot = base.snapshot;
  let appliedRecordCount = 0;

  for (const record of records) {
    if (record.sequence < currentSequence) {
      continue;
    }
    if (record.sequence === currentSequence) {
      continue;
    }
    const continuity = validateContinuity(options.uri, currentRevisionId, currentSequence, record);
    if (continuity.type === 'error') {
      return continuity;
    }

    const recordValidation = options.validateRecord(record);
    if (recordValidation.type === 'error') {
      return recoveryFailure('record-invalid', recordValidation.error.safeMessage);
    }
    const replayed = options.replay(currentSnapshot, record);
    if (replayed.type === 'error') {
      return recoveryFailure('replay-failed', replayed.error.safeMessage);
    }
    if (
      replayed.value.revisionId !== record.revisionId ||
      replayed.value.documentHash !== record.documentHash
    ) {
      return recoveryFailure(
        'document-hash-mismatch',
        'Replay output does not match the WAL Revision identity and document hash.',
      );
    }
    const snapshotValidation = options.validateSnapshot(replayed.value);
    if (snapshotValidation.type === 'error') {
      return recoveryFailure('snapshot-invalid', snapshotValidation.error.safeMessage);
    }

    currentRevisionId = record.revisionId;
    currentSequence = record.sequence;
    currentSnapshot = replayed.value;
    appliedRecordCount += 1;
  }

  return {
    type: 'ok',
    value: {
      headRevisionId: currentRevisionId,
      headSequence: currentSequence,
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
  const revisionIds = new Set<Revision['id']>();
  let previous: WalCommitRecord | undefined;

  for (const record of records) {
    if (record.uri !== uri) {
      return recoveryFailure(
        'history-discontinuous',
        'Every WAL record must use the recovered canonical document URI.',
      );
    }
    if (revisionIds.has(record.revisionId)) {
      return recoveryFailure(
        'history-discontinuous',
        'A Revision ID occurs more than once in the WAL stream.',
      );
    }
    revisionIds.add(record.revisionId);

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

  const baseRecord = records.find((record) => record.sequence === base.sequence);
  if (
    baseRecord !== undefined &&
    (baseRecord.revisionId !== base.revisionId ||
      baseRecord.documentHash !== base.snapshot.documentHash)
  ) {
    return recoveryFailure(
      'history-discontinuous',
      'The WAL record at the Snapshot sequence does not match the recovery base.',
    );
  }

  return {
    type: 'ok',
    value: undefined,
  };
}

function validateContinuity(
  uri: ResourceUri,
  currentRevisionId: Revision['id'],
  currentSequence: number,
  record: WalCommitRecord,
): Result<void, RecoveryFailure> {
  return record.uri === uri &&
    record.parentRevisionId === currentRevisionId &&
    record.sequence === currentSequence + 1
    ? {
        type: 'ok',
        value: undefined,
      }
    : recoveryFailure(
        'history-discontinuous',
        'WAL URI, parent Revision, or sequence is not continuous.',
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
