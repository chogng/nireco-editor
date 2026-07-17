import {
  nonCancellingToken,
  type CancellationToken,
} from '../../base/cancellation/cancellation-token.js';
import type { NirecoErrorCode, Result } from '../../base/errors/nireco-error.js';
import { createNirecoCatalogError } from '../../base/errors/nireco-error-catalog.js';
import { deepFreeze } from '../../base/immutability/deep-freeze.js';
import { parseRevisionId, type RevisionId } from '../../base/ids/identifiers.js';
import { isDocumentUri } from '../../base/uri/resource-uri.js';
import type { DocumentRef } from '../../model/resource-ref.js';
import type { IIdAllocator } from '../../workspace/id-allocator.js';
import type { INirecoModel } from '../../workspace/model.js';
import type {
  AlreadyOpenModelSource,
  ResolveModelResult,
  ResolveModelService,
  ResolveModelValue,
} from './resolve-model-types.js';

const REQUEST_KEYS = ['document'] as const;
const DOCUMENT_KEYS = ['revisionId', 'uri'] as const;

export interface InProcessResolveModelServiceOptions {
  readonly source: AlreadyOpenModelSource;
  readonly ids: Pick<IIdAllocator, 'allocateDebugId'>;
}

type ReadRequestResult =
  | {
      readonly type: 'ok';
      readonly document: DocumentRef;
    }
  | {
      readonly type: 'error';
      readonly reason: 'invalid-request' | 'invalid-uri';
    };

/**
 * Real `workspace.resolve_model` slice over already-open Models only.
 *
 * The wire request is captured exclusively through inert own data descriptors.
 * Cancellation is an out-of-band execution concern and is never a wire field.
 */
export class InProcessResolveModelService implements ResolveModelService {
  readonly #source: AlreadyOpenModelSource;
  readonly #ids: Pick<IIdAllocator, 'allocateDebugId'>;

  constructor(options: InProcessResolveModelServiceOptions) {
    this.#source = options.source;
    this.#ids = options.ids;
  }

  resolve(
    request: unknown,
    cancellation: CancellationToken = nonCancellingToken,
  ): ResolveModelResult {
    try {
      return this.#resolve(request, cancellation);
    } catch {
      return this.#internalError();
    }
  }

  #resolve(request: unknown, cancellation: CancellationToken): ResolveModelResult {
    const parsed = readResolveModelRequest(request);
    if (parsed.type === 'error') {
      return parsed.reason === 'invalid-uri'
        ? this.#error('INVALID_RESOURCE_URI')
        : this.#schemaInvalid();
    }
    if (isCancelled(cancellation)) {
      return this.#cancelled();
    }

    const model = this.#source.get(parsed.document.uri);
    if (isCancelled(cancellation)) {
      return this.#cancelled();
    }
    if (model === undefined) {
      return this.#modelNotFound();
    }
    if (model.uri !== parsed.document.uri) {
      return this.#internalError();
    }
    if (model.isDisposed) {
      return this.#modelDisposed();
    }

    return this.#resolveRevision(model, parsed.document, cancellation);
  }

  #resolveRevision(
    model: INirecoModel,
    document: DocumentRef,
    cancellation: CancellationToken,
  ): ResolveModelResult {
    const snapshot = model.getSnapshot(document.revisionId);
    if (isCancelled(cancellation)) {
      return this.#cancelled();
    }
    if (snapshot.type === 'error') {
      if (snapshot.error.code === 'MODEL_DISPOSED') {
        return this.#modelDisposed();
      }
      if (snapshot.error.code === 'REVISION_NOT_FOUND') {
        return this.#revisionNotFound(snapshot.error.currentRevisionId);
      }
      return this.#internalError();
    }
    if (snapshot.value.revisionId !== document.revisionId) {
      return this.#internalError();
    }
    const headRevisionId = model.headRevisionId;
    if (parseRevisionId(headRevisionId).type === 'invalid') {
      return this.#internalError();
    }
    const value: ResolveModelValue = {
      document,
      basedOnRevisionId: document.revisionId,
      consistency: 'exact',
      status: headRevisionId === document.revisionId ? 'current' : 'stale',
    };
    return { type: 'ok', value: deepFreeze(value) };
  }

  #schemaInvalid<TValue>(): Result<TValue> {
    return this.#error('SCHEMA_INVALID');
  }

  #cancelled<TValue>(): Result<TValue> {
    return this.#error('CANCELLED');
  }

  #modelNotFound<TValue>(): Result<TValue> {
    return this.#error('MODEL_NOT_FOUND');
  }

  #modelDisposed<TValue>(): Result<TValue> {
    return this.#error('MODEL_DISPOSED');
  }

  #revisionNotFound<TValue>(currentRevisionId?: RevisionId): Result<TValue> {
    return this.#error('REVISION_NOT_FOUND', currentRevisionId);
  }

  #internalError<TValue>(): Result<TValue> {
    return this.#error('INTERNAL_ERROR');
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

function readResolveModelRequest(value: unknown): ReadRequestResult {
  const request = captureExactRecord(value, REQUEST_KEYS);
  if (request === undefined) {
    return { type: 'error', reason: 'invalid-request' };
  }
  return readDocumentRef(request.get('document'));
}

function readDocumentRef(value: unknown): ReadRequestResult {
  const document = captureExactRecord(value, DOCUMENT_KEYS);
  if (document === undefined) {
    return { type: 'error', reason: 'invalid-request' };
  }
  const uri = document.get('uri');
  if (typeof uri !== 'string') {
    return { type: 'error', reason: 'invalid-request' };
  }
  if (!isDocumentUri(uri)) {
    return { type: 'error', reason: 'invalid-uri' };
  }
  const revisionId = document.get('revisionId');
  if (typeof revisionId !== 'string') {
    return { type: 'error', reason: 'invalid-request' };
  }
  const parsedRevisionId = parseRevisionId(revisionId);
  return parsedRevisionId.type === 'valid'
    ? {
        type: 'ok',
        document: {
          uri,
          revisionId: parsedRevisionId.value,
        },
      }
    : { type: 'error', reason: 'invalid-request' };
}

function captureExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): ReadonlyMap<string, unknown> | undefined {
  try {
    if (!isPlainRecordObject(value)) {
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return undefined;
    }
    const captured = new Map<string, unknown>();
    for (const key of expectedKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        return undefined;
      }
      captured.set(key, descriptor.value);
    }
    return captured;
  } catch {
    return undefined;
  }
}

function isPlainRecordObject(value: unknown): value is object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isCancelled(cancellation: CancellationToken): boolean {
  return cancellation.isCancellationRequested;
}
