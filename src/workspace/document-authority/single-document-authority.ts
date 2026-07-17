import type {
  NirecoError,
  NirecoErrorCategory,
  NirecoErrorCode,
  NirecoSuggestedAction,
  Result,
} from '../../base/errors/nireco-error.js';
import { HASH_DOMAINS } from '../../base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../../base/hashing/portable-sha-256.js';
import { deepFreeze } from '../../base/immutability/deep-freeze.js';
import type { ContentHash, RevisionId, TransactionId } from '../../base/ids/identifiers.js';
import {
  parseContentHash,
  parseRevisionId,
  parseTransactionId,
} from '../../base/ids/identifiers.js';
import type { JsonValue } from '../../base/serialization/canonical-json.js';
import { serializeCanonicalJson } from '../../base/serialization/canonical-json.js';
import { parseIsoTimestamp } from '../../base/time/clock.js';
import type { DocumentUri, ResourceUri } from '../../base/uri/resource-uri.js';
import { isDocumentUri } from '../../base/uri/resource-uri.js';
import type { PositionMap } from '../../model/mapping/position-map.js';
import {
  activateKernelDerivedDocumentSnapshotCache,
  cacheVerifiedFrozenDocumentSnapshot,
  retireVerifiedDocumentSnapshotCache,
} from '../../model/document-snapshot-cache.js';
import type { Revision, DurabilityLevel } from '../../model/revision/revision.js';
import { validateDocumentSnapshot } from '../../model/schema/manuscript-validator.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../model/snapshot.js';
import {
  prepareKernelTransaction,
  TRANSACTION_REPLAY_PROFILE,
  type TransactionInversePlan,
} from '../../model/transaction/transaction-kernel.js';
import type { Transaction } from '../../model/transaction/transaction.js';
import {
  decodeStrictActorRef,
  decodeStrictTransactionV1,
} from '../../model/transaction/transaction-runtime.js';
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
import { createKernelCommitPreparer } from './kernel-commit-preparer.js';

export interface PreparedCommit {
  readonly revision: Revision;
  readonly snapshot: DocumentSnapshot;
  readonly transactionHash: ContentHash;
  readonly positionMap: PositionMap;
  readonly inverse: TransactionInversePlan;
  readonly replayInput: JsonValue;
}

export type CommitPreparer = (
  transaction: Transaction,
  headRevision: Revision,
  headSnapshot: DocumentSnapshot,
) => Result<PreparedCommit>;

export interface SingleDocumentAuthorityOptions {
  readonly uri: DocumentUri;
  readonly initialRevision: Revision;
  readonly initialSnapshot: DocumentSnapshot;
  readonly lease: AuthorityLease;
  readonly wal: IWriteAheadLog;
  readonly walCodec: IWalRecordCodec;
  readonly snapshots: IAtomicSnapshotStore;
  readonly ids: IIdAllocator;
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
  readonly #uri: DocumentUri;
  readonly #lease: AuthorityLease;
  readonly #wal: IWriteAheadLog;
  readonly #walCodec: IWalRecordCodec;
  readonly #snapshots: IAtomicSnapshotStore;
  readonly #ids: IIdAllocator;
  readonly #prepareCommit: CommitPreparer;
  readonly #revisions = new Map<RevisionId, StoredRevision>();
  readonly #transactionIds = new Set<TransactionId>();
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
  #isDisposed = false;
  #disposePromise: Promise<void> | undefined;

  constructor(options: SingleDocumentAuthorityOptions) {
    const initialRevision = assertInitialState(options);
    this.#uri = initialRevision.uri;
    this.#lease = options.lease;
    this.#wal = options.wal;
    this.#walCodec = options.walCodec;
    this.#snapshots = options.snapshots;
    this.#ids = options.ids;
    this.#prepareCommit = createKernelCommitPreparer({
      ids: options.ids,
    });
    this.#headRevisionId = initialRevision.id;
    this.#revisions.set(initialRevision.id, storeRevision(initialRevision));
    this.#transactionIds.add(initialRevision.transactionId);
    const initialSnapshot = deepFreeze(options.initialSnapshot);
    const cached = cacheVerifiedFrozenDocumentSnapshot(initialSnapshot);
    if (cached.type === 'error') {
      throw new TypeError('The initial Authority Snapshot could not enter the verified cache.');
    }
    this.#documentSnapshots.set(initialRevision.id, initialSnapshot);
  }

  get mode(): AuthorityMode {
    return this.#mode;
  }

  async open(uri: ResourceUri): Promise<Result<DocumentHandle>> {
    if (uri !== this.#uri) {
      return this.#modelNotFound();
    }
    if (this.#isDisposed) {
      return this.#disposed();
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
    if (this.#isDisposed) {
      return this.#disposed();
    }
    return {
      type: 'ok',
      value: this.#headRevisionId,
    };
  }

  getSnapshot(uri: ResourceUri, revisionId = this.#headRevisionId): Result<DocumentSnapshot> {
    if (uri !== this.#uri) {
      return this.#modelNotFound();
    }
    if (this.#isDisposed) {
      return this.#disposed();
    }
    const snapshot = this.#documentSnapshots.get(revisionId);
    return snapshot === undefined
      ? this.#revisionNotFound(revisionId)
      : {
          type: 'ok',
          value: snapshot,
        };
  }

  async apply(transaction: Transaction): Promise<Result<CommitResult>> {
    const decoded = this.#decodeTransaction(transaction);
    if (decoded.type === 'error') {
      return decoded;
    }
    const normalized = decoded.value;
    const writable = this.#checkWritable(normalized.target.uri, normalized.target.baseRevisionId);
    if (writable.type === 'error') {
      return writable;
    }
    const identity = this.#checkTransactionIdentity(normalized.id);
    if (identity.type === 'error') {
      return identity;
    }

    const headRevision = this.#revision(this.#headRevisionId);
    const headSnapshot = this.#snapshot(this.#headRevisionId);
    const prepared = this.#prepareCommit(normalized, headRevision, headSnapshot);
    if (prepared.type === 'error') {
      return prepared;
    }
    const validation = this.#validateTrustedPreparedCommit(normalized, prepared.value);
    return validation.type === 'error'
      ? validation
      : this.#installPreparedCommit(normalized, validation.value);
  }

  async applyPrepared(
    transaction: Transaction,
    prepared: PreparedCommit,
  ): Promise<Result<CommitResult>> {
    const decoded = this.#decodeTransaction(transaction);
    if (decoded.type === 'error') {
      return decoded;
    }
    const normalized = decoded.value;
    const writable = this.#checkWritable(normalized.target.uri, normalized.target.baseRevisionId);
    if (writable.type === 'error') {
      return writable;
    }
    const identity = this.#checkTransactionIdentity(normalized.id);
    if (identity.type === 'error') {
      return identity;
    }

    const validation = this.#validatePreparedCommit(normalized, prepared);
    if (validation.type === 'error') {
      return validation;
    }
    return this.#installPreparedCommit(normalized, validation.value);
  }

  #installPreparedCommit(transaction: Transaction, commit: PreparedCommit): Result<CommitResult> {
    const previousSnapshot = this.#snapshot(this.#headRevisionId);
    const record = createWalRecord(commit);
    const framed = this.#walCodec.encode(record);
    if (framed.type === 'error') {
      retireVerifiedDocumentSnapshotCache(commit.snapshot);
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

    const frozenSnapshot = deepFreeze(commit.snapshot);
    const frozenPositionMap = deepFreeze(commit.positionMap);
    const frozenInverse = deepFreeze(commit.inverse);
    this.#revisions.set(commit.revision.id, storeRevision(commit.revision));
    this.#transactionIds.add(transaction.id);
    this.#documentSnapshots.set(commit.revision.id, frozenSnapshot);
    this.#headRevisionId = commit.revision.id;
    this.#activateCommittedSnapshotCache(previousSnapshot, frozenSnapshot);
    this.#pendingWalRevisionId = commit.revision.id;
    this.#pendingWalTask = this.#persistWal(commit.revision.id, framed.value);
    this.#notifyCommit();

    return {
      type: 'ok',
      value: {
        revisionId: commit.revision.id,
        snapshot: frozenSnapshot,
        transactionHash: commit.transactionHash,
        positionMap: frozenPositionMap,
        inverse: frozenInverse,
        achievedDurability: 'memory',
      },
    };
  }

  getDurability(uri: ResourceUri, revisionId: RevisionId): Result<DurabilityLevel> {
    if (uri !== this.#uri) {
      return this.#modelNotFound();
    }
    if (this.#isDisposed) {
      return this.#disposed();
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
    if (this.#isDisposed) {
      return Promise.resolve(this.#disposed());
    }
    if (!isDurabilityLevel(target)) {
      return Promise.resolve({
        type: 'error',
        error: this.#error(
          'SCHEMA_INVALID',
          'validation',
          false,
          'The requested durability target is invalid.',
          'abort',
          this.#headRevisionId,
        ),
      });
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
    if (this.#mode !== 'read-write') {
      return Promise.resolve({
        type: 'error',
        error: this.#readOnlyDurabilityError(revisionId),
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
    if (this.#isDisposed) {
      return this.#disposed();
    }
    const stored = this.#revisions.get(revisionId);
    return stored === undefined
      ? this.#revisionNotFound(revisionId)
      : {
          type: 'ok',
          value: projectRevision(stored),
        };
  }

  checkpoint(revisionId: RevisionId): Promise<Result<DurabilityAcknowledgement>> {
    if (this.#isDisposed) {
      return Promise.resolve(this.#disposed());
    }
    return this.#getOrStartCheckpoint(revisionId);
  }

  #getOrStartCheckpoint(revisionId: RevisionId): Promise<Result<DurabilityAcknowledgement>> {
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
    if (this.#mode !== 'read-write') {
      const error = this.#readOnlyDurabilityError(revisionId);
      this.#rejectSnapshotWaiters(revisionId, error);
      return {
        type: 'error',
        error,
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
    if (uri !== this.#uri || this.#isDisposed) {
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

  dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) {
      return this.#disposePromise;
    }
    this.#isDisposed = true;
    this.#mode = 'read-only';
    this.#rejectUnstartedSnapshotWaitersOnDispose(this.#disposedError());
    this.#disposePromise = this.#finishDispose();
    return this.#disposePromise;
  }

  async #finishDispose(): Promise<void> {
    await this.whenIdle();
    this.#lease.release();
    this.#listeners.clear();
    for (const snapshot of this.#documentSnapshots.values()) {
      retireVerifiedDocumentSnapshotCache(snapshot);
    }
  }

  #checkWritable(uri: ResourceUri, baseRevisionId: RevisionId): Result<void> {
    if (uri !== this.#uri) {
      return this.#modelNotFound();
    }
    if (this.#isDisposed) {
      return {
        type: 'error',
        error: this.#error(
          'MODEL_DISPOSED',
          'conflict',
          false,
          'The Document Authority has been disposed.',
          'abort',
          this.#headRevisionId,
        ),
      };
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

  #checkTransactionIdentity(transactionId: TransactionId): Result<void> {
    return this.#transactionIds.has(transactionId)
      ? {
          type: 'error',
          error: this.#error(
            'IDEMPOTENCY_CONFLICT',
            'conflict',
            false,
            'The Transaction ID has already been committed by this Authority.',
            'reread',
            this.#headRevisionId,
          ),
        }
      : {
          type: 'ok',
          value: undefined,
        };
  }

  #decodeTransaction(transaction: unknown): Result<Transaction> {
    const decoded = decodeStrictTransactionV1(transaction);
    return decoded.type === 'ok'
      ? decoded
      : {
          type: 'error',
          error: this.#error(
            decoded.error.reason === 'transaction-too-large'
              ? 'REQUEST_TOO_LARGE'
              : 'SCHEMA_INVALID',
            'validation',
            false,
            decoded.error.safeMessage,
            'abort',
            this.#headRevisionId,
          ),
        };
  }

  #validatePreparedCommit(
    transaction: Transaction,
    prepared: PreparedCommit,
  ): Result<PreparedCommit> {
    let derivedSnapshot: DocumentSnapshot | undefined;
    try {
      const parent = this.#revision(this.#headRevisionId);
      const derived = prepareKernelTransaction({
        transaction,
        headRevision: parent,
        headSnapshot: this.#snapshot(this.#headRevisionId),
        nextRevisionId: prepared.revision.id,
      });
      if (derived.type === 'error') {
        return this.#invalidPreparedCommit();
      }
      derivedSnapshot = derived.value.snapshot;
      const expected: PreparedCommit = {
        revision: {
          id: prepared.revision.id,
          uri: this.#uri,
          parentRevisionId: this.#headRevisionId,
          transactionId: transaction.id,
          sequence: parent.sequence + 1,
          documentHash: derived.value.snapshot.documentHash,
          actor: transaction.actor,
          createdAt: transaction.createdAt,
          durability: 'memory',
        },
        snapshot: derived.value.snapshot,
        transactionHash: derived.value.transactionHash,
        positionMap: derived.value.positionMap,
        inverse: derived.value.inverse,
        replayInput: derived.value.replayInput,
      };
      const isValid = [
        validatePreparedSnapshot(prepared),
        !this.#revisions.has(prepared.revision.id),
        !this.#transactionIds.has(transaction.id),
        Number.isSafeInteger(prepared.revision.sequence),
        canonicalValuesEqual(prepared.revision, expected.revision),
        canonicalValuesEqual(prepared.snapshot, expected.snapshot),
        prepared.transactionHash === expected.transactionHash,
        prepared.positionMap.fromRevisionId === this.#headRevisionId,
        prepared.positionMap.toRevisionId === prepared.revision.id,
        canonicalValuesEqual(prepared.inverse, expected.inverse),
        canonicalValuesEqual(prepared.replayInput, expected.replayInput),
        validatePreparedReplay(transaction, prepared),
      ].every(Boolean);
      if (!isValid) {
        retireVerifiedDocumentSnapshotCache(derived.value.snapshot);
        return this.#invalidPreparedCommit();
      }
      return {
        type: 'ok',
        value: expected,
      };
    } catch {
      if (derivedSnapshot !== undefined) {
        retireVerifiedDocumentSnapshotCache(derivedSnapshot);
      }
      return this.#invalidPreparedCommit();
    }
  }

  #validateTrustedPreparedCommit(
    transaction: Transaction,
    prepared: PreparedCommit,
  ): Result<PreparedCommit> {
    const parent = this.#revision(this.#headRevisionId);
    const revision = prepared.revision;
    const isValid = [
      !this.#revisions.has(revision.id),
      !this.#transactionIds.has(transaction.id),
      revision.uri === this.#uri,
      revision.parentRevisionId === this.#headRevisionId,
      revision.transactionId === transaction.id,
      revision.sequence === parent.sequence + 1,
      Number.isSafeInteger(revision.sequence),
      revision.actor === transaction.actor,
      revision.createdAt === transaction.createdAt,
      revision.durability === 'memory',
      prepared.snapshot.revisionId === revision.id,
      prepared.snapshot.documentHash === revision.documentHash,
      prepared.positionMap.fromRevisionId === this.#headRevisionId,
      prepared.positionMap.toRevisionId === revision.id,
    ].every(Boolean);
    if (!isValid) {
      retireVerifiedDocumentSnapshotCache(prepared.snapshot);
      return this.#invalidPreparedCommit();
    }
    return {
      type: 'ok',
      value: prepared,
    };
  }

  #activateCommittedSnapshotCache(
    previousSnapshot: DocumentSnapshot,
    snapshot: DocumentSnapshot,
  ): void {
    if (activateKernelDerivedDocumentSnapshotCache(previousSnapshot, snapshot)) {
      return;
    }
    const cached = cacheVerifiedFrozenDocumentSnapshot(snapshot);
    retireVerifiedDocumentSnapshotCache(previousSnapshot);
    if (cached.type === 'error') {
      retireVerifiedDocumentSnapshotCache(snapshot);
    }
  }

  #invalidPreparedCommit(): Result<never> {
    return {
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

  #disposed<TValue>(): Result<TValue> {
    return {
      type: 'error',
      error: this.#disposedError(),
    };
  }

  #disposedError(): NirecoError {
    return this.#error(
      'MODEL_DISPOSED',
      'conflict',
      false,
      'The Document Authority has been disposed.',
      'abort',
      this.#headRevisionId,
    );
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

  #readOnlyDurabilityError(revisionId: RevisionId): NirecoError {
    return this.#error(
      'DURABILITY_UNREACHABLE',
      'storage',
      false,
      'The read-only Authority cannot start additional durability writes.',
      'abort',
      revisionId,
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
    void this.#getOrStartCheckpoint(revisionId);
  }

  #rejectUnstartedSnapshotWaitersOnDispose(error: NirecoError): void {
    for (const revisionId of this.#waiters.keys()) {
      if (!this.#snapshotTasks.has(revisionId)) {
        this.#rejectSnapshotWaiters(revisionId, error);
      }
    }
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

function validatePreparedSnapshot(prepared: PreparedCommit): boolean {
  return isCanonicalSnapshot(prepared.snapshot);
}

function validatePreparedReplay(transaction: Transaction, prepared: PreparedCommit): boolean {
  const normalized = decodeStrictTransactionV1(transaction);
  const replayInput = asRecord(prepared.replayInput);
  if (
    normalized.type === 'error' ||
    replayInput === undefined ||
    !hasExactKeys(replayInput, ['profile', 'transaction']) ||
    replayInput['profile'] !== TRANSACTION_REPLAY_PROFILE
  ) {
    return false;
  }
  const replayTransaction = decodeStrictTransactionV1(replayInput['transaction']);
  if (replayTransaction.type === 'error') {
    return false;
  }
  const hashed = hashCanonicalJsonPortable(HASH_DOMAINS.transaction, normalized.value);
  const normalizedJson = serializeCanonicalJson(normalized.value);
  const replayJson = serializeCanonicalJson(replayTransaction.value);
  return (
    hashed.type === 'ok' &&
    hashed.hash === prepared.transactionHash &&
    normalizedJson.type === 'ok' &&
    replayJson.type === 'ok' &&
    normalizedJson.value === replayJson.value
  );
}

function isCanonicalSnapshot(snapshot: DocumentSnapshot): boolean {
  if (validateDocumentSnapshot(snapshot).type === 'error') {
    return false;
  }
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(snapshot),
  );
  return hashed.type === 'ok' && hashed.hash === snapshot.documentHash;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  const leftJson = serializeCanonicalJson(left);
  const rightJson = serializeCanonicalJson(right);
  return leftJson.type === 'ok' && rightJson.type === 'ok' && leftJson.value === rightJson.value;
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

function isDurabilityLevel(value: unknown): value is DurabilityLevel {
  return value === 'memory' || value === 'wal' || value === 'snapshot';
}

function assertInitialState(options: SingleDocumentAuthorityOptions): Revision {
  try {
    const revision = normalizeInitialRevision(options.initialRevision);
    if (
      options.uri === revision.uri &&
      options.uri === options.lease.fence.uri &&
      options.initialSnapshot.revisionId === revision.id &&
      options.initialSnapshot.documentHash === revision.documentHash &&
      isCanonicalSnapshot(options.initialSnapshot) &&
      revision.durability !== 'memory'
    ) {
      return revision;
    }
  } catch {
    // A hostile runtime value is invalid initial state.
  }
  throw new Error(
    'Initial Authority Revision, Snapshot, URI, and lease must agree and be durable.',
  );
}

function normalizeInitialRevision(value: unknown): Revision {
  const revision = readClosedDataRecord(value, [
    'id',
    'uri',
    'parentRevisionId',
    'transactionId',
    'sequence',
    'documentHash',
    'actor',
    'createdAt',
    'durability',
  ]);
  if (revision === undefined) {
    return invalidInitialRevision();
  }

  const id = requireParsedString(revision['id'], parseRevisionId);
  const uri = requireDocumentUri(revision['uri']);
  const parentRevisionId = requireParentRevisionId(revision['parentRevisionId']);
  const transactionId = requireParsedString(revision['transactionId'], parseTransactionId);
  const sequence = requireInitialSequence(revision['sequence']);
  const documentHash = requireParsedString(revision['documentHash'], parseContentHash);
  const actor = requireActor(revision['actor']);
  const createdAt = requireParsedString(revision['createdAt'], parseIsoTimestamp);
  const durability = requireDurability(revision['durability']);
  if (
    (sequence === 0 && parentRevisionId !== null) ||
    (sequence > 0 && parentRevisionId === null) ||
    parentRevisionId === id
  ) {
    return invalidInitialRevision();
  }
  return {
    id,
    uri,
    parentRevisionId,
    transactionId,
    sequence,
    documentHash,
    actor,
    createdAt,
    durability,
  };
}

function requireDocumentUri(value: unknown): DocumentUri {
  return typeof value === 'string' && isDocumentUri(value) ? value : invalidInitialRevision();
}

function requireParentRevisionId(value: unknown): RevisionId | null {
  return value === null ? null : requireParsedString(value, parseRevisionId);
}

function requireInitialSequence(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    return invalidInitialRevision();
  }
  return value;
}

function requireActor(value: unknown): Revision['actor'] {
  return decodeStrictActorRef(value) ?? invalidInitialRevision();
}

function requireDurability(value: unknown): DurabilityLevel {
  return isDurabilityLevel(value) ? value : invalidInitialRevision();
}

function invalidInitialRevision(): never {
  throw new TypeError('The initial Revision does not match its closed runtime schema.');
}

function readClosedDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  ) {
    return undefined;
  }
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return undefined;
    }
  }
  return value as Readonly<Record<string, unknown>>;
}

function parseString<TValue>(
  value: unknown,
  parse: (input: string) =>
    | { readonly type: 'valid'; readonly value: TValue }
    | {
        readonly type: 'invalid';
      },
): TValue | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parse(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function requireParsedString<TValue>(
  value: unknown,
  parse: (input: string) =>
    | { readonly type: 'valid'; readonly value: TValue }
    | {
        readonly type: 'invalid';
      },
): TValue {
  return parseString(value, parse) ?? invalidInitialRevision();
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
