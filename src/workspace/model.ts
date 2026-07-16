import type { Result } from '../base/errors/nireco-error.js';
import type { RevisionId } from '../base/ids/identifiers.js';
import type { AsyncDisposableResource } from '../base/lifecycle/disposable.js';
import type { ResourceUri } from '../base/uri/resource-uri.js';
import type { DurabilityLevel } from '../model/revision/revision.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
import type { DurabilityAcknowledgement } from './contracts.js';

export interface INirecoModel extends AsyncDisposableResource {
  readonly uri: ResourceUri;
  readonly schemaId: string;
  readonly headRevisionId: RevisionId;
  readonly isDisposed: boolean;

  getSnapshot(revisionId?: RevisionId): Result<DocumentSnapshot>;
  getDurability(revisionId: RevisionId): Result<DurabilityLevel>;
  whenDurable(
    revisionId: RevisionId,
    target: DurabilityLevel,
  ): Promise<Result<DurabilityAcknowledgement>>;
}

export interface CreateModelOptions {
  readonly uri: string;
  readonly snapshot: DocumentSnapshot;
}
