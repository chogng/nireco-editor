import type { Result } from '../../base/errors/nireco-error.js';
import type {
  ContentHash,
  EntityId,
  NodeId,
  RevisionId,
  SessionId,
} from '../../base/ids/identifiers.js';
import type { CancellationToken } from '../../base/cancellation/cancellation-token.js';
import type { Diagnostic } from '../../model/diagnostic.js';
import type { DocumentNode, Mark, NodeKind } from '../../model/node/manuscript-node.js';
import type { DocumentRef } from '../../model/resource-ref.js';
import type { Revision } from '../../model/revision/revision.js';
import type { DocumentSnapshot } from '../../model/snapshot.js';
import type { DocumentReadCursorScope } from './cursor-codec.js';

export type DocumentReadScope = DocumentReadCursorScope;

/** Maximum combined allowedNodeIds + allowedSectionIds in one Session Scope. */
export const MAX_DOCUMENT_READ_SCOPE_IDS = 1_000;

/** Maximum Session Scope context distance accepted by every read boundary. */
export const MAX_DOCUMENT_READ_CONTEXT_DISTANCE = 1_000_000;

export interface DocumentReadContext {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
  readonly cancellation?: CancellationToken;
}

/** Immutable, server-held authorization state resolved from a Session ID. */
export interface DocumentReadSessionGrant {
  readonly document: DocumentRef;
  readonly scope: DocumentReadScope;
}

export type DocumentReadSessionFailure =
  | {
      readonly status: 'expired';
    }
  | {
      readonly status: 'clock-unavailable';
    };

/**
 * Active Sessions resolve to their immutable grant. Unknown and revoked
 * Sessions both resolve to `undefined`; callers must not distinguish them.
 * Tagged failures extend the original grant-or-undefined contract without
 * breaking existing Session sources.
 */
export type DocumentReadSessionResolution =
  DocumentReadSessionGrant | DocumentReadSessionFailure | undefined;

export interface DocumentReadSessionSource {
  resolve(sessionId: SessionId): DocumentReadSessionResolution;
}

export interface RevisionBoundReadResult<TValue> {
  readonly document: DocumentRef;
  readonly basedOnRevisionId: RevisionId;
  readonly consistency: 'exact';
  readonly status: 'current' | 'stale';
  readonly value: TValue;
}

export interface DocumentPageResult<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor?: string;
  readonly truncated: boolean;
  readonly basedOnRevisionId: RevisionId;
  readonly approximateBytes: number;
}

export type GetDocumentHeadRequest = DocumentReadContext;

export interface DocumentHead {
  readonly headRevisionId: RevisionId;
}

export type GetDocumentHeadResult = Result<RevisionBoundReadResult<DocumentHead>>;

export type GetDocumentSnapshotRequest = DocumentReadContext;

export type GetDocumentSnapshotResult = Result<RevisionBoundReadResult<DocumentSnapshot>>;

export interface ReadDocumentNodesRequest extends DocumentReadContext {
  readonly nodeIds: readonly NodeId[];
  readonly cursor?: string;
  readonly maxResults?: number;
}

export interface ReadDocumentNodeMetadata {
  readonly nodeId: NodeId;
  readonly nodeHash?: ContentHash;
  readonly parentNodeId?: NodeId;
  readonly authorizedChildIndex?: number;
}

export type ReadDocumentNode =
  | (ReadDocumentNodeMetadata & {
      readonly nodeType: 'text';
      readonly text: string;
      readonly marks: readonly Mark[];
      readonly childIds: readonly [];
    })
  | (ReadDocumentNodeMetadata & {
      readonly nodeType: Exclude<NodeKind, 'text'>;
      readonly attrs: Exclude<DocumentNode, { readonly type: 'text' }>['attrs'];
      readonly childIds: readonly NodeId[];
    });

export type ReadDocumentNodesResult = Result<
  RevisionBoundReadResult<DocumentPageResult<ReadDocumentNode>>
>;

export interface ReadDocumentNodeNeighborhoodRequest extends DocumentReadContext {
  readonly nodeId: NodeId;
  readonly beforeBlocks: number;
  readonly afterBlocks: number;
  readonly cursor?: string;
  readonly maxResults?: number;
}

export interface DocumentNodeNeighborhoodPage extends DocumentPageResult<ReadDocumentNode> {
  readonly centerNodeId: NodeId;
}

export type ReadDocumentNodeNeighborhoodResult = Result<
  RevisionBoundReadResult<DocumentNodeNeighborhoodPage>
>;

export interface GetDocumentOutlineRequest extends DocumentReadContext {
  readonly cursor?: string;
  readonly maxDepth?: number;
  readonly maxResults?: number;
}

export interface DocumentOutlineItem {
  readonly nodeId: NodeId;
  readonly parentNodeId?: NodeId;
  readonly nodeType: NodeKind;
  readonly depth: number;
  readonly title: string;
  readonly authorizedChildCount: number;
  readonly nodeHash: ContentHash;
}

export type GetDocumentOutlineResult = Result<
  RevisionBoundReadResult<DocumentPageResult<DocumentOutlineItem>>
>;

export type DocumentSearchKind = 'text' | 'citation' | 'claim' | 'heading';

export interface SearchDocumentRequest extends DocumentReadContext {
  readonly query: string;
  readonly sectionIds?: readonly NodeId[];
  readonly kinds?: readonly DocumentSearchKind[];
  readonly cursor?: string;
  readonly maxResults?: number;
}

export type DocumentSearchTarget =
  | {
      readonly kind: 'node';
      readonly nodeId: NodeId;
    }
  | {
      readonly kind: 'academic-entity';
      readonly entityId: EntityId;
    };

export interface DocumentSearchMatch {
  readonly kind: DocumentSearchKind;
  readonly target: DocumentSearchTarget;
  readonly match: 'substring';
  readonly snippet: string;
}

export type SearchDocumentResult = Result<
  RevisionBoundReadResult<DocumentPageResult<DocumentSearchMatch>>
>;

export interface GetDocumentChangesSinceRequest extends DocumentReadContext {
  readonly sinceRevisionId: RevisionId;
  readonly cursor?: string;
  readonly maxResults?: number;
}

export interface DocumentRevisionChange {
  readonly revision: Revision;
}

export interface DocumentChangesPage extends DocumentPageResult<DocumentRevisionChange> {
  readonly fromRevisionId: RevisionId;
}

export type GetDocumentChangesSinceResult = Result<RevisionBoundReadResult<DocumentChangesPage>>;

export type DocumentDiagnosticSeverity = Diagnostic['severity'];

export interface GetDocumentDiagnosticsRequest extends DocumentReadContext {
  readonly severities?: readonly DocumentDiagnosticSeverity[];
  readonly codes?: readonly string[];
  readonly cursor?: string;
  readonly maxResults?: number;
}

export type GetDocumentDiagnosticsResult = Result<
  RevisionBoundReadResult<DocumentPageResult<Diagnostic>>
>;

export interface DocumentDiagnosticsSourceRequest {
  readonly document: DocumentRef;
  readonly scope: DocumentReadScope;
  readonly cancellation: CancellationToken;
}

/**
 * Produces diagnostics in deterministic order for one exact Revision and must
 * apply the granted Scope before constructing messages or suggested fixes.
 * Every returned Diagnostic must carry that same basedOnRevisionId.
 */
export interface DocumentDiagnosticsSource {
  getDiagnostics(request: DocumentDiagnosticsSourceRequest): Result<readonly Diagnostic[]>;
}

export interface DocumentReadService {
  getHead(request: GetDocumentHeadRequest): GetDocumentHeadResult;
  getSnapshot(request: GetDocumentSnapshotRequest): GetDocumentSnapshotResult;
  readNodes(request: ReadDocumentNodesRequest): ReadDocumentNodesResult;
  readNodeNeighborhood(
    request: ReadDocumentNodeNeighborhoodRequest,
  ): ReadDocumentNodeNeighborhoodResult;
  getOutline(request: GetDocumentOutlineRequest): GetDocumentOutlineResult;
  search(request: SearchDocumentRequest): SearchDocumentResult;
  getChangesSince(request: GetDocumentChangesSinceRequest): GetDocumentChangesSinceResult;
  getDiagnostics(request: GetDocumentDiagnosticsRequest): GetDocumentDiagnosticsResult;
}
