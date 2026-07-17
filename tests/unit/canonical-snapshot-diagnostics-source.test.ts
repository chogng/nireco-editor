import { describe, expect, it } from 'vitest';
import type { NirecoError, Result } from '../../src/base/errors/nireco-error.js';
import type { RevisionId } from '../../src/base/ids/identifiers.js';
import type { ResourceUri } from '../../src/base/uri/resource-uri.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import {
  CanonicalSnapshotDocumentDiagnosticsSource,
  type CanonicalSnapshotDiagnosticsModelSource,
} from '../../src/services/document-service/canonical-snapshot-diagnostics-source.js';
import type { INirecoModel } from '../../src/workspace/model.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  validDocumentUri,
} from '../test-support/fixtures.js';

const URI = validDocumentUri('nireco://workspace-01/document/structural-diagnostics');

describe('CanonicalSnapshotDocumentDiagnosticsSource', () => {
  it('reads and validates the exact canonical Snapshot before returning immutable emptiness', () => {
    const snapshot = createMinimalSnapshot();
    const model = new RecordingModel(URI, snapshot);
    const source = createSource({ get: () => model });

    const result = source.getDiagnostics(request(snapshot.revisionId));
    expect(result).toEqual({ type: 'ok', value: [] });
    if (result.type === 'error') {
      throw new Error(result.error.safeMessage);
    }
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(model.snapshotCalls).toEqual([snapshot.revisionId]);
  });

  it('fails before Model resolution when cancelled', () => {
    let sourceReads = 0;
    const source = createSource({
      get: () => {
        sourceReads += 1;
        return undefined;
      },
    });

    expect(
      source.getDiagnostics({
        ...request(createMinimalSnapshot().revisionId),
        cancellation: {
          isCancellationRequested: true,
          throwIfCancellationRequested(): void {},
        },
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'CANCELLED', category: 'transport', suggestedAction: 'abort' },
    });
    expect(sourceReads).toBe(0);
  });

  it('returns normative missing Model and Revision errors', () => {
    const snapshot = createMinimalSnapshot();
    const missingModel = createSource({ get: () => undefined });
    expect(missingModel.getDiagnostics(request(snapshot.revisionId))).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_NOT_FOUND',
        category: 'validation',
        suggestedAction: 'abort',
      },
    });

    const model = new RecordingModel(URI, snapshot);
    model.nextResult = modelError('REVISION_NOT_FOUND');
    expect(
      createSource({ get: () => model }).getDiagnostics(request(snapshot.revisionId)),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'REVISION_NOT_FOUND',
        category: 'validation',
        suggestedAction: 'reread',
        currentRevisionId: snapshot.revisionId,
      },
    });
  });

  it('reports mismatched content hashes and Revision identities as corrupt provider state', () => {
    const snapshot = createMinimalSnapshot();
    const hashMismatch = new RecordingModel(URI, snapshot);
    hashMismatch.nextResult = {
      type: 'ok',
      value: {
        ...snapshot,
        metadata: { ...snapshot.metadata, title: 'changed without rehashing' },
      },
    };
    expect(
      createSource({ get: () => hashMismatch }).getDiagnostics(request(snapshot.revisionId)),
    ).toMatchObject({
      type: 'error',
      error: { code: 'STORAGE_CORRUPT', category: 'storage', suggestedAction: 'abort' },
    });

    const wrongRevision = new RecordingModel(URI, snapshot);
    wrongRevision.nextResult = {
      type: 'ok',
      value: {
        ...snapshot,
        revisionId: '018f0000-0000-7000-8000-000000000999' as RevisionId,
      },
    };
    expect(
      createSource({ get: () => wrongRevision }).getDiagnostics(request(snapshot.revisionId)),
    ).toMatchObject({
      type: 'error',
      error: { code: 'STORAGE_CORRUPT', category: 'storage' },
    });
  });

  it('contains source and Model exceptions as typed internal failures', () => {
    const snapshot = createMinimalSnapshot();
    const throwingSource = createSource({
      get: () => {
        throw new Error('private source detail');
      },
    });
    expect(throwingSource.getDiagnostics(request(snapshot.revisionId))).toMatchObject({
      type: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        category: 'internal',
        retryable: true,
        suggestedAction: 'retry',
      },
    });

    const throwingModel = new RecordingModel(URI, snapshot);
    throwingModel.throwOnSnapshot = true;
    expect(
      createSource({ get: () => throwingModel }).getDiagnostics(request(snapshot.revisionId)),
    ).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR', category: 'internal' },
    });
  });
});

function createSource(
  modelSource: CanonicalSnapshotDiagnosticsModelSource,
): CanonicalSnapshotDocumentDiagnosticsSource {
  return new CanonicalSnapshotDocumentDiagnosticsSource({
    source: modelSource,
    ids: new DeterministicIdAllocator(),
  });
}

function request(revisionId: RevisionId) {
  return {
    document: { uri: URI, revisionId },
    scope: {},
    cancellation: {
      isCancellationRequested: false,
      throwIfCancellationRequested(): void {},
    },
  } as const;
}

class RecordingModel implements INirecoModel {
  readonly snapshotCalls: RevisionId[] = [];
  readonly schemaId: string;
  readonly uri: ResourceUri;
  readonly headRevisionId: RevisionId;
  readonly isDisposed = false;
  nextResult: Result<DocumentSnapshot> | undefined;
  throwOnSnapshot = false;

  constructor(
    uri: ResourceUri,
    readonly snapshot: DocumentSnapshot,
  ) {
    this.uri = uri;
    this.schemaId = snapshot.schemaId;
    this.headRevisionId = snapshot.revisionId;
  }

  getSnapshot(revisionId = this.headRevisionId): Result<DocumentSnapshot> {
    this.snapshotCalls.push(revisionId);
    if (this.throwOnSnapshot) {
      throw new Error('private Model detail');
    }
    return this.nextResult ?? { type: 'ok', value: this.snapshot };
  }

  async applyTransaction(): Promise<Result<never>> {
    throw new Error('unused');
  }

  getDurability(): Result<'snapshot'> {
    return { type: 'ok', value: 'snapshot' };
  }

  async whenDurable(): Promise<Result<never>> {
    throw new Error('unused');
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

function modelError(code: NirecoError['code']): Result<never> {
  return {
    type: 'error',
    error: {
      code,
      category: 'validation',
      retryable: false,
      safeMessage: 'untrusted provider message',
      debugId: '018f0000-0000-7000-8000-000000000998' as NirecoError['debugId'],
      suggestedAction: 'abort',
    },
  };
}
