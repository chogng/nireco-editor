import type {
  ContentHash,
  EntityId,
  NodeId,
  RevisionId,
  SessionId,
} from '../../base/ids/identifiers.js';
import type { IsoTimestamp } from '../../base/time/clock.js';
import type { ActorRef } from '../../model/actor.js';
import type { Diagnostic } from '../../model/diagnostic.js';
import type { DocumentNode, NodeKind } from '../../model/node/manuscript-node.js';
import type { DocumentRef } from '../../model/resource-ref.js';
import type { Revision } from '../../model/revision/revision.js';
import type {
  DOCUMENT_FORMAT_VERSION,
  MANUSCRIPT_SCHEMA_VERSION,
  DocumentSnapshot,
} from '../../model/snapshot.js';
import type { Proposal, ProposalRef } from '../../proposal/proposal.js';
import type { SemanticEdit, SemanticEditKind } from '../../proposal/semantic-edit.js';

/** Contract version implemented by the existing Gate 0 Mock runtime. */
export const COMET_CONTRACT_VERSION = '0.4-preview.1';

/** Current schema-only Gate 1 Contract Bundle version. */
export const CURRENT_COMET_CONTRACT_VERSION = '0.4-preview.2';

export const PREVIOUS_COMET_CONTRACT_VERSION = COMET_CONTRACT_VERSION;

export const GATE_1_READ_SERVICES = [
  'workspace.resolve_model',
  'document.get_head',
  'document.get_snapshot',
  'document.get_outline',
  'document.read_nodes',
  'document.read_node_neighborhood',
  'document.search',
  'document.get_changes_since',
  'document.get_diagnostics',
] as const;

export type Gate1ReadService = (typeof GATE_1_READ_SERVICES)[number];

export const GATE_1_READ_HARD_LIMITS = {
  maxCursorLength: 1_024,
  maxOutlineDepth: 256,
  maxPageItems: 1_000,
  maxReadNodeIds: 1_000,
  maxScopeIds: 1_000,
  maxContextDistance: 1_000_000,
  maxNeighborhoodBlocksPerDirection: 100,
  maxSearchQueryUtf16Units: 4_096,
  maxSearchSectionIds: 256,
  maxDiagnosticCodes: 256,
} as const;

export const INTEGRATION_CAPABILITIES = [
  'document.outline.read',
  'document.content.read',
  'document.search',
  'document.diagnostics.read',
  'academic.references.read',
  'academic.evidence.read',
  'academic.claims.read',
  'proposal.create',
  'proposal.edit',
  'proposal.validate',
  'proposal.rebase',
  'proposal.submit-review',
  'citation.propose',
  'evidence.propose',
] as const;

export type IntegrationCapability = (typeof INTEGRATION_CAPABILITIES)[number];

export interface ContractLimits {
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly maxPageItems: number;
  readonly maxChangedUtf16Units: number;
  readonly maxOperations: number;
  readonly maxNewReferences: number;
  readonly maxDeletedNodes: number;
  readonly maxMovedNodes: number;
  readonly sessionTtlSeconds: number;
  readonly cursorTtlSeconds: number;
}

export const TRANSPORT_FEATURES = [
  'in-process',
  'worker',
  'ipc',
  'internal-rpc',
  'cursor-pagination',
  'idempotency',
] as const;

export type TransportFeature = (typeof TRANSPORT_FEATURES)[number];

export const MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS: readonly SemanticEditKind[] = [
  'insert-block',
  'replace-block-content',
  'move-block',
  'delete-block',
  'insert-citation',
  'replace-citation',
  'create-claim',
  'link-claim-evidence',
  'create-evidence-link',
];

export const MOCK_SUPPORTED_CAPABILITIES: readonly IntegrationCapability[] = [
  'document.content.read',
  'proposal.create',
  'proposal.edit',
  'citation.propose',
  'evidence.propose',
];

export interface CometIntegrationHandshakeRequest {
  readonly requestedContractVersion: string;
  readonly cometBuildId: string;
  readonly adapterVersion: string;
  readonly workflowId: string;
  readonly requiredCapabilities: readonly IntegrationCapability[];
  readonly requiredSemanticEdits: readonly SemanticEditKind[];
  readonly requiredTransportFeatures: readonly TransportFeature[];
}

export interface CometIntegrationHandshakeResult {
  readonly acceptedContractVersion: typeof COMET_CONTRACT_VERSION;
  readonly nirecoBuildId: string;
  readonly documentFormatVersion: typeof DOCUMENT_FORMAT_VERSION;
  readonly schemaVersion: typeof MANUSCRIPT_SCHEMA_VERSION;
  readonly transactionProtocolVersion: typeof COMET_CONTRACT_VERSION;
  readonly proposalProtocolVersion: typeof COMET_CONTRACT_VERSION;
  readonly semanticEditProtocolVersion: typeof COMET_CONTRACT_VERSION;
  readonly supportedCapabilities: readonly IntegrationCapability[];
  readonly supportedSemanticEdits: readonly SemanticEditKind[];
  readonly limits: ContractLimits;
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly transportFeatures: readonly TransportFeature[];
}

export interface CometDocumentScope {
  readonly allowedSectionIds?: readonly NodeId[];
  readonly allowedNodeIds?: readonly NodeId[];
  readonly allowReadOutsideScopeForContext?: boolean;
  readonly maxContextDistance?: number;
}

export interface CometIntegrationConstraints {
  readonly maxChangedUtf16Units?: number;
  readonly maxOperations?: number;
  readonly maxNewReferences?: number;
  readonly maxDeletedNodes?: number;
  readonly maxMovedNodes?: number;
  readonly requireEvidenceForCitation: boolean;
  readonly requireVerifiedEvidence: boolean;
  readonly allowMetadataOnlyCitation: boolean;
  readonly allowDelete: boolean;
  readonly allowStructureMove: boolean;
}

export interface OpenCometSessionRequest {
  readonly contractVersion: string;
  readonly target: DocumentRef;
  readonly taskId: string;
  readonly traceId: string;
  readonly actor: Extract<ActorRef, { readonly type: 'comet-agent' }>;
  readonly requestedCapabilities: readonly IntegrationCapability[];
  readonly scope: CometDocumentScope;
  readonly constraints: CometIntegrationConstraints;
  readonly policySnapshotId: string;
}

export interface OpenCometSessionResult {
  readonly contractVersion: typeof COMET_CONTRACT_VERSION;
  readonly sessionId: SessionId;
  readonly target: DocumentRef;
  readonly grantedCapabilities: readonly IntegrationCapability[];
  readonly scope: CometDocumentScope;
  readonly constraints: CometIntegrationConstraints;
  readonly limits: ContractLimits;
  readonly capabilityGrantId: string;
  readonly expiresAt: IsoTimestamp;
}

export type RevisionBoundConsistency = 'exact' | 'eventual';
export type RevisionBoundStatus = 'current' | 'stale' | 'computing' | 'failed';

/**
 * An opaque server-issued cursor. Its wire value is bound to the Session,
 * Revision, granted Scope, service and canonical query hash.
 */
export type ReadCursor = string;

export interface RevisionBoundReadResult {
  readonly document: DocumentRef;
  readonly basedOnRevisionId: RevisionId;
  readonly consistency: RevisionBoundConsistency;
  readonly status: RevisionBoundStatus;
}

export interface PageResult<TItem> extends RevisionBoundReadResult {
  readonly status: 'current' | 'stale';
  readonly items: readonly TItem[];
  readonly nextCursor?: ReadCursor;
  readonly truncated: boolean;
  readonly approximateBytes: number;
}

export interface ReadPageRequest {
  readonly cursor?: ReadCursor;
  readonly maxResults?: number;
}

export interface ResolveModelRequest {
  readonly document: DocumentRef;
}

export interface ResolveModelResult extends RevisionBoundReadResult {
  readonly consistency: 'exact';
  readonly status: 'current' | 'stale';
}

export interface GetDocumentHeadRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
}

export interface GetDocumentHeadResult extends RevisionBoundReadResult {
  readonly consistency: 'exact';
  readonly status: 'current';
  readonly headRevisionId: RevisionId;
}

export interface GetDocumentSnapshotRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
}

export interface GetDocumentSnapshotResult extends RevisionBoundReadResult {
  readonly consistency: 'exact';
  readonly status: 'current' | 'stale';
  readonly snapshot: DocumentSnapshot;
}

export interface OutlineItem {
  readonly nodeId: NodeId;
  readonly parentNodeId?: NodeId;
  readonly nodeType: NodeKind;
  readonly depth: number;
  readonly title: string;
  readonly authorizedChildCount: number;
  readonly nodeHash: ContentHash;
}

export interface GetDocumentOutlineRequest extends ReadPageRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
  readonly maxDepth?: number;
}

export type GetDocumentOutlineResult = PageResult<OutlineItem>;

export interface ReadableDocumentNodeMetadata {
  readonly nodeId: NodeId;
  /**
   * Present only when the complete canonical subtree covered by this hash is
   * authorized, or when this is an exact authorized Text leaf.
   */
  readonly nodeHash?: ContentHash;
  readonly parentNodeId?: NodeId;
  readonly authorizedChildIndex?: number;
}

/**
 * Scope-filtered, non-recursive node projection. `childIds` contains only
 * children authorized for this response; nested DocumentNode content is never
 * placed on the read wire.
 */
export type ReadableDocumentNode<TNode extends DocumentNode = DocumentNode> = TNode extends {
  readonly type: 'text';
  readonly value: infer TValue;
  readonly marks: infer TMarks;
}
  ? ReadableDocumentNodeMetadata & {
      readonly nodeType: 'text';
      readonly text: TValue;
      readonly marks: TMarks;
      readonly childIds: readonly [];
    }
  : TNode extends {
        readonly type: infer TKind;
        readonly attrs: infer TAttributes;
      }
    ? ReadableDocumentNodeMetadata & {
        readonly nodeType: TKind;
        readonly attrs: TAttributes;
        readonly childIds: readonly NodeId[];
      }
    : never;

export interface ReadDocumentNodesRequest extends ReadPageRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
  readonly nodeIds: readonly NodeId[];
}

export type ReadDocumentNodesResult = PageResult<ReadableDocumentNode>;

export interface ReadDocumentNodeNeighborhoodRequest extends ReadPageRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
  readonly nodeId: NodeId;
  readonly beforeBlocks: number;
  readonly afterBlocks: number;
}

export interface ReadDocumentNodeNeighborhoodResult extends PageResult<ReadableDocumentNode> {
  readonly centerNodeId: NodeId;
}

export type DocumentSearchKind = 'text' | 'citation' | 'claim' | 'heading';
export type DocumentSearchMatch = 'exact' | 'prefix' | 'substring' | 'token';

export type DocumentSearchTarget =
  | {
      readonly kind: 'node';
      readonly nodeId: NodeId;
    }
  | {
      readonly kind: 'academic-entity';
      readonly entityId: EntityId;
    };

export interface DocumentSearchHit {
  readonly kind: DocumentSearchKind;
  readonly target: DocumentSearchTarget;
  readonly match: DocumentSearchMatch;
  readonly snippet: string;
}

export interface SearchDocumentRequest extends ReadPageRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
  readonly query: string;
  readonly sectionIds?: readonly NodeId[];
  readonly kinds?: readonly DocumentSearchKind[];
}

export type SearchDocumentResult = PageResult<DocumentSearchHit>;

export interface DocumentRevisionChange {
  readonly revision: Revision;
}

export interface GetDocumentChangesSinceRequest extends ReadPageRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
  readonly sinceRevisionId: RevisionId;
}

export interface GetDocumentChangesSinceResult extends PageResult<DocumentRevisionChange> {
  readonly fromRevisionId: RevisionId;
}

export interface GetDocumentDiagnosticsRequest extends ReadPageRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
  readonly severities?: readonly Diagnostic['severity'][];
  readonly codes?: readonly string[];
}

export type GetDocumentDiagnosticsResult = PageResult<Diagnostic>;

/** @deprecated Gate 0 Mock-only request retained for preview.1 compatibility. */
export interface GetSnapshotRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
}

/** @deprecated Gate 0 Mock-only result retained for preview.1 compatibility. */
export interface GetSnapshotResult {
  readonly document: DocumentRef;
  readonly snapshot: DocumentSnapshot;
}

export interface CreateProposalRequest {
  readonly sessionId: SessionId;
  readonly target: DocumentRef;
  readonly idempotencyKey: string;
}

export interface CreateProposalResult {
  readonly proposal: Proposal;
}

export interface StageSemanticEditsRequest {
  readonly sessionId: SessionId;
  readonly proposal: ProposalRef;
  readonly semanticEdits: readonly SemanticEdit[];
  readonly idempotencyKey: string;
}

export interface StageSemanticEditsResult {
  readonly proposal: Proposal;
}
