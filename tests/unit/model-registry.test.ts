import { describe, expect, it } from 'vitest';

import type { DocumentUri, ResourceUri } from '../../src/base/uri/resource-uri.js';
import { createReplaceTextPositionMap } from '../../src/model/mapping/replace-text-position-map.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import { MAX_TRANSACTION_CANONICAL_UTF8_BYTES } from '../../src/model/transaction/transaction-runtime.js';
import { AuthorityBackedNirecoModel } from '../../src/workspace/authority-backed-model.js';
import type { CommitResult, IDocumentAuthority } from '../../src/workspace/contracts.js';
import { InMemoryModelRegistry } from '../../src/workspace/in-memory-model-registry.js';
import type { IModelSnapshotLoader } from '../../src/workspace/model-registry.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  MINIMAL_FIXTURE_IDS,
  validContentHash,
  validDocumentUri,
  validIsoTimestamp,
  validResourceUri,
  validRevisionId,
  validUtf16Offset,
} from '../test-support/fixtures.js';

describe('InMemoryModelRegistry', () => {
  it('prevents duplicate active models across canonical URI variants', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });

    const first = await registry.create({
      uri: 'NIRECO://Workspace-01/document/doc-1/',
      snapshot: createMinimalSnapshot(),
    });
    const duplicate = await registry.create({
      uri: 'nireco://workspace-01/document/doc-1',
      snapshot: createMinimalSnapshot(),
    });

    expect(first.type).toBe('ok');
    expect(duplicate).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_URI_ALREADY_EXISTS',
      },
    });
    expect(registry.getAll()).toHaveLength(1);
  });

  it('removes a disposed model without deleting its supplied resource data', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const uri = validResourceUri('nireco://workspace-01/document/doc-1');
    const snapshot = createMinimalSnapshot();
    const created = await registry.create({
      uri,
      snapshot,
    });
    if (created.type === 'error') {
      throw new Error('Expected the model to be created.');
    }

    await created.value.dispose();

    expect(created.value.isDisposed).toBe(true);
    expect(registry.get(uri)).toBeUndefined();
    expect(snapshot.metadata.title).toBe('A minimal manuscript');
  });

  it('allows different registries to load the same URI independently', async () => {
    const firstRegistry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const secondRegistry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const uri = 'nireco://workspace-01/document/doc-1';

    const [first, second] = await Promise.all([
      firstRegistry.create({
        uri,
        snapshot: createMinimalSnapshot(),
      }),
      secondRegistry.create({
        uri,
        snapshot: createMinimalSnapshot(),
      }),
    ]);

    if (first.type === 'error' || second.type === 'error') {
      throw new Error('Expected both isolated registries to create a model.');
    }
    expect(first.value).not.toBe(second.value);
  });

  it('serializes concurrent creates for the same canonical URI', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });

    const [first, second] = await Promise.all([
      registry.create({
        uri: 'nireco://workspace-01/document/concurrent-create',
        snapshot: createMinimalSnapshot(),
      }),
      registry.create({
        uri: 'NIRECO://Workspace-01/document/concurrent-create/',
        snapshot: createMinimalSnapshot(),
      }),
    ]);

    expect([first.type, second.type].sort()).toEqual(['error', 'ok']);
    expect([first, second].find((result) => result.type === 'error')).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_URI_ALREADY_EXISTS',
      },
    });
    expect(registry.getAll()).toHaveLength(1);
  });

  it('does not let continuing Authority notifications starve Model creation', async () => {
    const snapshot = createMinimalSnapshot();
    const authorityHarness = createSelfNotifyingAuthority(snapshot);
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
      authority: authorityHarness.authority,
    });
    const uri = validResourceUri('nireco://workspace-01/document/notifying-authority');

    const creating = registry.create({
      uri,
      snapshot,
    });
    await authorityHarness.secondRefreshStarted;
    const settledBeforeLaterRefresh = await settlesWithinMicrotaskTurns(creating, 20);

    authorityHarness.stopNotifications();
    authorityHarness.releaseSecondRefresh();
    const created = await creating;

    expect(settledBeforeLaterRefresh).toBe(true);
    expect(authorityHarness.getHeadCallCount()).toBeGreaterThanOrEqual(2);
    expect(created.type).toBe('ok');
    if (created.type === 'ok') {
      expect(created.value.headRevisionId).toBe(snapshot.revisionId);
      await created.value.dispose();
    }
  });

  it('coalesces concurrent resolves into a single model load', async () => {
    const deferred = createDeferred<Awaited<ReturnType<IModelSnapshotLoader['load']>>>();
    let loadCount = 0;
    let loadedUri: ResourceUri | undefined;
    const loader: IModelSnapshotLoader = {
      async load(uri) {
        loadCount += 1;
        loadedUri = uri;
        const result = await deferred.promise;
        if (result.type === 'loaded') {
          return {
            type: 'loaded',
            options: {
              ...result.options,
              uri,
            },
          };
        }
        return result;
      },
    };
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
      loader,
    });
    const uri = validResourceUri('nireco://workspace-01/document/doc-1');
    const alias = uncheckedResourceUri('NIRECO://Workspace-01/document/doc-1/');

    const firstResolution = registry.resolve(uri);
    const secondResolution = registry.resolve(alias);
    deferred.resolve({
      type: 'loaded',
      options: {
        uri,
        snapshot: createMinimalSnapshot(),
      },
    });
    const [first, second] = await Promise.all([firstResolution, secondResolution]);

    expect(loadCount).toBe(1);
    expect(loadedUri).toBe(uri);
    expect(first.type).toBe('ok');
    expect(second.type).toBe('ok');
    if (first.type === 'ok' && second.type === 'ok') {
      expect(first.value).toBe(second.value);
    }
  });

  it('canonicalizes aliases for get and unload lifecycle operations', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const uri = validResourceUri('nireco://workspace-01/document/doc-1');
    const alias = uncheckedResourceUri('NIRECO://Workspace-01/document/doc-1/');
    const created = await registry.create({
      uri,
      snapshot: createMinimalSnapshot(),
    });
    if (created.type === 'error') {
      throw new Error('Expected the model to be created.');
    }

    expect(registry.get(alias)).toBe(created.value);
    await expect(registry.unload(alias)).resolves.toEqual({
      type: 'ok',
      value: undefined,
    });
    expect(created.value.isDisposed).toBe(true);
    expect(registry.get(uri)).toBeUndefined();
  });

  it('freezes the canonical snapshot exposed by a model', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const created = await registry.create({
      uri: 'nireco://workspace-01/document/doc-1',
      snapshot: createMinimalSnapshot(),
    });
    if (created.type === 'error') {
      throw new Error('Expected the model to be created.');
    }

    const snapshot = created.value.getSnapshot();
    if (snapshot.type === 'error') {
      throw new Error('Expected the snapshot to be available.');
    }

    expect(Object.isFrozen(snapshot.value)).toBe(true);
    expect(Object.isFrozen(snapshot.value.root.children)).toBe(true);
    expect(Object.isFrozen(snapshot.value.metadata.authors[0])).toBe(true);
  });

  it('rejects malformed or hash-drifted Snapshots before installing a Model', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const snapshot = createMinimalSnapshot();
    const malformedMetadata = {
      ...snapshot.metadata,
      futureField: true,
    };
    const malformed: DocumentSnapshot = {
      ...snapshot,
      metadata: malformedMetadata,
    };
    const hashDrifted: DocumentSnapshot = {
      ...snapshot,
      documentHash: validContentHash(
        'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ),
    };

    for (const candidate of [malformed, hashDrifted]) {
      await expect(
        registry.create({
          uri: 'nireco://workspace-01/document/invalid-snapshot',
          snapshot: candidate,
        }),
      ).resolves.toMatchObject({
        type: 'error',
        error: {
          code: 'SCHEMA_INVALID',
          category: 'validation',
        },
      });
    }
    expect(registry.getAll()).toHaveLength(0);
  });

  it('contains hostile Snapshot traps and returns a typed validation error', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const hostile = new Proxy(createMinimalSnapshot(), {
      ownKeys() {
        throw new Error('Snapshot traps must not escape the Model registry boundary.');
      },
    });

    await expect(
      registry.create({
        uri: 'nireco://workspace-01/document/hostile-snapshot',
        snapshot: hostile,
      }),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
        category: 'validation',
      },
    });
    expect(registry.getAll()).toHaveLength(0);
  });

  it('reports a missing immutable revision without treating it as a mutable-base conflict', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const created = await registry.create({
      uri: 'nireco://workspace-01/document/doc-1',
      snapshot: createMinimalSnapshot(),
    });
    if (created.type === 'error') {
      throw new Error('Expected the model to be created.');
    }

    expect(created.value.getSnapshot(validRevisionId('rev-missing'))).toMatchObject({
      type: 'error',
      error: {
        code: 'REVISION_NOT_FOUND',
        category: 'validation',
        suggestedAction: 'reread',
      },
    });
  });

  it('reports a loaded immutable Snapshot as already Snapshot-durable', async () => {
    const registry = new InMemoryModelRegistry({
      ids: new DeterministicIdAllocator(),
    });
    const snapshot = createMinimalSnapshot();
    const created = await registry.create({
      uri: 'nireco://workspace-01/document/doc-1',
      snapshot,
    });
    if (created.type === 'error') {
      throw new Error('Expected the model to be created.');
    }

    expect(created.value.getDurability(snapshot.revisionId)).toEqual({
      type: 'ok',
      value: 'snapshot',
    });
    await expect(created.value.whenDurable(snapshot.revisionId, 'wal')).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'snapshot',
        authorityMode: 'read-only',
      },
    });
    await expect(
      created.value.whenDurable(snapshot.revisionId, 'remote' as never),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
        category: 'validation',
      },
    });
  });
});

describe('AuthorityBackedNirecoModel direct apply', () => {
  it('rejects an oversized Transaction before invoking the Authority', async () => {
    const harness = createDirectApplyHarness();
    const transaction = createDirectTransaction(harness);
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

    await expect(harness.model.applyTransaction(oversized)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'REQUEST_TOO_LARGE',
        category: 'validation',
      },
    });
    expect(harness.model.headRevisionId).toBe(harness.initialSnapshot.revisionId);
    await harness.model.dispose();
  });

  it.each([
    ['malformed', 'SCHEMA_INVALID'],
    ['hash-drifted', 'SCHEMA_INVALID'],
    ['schema-mismatched', 'SCHEMA_INVALID'],
    ['revision-mismatched', 'BASE_REVISION_MISMATCH'],
  ] as const)('rejects a %s Commit Snapshot without changing local state', async (kind, code) => {
    const harness = createDirectApplyHarness();
    const snapshotRevisionId = harness.ids.allocateRevisionId();
    const commitRevisionId =
      kind === 'revision-mismatched' ? harness.ids.allocateRevisionId() : snapshotRevisionId;
    let snapshot: DocumentSnapshot;
    switch (kind) {
      case 'malformed': {
        const metadata = {
          ...harness.initialSnapshot.metadata,
          futureField: true,
        };
        snapshot = {
          ...harness.initialSnapshot,
          revisionId: snapshotRevisionId,
          metadata,
        };
        break;
      }
      case 'hash-drifted':
        snapshot = {
          ...harness.initialSnapshot,
          revisionId: snapshotRevisionId,
          documentHash: validContentHash(
            'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ),
        };
        break;
      case 'schema-mismatched': {
        const runtimeSnapshot: unknown = {
          ...harness.initialSnapshot,
          revisionId: snapshotRevisionId,
          schemaId: 'nireco.other-manuscript',
        };
        snapshot = runtimeSnapshot as DocumentSnapshot;
        break;
      }
      case 'revision-mismatched':
        snapshot = {
          ...harness.initialSnapshot,
          revisionId: snapshotRevisionId,
        };
        break;
    }
    const commit = createDirectCommit(harness.initialSnapshot, snapshot, commitRevisionId);
    harness.setApply(async () => ({ type: 'ok', value: commit }));

    const rejected = await harness.model.applyTransaction(createDirectTransaction(harness));

    expect(rejected).toMatchObject({
      type: 'error',
      error: {
        code,
      },
    });
    expect(harness.model.headRevisionId).toBe(harness.initialSnapshot.revisionId);
    for (const revisionId of new Set([snapshotRevisionId, commitRevisionId])) {
      expect(harness.model.getSnapshot(revisionId)).toMatchObject({
        type: 'error',
        error: {
          code: 'REVISION_NOT_FOUND',
        },
      });
    }
    await harness.model.dispose();
  });

  it('does not execute a Commit Snapshot accessor or install its Revision', async () => {
    const harness = createDirectApplyHarness();
    const revisionId = harness.ids.allocateRevisionId();
    let getterCalls = 0;
    const snapshot: DocumentSnapshot = {
      ...harness.initialSnapshot,
      revisionId,
    };
    Object.defineProperty(snapshot, 'metadata', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return harness.initialSnapshot.metadata;
      },
    });
    const commit = createDirectCommit(harness.initialSnapshot, snapshot, revisionId);
    harness.setApply(async () => ({ type: 'ok', value: commit }));

    const rejected = await harness.model.applyTransaction(createDirectTransaction(harness));

    expect(rejected).toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
      },
    });
    expect(getterCalls).toBe(0);
    expect(harness.model.headRevisionId).toBe(harness.initialSnapshot.revisionId);
    expect(harness.model.getSnapshot(revisionId)).toMatchObject({
      type: 'error',
      error: {
        code: 'REVISION_NOT_FOUND',
      },
    });
    await harness.model.dispose();
  });

  it.each([
    ['transaction-hash', 'SCHEMA_INVALID'],
    ['durability', 'SCHEMA_INVALID'],
    ['position-map-from', 'BASE_REVISION_MISMATCH'],
    ['position-map-to', 'BASE_REVISION_MISMATCH'],
    ['throwing-position-map', 'SCHEMA_INVALID'],
  ] as const)('rejects invalid %s Commit metadata before installation', async (kind, code) => {
    const harness = createDirectApplyHarness();
    const revisionId = harness.ids.allocateRevisionId();
    const snapshot: DocumentSnapshot = {
      ...harness.initialSnapshot,
      revisionId,
    };
    const commit = createDirectCommit(harness.initialSnapshot, snapshot, revisionId);
    let adaptedCommit: CommitResult;
    if (kind === 'transaction-hash') {
      const runtimeCommit: unknown = {
        ...commit,
        transactionHash: 'not-a-content-hash',
      };
      adaptedCommit = runtimeCommit as CommitResult;
    } else if (kind === 'durability') {
      const runtimeCommit: unknown = {
        ...commit,
        achievedDurability: 'snapshot',
      };
      adaptedCommit = runtimeCommit as CommitResult;
    } else if (kind === 'position-map-from' || kind === 'position-map-to') {
      const mismatchedRevisionId = harness.ids.allocateRevisionId();
      adaptedCommit = {
        ...commit,
        positionMap: createReplaceTextPositionMap({
          fromRevisionId:
            kind === 'position-map-from'
              ? mismatchedRevisionId
              : harness.initialSnapshot.revisionId,
          toRevisionId: kind === 'position-map-to' ? mismatchedRevisionId : revisionId,
          textNodeId: MINIMAL_FIXTURE_IDS.text,
          startUtf16Offset: validUtf16Offset(0),
          endUtf16Offset: validUtf16Offset(0),
          replacementUtf16Length: 1,
        }),
      };
    } else {
      const stableMap = commit.positionMap;
      adaptedCommit = {
        ...commit,
        positionMap: {
          fromRevisionId: stableMap.fromRevisionId,
          toRevisionId: stableMap.toRevisionId,
          mapPosition(position) {
            return stableMap.mapPosition(position);
          },
          mapNodeId() {
            throw new Error('A bad adapter must not leak a throwing PositionMap.');
          },
          compose(next) {
            return stableMap.compose(next);
          },
        },
      };
    }
    harness.setApply(async () => ({ type: 'ok', value: adaptedCommit }));

    const rejected = await harness.model.applyTransaction(createDirectTransaction(harness));

    expect(rejected).toMatchObject({
      type: 'error',
      error: {
        code,
      },
    });
    expect(harness.model.headRevisionId).toBe(harness.initialSnapshot.revisionId);
    expect(harness.model.getSnapshot(revisionId)).toMatchObject({
      type: 'error',
      error: {
        code: 'REVISION_NOT_FOUND',
      },
    });
    await harness.model.dispose();
  });

  it('preserves the remaining Commit fields after installing a normalized Snapshot', async () => {
    const harness = createDirectApplyHarness();
    const revisionId = harness.ids.allocateRevisionId();
    const snapshot: DocumentSnapshot = {
      ...harness.initialSnapshot,
      revisionId,
    };
    const commit = createDirectCommit(harness.initialSnapshot, snapshot, revisionId);
    harness.setApply(async () => ({ type: 'ok', value: commit }));

    const committed = await harness.model.applyTransaction(createDirectTransaction(harness));

    expect(committed.type).toBe('ok');
    if (committed.type === 'error') {
      throw new Error(committed.error.safeMessage);
    }
    expect(committed.value.revisionId).toBe(commit.revisionId);
    expect(committed.value.transactionHash).toBe(commit.transactionHash);
    expect(committed.value.positionMap).toBe(commit.positionMap);
    expect(committed.value.inverse).toBe(commit.inverse);
    expect(committed.value.achievedDurability).toBe(commit.achievedDurability);
    expect(committed.value.snapshot).not.toBe(snapshot);
    expect(Object.isFrozen(committed.value.snapshot)).toBe(true);
    expect(harness.model.headRevisionId).toBe(revisionId);
    expect(harness.model.getSnapshot(revisionId)).toEqual({
      type: 'ok',
      value: committed.value.snapshot,
    });
    await harness.model.dispose();
  });

  it('does not let a delayed apply result roll back a refreshed authoritative head', async () => {
    const harness = createDirectApplyHarness();
    const appliedRevisionId = harness.ids.allocateRevisionId();
    const laterRevisionId = harness.ids.allocateRevisionId();
    const appliedSnapshot: DocumentSnapshot = {
      ...harness.initialSnapshot,
      revisionId: appliedRevisionId,
    };
    const laterSnapshot: DocumentSnapshot = {
      ...harness.initialSnapshot,
      revisionId: laterRevisionId,
    };
    const applyResult = createDeferred<Awaited<ReturnType<IDocumentAuthority['apply']>>>();
    harness.setApply(async () => applyResult.promise);
    const applying = harness.model.applyTransaction(createDirectTransaction(harness));

    harness.setAuthoritativeSnapshot(laterSnapshot);
    harness.notify();
    await expect(harness.model.synchronizeWithAuthority()).resolves.toEqual({
      type: 'ok',
      value: undefined,
    });
    expect(harness.model.headRevisionId).toBe(laterRevisionId);

    applyResult.resolve({
      type: 'ok',
      value: createDirectCommit(harness.initialSnapshot, appliedSnapshot, appliedRevisionId),
    });
    await expect(applying).resolves.toMatchObject({
      type: 'ok',
      value: {
        revisionId: appliedRevisionId,
      },
    });

    expect(harness.model.headRevisionId).toBe(laterRevisionId);
    expect(harness.model.getSnapshot(appliedRevisionId)).toMatchObject({
      type: 'ok',
      value: {
        revisionId: appliedRevisionId,
      },
    });
    await harness.model.dispose();
  });

  it('contains Authority apply exceptions as INTERNAL_ERROR without changing local state', async () => {
    const harness = createDirectApplyHarness();
    harness.setApply(async () => {
      throw new Error('Authority apply failure.');
    });

    await expect(
      harness.model.applyTransaction(createDirectTransaction(harness)),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        category: 'internal',
      },
    });
    expect(harness.model.headRevisionId).toBe(harness.initialSnapshot.revisionId);
    await harness.model.dispose();
  });
});

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolvePromise: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value): void {
      if (resolvePromise === undefined) {
        throw new Error('Deferred promise resolver was not initialized.');
      }
      resolvePromise(value);
    },
  };
}

function uncheckedResourceUri(value: string): ResourceUri {
  return value as ResourceUri;
}

interface DirectApplyHarness {
  readonly uri: DocumentUri;
  readonly initialSnapshot: DocumentSnapshot;
  readonly ids: DeterministicIdAllocator;
  readonly model: AuthorityBackedNirecoModel;
  readonly notify: () => void;
  readonly setAuthoritativeSnapshot: (snapshot: DocumentSnapshot) => void;
  readonly setApply: (apply: IDocumentAuthority['apply']) => void;
}

function createDirectApplyHarness(): DirectApplyHarness {
  const uri = validDocumentUri('nireco://workspace-01/document/direct-apply-boundary');
  const initialSnapshot = createMinimalSnapshot();
  const ids = new DeterministicIdAllocator();
  let applyHandler: IDocumentAuthority['apply'] = async () => {
    throw new Error('The direct-apply test must install an Authority response.');
  };
  let authoritativeSnapshot = initialSnapshot;
  let listener: (() => void) | undefined;
  const authority: IDocumentAuthority = {
    async open(openedUri) {
      return {
        type: 'ok',
        value: {
          uri: openedUri,
          headRevisionId: initialSnapshot.revisionId,
        },
      };
    },
    async getHead() {
      return {
        type: 'ok',
        value: authoritativeSnapshot.revisionId,
      };
    },
    getSnapshot() {
      return {
        type: 'ok',
        value: authoritativeSnapshot,
      };
    },
    apply(transaction) {
      return applyHandler(transaction);
    },
    getDurability() {
      return {
        type: 'ok',
        value: 'snapshot',
      };
    },
    async whenDurable(_uri, revisionId) {
      return {
        type: 'ok',
        value: {
          revisionId,
          achievedDurability: 'snapshot',
          authorityMode: 'read-only',
        },
      };
    },
    subscribe(_uri, nextListener) {
      listener = nextListener;
      return {
        dispose(): void {
          if (listener === nextListener) {
            listener = undefined;
          }
        },
      };
    },
  };
  const model = new AuthorityBackedNirecoModel({
    uri,
    initialSnapshot,
    authority,
    ids,
    onDispose() {},
  });
  return {
    uri,
    initialSnapshot,
    ids,
    model,
    notify(): void {
      listener?.();
    },
    setAuthoritativeSnapshot(snapshot): void {
      authoritativeSnapshot = snapshot;
    },
    setApply(apply): void {
      applyHandler = apply;
    },
  };
}

function createDirectTransaction(harness: DirectApplyHarness): Transaction {
  return {
    id: harness.ids.allocateTransactionId(),
    target: {
      uri: harness.uri,
      baseRevisionId: harness.initialSnapshot.revisionId,
    },
    actor: {
      type: 'human',
      id: 'human-1',
    },
    operations: [
      {
        id: harness.ids.allocateOperationId(),
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(0),
        endUtf16Offset: validUtf16Offset(0),
        replacement: 'x',
      },
    ],
    preconditions: [
      {
        kind: 'document-hash',
        expected: harness.initialSnapshot.documentHash,
      },
    ],
    metadata: {
      source: 'human-input',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

function createDirectCommit(
  initialSnapshot: DocumentSnapshot,
  snapshot: DocumentSnapshot,
  revisionId: CommitResult['revisionId'],
): CommitResult {
  return {
    revisionId,
    snapshot,
    transactionHash: validContentHash(
      'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    ),
    positionMap: createReplaceTextPositionMap({
      fromRevisionId: initialSnapshot.revisionId,
      toRevisionId: revisionId,
      textNodeId: MINIMAL_FIXTURE_IDS.text,
      startUtf16Offset: validUtf16Offset(0),
      endUtf16Offset: validUtf16Offset(0),
      replacementUtf16Length: 1,
    }),
    inverse: {
      operations: [
        {
          type: 'replace-text',
          textNodeId: MINIMAL_FIXTURE_IDS.text,
          startUtf16Offset: validUtf16Offset(0),
          endUtf16Offset: validUtf16Offset(1),
          replacement: '',
        },
      ],
      preconditions: [],
    },
    achievedDurability: 'memory',
  };
}

interface SelfNotifyingAuthorityHarness {
  readonly authority: IDocumentAuthority;
  readonly secondRefreshStarted: Promise<undefined>;
  readonly getHeadCallCount: () => number;
  readonly releaseSecondRefresh: () => void;
  readonly stopNotifications: () => void;
}

function createSelfNotifyingAuthority(snapshot: DocumentSnapshot): SelfNotifyingAuthorityHarness {
  const secondRefreshStarted = createDeferred<undefined>();
  const secondRefreshRelease = createDeferred<undefined>();
  let listener: (() => void) | undefined;
  let notificationsEnabled = true;
  let getHeadCallCount = 0;

  const authority: IDocumentAuthority = {
    async open(uri) {
      return {
        type: 'ok',
        value: {
          uri,
          headRevisionId: snapshot.revisionId,
        },
      };
    },
    async getHead() {
      getHeadCallCount += 1;
      if (notificationsEnabled) {
        listener?.();
      }
      if (getHeadCallCount === 2) {
        secondRefreshStarted.resolve(undefined);
        await secondRefreshRelease.promise;
      }
      return {
        type: 'ok',
        value: snapshot.revisionId,
      };
    },
    getSnapshot() {
      return {
        type: 'ok',
        value: snapshot,
      };
    },
    async apply() {
      throw new Error('The synchronization regression does not apply Transactions.');
    },
    getDurability() {
      return {
        type: 'ok',
        value: 'snapshot',
      };
    },
    async whenDurable(_uri, revisionId) {
      return {
        type: 'ok',
        value: {
          revisionId,
          achievedDurability: 'snapshot',
          authorityMode: 'read-only',
        },
      };
    },
    subscribe(_uri, nextListener) {
      listener = nextListener;
      return {
        dispose(): void {
          if (listener === nextListener) {
            listener = undefined;
          }
        },
      };
    },
  };

  return {
    authority,
    secondRefreshStarted: secondRefreshStarted.promise,
    getHeadCallCount: () => getHeadCallCount,
    releaseSecondRefresh(): void {
      secondRefreshRelease.resolve(undefined);
    },
    stopNotifications(): void {
      notificationsEnabled = false;
    },
  };
}

function settlesWithinMicrotaskTurns(
  promise: Promise<unknown>,
  maximumTurns: number,
): Promise<boolean> {
  return Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    advanceMicrotaskTurns(maximumTurns).then(() => false),
  ]);
}

async function advanceMicrotaskTurns(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}
