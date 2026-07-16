import type { NirecoError, NirecoErrorCode, Result } from '../base/errors/nireco-error.js';
import { deepFreeze } from '../base/immutability/deep-freeze.js';
import type { RevisionId } from '../base/ids/identifiers.js';
import { canonicalizeResourceUri, type ResourceUri } from '../base/uri/resource-uri.js';
import type { DurabilityLevel } from '../model/revision/revision.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
import type { IIdAllocator } from './id-allocator.js';
import type {
  CreateModelResult,
  IModelRegistry,
  IModelSnapshotLoader,
  ResolveModelResult,
} from './model-registry.js';
import type { CreateModelOptions, INirecoModel } from './model.js';
import type { DurabilityAcknowledgement } from './contracts.js';

export interface InMemoryModelRegistryOptions {
  readonly ids: IIdAllocator;
  readonly loader?: IModelSnapshotLoader;
}

export class InMemoryModelRegistry implements IModelRegistry {
  readonly #ids: IIdAllocator;
  readonly #loader: IModelSnapshotLoader | undefined;
  readonly #models = new Map<ResourceUri, InMemoryNirecoModel>();
  readonly #pendingResolutions = new Map<ResourceUri, Promise<ResolveModelResult>>();

  constructor(options: InMemoryModelRegistryOptions) {
    this.#ids = options.ids;
    this.#loader = options.loader;
  }

  async create(options: CreateModelOptions): Promise<CreateModelResult> {
    const canonicalUri = canonicalizeResourceUri(options.uri);
    if (canonicalUri.type === 'invalid') {
      return {
        type: 'error',
        error: this.#createError(
          'INVALID_RESOURCE_URI',
          'The resource URI is invalid.',
          'validation',
          false,
          'abort',
        ),
      };
    }

    if (this.#models.has(canonicalUri.value)) {
      return {
        type: 'error',
        error: this.#createError(
          'MODEL_URI_ALREADY_EXISTS',
          'An active model already exists for this resource URI.',
          'conflict',
          false,
          'reread',
        ),
      };
    }

    const model = new InMemoryNirecoModel({
      uri: canonicalUri.value,
      snapshot: options.snapshot,
      onDispose: () => {
        this.#models.delete(canonicalUri.value);
      },
      createError: (code, safeMessage, currentRevisionId) =>
        this.#createError(
          code,
          safeMessage,
          code === 'REVISION_NOT_FOUND' ? 'validation' : 'conflict',
          false,
          'reread',
          currentRevisionId,
        ),
    });
    this.#models.set(canonicalUri.value, model);

    return {
      type: 'ok',
      value: model,
    };
  }

  async resolve(uri: ResourceUri): Promise<ResolveModelResult> {
    const activeModel = this.#models.get(uri);
    if (activeModel !== undefined) {
      return {
        type: 'ok',
        value: activeModel,
      };
    }

    const pendingResolution = this.#pendingResolutions.get(uri);
    if (pendingResolution !== undefined) {
      return pendingResolution;
    }

    if (this.#loader === undefined) {
      return {
        type: 'error',
        error: this.#createError(
          'MODEL_NOT_FOUND',
          'No model or resource provider is available for this URI.',
          'validation',
          false,
          'abort',
        ),
      };
    }

    const resolution = this.#loadAndCreate(uri);
    this.#pendingResolutions.set(uri, resolution);

    try {
      return await resolution;
    } finally {
      if (this.#pendingResolutions.get(uri) === resolution) {
        this.#pendingResolutions.delete(uri);
      }
    }
  }

  get(uri: ResourceUri): INirecoModel | undefined {
    return this.#models.get(uri);
  }

  getAll(): readonly INirecoModel[] {
    return [...this.#models.values()];
  }

  async unload(uri: ResourceUri): Promise<Result<void>> {
    const model = this.#models.get(uri);
    if (model === undefined) {
      return {
        type: 'error',
        error: this.#createError(
          'MODEL_NOT_FOUND',
          'No active model exists for this resource URI.',
          'validation',
          false,
          'abort',
        ),
      };
    }

    await model.dispose();
    return {
      type: 'ok',
      value: undefined,
    };
  }

  async #loadAndCreate(uri: ResourceUri): Promise<ResolveModelResult> {
    const loaded = await this.#loader?.load(uri);
    if (loaded === undefined) {
      return {
        type: 'error',
        error: this.#createError(
          'MODEL_NOT_FOUND',
          'No resource provider is available for this URI.',
          'validation',
          false,
          'abort',
        ),
      };
    }

    if (loaded.type === 'error') {
      return loaded;
    }

    return this.create({
      ...loaded.options,
      uri,
    });
  }

  #createError(
    code: NirecoErrorCode,
    safeMessage: string,
    category: NirecoError['category'],
    retryable: boolean,
    suggestedAction: NonNullable<NirecoError['suggestedAction']>,
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

interface InMemoryNirecoModelOptions {
  readonly uri: ResourceUri;
  readonly snapshot: DocumentSnapshot;
  readonly onDispose: () => void;
  readonly createError: (
    code: NirecoErrorCode,
    safeMessage: string,
    currentRevisionId?: RevisionId,
  ) => NirecoError;
}

class InMemoryNirecoModel implements INirecoModel {
  readonly #snapshot: DocumentSnapshot;
  readonly #onDispose: () => void;
  readonly #createError: InMemoryNirecoModelOptions['createError'];
  #isDisposed = false;

  readonly uri: ResourceUri;

  constructor(options: InMemoryNirecoModelOptions) {
    this.uri = options.uri;
    this.#snapshot = deepFreeze(options.snapshot);
    this.#onDispose = options.onDispose;
    this.#createError = options.createError;
  }

  get schemaId(): string {
    return this.#snapshot.schemaId;
  }

  get headRevisionId(): RevisionId {
    return this.#snapshot.revisionId;
  }

  get isDisposed(): boolean {
    return this.#isDisposed;
  }

  getSnapshot(revisionId?: RevisionId): Result<DocumentSnapshot> {
    if (this.#isDisposed) {
      return {
        type: 'error',
        error: this.#createError(
          'MODEL_DISPOSED',
          'The model has been disposed.',
          this.#snapshot.revisionId,
        ),
      };
    }

    if (revisionId !== undefined && revisionId !== this.#snapshot.revisionId) {
      return {
        type: 'error',
        error: this.#createError(
          'REVISION_NOT_FOUND',
          'The requested revision is not loaded in this preview model.',
          this.#snapshot.revisionId,
        ),
      };
    }

    return {
      type: 'ok',
      value: this.#snapshot,
    };
  }

  getDurability(revisionId: RevisionId): Result<DurabilityLevel> {
    const snapshot = this.getSnapshot(revisionId);
    return snapshot.type === 'error'
      ? snapshot
      : {
          type: 'ok',
          value: 'snapshot',
        };
  }

  async whenDurable(
    revisionId: RevisionId,
    target: DurabilityLevel,
  ): Promise<Result<DurabilityAcknowledgement>> {
    void target;
    const durability = this.getDurability(revisionId);
    return durability.type === 'error'
      ? durability
      : {
          type: 'ok',
          value: {
            revisionId,
            achievedDurability: durability.value,
            authorityMode: 'read-only',
          },
        };
  }

  async dispose(): Promise<void> {
    if (this.#isDisposed) {
      return;
    }

    this.#isDisposed = true;
    this.#onDispose();
  }
}
