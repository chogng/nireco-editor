import type { NirecoError, NirecoErrorCode, Result } from '../base/errors/nireco-error.js';
import { deepFreeze } from '../base/immutability/deep-freeze.js';
import { parseContentHash, type RevisionId } from '../base/ids/identifiers.js';
import type { ResourceUri } from '../base/uri/resource-uri.js';
import type { PositionMap } from '../model/mapping/position-map.js';
import type { SemanticPosition } from '../model/position/semantic-position.js';
import type { DurabilityLevel } from '../model/revision/revision.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
import type { Transaction } from '../model/transaction/transaction.js';
import { decodeStrictTransactionV1 } from '../model/transaction/transaction-runtime.js';
import { normalizeCanonicalDocumentSnapshot } from './canonical-document-snapshot.js';
import type { CommitResult, DurabilityAcknowledgement, IDocumentAuthority } from './contracts.js';
import type { IIdAllocator } from './id-allocator.js';
import type { INirecoModel } from './model.js';

export interface AuthorityBackedNirecoModelOptions {
  readonly uri: ResourceUri;
  readonly initialSnapshot: DocumentSnapshot;
  readonly authority: IDocumentAuthority;
  readonly ids: IIdAllocator;
  readonly onDispose: () => void;
}

export class AuthorityBackedNirecoModel implements INirecoModel {
  readonly #authority: IDocumentAuthority;
  readonly #ids: IIdAllocator;
  readonly #onDispose: () => void;
  readonly #snapshots = new Map<RevisionId, DocumentSnapshot>();
  readonly #pendingApplies = new Set<Promise<Result<CommitResult>>>();
  readonly #authoritySubscription: { dispose(): void };
  readonly #schemaId: string;
  #refreshChain: Promise<void> = Promise.resolve();
  #headRevisionId: RevisionId;
  #isDisposed = false;
  #disposePromise: Promise<void> | undefined;

  readonly uri: ResourceUri;

  constructor(options: AuthorityBackedNirecoModelOptions) {
    const normalized = normalizeCanonicalDocumentSnapshot(options.initialSnapshot);
    if (normalized.type === 'error') {
      throw new TypeError('An Authority-backed Model requires a canonical initial Snapshot.');
    }
    const initialSnapshot = deepFreeze(normalized.value);
    this.uri = options.uri;
    this.#authority = options.authority;
    this.#ids = options.ids;
    this.#onDispose = options.onDispose;
    this.#schemaId = initialSnapshot.schemaId;
    this.#headRevisionId = initialSnapshot.revisionId;
    this.#snapshots.set(initialSnapshot.revisionId, initialSnapshot);
    this.#authoritySubscription = this.#authority.subscribe(this.uri, () => {
      void this.#queueAuthorityRefresh();
    });
  }

  get schemaId(): string {
    return this.#schemaId;
  }

  get headRevisionId(): RevisionId {
    return this.#headRevisionId;
  }

  get isDisposed(): boolean {
    return this.#isDisposed;
  }

  getSnapshot(revisionId = this.#headRevisionId): Result<DocumentSnapshot> {
    if (this.#isDisposed) {
      return this.#error('MODEL_DISPOSED', 'The Model has been disposed.');
    }
    const snapshot = this.#snapshots.get(revisionId);
    return snapshot === undefined
      ? this.#error(
          'REVISION_NOT_FOUND',
          'The requested immutable Revision is not available in this Model.',
        )
      : {
          type: 'ok',
          value: snapshot,
        };
  }

  applyTransaction(transaction: Transaction): Promise<Result<CommitResult>> {
    if (this.#isDisposed) {
      return Promise.resolve(this.#error('MODEL_DISPOSED', 'The Model has been disposed.'));
    }
    const decoded = decodeStrictTransactionV1(transaction);
    if (decoded.type === 'error') {
      return Promise.resolve(
        this.#error(
          decoded.error.reason === 'transaction-too-large' ? 'REQUEST_TOO_LARGE' : 'SCHEMA_INVALID',
          decoded.error.safeMessage,
          'validation',
          'abort',
        ),
      );
    }
    if (decoded.value.target.uri !== this.uri) {
      return Promise.resolve(
        this.#error(
          'MODEL_NOT_FOUND',
          'The Transaction targets a different Model URI.',
          'validation',
          'abort',
        ),
      );
    }

    const pending = this.#applyTransaction(decoded.value);
    this.#pendingApplies.add(pending);
    void pending.then(
      () => {
        this.#pendingApplies.delete(pending);
      },
      () => {
        this.#pendingApplies.delete(pending);
      },
    );
    return pending;
  }

  async #applyTransaction(transaction: Transaction): Promise<Result<CommitResult>> {
    try {
      const committed = await this.#authority.apply(transaction);
      if (committed.type === 'error') {
        return committed;
      }
      const normalized = normalizeCanonicalDocumentSnapshot(committed.value.snapshot);
      if (normalized.type === 'error') {
        return this.#error('SCHEMA_INVALID', normalized.error.safeMessage, 'validation', 'abort');
      }
      if (
        normalized.value.revisionId !== committed.value.revisionId ||
        normalized.value.schemaId !== this.#schemaId
      ) {
        return this.#error(
          'BASE_REVISION_MISMATCH',
          'The Document Authority returned a Commit Snapshot inconsistent with the Model.',
          'conflict',
          'reread',
        );
      }
      const achievedDurability: unknown = committed.value.achievedDurability;
      if (
        typeof committed.value.transactionHash !== 'string' ||
        parseContentHash(committed.value.transactionHash).type === 'invalid' ||
        achievedDurability !== 'memory'
      ) {
        return this.#error(
          'SCHEMA_INVALID',
          'The Document Authority returned invalid Commit metadata.',
          'validation',
          'abort',
        );
      }
      const positionMapValidation = validateCommitPositionMap(
        committed.value.positionMap,
        transaction.target.baseRevisionId,
        committed.value.revisionId,
        normalized.value,
      );
      if (positionMapValidation === 'revision-mismatch') {
        return this.#error(
          'BASE_REVISION_MISMATCH',
          'The Document Authority returned a PositionMap for inconsistent Revisions.',
          'conflict',
          'reread',
        );
      }
      if (positionMapValidation === 'invalid') {
        return this.#error(
          'SCHEMA_INVALID',
          'The Document Authority returned an invalid PositionMap.',
          'validation',
          'abort',
        );
      }
      const snapshot = deepFreeze(normalized.value);
      const result: Result<CommitResult> = {
        type: 'ok',
        value: {
          ...committed.value,
          snapshot,
        },
      };
      const requiresReconciliation = await this.#enqueueStateTask(() =>
        this.#installCommitResult(transaction, result.value, snapshot),
      );
      if (requiresReconciliation) {
        this.#scheduleAuthorityReconciliation();
      }
      return result;
    } catch {
      return this.#error(
        'INTERNAL_ERROR',
        'The Document Authority failed while applying the Transaction.',
        'internal',
        'abort',
      );
    }
  }

  getDurability(revisionId: RevisionId): Result<DurabilityLevel> {
    if (this.#isDisposed) {
      return this.#error('MODEL_DISPOSED', 'The Model has been disposed.');
    }
    return this.#authority.getDurability(this.uri, revisionId);
  }

  whenDurable(
    revisionId: RevisionId,
    target: DurabilityLevel,
  ): Promise<Result<DurabilityAcknowledgement>> {
    return this.#isDisposed
      ? Promise.resolve(this.#error('MODEL_DISPOSED', 'The Model has been disposed.'))
      : this.#authority.whenDurable(this.uri, revisionId, target);
  }

  /**
   * Establishes an authoritative head read after subscription. Registry creation
   * uses this to close the read-before-subscribe lost-notification window.
   */
  synchronizeWithAuthority(): Promise<Result<void>> {
    if (this.#isDisposed) {
      return Promise.resolve(this.#error('MODEL_DISPOSED', 'The Model has been disposed.'));
    }

    // This queued read is the synchronization linearization point. Refreshes
    // already queued before this call run first, while notifications arriving
    // afterwards remain serialized behind it without extending create latency.
    return this.#queueAuthorityRefresh();
  }

  dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) {
      return this.#disposePromise;
    }
    this.#isDisposed = true;
    this.#authoritySubscription.dispose();
    this.#disposePromise = this.#finishDispose();
    return this.#disposePromise;
  }

  async #finishDispose(): Promise<void> {
    await Promise.allSettled([...this.#pendingApplies]);
    await this.#refreshChain;
    this.#snapshots.clear();
    this.#onDispose();
  }

  #queueAuthorityRefresh(): Promise<Result<void>> {
    return this.#enqueueStateTask(() => this.#refreshFromAuthority());
  }

  #enqueueStateTask<TResult>(task: () => TResult | Promise<TResult>): Promise<TResult> {
    const pending = this.#refreshChain.then(task);
    this.#refreshChain = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  #installCommitResult(
    transaction: Transaction,
    commit: CommitResult,
    snapshot: DocumentSnapshot,
  ): boolean {
    if (this.#isDisposed) {
      return false;
    }
    this.#snapshots.set(commit.revisionId, snapshot);
    if (
      this.#headRevisionId === transaction.target.baseRevisionId ||
      this.#headRevisionId === commit.revisionId
    ) {
      this.#headRevisionId = commit.revisionId;
      return false;
    }
    return true;
  }

  #scheduleAuthorityReconciliation(): void {
    if (!this.#isDisposed) {
      void this.#queueAuthorityRefresh();
    }
  }

  async #refreshFromAuthority(): Promise<Result<void>> {
    if (!this.#acceptsAuthorityRefresh()) {
      return this.#error('MODEL_DISPOSED', 'The Model has been disposed.');
    }
    try {
      const head = await this.#authority.getHead(this.uri);
      if (head.type === 'error') {
        return head;
      }
      if (!this.#acceptsAuthorityRefresh()) {
        return this.#error('MODEL_DISPOSED', 'The Model has been disposed.');
      }
      const snapshot = this.#authority.getSnapshot(this.uri, head.value);
      if (snapshot.type === 'error') {
        return snapshot;
      }
      if (!this.#acceptsAuthorityRefresh()) {
        return this.#error('MODEL_DISPOSED', 'The Model has been disposed.');
      }
      const normalized = normalizeCanonicalDocumentSnapshot(snapshot.value);
      if (normalized.type === 'error') {
        return this.#error('SCHEMA_INVALID', normalized.error.safeMessage);
      }
      if (
        normalized.value.revisionId !== head.value ||
        normalized.value.schemaId !== this.#schemaId
      ) {
        return this.#error(
          'BASE_REVISION_MISMATCH',
          'The Document Authority returned a Snapshot inconsistent with its head.',
          'conflict',
          'reread',
        );
      }
      const frozen = deepFreeze(normalized.value);
      this.#snapshots.set(frozen.revisionId, frozen);
      this.#headRevisionId = frozen.revisionId;
      return {
        type: 'ok',
        value: undefined,
      };
    } catch {
      return this.#error(
        'INTERNAL_ERROR',
        'The Document Authority failed while synchronizing the Model head.',
        'internal',
        'abort',
      );
    }
  }

  #acceptsAuthorityRefresh(): boolean {
    return !this.#isDisposed;
  }

  #error(
    code: NirecoErrorCode,
    safeMessage: string,
    category: NirecoError['category'] = code === 'MODEL_DISPOSED' ? 'conflict' : 'validation',
    suggestedAction: NonNullable<NirecoError['suggestedAction']> = code === 'MODEL_DISPOSED'
      ? 'abort'
      : 'reread',
  ): Result<never> {
    const error: NirecoError = {
      code,
      category,
      retryable: false,
      safeMessage,
      debugId: this.#ids.allocateDebugId(),
      currentRevisionId: this.#headRevisionId,
      suggestedAction,
    };
    return {
      type: 'error',
      error,
    };
  }
}

type PositionMapValidation = 'valid' | 'invalid' | 'revision-mismatch';

function validateCommitPositionMap(
  value: unknown,
  expectedFromRevisionId: RevisionId,
  expectedToRevisionId: RevisionId,
  snapshot: DocumentSnapshot,
): PositionMapValidation {
  try {
    if (!hasPositionMapSurface(value)) {
      return 'invalid';
    }
    if (
      value.fromRevisionId !== expectedFromRevisionId ||
      value.toRevisionId !== expectedToRevisionId
    ) {
      return 'revision-mismatch';
    }
    const probe: SemanticPosition = {
      kind: 'node-boundary',
      parentNodeId: snapshot.root.id,
      childIndex: 0,
      affinity: 'before',
    };
    if (!mapsProbeIdentity(value, snapshot.root.id, probe)) {
      return 'invalid';
    }
    const composed = value.compose(createIdentityPositionMap(expectedToRevisionId));
    return hasPositionMapSurface(composed) &&
      composed.fromRevisionId === expectedFromRevisionId &&
      composed.toRevisionId === expectedToRevisionId &&
      mapsProbeIdentity(composed, snapshot.root.id, probe)
      ? 'valid'
      : 'invalid';
  } catch {
    return 'invalid';
  }
}

function hasPositionMapSurface(value: unknown): value is PositionMap {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PositionMap>;
  return (
    typeof candidate.fromRevisionId === 'string' &&
    typeof candidate.toRevisionId === 'string' &&
    typeof candidate.mapPosition === 'function' &&
    typeof candidate.mapNodeId === 'function' &&
    typeof candidate.compose === 'function'
  );
}

function mapsProbeIdentity(
  map: PositionMap,
  rootNodeId: DocumentSnapshot['root']['id'],
  probe: SemanticPosition,
): boolean {
  const mappedNode = map.mapNodeId(rootNodeId);
  const mappedPosition = map.mapPosition(probe);
  return (
    mappedNode.status === 'mapped' &&
    mappedNode.nodeId === rootNodeId &&
    mappedPosition.status === 'mapped' &&
    sameSemanticPosition(mappedPosition.position, probe)
  );
}

function sameSemanticPosition(left: SemanticPosition, right: SemanticPosition): boolean {
  return (
    left.kind === 'node-boundary' &&
    right.kind === 'node-boundary' &&
    left.parentNodeId === right.parentNodeId &&
    left.childIndex === right.childIndex &&
    left.affinity === right.affinity
  );
}

function createIdentityPositionMap(revisionId: RevisionId): PositionMap {
  return {
    fromRevisionId: revisionId,
    toRevisionId: revisionId,
    mapPosition(position) {
      return {
        status: 'mapped',
        position,
      };
    },
    mapNodeId(nodeId) {
      return {
        status: 'mapped',
        nodeId,
      };
    },
    compose(next) {
      return next;
    },
  };
}
