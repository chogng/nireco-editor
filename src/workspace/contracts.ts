import type { CancellationToken } from '../base/cancellation/cancellation-token.js';
import type { Result } from '../base/errors/nireco-error.js';
import type { ContentHash, RevisionId, WorkspaceId } from '../base/ids/identifiers.js';
import type { AsyncDisposableResource, Disposable } from '../base/lifecycle/disposable.js';
import type { JsonValue } from '../base/serialization/canonical-json.js';
import type { IClock } from '../base/time/clock.js';
import type { ResourceUri } from '../base/uri/resource-uri.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
import type { DurabilityLevel } from '../model/revision/revision.js';
import type { Transaction } from '../model/transaction/transaction.js';
import type { IIdAllocator } from './id-allocator.js';
import type { IModelRegistry } from './model-registry.js';

export interface ISchemaRegistry {
  has(schemaId: string, schemaVersion: string): boolean;
}

export interface ResourceSnapshot {
  readonly uri: ResourceUri;
  readonly content: JsonValue;
}

export interface ResourceChange {
  readonly expectedRevisionId?: RevisionId;
  readonly content: JsonValue;
}

export interface ResourceWriteResult {
  readonly revisionId?: RevisionId;
}

export interface IResourceProvider {
  canHandle(uri: ResourceUri): boolean;
  read(uri: ResourceUri, cancellation: CancellationToken): Promise<Result<ResourceSnapshot>>;
  write?(
    uri: ResourceUri,
    change: ResourceChange,
    cancellation: CancellationToken,
  ): Promise<Result<ResourceWriteResult>>;
  watch?(uri: ResourceUri, listener: () => void): Disposable;
}

export interface IResourceProviderRegistry {
  register(provider: IResourceProvider): Disposable;
  resolve(uri: ResourceUri): IResourceProvider | undefined;
}

export interface DocumentHandle {
  readonly uri: ResourceUri;
  readonly headRevisionId: RevisionId;
}

export interface CommitResult {
  readonly revisionId: RevisionId;
  readonly snapshot: DocumentSnapshot;
  readonly transactionHash: ContentHash;
  readonly achievedDurability: 'memory';
}

export type AuthorityMode = 'read-write' | 'read-only' | 'recovery-required';

export interface DurabilityAcknowledgement {
  readonly revisionId: RevisionId;
  readonly achievedDurability: DurabilityLevel;
  readonly authorityMode: AuthorityMode;
}

export interface IDocumentAuthority {
  open(uri: ResourceUri): Promise<Result<DocumentHandle>>;
  getHead(uri: ResourceUri): Promise<Result<RevisionId>>;
  apply(transaction: Transaction): Promise<Result<CommitResult>>;
  getDurability(uri: ResourceUri, revisionId: RevisionId): Result<DurabilityLevel>;
  whenDurable(
    uri: ResourceUri,
    revisionId: RevisionId,
    target: DurabilityLevel,
  ): Promise<Result<DurabilityAcknowledgement>>;
  subscribe(uri: ResourceUri, listener: () => void): Disposable;
}

export interface IStorageAdapter {
  readSnapshot(uri: ResourceUri, revisionId?: RevisionId): Promise<Result<DocumentSnapshot>>;
  writeSnapshot(uri: ResourceUri, snapshot: DocumentSnapshot): Promise<Result<void>>;
}

export interface INirecoWorkspace extends AsyncDisposableResource {
  readonly id: WorkspaceId;
  readonly models: IModelRegistry;
  readonly schemas: ISchemaRegistry;
  readonly resources: IResourceProviderRegistry;
  readonly authority: IDocumentAuthority;
  readonly storage: IStorageAdapter;
  readonly ids: IIdAllocator;
  readonly clock: IClock;
}
