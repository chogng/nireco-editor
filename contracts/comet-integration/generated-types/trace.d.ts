/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: contracts/comet-integration/schemas/trace.schema.json
 * Generator: json-schema-to-typescript
 * Generator version: 15.0.4
 * Source SHA-256: 11a4b09e251707aa363a1360f4bc07b7b235ea436f0000080721e2e6e258274a
 */

/**
 * External or integration-owned opaque identity. Nireco-allocated production identities use AllocatedId instead.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "OpaqueId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "RequestId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TaskId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ToolInvocationId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CapabilityGrantId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "PolicySnapshotId".
 */
export type OpaqueId = string;
/**
 * Canonical Nireco document URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentUri".
 */
export type DocumentUri = string;
/**
 * Canonical lowercase RFC 9562 UUIDv7 allocated by a trusted Nireco boundary before reducer entry.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "AllocatedId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "WorkspaceId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "OperationId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SessionId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DebugId".
 */
export type AllocatedId = string;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceEvent".
 */
export type TraceEvent = {
  [k: string]: unknown | undefined;
} & {
  sequence: number;
  at: Rfc3339Timestamp;
  component:
    | 'comet-orchestrator'
    | 'comet-adapter'
    | 'nireco-contract'
    | 'nireco-mock'
    | 'nireco-proposal-service'
    | 'user-review-controller';
  type:
    | 'handshake'
    | 'session.open'
    | 'document.read'
    | 'proposal.create'
    | 'proposal.stage-edits'
    | 'proposal.validate'
    | 'proposal.diff'
    | 'proposal.submit-review'
    | 'proposal.rebase'
    | 'review.decision'
    | 'transaction.commit'
    | 'revision.durable';
  service?: string;
  requestId?: OpaqueId;
  toolInvocationId?: OpaqueId;
  document?: DocumentRef;
  proposal?: TraceProposalRef;
  requestedCapabilities?: IntegrationCapability[];
  grantedCapabilities?: IntegrationCapability[];
  semanticEditKinds?: SemanticEditKind[];
  basedOnRevisionId?: AllocatedId;
  outcome: 'ok' | 'error';
  errorCode?: NirecoErrorCode;
  summary: string;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Rfc3339Timestamp".
 */
export type Rfc3339Timestamp = string;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "IntegrationCapability".
 */
export type IntegrationCapability =
  | 'document.outline.read'
  | 'document.content.read'
  | 'document.search'
  | 'document.diagnostics.read'
  | 'academic.references.read'
  | 'academic.evidence.read'
  | 'academic.claims.read'
  | 'proposal.create'
  | 'proposal.edit'
  | 'proposal.validate'
  | 'proposal.rebase'
  | 'proposal.submit-review'
  | 'citation.propose'
  | 'evidence.propose';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticEditKind".
 */
export type SemanticEditKind =
  | 'insert-block'
  | 'replace-block-content'
  | 'move-block'
  | 'delete-block'
  | 'insert-citation'
  | 'replace-citation'
  | 'create-claim'
  | 'link-claim-evidence'
  | 'create-evidence-link'
  | 'update-metadata';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NirecoErrorCode".
 */
export type NirecoErrorCode =
  | 'INVALID_RESOURCE_URI'
  | 'MODEL_URI_ALREADY_EXISTS'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_DISPOSED'
  | 'CONTRACT_VERSION_UNSUPPORTED'
  | 'CAPABILITY_UNSUPPORTED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SCOPE_VIOLATION'
  | 'BASE_REVISION_MISMATCH'
  | 'REVISION_NOT_FOUND'
  | 'PROPOSAL_REVISION_MISMATCH'
  | 'NODE_NOT_FOUND'
  | 'ENTITY_NOT_FOUND'
  | 'POSITION_INVALID'
  | 'ANCHOR_ORPHANED'
  | 'REQUEST_TOO_LARGE'
  | 'SCHEMA_INVALID'
  | 'SCHEMA_VERSION_UNSUPPORTED'
  | 'SEMANTIC_EDIT_UNSUPPORTED'
  | 'PROPOSAL_LOCKED'
  | 'PROPOSAL_CONFLICT'
  | 'EVIDENCE_REQUIRED'
  | 'EVIDENCE_STALE'
  | 'CITATION_SUPPORT_INVALID'
  | 'POLICY_VIOLATION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CANCELLED'
  | 'TEMPORARY_UNAVAILABLE'
  | 'DURABILITY_UNREACHABLE'
  | 'WAL_APPEND_FAILED'
  | 'WAL_FSYNC_FAILED'
  | 'SNAPSHOT_COMMIT_FAILED'
  | 'RECOVERY_REQUIRED'
  | 'STORAGE_CORRUPT'
  | 'INTERNAL_ERROR';
/**
 * Canonical lowercase RFC 9562 UUIDv8 deterministically derived from a frozen domain-separated SHA-256 preimage.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DerivedId".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupId".
 */
export type DerivedId = string;
/**
 * Untrusted, request-local correlation key. It is never a trusted Nireco identity.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ClientRef".
 */
export type ClientRef = string;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ContentHash".
 */
export type ContentHash = string;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "HashDomain".
 */
export type HashDomain =
  | 'nireco.academic-entity.v1'
  | 'nireco.document-content.v1'
  | 'nireco.governance-manifest.v1'
  | 'nireco.node.v1'
  | 'nireco.proposal-change-group.v1'
  | 'nireco.semantic-diff.v1'
  | 'nireco.transaction.v1';
/**
 * A JSON value used only at explicitly declared extension or patch boundaries.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonArray".
 */
export type JsonArray = JsonValue[];
/**
 * Offset measured in UTF-16 code units. A service must additionally reject a value inside a surrogate pair.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Utf16Offset".
 */
export type Utf16Offset = number;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ActorRef".
 */
export type ActorRef =
  HumanActorRef | CometAgentActorRef | ProductControllerActorRef | SystemActorRef;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticTargetRef".
 */
export type SemanticTargetRef =
  NodeTargetRef | EntityTargetRef | RangeTargetRef | MetadataTargetRef;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticPosition".
 */
export type SemanticPosition = TextPosition | NodeBoundaryPosition;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Affinity".
 */
export type Affinity = 'before' | 'after';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TransportFeature".
 */
export type TransportFeature =
  'in-process' | 'worker' | 'ipc' | 'internal-rpc' | 'cursor-pagination' | 'idempotency';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Gate1ReadService".
 */
export type Gate1ReadService =
  | 'workspace.resolve_model'
  | 'document.get_head'
  | 'document.get_snapshot'
  | 'document.get_outline'
  | 'document.read_nodes'
  | 'document.read_node_neighborhood'
  | 'document.search'
  | 'document.get_changes_since'
  | 'document.get_diagnostics';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionBoundConsistency".
 */
export type RevisionBoundConsistency = 'exact' | 'eventual';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionBoundStatus".
 */
export type RevisionBoundStatus = 'current' | 'stale' | 'computing' | 'failed';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SuccessfulRevisionBoundStatus".
 */
export type SuccessfulRevisionBoundStatus = 'current' | 'stale';
/**
 * Opaque, unpadded canonical base64url cursor. The authenticated server-side binding covers the Session, Revision, granted Scope, service and canonical query hash; the wire value contains no raw IDs, Scope or storage key.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReadCursor".
 */
export type ReadCursor = string;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReadMaxResults".
 */
export type ReadMaxResults = number;
/**
 * No silent truncation: truncated=true requires a continuation cursor and truncated=false forbids one. approximateBytes is capped at runtime by the negotiated maxResponseBytes.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "PageResult".
 */
export type PageResult = {
  [k: string]: unknown | undefined;
} & {
  document: DocumentRef;
  basedOnRevisionId: AllocatedId;
  consistency: RevisionBoundConsistency;
  status: SuccessfulRevisionBoundStatus;
  /**
   * @maxItems 1000
   */
  items: PageItem[];
  nextCursor?: ReadCursor;
  truncated: boolean;
  approximateBytes: number;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "PageItem".
 */
export type PageItem =
  OutlineItem | ReadableDocumentNode | DocumentSearchHit | DocumentRevisionChange | Diagnostic;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeKind".
 */
export type NodeKind =
  | 'bibliographyPlaceholder'
  | 'blockQuote'
  | 'body'
  | 'citation'
  | 'codeBlock'
  | 'crossReference'
  | 'displayEquation'
  | 'figure'
  | 'figureAsset'
  | 'figureCaption'
  | 'footnote'
  | 'footnoteReference'
  | 'frontMatter'
  | 'hardBreak'
  | 'heading'
  | 'horizontalRule'
  | 'inlineEquation'
  | 'list'
  | 'listItem'
  | 'manuscript'
  | 'paragraph'
  | 'section'
  | 'table'
  | 'tableCaption'
  | 'tableCell'
  | 'tableRow'
  | 'text';
/**
 * A scope-filtered shallow projection. It cannot recursively embed DocumentNode children, expose DOM positions, or expose a hash of hidden subtree content.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReadableDocumentNode".
 */
export type ReadableDocumentNode = {
  [k: string]: unknown | undefined;
} & {
  nodeId: AllocatedId;
  nodeType: NodeKind;
  attrs?: JsonObject1;
  text?: string;
  /**
   * @maxItems 8
   */
  marks?:
    | []
    | [Mark]
    | [Mark, Mark]
    | [Mark, Mark, Mark]
    | [Mark, Mark, Mark, Mark]
    | [Mark, Mark, Mark, Mark, Mark]
    | [Mark, Mark, Mark, Mark, Mark, Mark]
    | [Mark, Mark, Mark, Mark, Mark, Mark, Mark]
    | [Mark, Mark, Mark, Mark, Mark, Mark, Mark, Mark];
  /**
   * Non-recursive child references filtered to IDs authorized by the granted Scope.
   */
  childIds: AllocatedId[];
  /**
   * Present only when the complete canonical subtree covered by the hash is authorized (document-wide or allowed-Section context), or for an exact authorized Text leaf. It is omitted from partial exact non-Text projections to avoid a hidden-subtree hash oracle.
   */
  nodeHash?: string;
  /**
   * Canonical lowercase RFC 9562 UUIDv7 allocated by a trusted Nireco boundary before reducer entry.
   */
  parentNodeId?: string;
  /**
   * Index among authorized siblings only; never exposes the position of hidden siblings.
   */
  authorizedChildIndex?: number;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Mark".
 */
export type Mark = SimpleMark | LinkMark;
/**
 * ASCII-visible canonical wire URI. Raw Unicode is forbidden and must be UTF-8 percent-encoded; percent escapes use uppercase hexadecimal. Nireco and Comet logical URIs are further constrained by LogicalResourceUri.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceUri".
 */
export type ResourceUri = string;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSearchKind".
 */
export type DocumentSearchKind = 'text' | 'citation' | 'claim' | 'heading';
/**
 * A stable semantic target. DOM nodes and raw DOM offsets are not part of the contract.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSearchTarget".
 */
export type DocumentSearchTarget =
  | {
      kind: 'node';
      nodeId: AllocatedId;
    }
  | {
      kind: 'academic-entity';
      entityId: AllocatedId;
    };
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSearchMatch".
 */
export type DocumentSearchMatch = 'exact' | 'prefix' | 'substring' | 'token';
/**
 * Highest acknowledged durability level. State advances monotonically.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DurabilityLevel".
 */
export type DurabilityLevel = 'memory' | 'wal' | 'snapshot';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "BlockNode".
 */
export type BlockNode =
  | SectionNode
  | ParagraphNode
  | HeadingNode
  | FigureNode
  | TableNode
  | DisplayEquationNode
  | BlockQuoteNode
  | CodeBlockNode
  | ListNode
  | HorizontalRuleNode
  | FootnoteNode;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "InlineNode".
 */
export type InlineNode =
  | TextNode
  | CitationNode
  | CrossReferenceNode
  | InlineEquationNode
  | FootnoteReferenceNode
  | HardBreakNode;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "LimitedCellBlockNode".
 */
export type LimitedCellBlockNode = ParagraphNode | BlockQuoteNode | CodeBlockNode | ListNode;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteBlockNode".
 */
export type FootnoteBlockNode = ParagraphNode | BlockQuoteNode | CodeBlockNode | ListNode;
/**
 * Canonical Comet-owned logical resource URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CometResourceUri".
 */
export type CometResourceUri = string;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceLocator".
 */
export type EvidenceLocator =
  | PageEvidenceLocator
  | SectionEvidenceLocator
  | TextQuoteEvidenceLocator
  | TimeEvidenceLocator
  | RecordEvidenceLocator;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentOutlineResult".
 */
export type GetDocumentOutlineResult = PageResult & {
  /**
   * @maxItems 1000
   */
  items: OutlineItem[];
  [k: string]: unknown | undefined;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReadDocumentNodesResult".
 */
export type ReadDocumentNodesResult = PageResult & {
  /**
   * @maxItems 1000
   */
  items: ReadableDocumentNode[];
  [k: string]: unknown | undefined;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReadDocumentNodeNeighborhoodResult".
 */
export type ReadDocumentNodeNeighborhoodResult = {
  [k: string]: unknown | undefined;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SearchDocumentResult".
 */
export type SearchDocumentResult = PageResult & {
  /**
   * @maxItems 1000
   */
  items: DocumentSearchHit[];
  [k: string]: unknown | undefined;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentChangesSinceResult".
 */
export type GetDocumentChangesSinceResult = {
  [k: string]: unknown | undefined;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentDiagnosticsResult".
 */
export type GetDocumentDiagnosticsResult = PageResult & {
  /**
   * @maxItems 1000
   */
  items: Diagnostic[];
  [k: string]: unknown | undefined;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Proposal".
 */
export type Proposal = {
  [k: string]: unknown | undefined;
} & {
  id: AllocatedId;
  documentUri: DocumentUri;
  baseRevisionId: AllocatedId;
  proposalRevision: number;
  actor: ActorRef;
  status: ProposalStatus;
  semanticEdits: SemanticEdit[];
  validation: ProposalValidationSnapshot;
  diff?: SemanticDiff;
  provenance: ProposalProvenance;
  createdAt: Rfc3339Timestamp;
  updatedAt: Rfc3339Timestamp;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalStatus".
 */
export type ProposalStatus =
  | 'draft'
  | 'validating'
  | 'validated'
  | 'needs-review'
  | 'conflicted'
  | 'accepted'
  | 'partially-accepted'
  | 'rejected'
  | 'discarded'
  | 'expired';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticEdit".
 */
export type SemanticEdit =
  | InsertBlockEdit
  | ReplaceBlockContentEdit
  | MoveBlockEdit
  | DeleteBlockEdit
  | InsertCitationEdit
  | ReplaceCitationEdit
  | CreateClaimEdit
  | LinkClaimEvidenceEdit
  | CreateEvidenceLinkEdit
  | UpdateMetadataEdit;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedBlockContent".
 */
export type ProposedBlockContent =
  ProposedInlineContainerBlock | ProposedStructuredBlock | ProposedAtomicBlock;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedInlineContent".
 */
export type ProposedInlineContent =
  ProposedText | ProposedHardBreak | ProposedInlineEquation | ProposedCrossReference;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedAtomicBlock".
 */
export type ProposedAtomicBlock = {
  [k: string]: unknown | undefined;
} & {
  clientRef: ClientRef;
  type: 'displayEquation' | 'codeBlock' | 'horizontalRule';
  /**
   * Intentional open proposal boundary; final attributes are validated against manuscript.schema.json.
   */
  attrs: {
    [k: string]: JsonValue;
  };
  /**
   * Code block content. Other atomic block kinds must omit this field.
   */
  text?: string;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticPrecondition".
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionPrecondition".
 */
export type SemanticPrecondition =
  | NodeExistsPrecondition
  | NodeHashPrecondition
  | EntityExistsPrecondition
  | SchemaVersionPrecondition
  | DocumentHashPrecondition;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReplaceBlockContentEdit".
 */
export type ReplaceBlockContentEdit = {
  [k: string]: unknown | undefined;
} & {
  kind: 'replace-block-content';
  targetNodeId: AllocatedId;
  expectedContentHash: ContentHash;
  replacement: ProposedInlineContent[];
  preserveCitations: 'all' | 'none' | 'explicit';
  explicitCitationIds?: AllocatedId[];
  rationale: string;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationRelation".
 */
export type CitationRelation = 'supports' | 'partially-supports' | 'contradicts' | 'context-only';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceVerification".
 */
export type EvidenceVerification = {
  [k: string]: unknown | undefined;
} & {
  status: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
  verifiedBy?: ActorRef;
  verifiedAt?: Rfc3339Timestamp;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalValidationSnapshot".
 */
export type ProposalValidationSnapshot = {
  [k: string]: unknown | undefined;
} & {
  status: 'not-run' | 'validating' | 'valid' | 'warning' | 'invalid' | 'conflicted';
  basedOnRevisionId: AllocatedId;
  basedOnProposalRevision: number;
  diagnostics: Diagnostic[];
  validatedAt?: Rfc3339Timestamp;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticDiff".
 */
export type SemanticDiff = {
  [k: string]: unknown | undefined;
} & {
  id: OpaqueId;
  algorithmVersion: 'nireco-semantic-diff-1';
  document: DocumentRef;
  proposalId: AllocatedId;
  proposalRevision: number;
  generatedAgainstRevisionId: AllocatedId;
  groups: ProposalChangeGroup[];
  summary: SemanticDiffSummary;
  diagnostics: Diagnostic[];
  supersedes?: SupersededGroupMapping[];
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupKind".
 */
export type ProposalChangeGroupKind =
  | 'insert-content'
  | 'rewrite-content'
  | 'delete-content'
  | 'move-structure'
  | 'add-citation'
  | 'replace-citation'
  | 'change-evidence'
  | 'change-claim-relation'
  | 'metadata';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentFragment".
 */
export type DocumentFragment = BlockDocumentFragment | InlineDocumentFragment;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentNode".
 */
export type DocumentNode =
  | ManuscriptNode
  | FrontMatterNode
  | BodyNode
  | BlockNode
  | InlineNode
  | FigureAssetNode
  | FigureCaptionNode
  | TableCaptionNode
  | TableRowNode
  | TableCellNode
  | ListItemNode
  | BibliographyPlaceholderNode;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertableNode".
 */
export type InsertableNode =
  | FrontMatterNode
  | BodyNode
  | BlockNode
  | InlineNode
  | FigureAssetNode
  | FigureCaptionNode
  | TableCaptionNode
  | TableRowNode
  | TableCellNode
  | ListItemNode
  | BibliographyPlaceholderNode;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Operation".
 */
export type Operation =
  | InsertNodeOperation
  | DeleteNodeOperation
  | MoveNodeOperation
  | ReplaceTextOperation
  | SetNodeAttributesOperation
  | AddMarkOperation
  | RemoveMarkOperation
  | CreateAcademicEntityOperation
  | UpdateAcademicEntityOperation
  | DeleteAcademicEntityOperation
  | LinkAcademicEntitiesOperation
  | UnlinkAcademicEntitiesOperation;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReplaceTextOperation".
 */
export type ReplaceTextOperation = {
  [k: string]: unknown | undefined;
} & {
  id: AllocatedId;
  type: 'replace-text';
  textNodeId: AllocatedId;
  startUtf16Offset: Utf16Offset;
  endUtf16Offset: Utf16Offset;
  replacement: string;
};
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicEntity".
 */
export type AcademicEntity = ReferenceSnapshot | EvidenceLink | ClaimEntity;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicRelationKind".
 */
export type AcademicRelationKind =
  | 'claim-supports-evidence'
  | 'claim-partially-supports-evidence'
  | 'claim-contradicts-evidence'
  | 'claim-context-only-evidence'
  | 'claim-unclear-evidence'
  | 'citation-references-reference'
  | 'evidence-located-in-source'
  | 'cross-reference-targets';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CanonicalSegment".
 */
export type CanonicalSegment = string;
/**
 * Canonical logical URI: lowercase scheme and host; no userinfo, query, fragment, or port; at least two non-empty path segments; no trailing slash. Path case is preserved.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "LogicalResourceUri".
 */
export type LogicalResourceUri = string;
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "AuthorityMode".
 */
export type AuthorityMode = 'read-write' | 'read-only' | 'recovery-required';
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionMetadata".
 */
export type TransactionMetadata = {
  [k: string]: unknown | undefined;
} & {
  source: 'human-input' | 'command' | 'import' | 'migration' | 'validator-fix' | 'proposal-accept';
  undoGroupId?: OpaqueId;
  proposalId?: AllocatedId;
  proposalRevision?: number;
  cometTaskId?: OpaqueId;
  /**
   * @maxItems 1024
   */
  toolInvocationIds?: OpaqueId[];
  idempotencyKey?: string;
};

/**
 * Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.
 */
export interface TraceSchemaTypes {
  contractValue?: IntegrationTrace;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "IntegrationTrace".
 */
export interface IntegrationTrace {
  contractVersion: '0.4-preview.2';
  traceId: OpaqueId;
  taskId: OpaqueId;
  workflowId: string;
  document: DocumentRef;
  scenario: string;
  status: 'ok' | 'error';
  sessionId?: AllocatedId;
  capabilityGrantId?: OpaqueId;
  proposal?: TraceProposalRef;
  /**
   * @minItems 1
   */
  events: [TraceEvent, ...TraceEvent[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRef".
 */
export interface DocumentRef {
  uri: DocumentUri;
  revisionId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceProposalRef".
 */
export interface TraceProposalRef {
  proposalId: AllocatedId;
  proposalRevision: number;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "HashConformanceVector".
 */
export interface HashConformanceVector {
  name: string;
  domain: HashDomain;
  payloadSchemaId: string;
  payload: JsonValue;
  canonicalJson: string;
  preimageUtf8Hex: string;
  expectedHash: ContentHash;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "HashConformanceVectorSet".
 */
export interface HashConformanceVectorSet {
  profile: 'nireco-hash-preimage-1';
  preimageFormula: 'UTF8(NIRECO\\0HASH\\0V1\\0 + domain + \\0 + canonicalJson(payload))';
  /**
   * @minItems 1
   */
  vectors: [HashConformanceVector, ...HashConformanceVector[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GovernanceManifestHashPayload".
 */
export interface GovernanceManifestHashPayload {
  engineeringStandardVersion: string;
  files: GovernanceManifestFileHash[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GovernanceManifestFileHash".
 */
export interface GovernanceManifestFileHash {
  path: string;
  rawSha256: ContentHash;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "HumanActorRef".
 */
export interface HumanActorRef {
  type: 'human';
  id: OpaqueId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CometAgentActorRef".
 */
export interface CometAgentActorRef {
  type: 'comet-agent';
  id: OpaqueId;
  workflowId: string;
  modelRef?: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProductControllerActorRef".
 */
export interface ProductControllerActorRef {
  type: 'product-controller';
  id: OpaqueId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SystemActorRef".
 */
export interface SystemActorRef {
  type: 'system';
  id: OpaqueId;
  role: 'importer' | 'migration' | 'validator' | 'recovery';
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Diagnostic".
 */
export interface Diagnostic {
  id: OpaqueId;
  source: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  target?: SemanticTargetRef;
  basedOnRevisionId: AllocatedId;
  stale: boolean;
  related?: DiagnosticRelatedInformation[];
  suggestedFix?: ProposedFix;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeTargetRef".
 */
export interface NodeTargetRef {
  kind: 'node';
  document: DocumentRef;
  nodeId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityTargetRef".
 */
export interface EntityTargetRef {
  kind: 'academic-entity';
  document: DocumentRef;
  entityId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "RangeTargetRef".
 */
export interface RangeTargetRef {
  kind: 'range';
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TextPosition".
 */
export interface TextPosition {
  kind: 'text';
  textNodeId: AllocatedId;
  utf16Offset: Utf16Offset;
  affinity: Affinity;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeBoundaryPosition".
 */
export interface NodeBoundaryPosition {
  kind: 'node-boundary';
  parentNodeId: AllocatedId;
  childIndex: number;
  affinity: Affinity;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "MetadataTargetRef".
 */
export interface MetadataTargetRef {
  kind: 'metadata';
  document: DocumentRef;
  field: 'title' | 'authors' | 'abstract' | 'keywords';
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DiagnosticRelatedInformation".
 */
export interface DiagnosticRelatedInformation {
  message: string;
  target: SemanticTargetRef;
}
/**
 * A non-committing draft suggestion. Applying it still requires the normal Proposal or trusted Transaction validation path.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedFix".
 */
export interface ProposedFix {
  kind: 'proposal-draft' | 'transaction-draft';
  description: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NirecoError".
 */
export interface NirecoError {
  code: NirecoErrorCode;
  category:
    | 'validation'
    | 'conflict'
    | 'permission'
    | 'compatibility'
    | 'storage'
    | 'transport'
    | 'internal';
  retryable: boolean;
  safeMessage: string;
  debugId: AllocatedId;
  currentRevisionId?: AllocatedId;
  requiredCapability?: string;
  conflictingTargets?: SemanticTargetRef[];
  suggestedAction: 'retry' | 'reread' | 'rebase' | 'request-permission' | 'user-review' | 'abort';
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CometIntegrationHandshakeRequest".
 */
export interface CometIntegrationHandshakeRequest {
  requestedContractVersion: string;
  cometBuildId: string;
  adapterVersion: string;
  workflowId: string;
  requiredCapabilities: IntegrationCapability[];
  requiredSemanticEdits: SemanticEditKind[];
  requiredTransportFeatures: TransportFeature[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CometIntegrationHandshakeResult".
 */
export interface CometIntegrationHandshakeResult {
  acceptedContractVersion: '0.4-preview.1';
  nirecoBuildId: string;
  documentFormatVersion: '1.0.0-preview.1';
  schemaVersion: '1.0.0-preview.1';
  transactionProtocolVersion: '0.4-preview.1';
  proposalProtocolVersion: '0.4-preview.1';
  semanticEditProtocolVersion: '0.4-preview.1';
  supportedCapabilities: IntegrationCapability[];
  supportedSemanticEdits: SemanticEditKind[];
  limits: ContractLimits;
  /**
   * Intentional map exception: feature-flag keys are negotiated and namespaced by this private contract.
   */
  featureFlags: {
    [k: string]: boolean | undefined;
  };
  transportFeatures: TransportFeature[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ContractLimits".
 */
export interface ContractLimits {
  maxRequestBytes: number;
  maxResponseBytes: number;
  maxPageItems: number;
  maxChangedUtf16Units: number;
  maxOperations: number;
  maxNewReferences: number;
  maxDeletedNodes: number;
  maxMovedNodes: number;
  sessionTtlSeconds: number;
  cursorTtlSeconds: number;
}
/**
 * Each ID array is capped at 1000 entries. The combined allowedSectionIds plus allowedNodeIds count is also capped at 1000 as a runtime cross-field invariant. maxContextDistance is capped at 1000000 at every Session, service, and cursor boundary.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CometDocumentScope".
 */
export interface CometDocumentScope {
  /**
   * @maxItems 1000
   */
  allowedSectionIds?: AllocatedId[];
  /**
   * @maxItems 1000
   */
  allowedNodeIds?: AllocatedId[];
  allowReadOutsideScopeForContext?: boolean;
  maxContextDistance?: number;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CometIntegrationConstraints".
 */
export interface CometIntegrationConstraints {
  maxChangedUtf16Units?: number;
  maxOperations?: number;
  maxNewReferences?: number;
  maxDeletedNodes?: number;
  maxMovedNodes?: number;
  requireEvidenceForCitation: boolean;
  requireVerifiedEvidence: boolean;
  allowMetadataOnlyCitation: boolean;
  allowDelete: boolean;
  allowStructureMove: boolean;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "OpenCometSessionRequest".
 */
export interface OpenCometSessionRequest {
  contractVersion: string;
  target: DocumentRef;
  taskId: OpaqueId;
  traceId: OpaqueId;
  actor: CometAgentActorRef;
  requestedCapabilities: IntegrationCapability[];
  scope: CometDocumentScope;
  constraints: CometIntegrationConstraints;
  policySnapshotId: OpaqueId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "OpenCometSessionResult".
 */
export interface OpenCometSessionResult {
  contractVersion: '0.4-preview.1';
  sessionId: AllocatedId;
  target: DocumentRef;
  grantedCapabilities: IntegrationCapability[];
  scope: CometDocumentScope;
  constraints: CometIntegrationConstraints;
  limits: ContractLimits;
  capabilityGrantId: OpaqueId;
  expiresAt: Rfc3339Timestamp;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionBoundReadResult".
 */
export interface RevisionBoundReadResult {
  document: DocumentRef;
  basedOnRevisionId: AllocatedId;
  consistency: RevisionBoundConsistency;
  status: RevisionBoundStatus;
}
/**
 * A requested maxResults is additionally capped by the negotiated Session maxPageItems.
 *
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReadPageRequest".
 */
export interface ReadPageRequest {
  cursor?: ReadCursor;
  maxResults?: ReadMaxResults;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "OutlineItem".
 */
export interface OutlineItem {
  nodeId: AllocatedId;
  /**
   * Canonical lowercase RFC 9562 UUIDv7 allocated by a trusted Nireco boundary before reducer entry.
   */
  parentNodeId?: string;
  nodeType: NodeKind;
  depth: number;
  title: string;
  /**
   * Counts only children authorized by the granted Scope.
   */
  authorizedChildCount: number;
  nodeHash: ContentHash;
}
/**
 * Exact canonical attributes of an attributed source node; never model-supplied attributes.
 */
export interface JsonObject1 {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SimpleMark".
 */
export interface SimpleMark {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'subscript' | 'superscript';
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "LinkMark".
 */
export interface LinkMark {
  type: 'link';
  href: ResourceUri;
  title?: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSearchHit".
 */
export interface DocumentSearchHit {
  kind: DocumentSearchKind;
  target: DocumentSearchTarget;
  match: DocumentSearchMatch;
  /**
   * Scope-authorized text only. It never carries a DOM offset.
   */
  snippet: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRevisionChange".
 */
export interface DocumentRevisionChange {
  revision: Revision;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Revision".
 */
export interface Revision {
  id: AllocatedId;
  uri: DocumentUri;
  parentRevisionId: AllocatedId | null;
  transactionId: AllocatedId;
  sequence: number;
  documentHash: ContentHash;
  actor: ActorRef;
  createdAt: Rfc3339Timestamp;
  durability: DurabilityLevel;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ResolveModelRequest".
 */
export interface ResolveModelRequest {
  document: DocumentRef;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ResolveModelResult".
 */
export interface ResolveModelResult {
  document: DocumentRef;
  basedOnRevisionId: AllocatedId;
  consistency: 'exact';
  status: SuccessfulRevisionBoundStatus;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentHeadRequest".
 */
export interface GetDocumentHeadRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentHeadResult".
 */
export interface GetDocumentHeadResult {
  document: DocumentRef;
  basedOnRevisionId: AllocatedId;
  consistency: 'exact';
  status: 'current';
  headRevisionId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentSnapshotRequest".
 */
export interface GetDocumentSnapshotRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentSnapshotResult".
 */
export interface GetDocumentSnapshotResult {
  document: DocumentRef;
  basedOnRevisionId: AllocatedId;
  consistency: 'exact';
  status: SuccessfulRevisionBoundStatus;
  snapshot: DocumentSnapshot;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSnapshot".
 */
export interface DocumentSnapshot {
  format: 'nireco-document';
  formatVersion: '1.0.0-preview.1';
  schemaId: 'nireco.manuscript';
  schemaVersion: '1.0.0-preview.1';
  revisionId: AllocatedId;
  documentHash: ContentHash;
  metadata: ManuscriptMetadata;
  root: ManuscriptNode;
  academicGraph: AcademicGraphSnapshot;
  settings: DocumentSemanticSettings;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ManuscriptMetadata".
 */
export interface ManuscriptMetadata {
  title: string;
  /**
   * @maxItems 1024
   */
  authors: ManuscriptAuthor[];
  abstract: string;
  /**
   * @maxItems 1024
   */
  keywords: string[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ManuscriptAuthor".
 */
export interface ManuscriptAuthor {
  id?: AllocatedId;
  name: string;
  given?: string;
  family?: string;
  orcid?: string;
  affiliations?: string[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ManuscriptNode".
 */
export interface ManuscriptNode {
  id: AllocatedId;
  type: 'manuscript';
  attrs: EmptyAttributes;
  children:
    | [BodyNode]
    | [FrontMatterNode, BodyNode]
    | [BodyNode, BibliographyPlaceholderNode]
    | [FrontMatterNode, BodyNode, BibliographyPlaceholderNode];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EmptyAttributes".
 */
export interface EmptyAttributes {}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "BodyNode".
 */
export interface BodyNode {
  id: AllocatedId;
  type: 'body';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [BlockNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SectionNode".
 */
export interface SectionNode {
  id: AllocatedId;
  type: 'section';
  attrs: {
    level: number;
  };
  /**
   * A section starts with exactly one direct heading.
   *
   * @minItems 1
   */
  children: [HeadingNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "HeadingNode".
 */
export interface HeadingNode {
  id: AllocatedId;
  type: 'heading';
  attrs: {
    level: number;
  };
  children: InlineNode[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TextNode".
 */
export interface TextNode {
  id: AllocatedId;
  type: 'text';
  value: string;
  marks: Mark[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationNode".
 */
export interface CitationNode {
  id: AllocatedId;
  type: 'citation';
  attrs: {
    citationId: AllocatedId;
    referenceId: AllocatedId;
    locator?: CitationLocator;
    prefix?: string;
    suffix?: string;
  };
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationLocator".
 */
export interface CitationLocator {
  label: 'page' | 'chapter' | 'section' | 'paragraph' | 'figure' | 'table' | 'timestamp' | 'record';
  value: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CrossReferenceNode".
 */
export interface CrossReferenceNode {
  id: AllocatedId;
  type: 'crossReference';
  attrs: {
    targetEntityId: AllocatedId;
    label?: string;
  };
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "InlineEquationNode".
 */
export interface InlineEquationNode {
  id: AllocatedId;
  type: 'inlineEquation';
  attrs: {
    source: string;
  };
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteReferenceNode".
 */
export interface FootnoteReferenceNode {
  id: AllocatedId;
  type: 'footnoteReference';
  attrs: {
    footnoteNodeId: AllocatedId;
  };
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "HardBreakNode".
 */
export interface HardBreakNode {
  id: AllocatedId;
  type: 'hardBreak';
  attrs: EmptyAttributes;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ParagraphNode".
 */
export interface ParagraphNode {
  id: AllocatedId;
  type: 'paragraph';
  attrs: {
    alignment: 'start' | 'center' | 'end' | 'justify';
  };
  children: InlineNode[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureNode".
 */
export interface FigureNode {
  id: AllocatedId;
  type: 'figure';
  attrs: {
    entityId?: AllocatedId;
    label?: string;
  };
  children: [FigureAssetNode] | [FigureAssetNode, FigureCaptionNode];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureAssetNode".
 */
export interface FigureAssetNode {
  id: AllocatedId;
  type: 'figureAsset';
  attrs: {
    uri: ResourceUri;
    contentHash: ContentHash;
    altText: string;
  };
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureCaptionNode".
 */
export interface FigureCaptionNode {
  id: AllocatedId;
  type: 'figureCaption';
  attrs: EmptyAttributes;
  children: InlineNode[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TableNode".
 */
export interface TableNode {
  id: AllocatedId;
  type: 'table';
  attrs: {
    entityId?: AllocatedId;
    label?: string;
  };
  /**
   * A table has one or more rows and at most one caption. Conformance additionally enforces that a caption, when present, is the first child.
   *
   * @minItems 1
   */
  children: {
    [k: string]: unknown | undefined;
  } & [TableCaptionNode | TableRowNode, ...(TableCaptionNode | TableRowNode)[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TableCaptionNode".
 */
export interface TableCaptionNode {
  id: AllocatedId;
  type: 'tableCaption';
  attrs: EmptyAttributes;
  children: InlineNode[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TableRowNode".
 */
export interface TableRowNode {
  id: AllocatedId;
  type: 'tableRow';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [TableCellNode, ...TableCellNode[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TableCellNode".
 */
export interface TableCellNode {
  id: AllocatedId;
  type: 'tableCell';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [ParagraphNode, ...LimitedCellBlockNode[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "BlockQuoteNode".
 */
export interface BlockQuoteNode {
  id: AllocatedId;
  type: 'blockQuote';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [BlockNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CodeBlockNode".
 */
export interface CodeBlockNode {
  id: AllocatedId;
  type: 'codeBlock';
  attrs: {
    language?: string;
  };
  /**
   * @maxItems 1
   */
  children: [] | [TextNode];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ListNode".
 */
export interface ListNode {
  id: AllocatedId;
  type: 'list';
  attrs: {
    [k: string]: unknown | undefined;
  };
  /**
   * @minItems 1
   */
  children: [ListItemNode, ...ListItemNode[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ListItemNode".
 */
export interface ListItemNode {
  id: AllocatedId;
  type: 'listItem';
  attrs: EmptyAttributes;
  /**
   * A list item starts with a paragraph.
   *
   * @minItems 1
   */
  children: [ParagraphNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DisplayEquationNode".
 */
export interface DisplayEquationNode {
  id: AllocatedId;
  type: 'displayEquation';
  attrs: {
    source: string;
    label?: string;
    entityId?: AllocatedId;
  };
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "HorizontalRuleNode".
 */
export interface HorizontalRuleNode {
  id: AllocatedId;
  type: 'horizontalRule';
  attrs: EmptyAttributes;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteNode".
 */
export interface FootnoteNode {
  id: AllocatedId;
  type: 'footnote';
  attrs: {
    label?: string;
  };
  /**
   * @minItems 1
   */
  children: [FootnoteBlockNode, ...FootnoteBlockNode[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "FrontMatterNode".
 */
export interface FrontMatterNode {
  id: AllocatedId;
  type: 'frontMatter';
  attrs: EmptyAttributes;
  /**
   * The preview reserves the structural front-matter node, while title/authors/abstract/keywords live in DocumentSnapshot.metadata.
   *
   * @maxItems 0
   */
  children: [];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "BibliographyPlaceholderNode".
 */
export interface BibliographyPlaceholderNode {
  id: AllocatedId;
  type: 'bibliographyPlaceholder';
  attrs: {
    heading: string;
  };
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicGraphSnapshot".
 */
export interface AcademicGraphSnapshot {
  referenceSnapshots: ReferenceSnapshot[];
  evidenceLinks: EvidenceLink[];
  claims: ClaimEntity[];
  claimEvidenceRelations: ClaimEvidenceRelation[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReferenceSnapshot".
 */
export interface ReferenceSnapshot {
  id: AllocatedId;
  externalUri?: ResourceUri;
  /**
   * Intentional open exception: CSL-JSON is an externally governed map and is preserved as canonical JSON.
   */
  cslJson: {
    [k: string]: unknown | undefined;
  };
  metadataHash: ContentHash;
  capturedAt: Rfc3339Timestamp;
  sourceProvider?: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceLink".
 */
export interface EvidenceLink {
  id: AllocatedId;
  uri: CometResourceUri;
  sourceUri: ResourceUri;
  sourceContentHash: ContentHash;
  locator: EvidenceLocator;
  excerpt?: string;
  excerptHash?: ContentHash;
  verificationStatus: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
  verifiedBy?: ActorRef;
  verifiedAt?: Rfc3339Timestamp;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "PageEvidenceLocator".
 */
export interface PageEvidenceLocator {
  kind: 'page';
  page: number;
  pageLabel?: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SectionEvidenceLocator".
 */
export interface SectionEvidenceLocator {
  kind: 'section';
  section: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TextQuoteEvidenceLocator".
 */
export interface TextQuoteEvidenceLocator {
  kind: 'text-quote';
  exact: string;
  prefix?: string;
  suffix?: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TimeEvidenceLocator".
 */
export interface TimeEvidenceLocator {
  kind: 'time';
  startSeconds: number;
  endSeconds?: number;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "RecordEvidenceLocator".
 */
export interface RecordEvidenceLocator {
  kind: 'record';
  recordKey: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ClaimEntity".
 */
export interface ClaimEntity {
  id: AllocatedId;
  anchor: PersistentAnchor;
  textSnapshot: string;
  textHash: ContentHash;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "PersistentAnchor".
 */
export interface PersistentAnchor {
  document: DocumentRef;
  primary: SemanticPosition;
  targetNodeId?: AllocatedId;
  textQuote?: TextQuote;
  pathHint?: AllocatedId[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "TextQuote".
 */
export interface TextQuote {
  exact: string;
  prefix?: string;
  suffix?: string;
  normalizedHash?: ContentHash;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ClaimEvidenceRelation".
 */
export interface ClaimEvidenceRelation {
  claimId: AllocatedId;
  evidenceId: AllocatedId;
  relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only' | 'unclear';
  assessedBy: ActorRef;
  confidence?: number;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSemanticSettings".
 */
export interface DocumentSemanticSettings {
  language: string;
  citationStyle: string;
  headingNumbering: boolean;
  bibliographyEnabled: boolean;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentOutlineRequest".
 */
export interface GetDocumentOutlineRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
  maxDepth?: number;
  cursor?: ReadCursor;
  maxResults?: ReadMaxResults;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReadDocumentNodesRequest".
 */
export interface ReadDocumentNodesRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  nodeIds: [AllocatedId, ...AllocatedId[]];
  cursor?: ReadCursor;
  maxResults?: ReadMaxResults;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReadDocumentNodeNeighborhoodRequest".
 */
export interface ReadDocumentNodeNeighborhoodRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
  nodeId: AllocatedId;
  beforeBlocks: number;
  afterBlocks: number;
  cursor?: ReadCursor;
  maxResults?: ReadMaxResults;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SearchDocumentRequest".
 */
export interface SearchDocumentRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
  query: string;
  /**
   * An optional narrowing intersected with the granted Scope; it can never broaden the Session grant.
   *
   * @maxItems 256
   */
  sectionIds?: AllocatedId[];
  /**
   * @maxItems 4
   */
  kinds?:
    | []
    | [DocumentSearchKind]
    | [DocumentSearchKind, DocumentSearchKind]
    | [DocumentSearchKind, DocumentSearchKind, DocumentSearchKind]
    | [DocumentSearchKind, DocumentSearchKind, DocumentSearchKind, DocumentSearchKind];
  cursor?: ReadCursor;
  maxResults?: ReadMaxResults;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentChangesSinceRequest".
 */
export interface GetDocumentChangesSinceRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
  sinceRevisionId: AllocatedId;
  cursor?: ReadCursor;
  maxResults?: ReadMaxResults;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetDocumentDiagnosticsRequest".
 */
export interface GetDocumentDiagnosticsRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
  /**
   * @maxItems 3
   */
  severities?:
    | []
    | ['info' | 'warning' | 'error']
    | ['info' | 'warning' | 'error', 'info' | 'warning' | 'error']
    | ['info' | 'warning' | 'error', 'info' | 'warning' | 'error', 'info' | 'warning' | 'error'];
  /**
   * @maxItems 256
   */
  codes?: string[];
  cursor?: ReadCursor;
  maxResults?: ReadMaxResults;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetSnapshotRequest".
 */
export interface GetSnapshotRequest {
  sessionId: AllocatedId;
  document: DocumentRef;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "GetSnapshotResult".
 */
export interface GetSnapshotResult {
  document: DocumentRef;
  snapshot: DocumentSnapshot;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CreateProposalRequest".
 */
export interface CreateProposalRequest {
  sessionId: AllocatedId;
  target: DocumentRef;
  idempotencyKey: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CreateProposalResult".
 */
export interface CreateProposalResult {
  proposal: Proposal;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertBlockEdit".
 */
export interface InsertBlockEdit {
  kind: 'insert-block';
  clientRef: ClientRef;
  target: InsertionTarget;
  block: ProposedBlockContent;
  rationale?: string;
  preconditions?: SemanticPrecondition[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertionTarget".
 */
export interface InsertionTarget {
  parentNodeId: AllocatedId;
  afterNodeId?: AllocatedId;
  beforeNodeId?: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedInlineContainerBlock".
 */
export interface ProposedInlineContainerBlock {
  clientRef: ClientRef;
  type: 'paragraph' | 'heading';
  /**
   * Intentional open proposal boundary; the canonical manuscript node schema validates compiled attributes.
   */
  attrs: {
    [k: string]: JsonValue;
  };
  children: ProposedInlineContent[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedText".
 */
export interface ProposedText {
  clientRef: ClientRef;
  type: 'text';
  value: string;
  marks: Mark[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedHardBreak".
 */
export interface ProposedHardBreak {
  clientRef: ClientRef;
  type: 'hardBreak';
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedInlineEquation".
 */
export interface ProposedInlineEquation {
  clientRef: ClientRef;
  type: 'inlineEquation';
  source: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedCrossReference".
 */
export interface ProposedCrossReference {
  clientRef: ClientRef;
  type: 'crossReference';
  targetEntityId: AllocatedId;
  label?: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedStructuredBlock".
 */
export interface ProposedStructuredBlock {
  clientRef: ClientRef;
  type: 'section' | 'figure' | 'table' | 'list' | 'listItem' | 'blockQuote' | 'footnote';
  /**
   * Intentional open proposal boundary; final structure and attributes are validated against manuscript.schema.json.
   */
  attrs: {
    [k: string]: JsonValue;
  };
  children: (ProposedBlockContent | ProposedInlineContent)[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeExistsPrecondition".
 */
export interface NodeExistsPrecondition {
  kind: 'node-exists';
  nodeId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeHashPrecondition".
 */
export interface NodeHashPrecondition {
  kind: 'node-hash';
  nodeId: AllocatedId;
  expected: ContentHash;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityExistsPrecondition".
 */
export interface EntityExistsPrecondition {
  kind: 'entity-exists';
  entityId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SchemaVersionPrecondition".
 */
export interface SchemaVersionPrecondition {
  kind: 'schema-version';
  expected: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentHashPrecondition".
 */
export interface DocumentHashPrecondition {
  kind: 'document-hash';
  expected: ContentHash;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "MoveBlockEdit".
 */
export interface MoveBlockEdit {
  kind: 'move-block';
  targetNodeId: AllocatedId;
  target: InsertionTarget;
  rationale: string;
  preconditions?: SemanticPrecondition[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DeleteBlockEdit".
 */
export interface DeleteBlockEdit {
  kind: 'delete-block';
  targetNodeId: AllocatedId;
  expectedContentHash: ContentHash;
  rationale: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertCitationEdit".
 */
export interface InsertCitationEdit {
  kind: 'insert-citation';
  clientRef: ClientRef;
  target: SemanticPosition;
  claimId?: AllocatedId;
  referenceId: AllocatedId;
  evidenceIds: AllocatedId[];
  relation: CitationRelation;
  locator?: CitationLocator;
  prefix?: string;
  suffix?: string;
  rationale: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ReplaceCitationEdit".
 */
export interface ReplaceCitationEdit {
  kind: 'replace-citation';
  targetCitationNodeId: AllocatedId;
  expectedReferenceId: AllocatedId;
  referenceId: AllocatedId;
  evidenceIds: AllocatedId[];
  relation: CitationRelation;
  locator?: CitationLocator;
  prefix?: string;
  suffix?: string;
  rationale: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CreateClaimEdit".
 */
export interface CreateClaimEdit {
  kind: 'create-claim';
  clientRef: ClientRef;
  anchor: PersistentAnchor;
  textSnapshot: string;
  textHash: ContentHash;
  rationale: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "LinkClaimEvidenceEdit".
 */
export interface LinkClaimEvidenceEdit {
  kind: 'link-claim-evidence';
  claimId: AllocatedId;
  evidenceId: AllocatedId;
  relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only' | 'unclear';
  assessedBy: ActorRef;
  confidence?: number;
  rationale: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CreateEvidenceLinkEdit".
 */
export interface CreateEvidenceLinkEdit {
  kind: 'create-evidence-link';
  clientRef: ClientRef;
  uri: CometResourceUri;
  sourceUri: ResourceUri;
  sourceContentHash: ContentHash;
  locator: EvidenceLocator;
  excerpt?: string;
  excerptHash?: ContentHash;
  verification: EvidenceVerification;
  rationale: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "UpdateMetadataEdit".
 */
export interface UpdateMetadataEdit {
  kind: 'update-metadata';
  patch: MetadataPatch;
  rationale: string;
  preconditions?: SemanticPrecondition[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "MetadataPatch".
 */
export interface MetadataPatch {
  title?: string;
  /**
   * @maxItems 1024
   */
  authors?: ManuscriptAuthor[];
  abstract?: string;
  /**
   * @maxItems 1024
   */
  keywords?: string[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroup".
 */
export interface ProposalChangeGroup {
  id: DerivedId;
  kind: ProposalChangeGroupKind;
  /**
   * @minItems 1
   */
  targetRefs: [SemanticTargetRef, ...SemanticTargetRef[]];
  /**
   * @minItems 1
   */
  operationIds: [AllocatedId, ...AllocatedId[]];
  dependsOn: DerivedId[];
  before?: DocumentFragment;
  after?: DocumentFragment;
  citationChanges: CitationChange[];
  evidenceChanges: EvidenceChange[];
  rationale?: string;
  warnings: Diagnostic[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "BlockDocumentFragment".
 */
export interface BlockDocumentFragment {
  kind: 'block';
  nodes: BlockNode[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "InlineDocumentFragment".
 */
export interface InlineDocumentFragment {
  kind: 'inline';
  nodes: InlineNode[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationChange".
 */
export interface CitationChange {
  kind: 'added' | 'removed' | 'replaced';
  citationNodeId?: AllocatedId;
  beforeReferenceId?: AllocatedId;
  afterReferenceId?: AllocatedId;
  evidenceIds?: AllocatedId[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceChange".
 */
export interface EvidenceChange {
  kind: 'added' | 'removed' | 'verification-changed' | 'relation-changed' | 'stale';
  evidenceId: AllocatedId;
  claimId?: AllocatedId;
  beforeStatus?: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
  afterStatus?: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticDiffSummary".
 */
export interface SemanticDiffSummary {
  groupCount: number;
  insertedContentGroups: number;
  rewrittenContentGroups: number;
  deletedContentGroups: number;
  movedStructureGroups: number;
  citationChangeCount: number;
  evidenceChangeCount: number;
  metadataChangeCount: number;
  changedUtf16Units: number;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SupersededGroupMapping".
 */
export interface SupersededGroupMapping {
  previousGroupId: DerivedId;
  currentGroupIds: DerivedId[];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalProvenance".
 */
export interface ProposalProvenance {
  taskId: OpaqueId;
  traceId: OpaqueId;
  sessionId: AllocatedId;
  capabilityGrantId: OpaqueId;
  workflowId: string;
  modelRef?: string;
  toolInvocationIds: OpaqueId[];
  idempotencyKey?: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "StageSemanticEditsRequest".
 */
export interface StageSemanticEditsRequest {
  sessionId: AllocatedId;
  proposal: ProposalRef;
  /**
   * @minItems 1
   */
  semanticEdits: [SemanticEdit, ...SemanticEdit[]];
  idempotencyKey: string;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalRef".
 */
export interface ProposalRef {
  proposalId: AllocatedId;
  expectedProposalRevision: number;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "StageSemanticEditsResult".
 */
export interface StageSemanticEditsResult {
  proposal: Proposal;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentHashPayload".
 */
export interface DocumentHashPayload {
  schemaId: 'nireco.manuscript';
  schemaVersion: '1.0.0-preview.1';
  metadata: ManuscriptMetadata;
  root: ManuscriptNode;
  academicGraph: AcademicGraphSnapshot;
  settings: DocumentSemanticSettings;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertNodeOperation".
 */
export interface InsertNodeOperation {
  id: AllocatedId;
  type: 'insert-node';
  parentNodeId: AllocatedId;
  childIndex: number;
  node: InsertableNode;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DeleteNodeOperation".
 */
export interface DeleteNodeOperation {
  id: AllocatedId;
  type: 'delete-node';
  targetNodeId: AllocatedId;
  expectedNodeHash: ContentHash;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "MoveNodeOperation".
 */
export interface MoveNodeOperation {
  id: AllocatedId;
  type: 'move-node';
  targetNodeId: AllocatedId;
  newParentNodeId: AllocatedId;
  childIndex: number;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SetNodeAttributesOperation".
 */
export interface SetNodeAttributesOperation {
  id: AllocatedId;
  type: 'set-node-attributes';
  nodeId: AllocatedId;
  /**
   * Intentional open exception at the typed operation boundary; the target node schema validates the resulting attributes.
   */
  attributes: {
    [k: string]: JsonValue;
  };
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "AddMarkOperation".
 */
export interface AddMarkOperation {
  id: AllocatedId;
  type: 'add-mark';
  textNodeId: AllocatedId;
  startUtf16Offset: Utf16Offset;
  endUtf16Offset: Utf16Offset;
  mark: Mark;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "RemoveMarkOperation".
 */
export interface RemoveMarkOperation {
  id: AllocatedId;
  type: 'remove-mark';
  textNodeId: AllocatedId;
  startUtf16Offset: Utf16Offset;
  endUtf16Offset: Utf16Offset;
  mark: Mark;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CreateAcademicEntityOperation".
 */
export interface CreateAcademicEntityOperation {
  id: AllocatedId;
  type: 'create-academic-entity';
  entity: AcademicEntity;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "UpdateAcademicEntityOperation".
 */
export interface UpdateAcademicEntityOperation {
  id: AllocatedId;
  type: 'update-academic-entity';
  entityId: AllocatedId;
  /**
   * @minItems 1
   */
  patch: [EntityPatch, ...EntityPatch[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityPatch".
 */
export interface EntityPatch {
  field: string;
  value: JsonValue;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DeleteAcademicEntityOperation".
 */
export interface DeleteAcademicEntityOperation {
  id: AllocatedId;
  type: 'delete-academic-entity';
  entityId: AllocatedId;
  expectedEntityHash: ContentHash;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "LinkAcademicEntitiesOperation".
 */
export interface LinkAcademicEntitiesOperation {
  id: AllocatedId;
  type: 'link-academic-entities';
  fromEntityId: AllocatedId;
  toEntityId: AllocatedId;
  relation: AcademicRelationKind;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "UnlinkAcademicEntitiesOperation".
 */
export interface UnlinkAcademicEntitiesOperation {
  id: AllocatedId;
  type: 'unlink-academic-entities';
  fromEntityId: AllocatedId;
  toEntityId: AllocatedId;
  relation: AcademicRelationKind;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticRange".
 */
export interface SemanticRange {
  anchor: SemanticPosition;
  focus: SemanticPosition;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeRef".
 */
export interface NodeRef {
  document: DocumentRef;
  nodeId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicEntityRef".
 */
export interface AcademicEntityRef {
  document: DocumentRef;
  entityId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRangeRef".
 */
export interface DocumentRangeRef {
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceRef".
 */
export interface ResourceRef {
  uri: ResourceUri;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "MutableDocumentTarget".
 */
export interface MutableDocumentTarget {
  uri: DocumentUri;
  baseRevisionId: AllocatedId;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "DurabilityAcknowledgement".
 */
export interface DurabilityAcknowledgement {
  revisionId: AllocatedId;
  achievedDurability: DurabilityLevel;
  authorityMode: AuthorityMode;
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "CommitResult".
 */
export interface CommitResult {
  revisionId: AllocatedId;
  snapshot: DocumentSnapshot;
  transactionHash: ContentHash;
  /**
   * apply() acknowledges only the in-memory commit; callers use whenDurable() for WAL or Snapshot.
   */
  achievedDurability: 'memory';
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupIdentityPayload".
 */
export interface ProposalChangeGroupIdentityPayload {
  algorithmVersion: 'nireco-semantic-diff-1';
  documentUri: DocumentUri;
  generatedAgainstRevisionId: AllocatedId;
  proposalId: AllocatedId;
  proposalRevision: number;
  kind: ProposalChangeGroupKind;
  /**
   * @minItems 1
   */
  targetRefs: [SemanticTargetRef, ...SemanticTargetRef[]];
  /**
   * @minItems 1
   */
  operationIds: [AllocatedId, ...AllocatedId[]];
}
/**
 * This interface was referenced by `TraceSchemaTypes`'s JSON-Schema
 * via the `definition` "Transaction".
 */
export interface Transaction {
  id: AllocatedId;
  target: MutableDocumentTarget;
  actor: ActorRef;
  intent?: string;
  /**
   * @minItems 1
   * @maxItems 1024
   */
  operations: [Operation, ...Operation[]];
  /**
   * @maxItems 4096
   */
  preconditions: SemanticPrecondition[];
  metadata: TransactionMetadata;
  createdAt: Rfc3339Timestamp;
}
