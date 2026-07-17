import type { NirecoError, NirecoErrorCode, Result } from '../base/errors/nireco-error.js';
import { deepFreeze } from '../base/immutability/deep-freeze.js';
import type { RevisionId } from '../base/ids/identifiers.js';
import { canonicalizeResourceUri, type ResourceUri } from '../base/uri/resource-uri.js';
import type { DurabilityLevel } from '../model/revision/revision.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
import { AuthorityBackedNirecoModel } from './authority-backed-model.js';
import { normalizeCanonicalDocumentSnapshot } from './canonical-document-snapshot.js';
import type { IIdAllocator } from './id-allocator.js';
import type {
  CreateModelResult,
  IModelRegistry,
  IModelSnapshotLoader,
  ResolveModelResult,
} from './model-registry.js';
import type { CreateModelOptions, INirecoModel } from './model.js';
import type { CommitResult, DurabilityAcknowledgement, IDocumentAuthority } from './contracts.js';

export interface InMemoryModelRegistryOptions {
  readonly ids: IIdAllocator;
  readonly loader?: IModelSnapshotLoader;
  readonly authority?: IDocumentAuthority;
}

export class InMemoryModelRegistry implements IModelRegistry {
  readonly #ids: IIdAllocator;
  readonly #loader: IModelSnapshotLoader | undefined;
  readonly #authority: IDocumentAuthority | undefined;
  readonly #models = new Map<ResourceUri, INirecoModel>();
  readonly #pendingResolutions = new Map<ResourceUri, Promise<ResolveModelResult>>();

  constructor(options: InMemoryModelRegistryOptions) {
    this.#ids = options.ids;
    this.#loader = options.loader;
    this.#authority = options.authority;
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
      return this.#duplicateModelError();
    }
    const snapshot = this.#normalizeSnapshot(options.snapshot);
    if (snapshot.type === 'error') {
      return snapshot;
    }

    const authorityAlignment = await this.#validateAuthorityAlignment(
      canonicalUri.value,
      snapshot.value,
    );
    if (authorityAlignment.type === 'error') {
      return authorityAlignment;
    }
    if (this.#models.has(canonicalUri.value)) {
      return this.#duplicateModelError();
    }

    let model: INirecoModel;
    const onDispose = (): void => {
      if (this.#models.get(canonicalUri.value) === model) {
        this.#models.delete(canonicalUri.value);
      }
    };
    if (this.#authority === undefined) {
      model = new InMemoryNirecoModel({
        uri: canonicalUri.value,
        snapshot: snapshot.value,
        onDispose,
        createError: (code, safeMessage, category, suggestedAction, currentRevisionId) =>
          this.#createError(code, safeMessage, category, false, suggestedAction, currentRevisionId),
      });
    } else {
      const authorityModel = new AuthorityBackedNirecoModel({
        uri: canonicalUri.value,
        initialSnapshot: snapshot.value,
        authority: this.#authority,
        ids: this.#ids,
        onDispose,
      });
      model = authorityModel;
      const synchronized = await authorityModel.synchronizeWithAuthority();
      if (synchronized.type === 'error') {
        await authorityModel.dispose();
        return synchronized;
      }
      if (this.#models.has(canonicalUri.value)) {
        await authorityModel.dispose();
        return this.#duplicateModelError();
      }
    }
    this.#models.set(canonicalUri.value, model);

    return {
      type: 'ok',
      value: model,
    };
  }

  async resolve(uri: ResourceUri): Promise<ResolveModelResult> {
    const canonicalUri = canonicalizeResourceUri(uri);
    if (canonicalUri.type === 'invalid') {
      return this.#invalidUriError();
    }

    const activeModel = this.#models.get(canonicalUri.value);
    if (activeModel !== undefined) {
      return {
        type: 'ok',
        value: activeModel,
      };
    }

    const pendingResolution = this.#pendingResolutions.get(canonicalUri.value);
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

    const resolution = this.#loadAndCreate(canonicalUri.value);
    this.#pendingResolutions.set(canonicalUri.value, resolution);

    try {
      return await resolution;
    } finally {
      if (this.#pendingResolutions.get(canonicalUri.value) === resolution) {
        this.#pendingResolutions.delete(canonicalUri.value);
      }
    }
  }

  get(uri: ResourceUri): INirecoModel | undefined {
    const canonicalUri = canonicalizeResourceUri(uri);
    return canonicalUri.type === 'invalid' ? undefined : this.#models.get(canonicalUri.value);
  }

  getAll(): readonly INirecoModel[] {
    return [...this.#models.values()];
  }

  async unload(uri: ResourceUri): Promise<Result<void>> {
    const canonicalUri = canonicalizeResourceUri(uri);
    if (canonicalUri.type === 'invalid') {
      return this.#invalidUriError();
    }
    const model = this.#models.get(canonicalUri.value);
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

  async #validateAuthorityAlignment(
    uri: ResourceUri,
    snapshot: DocumentSnapshot,
  ): Promise<Result<void>> {
    if (this.#authority === undefined) {
      return {
        type: 'ok',
        value: undefined,
      };
    }
    const opened = await this.#authority.open(uri);
    if (opened.type === 'error') {
      return opened;
    }
    if (opened.value.uri !== uri || opened.value.headRevisionId !== snapshot.revisionId) {
      return this.#authorityAlignmentError(opened.value.headRevisionId);
    }
    const authoritativeSnapshot = this.#authority.getSnapshot(uri, opened.value.headRevisionId);
    if (authoritativeSnapshot.type === 'error') {
      return authoritativeSnapshot;
    }
    return snapshotsAgree(authoritativeSnapshot.value, snapshot)
      ? {
          type: 'ok',
          value: undefined,
        }
      : this.#authorityAlignmentError(opened.value.headRevisionId);
  }

  #authorityAlignmentError(currentRevisionId: RevisionId): Result<never> {
    return {
      type: 'error',
      error: this.#createError(
        'BASE_REVISION_MISMATCH',
        'The supplied Snapshot does not match the Document Authority head.',
        'conflict',
        false,
        'reread',
        currentRevisionId,
      ),
    };
  }

  #duplicateModelError(): Result<never> {
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

  #invalidUriError<TValue>(): Result<TValue> {
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

  #normalizeSnapshot(value: unknown): Result<DocumentSnapshot> {
    const normalized = normalizeCanonicalDocumentSnapshot(value);
    return normalized.type === 'ok'
      ? normalized
      : this.#invalidSnapshotError(normalized.error.safeMessage);
  }

  #invalidSnapshotError(safeMessage: string): Result<never> {
    return {
      type: 'error',
      error: this.#createError('SCHEMA_INVALID', safeMessage, 'validation', false, 'abort'),
    };
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

function snapshotsAgree(left: DocumentSnapshot, right: DocumentSnapshot): boolean {
  const leftIdentity = snapshotIdentity(left);
  const rightIdentity = snapshotIdentity(right);
  return (
    leftIdentity.revisionId === rightIdentity.revisionId &&
    leftIdentity.documentHash === rightIdentity.documentHash &&
    leftIdentity.format === rightIdentity.format &&
    leftIdentity.formatVersion === rightIdentity.formatVersion &&
    leftIdentity.schemaId === rightIdentity.schemaId &&
    leftIdentity.schemaVersion === rightIdentity.schemaVersion
  );
}

interface SnapshotIdentity {
  readonly revisionId: string;
  readonly documentHash: string;
  readonly format: string;
  readonly formatVersion: string;
  readonly schemaId: string;
  readonly schemaVersion: string;
}

function snapshotIdentity(snapshot: DocumentSnapshot): SnapshotIdentity {
  return snapshot;
}

interface InMemoryNirecoModelOptions {
  readonly uri: ResourceUri;
  readonly snapshot: DocumentSnapshot;
  readonly onDispose: () => void;
  readonly createError: (
    code: NirecoErrorCode,
    safeMessage: string,
    category: NirecoError['category'],
    suggestedAction: NonNullable<NirecoError['suggestedAction']>,
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
          'conflict',
          'abort',
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
          'validation',
          'reread',
          this.#snapshot.revisionId,
        ),
      };
    }

    return {
      type: 'ok',
      value: this.#snapshot,
    };
  }

  async applyTransaction(): Promise<Result<CommitResult>> {
    const disposed = this.#isDisposed;
    return {
      type: 'error',
      error: this.#createError(
        disposed ? 'MODEL_DISPOSED' : 'CAPABILITY_UNSUPPORTED',
        disposed
          ? 'The Model has been disposed.'
          : 'This in-memory Model was created without a Document Authority.',
        disposed ? 'conflict' : 'compatibility',
        'abort',
        this.#snapshot.revisionId,
      ),
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
    if (!isDurabilityLevel(target)) {
      return {
        type: 'error',
        error: this.#createError(
          'SCHEMA_INVALID',
          'The requested durability target is invalid.',
          'validation',
          'abort',
          this.#snapshot.revisionId,
        ),
      };
    }
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

function isDurabilityLevel(value: unknown): value is DurabilityLevel {
  return value === 'memory' || value === 'wal' || value === 'snapshot';
}
