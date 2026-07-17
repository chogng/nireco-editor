import type { NirecoError, NirecoErrorCode, Result } from '../../base/errors/nireco-error.js';
import { createNirecoCatalogError } from '../../base/errors/nireco-error-catalog.js';
import { parseRevisionId, type RevisionId } from '../../base/ids/identifiers.js';
import type { ResourceUri } from '../../base/uri/resource-uri.js';
import { isDocumentUri } from '../../base/uri/resource-uri.js';
import type { Diagnostic } from '../../model/diagnostic.js';
import type { IIdAllocator } from '../../workspace/id-allocator.js';
import type { INirecoModel } from '../../workspace/model.js';
import { normalizeCanonicalDocumentSnapshot } from '../../workspace/canonical-document-snapshot.js';
import type {
  DocumentDiagnosticsSource,
  DocumentDiagnosticsSourceRequest,
} from './document-read-types.js';

export interface CanonicalSnapshotDiagnosticsModelSource {
  get(uri: ResourceUri): INirecoModel | undefined;
}

export interface CanonicalSnapshotDocumentDiagnosticsSourceOptions {
  readonly source: CanonicalSnapshotDiagnosticsModelSource;
  readonly ids: Pick<IIdAllocator, 'allocateDebugId'>;
}

const EMPTY_DIAGNOSTICS: readonly Diagnostic[] = Object.freeze([]);

/**
 * Production structural diagnostics boundary for an exact, already-open Model Snapshot.
 *
 * Canonical Models reject structurally invalid documents before installation, so a healthy
 * Snapshot produces no structural diagnostics. Corrupt or mismatched provider state is a
 * typed storage failure, never a successful empty result. Domain-specific lint providers may
 * be composed above this source later without weakening this exact-Snapshot validation.
 */
export class CanonicalSnapshotDocumentDiagnosticsSource implements DocumentDiagnosticsSource {
  readonly #source: CanonicalSnapshotDiagnosticsModelSource;
  readonly #ids: Pick<IIdAllocator, 'allocateDebugId'>;

  constructor(options: CanonicalSnapshotDocumentDiagnosticsSourceOptions) {
    this.#source = options.source;
    this.#ids = options.ids;
  }

  getDiagnostics(request: DocumentDiagnosticsSourceRequest): Result<readonly Diagnostic[]> {
    try {
      return this.#getDiagnostics(request);
    } catch {
      return this.#error('INTERNAL_ERROR');
    }
  }

  #getDiagnostics(request: DocumentDiagnosticsSourceRequest): Result<readonly Diagnostic[]> {
    if (isCancelled(request)) {
      return this.#error('CANCELLED');
    }
    if (!isDocumentUri(request.document.uri)) {
      return this.#error('INVALID_RESOURCE_URI');
    }
    if (parseRevisionId(request.document.revisionId).type === 'invalid') {
      return this.#error('SCHEMA_INVALID');
    }

    const model = this.#source.get(request.document.uri);
    if (model === undefined) {
      return this.#error('MODEL_NOT_FOUND');
    }
    if (model.uri !== request.document.uri) {
      return this.#error('INTERNAL_ERROR');
    }
    if (isCancelled(request)) {
      return this.#error('CANCELLED');
    }

    const snapshot = model.getSnapshot(request.document.revisionId);
    if (snapshot.type === 'error') {
      return this.#normalizeModelError(snapshot.error, model.headRevisionId);
    }
    if (isCancelled(request)) {
      return this.#error('CANCELLED');
    }
    const normalized = normalizeCanonicalDocumentSnapshot(snapshot.value);
    if (
      normalized.type === 'error' ||
      normalized.value.revisionId !== request.document.revisionId
    ) {
      return this.#error('STORAGE_CORRUPT', request.document.revisionId);
    }
    if (isCancelled(request)) {
      return this.#error('CANCELLED');
    }
    return { type: 'ok', value: EMPTY_DIAGNOSTICS };
  }

  #normalizeModelError(
    error: NirecoError,
    currentRevisionId: RevisionId,
  ): Result<readonly Diagnostic[]> {
    if (error.code === 'MODEL_DISPOSED') {
      return this.#error('MODEL_DISPOSED', currentRevisionId);
    }
    if (error.code === 'REVISION_NOT_FOUND') {
      return this.#error('REVISION_NOT_FOUND', currentRevisionId);
    }
    return this.#error('INTERNAL_ERROR', currentRevisionId);
  }

  #error<TValue>(code: NirecoErrorCode, currentRevisionId?: RevisionId): Result<TValue> {
    return {
      type: 'error',
      error: createNirecoCatalogError(code, this.#ids.allocateDebugId(), {
        ...(currentRevisionId === undefined ? {} : { currentRevisionId }),
      }),
    };
  }
}

function isCancelled(request: DocumentDiagnosticsSourceRequest): boolean {
  return request.cancellation.isCancellationRequested;
}
