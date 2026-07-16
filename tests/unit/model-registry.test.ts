import { describe, expect, it } from 'vitest';

import { InMemoryModelRegistry } from '../../src/workspace/in-memory-model-registry.js';
import type { IModelSnapshotLoader } from '../../src/workspace/model-registry.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  validResourceUri,
  validRevisionId,
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

  it('coalesces concurrent resolves into a single model load', async () => {
    const deferred = createDeferred<Awaited<ReturnType<IModelSnapshotLoader['load']>>>();
    let loadCount = 0;
    const loader: IModelSnapshotLoader = {
      async load(uri) {
        loadCount += 1;
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

    const firstResolution = registry.resolve(uri);
    const secondResolution = registry.resolve(uri);
    deferred.resolve({
      type: 'loaded',
      options: {
        uri,
        snapshot: createMinimalSnapshot(),
      },
    });
    const [first, second] = await Promise.all([firstResolution, secondResolution]);

    expect(loadCount).toBe(1);
    expect(first.type).toBe('ok');
    expect(second.type).toBe('ok');
    if (first.type === 'ok' && second.type === 'ok') {
      expect(first.value).toBe(second.value);
    }
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
