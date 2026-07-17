import type { CancellationToken } from '../../base/cancellation/cancellation-token.js';
import type { Result } from '../../base/errors/nireco-error.js';
import type { RevisionId } from '../../base/ids/identifiers.js';
import type { ResourceUri } from '../../base/uri/resource-uri.js';
import type { DocumentRef } from '../../model/resource-ref.js';
import type { INirecoModel } from '../../workspace/model.js';

/** Preview.2 wire request. Execution cancellation is supplied out-of-band. */
export interface ResolveModelRequest {
  readonly document: DocumentRef;
}

/** Preview.2 wire result, with no Model or registry internals exposed. */
export interface ResolveModelValue {
  readonly document: DocumentRef;
  readonly basedOnRevisionId: RevisionId;
  readonly consistency: 'exact';
  readonly status: 'current' | 'stale';
}

export type ResolveModelResult = Result<ResolveModelValue>;

/** Read-only port that can observe only Models already open in this process. */
export interface AlreadyOpenModelSource {
  get(uri: ResourceUri): INirecoModel | undefined;
}

export interface ResolveModelService {
  resolve(request: unknown, cancellation?: CancellationToken): ResolveModelResult;
}
