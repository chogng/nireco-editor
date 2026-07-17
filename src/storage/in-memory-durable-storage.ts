import type { Result } from '../base/errors/nireco-error.js';
import { deepFreeze } from '../base/immutability/deep-freeze.js';
import type { ResourceUri } from '../base/uri/resource-uri.js';
import type {
  AuthorityFence,
  DurabilityPortError,
  IWriteAheadLog,
  SnapshotManifest,
} from '../workspace/document-authority/durability-ports.js';
import type { ISnapshotByteStorage } from './snapshot-store.js';

export type DurabilityFaultPoint =
  | 'wal.append'
  | 'wal.fsync'
  | 'wal.read'
  | 'wal.truncate'
  | 'snapshot.write-temporary'
  | 'snapshot.fsync-temporary'
  | 'snapshot.read-temporary'
  | 'snapshot.atomic-rename'
  | 'snapshot.read-manifest'
  | 'snapshot.read'
  | 'snapshot.switch-manifest';

export interface FaultPause {
  release(): void;
}

export interface InMemoryDurableStorageOptions {
  readonly isFenceCurrent: (fence: AuthorityFence) => boolean;
}

interface WalState {
  volatileBytes: Uint8Array;
  durableBytes: Uint8Array;
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

interface SnapshotManifestDraft {
  readonly manifestVersion: 1;
  readonly uri: ResourceUri;
  readonly revisionId: SnapshotManifest['revisionId'];
  readonly parentRevisionId: SnapshotManifest['parentRevisionId'];
  readonly transactionId: SnapshotManifest['transactionId'];
  readonly sequence: number;
  readonly documentHash: SnapshotManifest['documentHash'];
  readonly actor: SnapshotManifest['actor'];
  readonly createdAt: SnapshotManifest['createdAt'];
  readonly snapshotKey: string;
}

export class InMemoryDurableStorage implements IWriteAheadLog, ISnapshotByteStorage {
  readonly #isFenceCurrent: (fence: AuthorityFence) => boolean;
  readonly #wal = new Map<ResourceUri, WalState>();
  readonly #temporarySnapshots = new Map<string, Uint8Array>();
  readonly #syncedTemporarySnapshots = new Set<string>();
  readonly #snapshots = new Map<string, Uint8Array>();
  readonly #manifests = new Map<ResourceUri, SnapshotManifest>();
  readonly #failures = new Map<DurabilityFaultPoint, number>();
  readonly #pauses = new Map<DurabilityFaultPoint, Deferred>();

  constructor(options: InMemoryDurableStorageOptions) {
    this.#isFenceCurrent = options.isFenceCurrent;
  }

  failNext(point: DurabilityFaultPoint, count = 1): void {
    this.#failures.set(point, (this.#failures.get(point) ?? 0) + count);
  }

  pauseAt(point: DurabilityFaultPoint): FaultPause {
    if (this.#pauses.has(point)) {
      throw new Error(`A pause already exists for ${point}.`);
    }
    const deferred = createDeferred();
    this.#pauses.set(point, deferred);
    let released = false;
    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.#pauses.delete(point);
        deferred.resolve();
      },
    };
  }

  async append(
    fence: AuthorityFence,
    framedRecord: Uint8Array,
  ): Promise<Result<void, DurabilityPortError>> {
    const ready = await this.#before('wal.append', fence, 'wal-append');
    if (ready.type === 'error') {
      return ready;
    }
    const state = this.#walState(fence.uri);
    state.volatileBytes = concatenateBytes(state.volatileBytes, framedRecord);
    return ok();
  }

  async fsync(fence: AuthorityFence): Promise<Result<void, DurabilityPortError>> {
    const ready = await this.#before('wal.fsync', fence, 'wal-fsync');
    if (ready.type === 'error') {
      return ready;
    }
    const state = this.#walState(fence.uri);
    state.durableBytes = state.volatileBytes.slice();
    return ok();
  }

  async readDurable(uri: ResourceUri): Promise<Result<Uint8Array, DurabilityPortError>> {
    const ready = await this.#beforeRead('wal.read', 'wal-read');
    if (ready.type === 'error') {
      return ready;
    }
    return {
      type: 'ok',
      value: this.#walState(uri).durableBytes.slice(),
    };
  }

  async truncateDurable(
    fence: AuthorityFence,
    expectedByteLength: number,
    byteLength: number,
  ): Promise<Result<void, DurabilityPortError>> {
    const ready = await this.#before('wal.truncate', fence, 'wal-truncate');
    if (ready.type === 'error') {
      return ready;
    }
    const state = this.#walState(fence.uri);
    if (state.durableBytes.byteLength !== expectedByteLength) {
      return storageError(
        'wal-truncate',
        'length-conflict',
        'The durable WAL length changed before the compare-and-truncate operation.',
      );
    }
    if (byteLength < 0 || byteLength > state.durableBytes.byteLength) {
      return storageError('wal-truncate', 'corrupt', 'The WAL truncation boundary is invalid.');
    }
    state.durableBytes = state.durableBytes.slice(0, byteLength);
    state.volatileBytes = state.durableBytes.slice();
    return ok();
  }

  async writeTemporary(
    fence: AuthorityFence,
    temporaryKey: string,
    bytes: Uint8Array,
  ): Promise<Result<void, DurabilityPortError>> {
    const ready = await this.#before('snapshot.write-temporary', fence, 'snapshot-write-temporary');
    if (ready.type === 'error') {
      return ready;
    }
    this.#temporarySnapshots.set(storageKey(fence.uri, temporaryKey), bytes.slice());
    return ok();
  }

  async fsyncTemporary(
    fence: AuthorityFence,
    temporaryKey: string,
  ): Promise<Result<void, DurabilityPortError>> {
    const ready = await this.#before('snapshot.fsync-temporary', fence, 'snapshot-fsync-temporary');
    if (ready.type === 'error') {
      return ready;
    }
    const key = storageKey(fence.uri, temporaryKey);
    if (!this.#temporarySnapshots.has(key)) {
      return storageError(
        'snapshot-fsync-temporary',
        'io',
        'The temporary Snapshot does not exist.',
      );
    }
    this.#syncedTemporarySnapshots.add(key);
    return ok();
  }

  async readTemporary(
    uri: ResourceUri,
    temporaryKey: string,
  ): Promise<Result<Uint8Array, DurabilityPortError>> {
    const ready = await this.#beforeRead('snapshot.read-temporary', 'snapshot-validate-temporary');
    if (ready.type === 'error') {
      return ready;
    }
    const bytes = this.#temporarySnapshots.get(storageKey(uri, temporaryKey));
    return bytes === undefined
      ? storageError('snapshot-validate-temporary', 'io', 'The temporary Snapshot does not exist.')
      : {
          type: 'ok',
          value: bytes.slice(),
        };
  }

  async atomicRename(
    fence: AuthorityFence,
    temporaryKey: string,
    snapshotKey: string,
  ): Promise<Result<void, DurabilityPortError>> {
    const ready = await this.#before('snapshot.atomic-rename', fence, 'snapshot-atomic-rename');
    if (ready.type === 'error') {
      return ready;
    }
    const sourceKey = storageKey(fence.uri, temporaryKey);
    const destinationKey = storageKey(fence.uri, snapshotKey);
    const bytes = this.#temporarySnapshots.get(sourceKey);
    if (bytes === undefined || !this.#syncedTemporarySnapshots.has(sourceKey)) {
      return storageError(
        'snapshot-atomic-rename',
        'io',
        'The temporary Snapshot is missing or has not been fsynced.',
      );
    }
    this.#snapshots.set(destinationKey, bytes);
    this.#temporarySnapshots.delete(sourceKey);
    this.#syncedTemporarySnapshots.delete(sourceKey);
    return ok();
  }

  async readManifest(
    uri: ResourceUri,
  ): Promise<Result<SnapshotManifest | undefined, DurabilityPortError>> {
    const ready = await this.#beforeRead('snapshot.read-manifest', 'snapshot-manifest-read');
    if (ready.type === 'error') {
      return ready;
    }
    return {
      type: 'ok',
      value: this.#manifests.get(uri),
    };
  }

  async readSnapshot(
    uri: ResourceUri,
    snapshotKey: string,
  ): Promise<Result<Uint8Array | undefined, DurabilityPortError>> {
    const ready = await this.#beforeRead('snapshot.read', 'snapshot-manifest-read');
    if (ready.type === 'error') {
      return ready;
    }
    return {
      type: 'ok',
      value: this.#snapshots.get(storageKey(uri, snapshotKey))?.slice(),
    };
  }

  async switchManifest(
    fence: AuthorityFence,
    expectedGeneration: number,
    draft: SnapshotManifestDraft,
  ): Promise<Result<SnapshotManifest, DurabilityPortError>> {
    const ready = await this.#before('snapshot.switch-manifest', fence, 'snapshot-manifest-switch');
    if (ready.type === 'error') {
      return ready;
    }
    const current = this.#manifests.get(fence.uri);
    if ((current?.generation ?? 0) !== expectedGeneration) {
      return storageError(
        'snapshot-manifest-switch',
        'generation-conflict',
        'The Snapshot manifest generation changed before the atomic switch.',
      );
    }
    if (current !== undefined && current.sequence > draft.sequence) {
      return storageError(
        'snapshot-manifest-switch',
        'generation-conflict',
        'The Snapshot manifest sequence cannot move backward.',
      );
    }
    if (!this.#snapshots.has(storageKey(fence.uri, draft.snapshotKey))) {
      return storageError(
        'snapshot-manifest-switch',
        'corrupt',
        'The Snapshot manifest cannot reference a missing Snapshot.',
      );
    }

    const manifest = deepFreeze<SnapshotManifest>({
      ...draft,
      actor: {
        ...draft.actor,
      },
      generation: expectedGeneration + 1,
    });
    this.#manifests.set(fence.uri, manifest);
    return {
      type: 'ok',
      value: manifest,
    };
  }

  crash(): void {
    for (const state of this.#wal.values()) {
      state.volatileBytes = state.durableBytes.slice();
    }
    this.#temporarySnapshots.clear();
    this.#syncedTemporarySnapshots.clear();
    for (const deferred of this.#pauses.values()) {
      deferred.resolve();
    }
    this.#pauses.clear();
  }

  durableWalBytes(uri: ResourceUri): Uint8Array {
    return this.#walState(uri).durableBytes.slice();
  }

  seedDurableWal(uri: ResourceUri, bytes: Uint8Array): void {
    this.#wal.set(uri, {
      durableBytes: bytes.slice(),
      volatileBytes: bytes.slice(),
    });
  }

  corruptDurableWal(uri: ResourceUri, byteOffset: number, xorMask = 0xff): void {
    const state = this.#walState(uri);
    if (byteOffset < 0 || byteOffset >= state.durableBytes.byteLength) {
      throw new Error('The WAL corruption offset is outside the durable bytes.');
    }
    const corrupted = state.durableBytes.slice();
    corrupted[byteOffset] = (corrupted[byteOffset] ?? 0) ^ xorMask;
    state.durableBytes = corrupted;
    state.volatileBytes = corrupted.slice();
  }

  currentManifest(uri: ResourceUri): SnapshotManifest | undefined {
    return this.#manifests.get(uri);
  }

  #walState(uri: ResourceUri): WalState {
    const existing = this.#wal.get(uri);
    if (existing !== undefined) {
      return existing;
    }
    const created: WalState = {
      volatileBytes: new Uint8Array(),
      durableBytes: new Uint8Array(),
    };
    this.#wal.set(uri, created);
    return created;
  }

  async #before(
    point: DurabilityFaultPoint,
    fence: AuthorityFence,
    stage: DurabilityPortError['stage'],
  ): Promise<Result<void, DurabilityPortError>> {
    const paused = this.#pauses.get(point);
    if (paused !== undefined) {
      await paused.promise;
    }
    if (!this.#isFenceCurrent(fence)) {
      return storageError(stage, 'stale-fence', 'The Authority fencing epoch is stale.');
    }
    if (this.#consumeFailure(point)) {
      return storageError(stage, 'io', `Injected failure at ${point}.`);
    }
    return ok();
  }

  async #beforeRead(
    point: DurabilityFaultPoint,
    stage: DurabilityPortError['stage'],
  ): Promise<Result<void, DurabilityPortError>> {
    const paused = this.#pauses.get(point);
    if (paused !== undefined) {
      await paused.promise;
    }
    return this.#consumeFailure(point)
      ? storageError(stage, 'io', `Injected failure at ${point}.`)
      : ok();
  }

  #consumeFailure(point: DurabilityFaultPoint): boolean {
    const remaining = this.#failures.get(point) ?? 0;
    if (remaining === 0) {
      return false;
    }
    if (remaining === 1) {
      this.#failures.delete(point);
    } else {
      this.#failures.set(point, remaining - 1);
    }
    return true;
  }
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => {
      if (resolvePromise === undefined) {
        throw new Error('The pause resolver was not initialized.');
      }
      resolvePromise();
    },
  };
}

function concatenateBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

function storageKey(uri: ResourceUri, key: string): string {
  return `${uri}\u0000${key}`;
}

function ok(): Result<void, DurabilityPortError> {
  return {
    type: 'ok',
    value: undefined,
  };
}

function storageError(
  stage: DurabilityPortError['stage'],
  reason: DurabilityPortError['reason'],
  safeMessage: string,
): Result<never, DurabilityPortError> {
  return {
    type: 'error',
    error: {
      stage,
      reason,
      safeMessage,
    },
  };
}
