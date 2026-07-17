import { describe, expect, it } from 'vitest';

import type { CancellationToken } from '../../src/base/cancellation/cancellation-token.js';
import { nonCancellingToken } from '../../src/base/cancellation/cancellation-token.js';
import type { NirecoError, Result } from '../../src/base/errors/nireco-error.js';
import { parseRevisionId, type RevisionId } from '../../src/base/ids/identifiers.js';
import type { ResourceUri } from '../../src/base/uri/resource-uri.js';
import type { DurabilityLevel } from '../../src/model/revision/revision.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import { InProcessResolveModelService } from '../../src/services/workspace-service/resolve-model-service.js';
import type { AlreadyOpenModelSource } from '../../src/services/workspace-service/resolve-model-types.js';
import type { CommitResult, DurabilityAcknowledgement } from '../../src/workspace/contracts.js';
import type { INirecoModel } from '../../src/workspace/model.js';
import {
  DeterministicIdAllocator,
  createMinimalSnapshot,
  validDocumentUri,
  validResourceUri,
} from '../test-support/fixtures.js';

const URI = validDocumentUri('nireco://workspace-01/document/resolve-model');
const OTHER_URI = validDocumentUri('nireco://workspace-01/document/resolve-other');
const NON_DOCUMENT_URI = validResourceUri('https://example.com/document');
const REVISION_ONE = revisionId('018f0000-0000-7000-8000-000000000501');
const REVISION_TWO = revisionId('018f0000-0000-7000-8000-000000000502');
const MISSING_REVISION = revisionId('018f0000-0000-7000-8000-000000000599');

describe('InProcessResolveModelService', () => {
  it('returns the exact Preview.2 current result without exposing the Model', () => {
    const model = createModel();
    const source = new TestOpenModelSource(model);
    const result = createService(source).resolve(request());
    if (result.type === 'error') {
      throw new Error(result.error.safeMessage);
    }

    expect(result.value).toEqual({
      document: { uri: URI, revisionId: REVISION_ONE },
      basedOnRevisionId: REVISION_ONE,
      consistency: 'exact',
      status: 'current',
    });
    expect(Reflect.ownKeys(result.value).sort()).toEqual([
      'basedOnRevisionId',
      'consistency',
      'document',
      'status',
    ]);
    expect(Reflect.ownKeys(result.value.document).sort()).toEqual(['revisionId', 'uri']);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.document)).toBe(true);
    expect(model.snapshotReads).toEqual([REVISION_ONE]);
  });

  it('resolves an existing fixed Revision as stale after the Model head advances', () => {
    const model = createModel();
    model.headRevisionId = REVISION_TWO;
    expect(createService(new TestOpenModelSource(model)).resolve(request())).toMatchObject({
      type: 'ok',
      value: {
        document: { revisionId: REVISION_ONE },
        basedOnRevisionId: REVISION_ONE,
        consistency: 'exact',
        status: 'stale',
      },
    });
  });

  it('returns typed model, disposed, and Revision failures', () => {
    const missingSource = new TestOpenModelSource(undefined);
    expect(createService(missingSource).resolve(request())).toMatchObject({
      type: 'error',
      error: { code: 'MODEL_NOT_FOUND', category: 'validation' },
    });

    const disposed = createModel();
    disposed.disposed = true;
    expect(createService(new TestOpenModelSource(disposed)).resolve(request())).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
        category: 'conflict',
        retryable: false,
        suggestedAction: 'reread',
      },
    });
    expect(disposed.snapshotReads).toEqual([]);

    const model = createModel();
    expect(
      createService(new TestOpenModelSource(model)).resolve(
        request({ revisionId: MISSING_REVISION }),
      ),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'REVISION_NOT_FOUND',
        category: 'validation',
        retryable: false,
        suggestedAction: 'reread',
      },
    });
    expect(model.snapshotReads).toEqual([MISSING_REVISION]);
  });

  it('never resolves or leaks a Model belonging to a different document URI', () => {
    const model = createModel();
    const exactSource = new TestOpenModelSource(model);
    expect(createService(exactSource).resolve(request({ uri: OTHER_URI }))).toMatchObject({
      type: 'error',
      error: { code: 'MODEL_NOT_FOUND' },
    });
    expect(model.snapshotReads).toEqual([]);

    const mismatchedSource = new TestOpenModelSource(model, { returnForEveryUri: true });
    expect(createService(mismatchedSource).resolve(request({ uri: OTHER_URI }))).toMatchObject({
      type: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        category: 'internal',
        retryable: true,
        suggestedAction: 'retry',
      },
    });
    expect(model.snapshotReads).toEqual([]);
  });

  it('validates the exact requested Revision returned by the Model', () => {
    const model = createModel({ returnWrongSnapshot: true });
    expect(createService(new TestOpenModelSource(model)).resolve(request())).toMatchObject({
      type: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        category: 'internal',
        retryable: true,
        suggestedAction: 'retry',
      },
    });
  });

  it('contains source exceptions as canonical retryable internal errors', () => {
    const source = new TestOpenModelSource(createModel(), { throwOnGet: true });
    const result = createService(source).resolve(request());
    expect(result).toMatchObject({
      type: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        category: 'internal',
        retryable: true,
        suggestedAction: 'retry',
      },
    });
    if (result.type === 'error') {
      expect(result.error.safeMessage).not.toContain('private source failure');
    }
  });

  it('rejects closed-schema violations without invoking accessors or the source', () => {
    const model = createModel();
    const source = new TestOpenModelSource(model);
    const service = createService(source);
    expect(service.resolve({ ...request(), extra: true })).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(
      service.resolve({
        document: { ...request().document, extra: true },
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCHEMA_INVALID' } });
    expect(
      service.resolve({
        ...request(),
        cancellation: nonCancellingToken,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCHEMA_INVALID' } });

    let getterCalls = 0;
    const accessorDocument = Object.defineProperty({ revisionId: REVISION_ONE }, 'uri', {
      enumerable: true,
      get(): ResourceUri {
        getterCalls += 1;
        return URI;
      },
    });
    expect(service.resolve({ document: accessorDocument })).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(getterCalls).toBe(0);
    expect(source.calls).toEqual([]);
  });

  it('captures descriptor values once and never invokes request Proxy get traps', () => {
    let requestGets = 0;
    let documentGets = 0;
    const document = new Proxy(
      { uri: URI, revisionId: REVISION_ONE },
      {
        get(target, property, receiver): unknown {
          documentGets += 1;
          return property === 'revisionId'
            ? MISSING_REVISION
            : Reflect.get(target, property, receiver);
        },
      },
    );
    const proxyRequest = new Proxy(
      { document },
      {
        get(): unknown {
          requestGets += 1;
          return undefined;
        },
      },
    );
    expect(
      createService(new TestOpenModelSource(createModel())).resolve(proxyRequest),
    ).toMatchObject({
      type: 'ok',
      value: { basedOnRevisionId: REVISION_ONE },
    });
    expect(requestGets).toBe(0);
    expect(documentGets).toBe(0);
  });

  it('rejects invalid Document URI and Revision identity profiles', () => {
    const source = new TestOpenModelSource(createModel());
    const service = createService(source);
    expect(service.resolve(request({ uri: NON_DOCUMENT_URI }))).toMatchObject({
      type: 'error',
      error: { code: 'INVALID_RESOURCE_URI', category: 'validation' },
    });
    expect(service.resolve(request({ uri: 42 }))).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID', category: 'validation' },
    });
    expect(
      service.resolve({
        document: { uri: URI, revisionId: 'revision-preview-fixture' },
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCHEMA_INVALID' } });
    expect(source.calls).toEqual([]);
  });

  it('supports cancellation before and immediately after the source lookup', () => {
    const initialCancellation = new MutableCancellationToken(true);
    const initialSource = new TestOpenModelSource(createModel());
    expect(createService(initialSource).resolve(request(), initialCancellation)).toMatchObject({
      type: 'error',
      error: { code: 'CANCELLED', category: 'transport' },
    });
    expect(initialSource.calls).toEqual([]);

    const midCancellation = new MutableCancellationToken();
    const model = createModel();
    const midSource = new TestOpenModelSource(model, {
      onGet: () => {
        midCancellation.cancel();
      },
    });
    expect(createService(midSource).resolve(request(), midCancellation)).toMatchObject({
      type: 'error',
      error: { code: 'CANCELLED', category: 'transport' },
    });
    expect(midSource.calls).toEqual([URI]);
    expect(model.snapshotReads).toEqual([]);
  });
});

class TestOpenModelSource implements AlreadyOpenModelSource {
  readonly calls: ResourceUri[] = [];
  readonly #model: TestModel | undefined;
  readonly #returnForEveryUri: boolean;
  readonly #throwOnGet: boolean;
  readonly #onGet: (() => void) | undefined;

  constructor(
    model: TestModel | undefined,
    options: {
      readonly returnForEveryUri?: boolean;
      readonly throwOnGet?: boolean;
      readonly onGet?: () => void;
    } = {},
  ) {
    this.#model = model;
    this.#returnForEveryUri = options.returnForEveryUri === true;
    this.#throwOnGet = options.throwOnGet === true;
    this.#onGet = options.onGet;
  }

  get(uri: ResourceUri): INirecoModel | undefined {
    this.calls.push(uri);
    this.#onGet?.();
    if (this.#throwOnGet) {
      throw new Error('private source failure');
    }
    return this.#returnForEveryUri || this.#model?.uri === uri ? this.#model : undefined;
  }
}

class TestModel implements INirecoModel {
  readonly uri: ResourceUri;
  readonly schemaId = 'nireco.manuscript';
  readonly snapshotReads: RevisionId[] = [];
  readonly #snapshots: ReadonlyMap<RevisionId, DocumentSnapshot>;
  readonly #ids = new DeterministicIdAllocator();
  readonly #returnWrongSnapshot: boolean;
  headRevisionId: RevisionId;
  disposed = false;

  constructor(options: {
    readonly uri: ResourceUri;
    readonly snapshots: readonly DocumentSnapshot[];
    readonly headRevisionId: RevisionId;
    readonly returnWrongSnapshot: boolean;
  }) {
    this.uri = options.uri;
    this.#snapshots = new Map(options.snapshots.map((snapshot) => [snapshot.revisionId, snapshot]));
    this.headRevisionId = options.headRevisionId;
    this.#returnWrongSnapshot = options.returnWrongSnapshot;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  getSnapshot(revisionId = this.headRevisionId): Result<DocumentSnapshot> {
    this.snapshotReads.push(revisionId);
    if (this.disposed) {
      return this.#error('MODEL_DISPOSED', 'The Model has been disposed.', 'conflict');
    }
    if (this.#returnWrongSnapshot) {
      const wrong = this.#snapshots.get(REVISION_TWO);
      return wrong === undefined
        ? this.#error('REVISION_NOT_FOUND', 'The wrong Snapshot fixture is unavailable.')
        : { type: 'ok', value: wrong };
    }
    const snapshot = this.#snapshots.get(revisionId);
    return snapshot === undefined
      ? this.#error('REVISION_NOT_FOUND', 'The requested Revision is unavailable.')
      : { type: 'ok', value: snapshot };
  }

  async applyTransaction(transaction: Transaction): Promise<Result<CommitResult>> {
    void transaction;
    return this.#error('CAPABILITY_UNSUPPORTED', 'The resolve test Model is immutable.');
  }

  getDurability(revisionId: RevisionId): Result<DurabilityLevel> {
    return this.#snapshots.has(revisionId)
      ? { type: 'ok', value: 'snapshot' }
      : this.#error('REVISION_NOT_FOUND', 'The requested Revision is unavailable.');
  }

  async whenDurable(
    revisionId: RevisionId,
    target: DurabilityLevel,
  ): Promise<Result<DurabilityAcknowledgement>> {
    void target;
    return this.#snapshots.has(revisionId)
      ? {
          type: 'ok',
          value: {
            revisionId,
            achievedDurability: 'snapshot',
            authorityMode: 'read-only',
          },
        }
      : this.#error('REVISION_NOT_FOUND', 'The requested Revision is unavailable.');
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  #error<TValue>(
    code: NirecoError['code'],
    safeMessage: string,
    category: NirecoError['category'] = 'validation',
  ): Result<TValue> {
    return {
      type: 'error',
      error: {
        code,
        category,
        retryable: false,
        safeMessage,
        debugId: this.#ids.allocateDebugId(),
        suggestedAction: 'abort',
      },
    };
  }
}

class MutableCancellationToken implements CancellationToken {
  #cancelled: boolean;

  constructor(cancelled = false) {
    this.#cancelled = cancelled;
  }

  get isCancellationRequested(): boolean {
    return this.#cancelled;
  }

  cancel(): void {
    this.#cancelled = true;
  }

  throwIfCancellationRequested(): void {
    if (this.#cancelled) {
      throw new Error('cancelled');
    }
  }
}

function createService(source: AlreadyOpenModelSource): InProcessResolveModelService {
  return new InProcessResolveModelService({
    source,
    ids: new DeterministicIdAllocator(),
  });
}

function createModel(
  options: {
    readonly returnWrongSnapshot?: boolean;
  } = {},
): TestModel {
  return new TestModel({
    uri: URI,
    snapshots: [createMinimalSnapshot(REVISION_ONE), createMinimalSnapshot(REVISION_TWO)],
    headRevisionId: REVISION_ONE,
    returnWrongSnapshot: options.returnWrongSnapshot === true,
  });
}

function request(
  document: {
    readonly uri?: unknown;
    readonly revisionId?: unknown;
  } = {},
): { readonly document: { readonly uri: unknown; readonly revisionId: unknown } } {
  return {
    document: {
      uri: document.uri ?? URI,
      revisionId: document.revisionId ?? REVISION_ONE,
    },
  };
}

function revisionId(value: string): RevisionId {
  const parsed = parseRevisionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Revision ID: ${value}`);
  }
  return parsed.value;
}
