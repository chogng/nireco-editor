import type {
  NirecoError,
  NirecoErrorCategory,
  NirecoErrorCode,
  NirecoSuggestedAction,
  Result,
} from '../../base/errors/nireco-error.js';
import { deepFreeze } from '../../base/immutability/deep-freeze.js';
import type { ContentHash, RevisionId } from '../../base/ids/identifiers.js';
import type { JsonValue } from '../../base/serialization/canonical-json.js';
import type { ResourceUri } from '../../base/uri/resource-uri.js';
import type { Revision, DurabilityLevel } from '../../model/revision/revision.js';
import type { DocumentSnapshot } from '../../model/snapshot.js';
import type { Transaction } from '../../model/transaction/transaction.js';
import type {
  AuthorityMode,
  CommitResult,
  DocumentHandle,
  DurabilityAcknowledgement,
  IDocumentAuthority,
} from '../contracts.js';
import type { IIdAllocator } from '../id-allocator.js';
import type { AuthorityLease } from './authority-lease.js';
import type {
  DurabilityPortError,
  IAtomicSnapshotStore,
  IWalRecordCodec,
  IWriteAheadLog,
  WalCommitRecord,
} from './durability-ports.js';
import { isDurabilityAtLeast } from './durability-ports.js';

export interface PreparedCommit {
  readonly revision: Revision;
  readonly snapshot: DocumentSnapshot;
  readonly transactionHash: ContentHash;
  readonly replayInput: JsonValue;
}

export type CommitPreparer = (
  transaction: Transaction,
  headRevision: Revision,
  headSnapshot: DocumentSnapshot,
) => Result<PreparedCommit>;

export interface SingleDocumentAuthorityOptions {
  readonly uri: ResourceUri;
  readonly initialRevision: Revision;
  readonly initialSnapshot: DocumentSnapshot;
  readonly lease: AuthorityLease;
  readonly wal: IWriteAheadLog;
  readonly walCodec: IWalRecordCodec;
  readonly snapshots: IAtomicSnapshotStore;
  readonly ids: IIdAllocator;
  readonly prepareCommit: CommitPreparer;
}

type RevisionIdentity = Omit<Revision, 'durability'>;

interface StoredRevision {
  readonly identity: RevisionIdentity;
  durability: DurabilityLevel;
}

interface DurabilityWaiter {
  readonly target: DurabilityLevel;
  readonly resolve: (result: Result<DurabilityAcknowledgement>) => void;
}

export class SingleDocumentAuthority implements IDocumentAuthority {
  readonly #uri: ResourceUri;
  readonly #lease: AuthorityLease;
  readonly #wal: IWriteAheadLog;
  readonly #walCodec: IWalRecordCodec;
  readonly #snapshots: IAtomicSnapshotStore;
  readonly #ids: IIdAllocator;
  readonly #prepareCommit: CommitPreparer;
  readonly #revisions = new Map<RevisionId, StoredRevision>();
  readonly #documentSnapshots = new Map<RevisionId, DocumentSnapshot>();
  readonly #terminalDurabilityFailures = new Map<RevisionId, NirecoError>();
  readonly #snapshotFailures = new Map<RevisionId, NirecoError>();
  readonly #waiters = new Map<RevisionId, Set<DurabilityWaiter>>();
  readonly #snapshotTasks = new Map<RevisionId, Promise<Result<DurabilityAcknowledgement>>>();
  readonly #listeners = new Set<() => void>();
  #headRevisionId: RevisionId;
  #mode: AuthorityMode = 'read-write';
  #pendingWalRevisionId: RevisionId | undefined;
  #pendingWalTask: Promise<void> | undefined;

  constructor(options: SingleDocumentAuthorityOptions) {
    assertInitialState(options);
    this.#uri = options.uri;
    this.#lease = options.lease;
    this.#wal = options.wal;
    this.#walCodec = options.walCodec;
    this.#snapshots = options.snapshots;
    this.#ids = options.ids;
    this.#prepareCommit = options.prepareCommit;
    this.#headRevisionId = options.initialRevision.id;
    this.#revisions.set(options.initialRevision.id, storeRevision(options.initialRevision));
    this.#documentSnapshots.set(options.initialRevision.id, deepFreeze(options.initialSnapshot));
  }

  get mode(): AuthorityMode {
    return this.#mode;
  }

  async open(uri: ResourceUri): Promise<Result<DocumentHandle>> {
    if (uri !== this.#uri) {
      return this.#modelNotFound();
    }
    return {
      type: 'ok',
      value: {
        uri: this.#uri,
        headRevisionId: this.#headRevisionId,
      },
    };
  }

  async getHead(uri: ResourceUri): Promise<Result<RevisionId>> {
    if (uri !== this.#uri) {
      return this.#modelNotFound();
    }
    return {
      type: 'ok',
      value: this.#headRevisionId,
    };
  }

  async apply(transaction: Transaction): Promise<Result<CommitResult>> {
    const writable = this.#checkWritable(transaction.target.uri, transaction.target.baseRevisionId);
    if (writable.type === 'error') {
      return writable;
    }

    const headRevision = this.#revision(this.#headRevisionId);
    const headSnapshot = this.#snapshot(this.#headRevisionId);
    const prepared = this.#prepareCommit(transaction, headRevision, headSnapshot);
    if (prepared.type === 'error') {
      return prepared;
    }
    return this.applyPrepared(transaction, prepared.value);
  }

  async applyPrepared(
    transaction: Transaction,
    prepared: PreparedCommit,
  ): Promise<Result<CommitResult>> {
    const writable = this.#checkWritable(transaction.target.uri, transaction.target.baseRevisionId);
    if (writable.type === 'error') {
      return writable;
    }

    const validation = this.#validatePreparedCommit(transaction, prepared);
    if (validation.type === 'error') {
      return validation;
    }

    const record = createWalRecord(prepared);
    const framed = this.#walCodec.encode(record);
    if (framed.type === 'error') {
      return {
        type: 'error',
        error: this.#error(
          framed.error.reason === 'record-too-large' ? 'REQUEST_TOO_LARGE' : 'INTERNAL_ERROR',
          framed.error.reason === 'record-too-large' ? 'validation' : 'internal',
          false,
          'The prepared commit could not be encoded as one WAL record.',
          'abort',
          this.#headRevisionId,
        ),
      };
    }

    const frozenSnapshot = deepFreeze(prepared.snapshot);
    this.#revisions.set(prepared.revision.id, storeRevision(prepared.revision));
    this.#documentSnapshots.set(prepared.revision.id, frozenSnapshot);
    this.#headRevisionId = prepared.revision.id;
    this.#pendingWalRevisionId = prepared.revision.id;
    this.#pendingWalTask = this.#persistWal(prepared.revision.id, framed.value);
    this.#notifyCommit();

    return {
      type: 'ok',
      value: {
        revisionId: prepared.revision.id,
        snapshot: frozenSnapshot,
        transactionHash: prepared.transactionHash,
        achievedDurability: 'memory',
      },
    };
  }

  getDurability(uri: ResourceUri, revisionId: RevisionId): Result<DurabilityLevel> {
    if (uri !== this.#uri) {
      return this.#modelNotFound();
    }
    const revision = this.#revisions.get(revisionId);
    return revision === undefined
      ? this.#revisionNotFound(revisionId)
      : {
          type: 'ok',
          value: revision.durability,
        };
  }

  whenDurable(
    uri: ResourceUri,
    revisionId: RevisionId,
    target: DurabilityLevel,
  ): Promise<Result<DurabilityAcknowledgement>> {
    if (uri !== this.#uri) {
      return Promise.resolve(this.#modelNotFound());
    }
    const revision = this.#revisions.get(revisionId);
    if (revision === undefined) {
      return Promise.resolve(this.#revisionNotFound(revisionId));
    }
    if (isDurabilityAtLeast(revision.durability, target)) {
      return Promise.resolve({
        type: 'ok',
        value: this.#acknowledgement(revisionId, revision.durability),
      });
    }

    const terminalFailure = this.#terminalDurabilityFailures.get(revisionId);
    if (terminalFailure !== undefined) {
      return Promise.resolve({
        type: 'error',
        error: terminalFailure,
      });
    }
    const snapshotFailure = this.#snapshotFailures.get(revisionId);
    if (target === 'snapshot' && snapshotFailure !== undefined) {
      return Promise.resolve({
        type: 'error',
        error: snapshotFailure,
      });
    }

    const pending = new Promise<Result<DurabilityAcknowledgement>>((resolve) => {
      const waiter: DurabilityWaiter = {
        target,
        resolve,
      };
      const existing = this.#waiters.get(revisionId);
      if (existing === undefined) {
        this.#waiters.set(revisionId, new Set([waiter]));
      } else {
        existing.add(waiter);
      }
    });
    this.#scheduleSnapshotForWaiters(revisionId);
    return pending;
  }

  getRevision(revisionId: RevisionId): Result<Revision> {
    const stored = this.#revisions.get(revisionId);
    return stored === undefined
      ? this.#revisionNotFound(revisionId)
      : {
          type: 'ok',
          value: projectRevision(stored),
        };
  }

  checkpoint(revisionId: RevisionId): Promise<Result<DurabilityAcknowledgement>> {
    const pending = this.#snapshotTasks.get(revisionId);
    if (pending !== undefined) {
      return pending;
    }

    const task = this.#checkpoint(revisionId);
    this.#snapshotTasks.set(revisionId, task);
    void task.then(
      () => {
        this.#deleteSnapshotTask(revisionId, task);
      },
      () => {
        this.#deleteSnapshotTask(revisionId, task);
      },
    );
    return task;
  }

  async #checkpoint(revisionId: RevisionId): Promise<Result<DurabilityAcknowledgement>> {
    const stored = this.#revisions.get(revisionId);
    if (stored === undefined) {
      return this.#revisionNotFound(revisionId);
    }
    if (!isDurabilityAtLeast(stored.durability, 'wal')) {
      return {
        type: 'error',
        error:
          this.#terminalDurabilityFailures.get(revisionId) ??
          this.#error(
            'TEMPORARY_UNAVAILABLE',
            'storage',
            true,
            'The Revision must reach WAL durability before Snapshot commit.',
            'retry',
            this.#headRevisionId,
          ),
      };
    }
    if (stored.durability === 'snapshot') {
      return {
        type: 'ok',
        value: this.#acknowledgement(revisionId, 'snapshot'),
      };
    }
    if (!this.#lease.isCurrent()) {
      this.#mode = 'read-only';
      const error = this.#snapshotError({
        stage: 'snapshot-manifest-switch',
        reason: 'stale-fence',
        safeMessage: 'The Snapshot commit lost its Authority fence.',
      });
      this.#snapshotFailures.set(revisionId, error);
      this.#rejectSnapshotWaiters(revisionId, error);
      return {
        type: 'error',
        error,
      };
    }

    this.#snapshotFailures.delete(revisionId);
    const committed = await this.#commitSnapshot(
      projectRevision(stored),
      this.#snapshot(revisionId),
    );
    if (committed.type === 'error') {
      const error = this.#snapshotError(committed.error);
      if (committed.error.reason === 'stale-fence') {
        this.#mode = 'read-only';
      }
      this.#snapshotFailures.set(revisionId, error);
      this.#rejectSnapshotWaiters(revisionId, error);
      return {
        type: 'error',
        error,
      };
    }

    this.#snapshotFailures.delete(revisionId);
    this.#promote(revisionId, 'snapshot');
    return {
      type: 'ok',
      value: this.#acknowledgement(revisionId, 'snapshot'),
    };
  }

  subscribe(uri: ResourceUri, listener: () => void): { dispose(): void } {
    if (uri !== this.#uri) {
      return {
        dispose: () => undefined,
      };
    }
    this.#listeners.add(listener);
    return {
      dispose: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  async whenIdle(): Promise<void> {
    await this.#pendingWalTask;
    await Promise.all(this.#snapshotTasks.values());
  }

  async dispose(): Promise<void> {
    await this.whenIdle();
    this.#mode = 'read-only';
    this.#lease.release();
  }

  #checkWritable(uri: ResourceUri, baseRevisionId: RevisionId): Result<void> {
    if (uri !== this.#uri) {
      return this.#modelNotFound();
    }
    if (this.#mode !== 'read-write') {
      return {
        type: 'error',
        error: this.#error(
          'DURABILITY_UNREACHABLE',
          'storage',
          false,
          'The Authority is read-only after a durability failure.',
          'abort',
          this.#headRevisionId,
        ),
      };
    }
    if (!this.#lease.isCurrent()) {
      this.#mode = 'read-only';
      return {
        type: 'error',
        error: this.#error(
          'DURABILITY_UNREACHABLE',
          'storage',
          false,
          'The Authority no longer owns the current fencing epoch.',
          'abort',
          this.#headRevisionId,
        ),
      };
    }
    if (this.#pendingWalRevisionId !== undefined) {
      return {
        type: 'error',
        error: this.#error(
          'TEMPORARY_UNAVAILABLE',
          'storage',
          true,
          'A memory commit is still waiting for WAL durability.',
          'retry',
          this.#headRevisionId,
        ),
      };
    }
    if (baseRevisionId !== this.#headRevisionId) {
      return {
        type: 'error',
        error: this.#error(
          'BASE_REVISION_MISMATCH',
          'conflict',
          false,
          'The Transaction base Revision does not match the current head.',
          'rebase',
          this.#headRevisionId,
        ),
      };
    }
    return {
      type: 'ok',
      value: undefined,
    };
  }

  #validatePreparedCommit(transaction: Transaction, prepared: PreparedCommit): Result<void> {
    const parent = this.#revision(this.#headRevisionId);
    const isValid =
      prepared.revision.durability === 'memory' &&
      !this.#revisions.has(prepared.revision.id) &&
      prepared.revision.uri === this.#uri &&
      prepared.revision.parentRevisionId === this.#headRevisionId &&
      prepared.revision.sequence === parent.sequence + 1 &&
      prepared.revision.transactionId === transaction.id &&
      prepared.snapshot.revisionId === prepared.revision.id &&
      prepared.snapshot.documentHash === prepared.revision.documentHash;
    return isValid
      ? {
          type: 'ok',
          value: undefined,
        }
      : {
          type: 'error',
          error: this.#error(
            'SCHEMA_INVALID',
            'validation',
            false,
            'The prepared commit is inconsistent with the current head.',
            'abort',
            this.#headRevisionId,
          ),
        };
  }

  async #persistWal(revisionId: RevisionId, framedRecord: Uint8Array): Promise<void> {
    const result = await this.#appendAndFsync(framedRecord);
    if (result.type === 'ok') {
      this.#promote(revisionId, 'wal');
    } else {
      this.#failWal(revisionId, result.error);
    }
    if (this.#pendingWalRevisionId === revisionId) {
      this.#pendingWalRevisionId = undefined;
    }
  }

  async #appendAndFsync(framedRecord: Uint8Array): Promise<Result<void, DurabilityPortError>> {
    let appended: Result<void, DurabilityPortError>;
    try {
      appended = await this.#wal.append(this.#lease.fence, framedRecord);
    } catch {
      return portException('wal-append', 'The WAL adapter threw during append.');
    }
    if (appended.type === 'error') {
      return appended;
    }

    try {
      return await this.#wal.fsync(this.#lease.fence);
    } catch {
      return portException('wal-fsync', 'The WAL adapter threw during fsync.');
    }
  }

  async #commitSnapshot(
    revision: Revision,
    snapshot: DocumentSnapshot,
  ): Promise<Result<unknown, DurabilityPortError>> {
    try {
      return await this.#snapshots.commit({
        fence: this.#lease.fence,
        revision,
        snapshot,
      });
    } catch {
      return portException('snapshot-manifest-switch', 'The Snapshot adapter threw during commit.');
    }
  }

  #promote(revisionId: RevisionId, target: DurabilityLevel): void {
    const stored = this.#revisions.get(revisionId);
    if (stored === undefined || isDurabilityAtLeast(stored.durability, target)) {
      return;
    }
    stored.durability = target;
    const waiters = this.#waiters.get(revisionId);
    if (waiters === undefined) {
      return;
    }
    for (const waiter of waiters) {
      if (isDurabilityAtLeast(target, waiter.target)) {
        waiter.resolve({
          type: 'ok',
          value: this.#acknowledgement(revisionId, target),
        });
        waiters.delete(waiter);
      }
    }
    if (waiters.size === 0) {
      this.#waiters.delete(revisionId);
    }
    this.#scheduleSnapshotForWaiters(revisionId);
  }

  #failWal(revisionId: RevisionId, portFailure: DurabilityPortError): void {
    this.#mode = 'read-only';
    const code: NirecoErrorCode =
      portFailure.stage === 'wal-append' ? 'WAL_APPEND_FAILED' : 'WAL_FSYNC_FAILED';
    const error = this.#error(
      portFailure.reason === 'stale-fence' ? 'DURABILITY_UNREACHABLE' : code,
      'storage',
      false,
      portFailure.safeMessage,
      'abort',
      revisionId,
    );
    this.#terminalDurabilityFailures.set(revisionId, error);
    this.#rejectWaiters(revisionId, error, (target) => target !== 'memory');
  }

  #rejectSnapshotWaiters(revisionId: RevisionId, error: NirecoError): void {
    this.#rejectWaiters(revisionId, error, (target) => target === 'snapshot');
  }

  #rejectWaiters(
    revisionId: RevisionId,
    error: NirecoError,
    predicate: (target: DurabilityLevel) => boolean,
  ): void {
    const waiters = this.#waiters.get(revisionId);
    if (waiters === undefined) {
      return;
    }
    for (const waiter of waiters) {
      if (predicate(waiter.target)) {
        waiter.resolve({
          type: 'error',
          error,
        });
        waiters.delete(waiter);
      }
    }
    if (waiters.size === 0) {
      this.#waiters.delete(revisionId);
    }
  }

  #notifyCommit(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // Listener failure cannot roll back an installed Revision.
      }
    }
  }

  #acknowledgement(
    revisionId: RevisionId,
    achievedDurability: DurabilityLevel,
  ): DurabilityAcknowledgement {
    return {
      revisionId,
      achievedDurability,
      authorityMode: this.#mode,
    };
  }

  #revision(revisionId: RevisionId): Revision {
    const stored = this.#revisions.get(revisionId);
    if (stored === undefined) {
      throw new Error('Authority state references a missing Revision.');
    }
    return projectRevision(stored);
  }

  #snapshot(revisionId: RevisionId): DocumentSnapshot {
    const snapshot = this.#documentSnapshots.get(revisionId);
    if (snapshot === undefined) {
      throw new Error('Authority state references a missing Snapshot.');
    }
    return snapshot;
  }

  #revisionNotFound<TValue>(revisionId: RevisionId): Result<TValue> {
    return {
      type: 'error',
      error: this.#error(
        'REVISION_NOT_FOUND',
        'validation',
        false,
        'The requested Revision is not known to this Authority.',
        'reread',
        revisionId,
      ),
    };
  }

  #modelNotFound<TValue>(): Result<TValue> {
    return {
      type: 'error',
      error: this.#error(
        'MODEL_NOT_FOUND',
        'validation',
        false,
        'This Authority does not own the requested document URI.',
        'abort',
      ),
    };
  }

  #snapshotError(portFailure: DurabilityPortError): NirecoError {
    if (portFailure.reason === 'stale-fence') {
      return this.#error(
        'DURABILITY_UNREACHABLE',
        'storage',
        false,
        portFailure.safeMessage,
        'abort',
        this.#headRevisionId,
      );
    }
    return this.#error(
      'SNAPSHOT_COMMIT_FAILED',
      'storage',
      true,
      portFailure.safeMessage,
      'retry',
      this.#headRevisionId,
    );
  }

  #scheduleSnapshotForWaiters(revisionId: RevisionId): void {
    const stored = this.#revisions.get(revisionId);
    const waiters = this.#waiters.get(revisionId);
    if (
      stored?.durability !== 'wal' ||
      waiters === undefined ||
      ![...waiters].some((waiter) => waiter.target === 'snapshot') ||
      this.#snapshotFailures.has(revisionId)
    ) {
      return;
    }
    void this.checkpoint(revisionId);
  }

  #deleteSnapshotTask(
    revisionId: RevisionId,
    task: Promise<Result<DurabilityAcknowledgement>>,
  ): void {
    if (this.#snapshotTasks.get(revisionId) === task) {
      this.#snapshotTasks.delete(revisionId);
    }
  }

  #error(
    code: NirecoErrorCode,
    category: NirecoErrorCategory,
    retryable: boolean,
    safeMessage: string,
    suggestedAction: NirecoSuggestedAction,
    currentRevisionId?: RevisionId,
  ): NirecoError {
    return {
      code,
      category,
      retryable,
      safeMessage,
      debugId: this.#ids.allocateDebugId(),
      suggestedAction,
      ...(currentRevisionId === undefined ? {} : { currentRevisionId }),
    };
  }
}

function createWalRecord(prepared: PreparedCommit): WalCommitRecord {
  return {
    recordVersion: 1,
    recordType: 'commit',
    uri: prepared.revision.uri,
    revisionId: prepared.revision.id,
    parentRevisionId: prepared.revision.parentRevisionId,
    transactionId: prepared.revision.transactionId,
    sequence: prepared.revision.sequence,
    transactionHash: prepared.transactionHash,
    documentHash: prepared.revision.documentHash,
    replayInput: prepared.replayInput,
  };
}

function storeRevision(revision: Revision): StoredRevision {
  const { durability, ...identity } = revision;
  return {
    identity: deepFreeze(identity),
    durability,
  };
}

function projectRevision(stored: StoredRevision): Revision {
  return {
    ...stored.identity,
    durability: stored.durability,
  };
}

function assertInitialState(options: SingleDocumentAuthorityOptions): void {
  if (
    options.uri !== options.initialRevision.uri ||
    options.uri !== options.lease.fence.uri ||
    options.initialSnapshot.revisionId !== options.initialRevision.id ||
    options.initialSnapshot.documentHash !== options.initialRevision.documentHash ||
    options.initialRevision.durability === 'memory'
  ) {
    throw new Error(
      'Initial Authority Revision, Snapshot, URI, and lease must agree and be durable.',
    );
  }
}

function portException(
  stage: DurabilityPortError['stage'],
  safeMessage: string,
): Result<never, DurabilityPortError> {
  return {
    type: 'error',
    error: {
      stage,
      reason: 'io',
      safeMessage,
    },
  };
}
