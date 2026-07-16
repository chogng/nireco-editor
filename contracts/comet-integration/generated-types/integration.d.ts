/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: contracts/comet-integration/schemas/integration.schema.json
 * Generator: json-schema-to-typescript
 * Generator version: 15.0.4
 * Source SHA-256: d47705fc41aeaa01b60ba7c06284247a43c2a165239fde7af5c944fc8400a4ae
 */

/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TransportFeature".
 */
export type TransportFeature =
  'in-process' | 'worker' | 'ipc' | 'internal-rpc' | 'cursor-pagination' | 'idempotency';
/**
 * Opaque identity. The preview contract intentionally does not freeze a UUID representation.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "OpaqueId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "WorkspaceId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SessionId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DebugId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "RequestId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TaskId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ToolInvocationId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CapabilityGrantId".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "PolicySnapshotId".
 */
export type OpaqueId = string;
/**
 * Untrusted, request-local correlation key. It is never a trusted Nireco identity.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ClientRef".
 */
export type ClientRef = string;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ContentHash".
 */
export type ContentHash = string;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "Rfc3339Timestamp".
 */
export type Rfc3339Timestamp = string;
/**
 * Offset measured in UTF-16 code units. A service must additionally reject a value inside a surrogate pair.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "Utf16Offset".
 */
export type Utf16Offset = number;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ActorRef".
 */
export type ActorRef =
  HumanActorRef | CometAgentActorRef | ProductControllerActorRef | SystemActorRef;
/**
 * A JSON value used only at explicitly declared extension or patch boundaries.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonArray".
 */
export type JsonArray = JsonValue[];
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticTargetRef".
 */
export type SemanticTargetRef =
  NodeTargetRef | EntityTargetRef | RangeTargetRef | MetadataTargetRef;
/**
 * Canonical Nireco document URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentUri".
 */
export type DocumentUri = string;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticPosition".
 */
export type SemanticPosition = TextPosition | NodeBoundaryPosition;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "Affinity".
 */
export type Affinity = 'before' | 'after';
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "Mark".
 */
export type Mark = SimpleMark | LinkMark;
/**
 * ASCII-visible canonical wire URI. Raw Unicode is forbidden and must be UTF-8 percent-encoded; percent escapes use uppercase hexadecimal. Nireco and Comet logical URIs are further constrained by LogicalResourceUri.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceUri".
 */
export type ResourceUri = string;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "LimitedCellBlockNode".
 */
export type LimitedCellBlockNode = ParagraphNode | BlockQuoteNode | CodeBlockNode | ListNode;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteBlockNode".
 */
export type FootnoteBlockNode = ParagraphNode | BlockQuoteNode | CodeBlockNode | ListNode;
/**
 * Canonical Comet-owned logical resource URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CometResourceUri".
 */
export type CometResourceUri = string;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceLocator".
 */
export type EvidenceLocator =
  | PageEvidenceLocator
  | SectionEvidenceLocator
  | TextQuoteEvidenceLocator
  | TimeEvidenceLocator
  | RecordEvidenceLocator;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "Proposal".
 */
export type Proposal = {
  [k: string]: unknown | undefined;
} & {
  id: OpaqueId;
  documentUri: DocumentUri;
  baseRevisionId: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedBlockContent".
 */
export type ProposedBlockContent =
  ProposedInlineContainerBlock | ProposedStructuredBlock | ProposedAtomicBlock;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedInlineContent".
 */
export type ProposedInlineContent =
  ProposedText | ProposedHardBreak | ProposedInlineEquation | ProposedCrossReference;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticPrecondition".
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionPrecondition".
 */
export type SemanticPrecondition =
  | NodeExistsPrecondition
  | NodeHashPrecondition
  | EntityExistsPrecondition
  | SchemaVersionPrecondition
  | DocumentHashPrecondition;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ReplaceBlockContentEdit".
 */
export type ReplaceBlockContentEdit = {
  [k: string]: unknown | undefined;
} & {
  kind: 'replace-block-content';
  targetNodeId: OpaqueId;
  expectedContentHash: ContentHash;
  replacement: ProposedInlineContent[];
  preserveCitations: 'all' | 'none' | 'explicit';
  explicitCitationIds?: OpaqueId[];
  rationale: string;
};
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationRelation".
 */
export type CitationRelation = 'supports' | 'partially-supports' | 'contradicts' | 'context-only';
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalValidationSnapshot".
 */
export type ProposalValidationSnapshot = {
  [k: string]: unknown | undefined;
} & {
  status: 'not-run' | 'validating' | 'valid' | 'warning' | 'invalid' | 'conflicted';
  basedOnRevisionId: OpaqueId;
  basedOnProposalRevision: number;
  diagnostics: Diagnostic[];
  validatedAt?: Rfc3339Timestamp;
};
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticDiff".
 */
export type SemanticDiff = {
  [k: string]: unknown | undefined;
} & {
  id: OpaqueId;
  document: DocumentRef;
  proposalId: OpaqueId;
  proposalRevision: number;
  generatedAgainstRevisionId: OpaqueId;
  groups: ProposalChangeGroup[];
  summary: SemanticDiffSummary;
  diagnostics: Diagnostic[];
  supersedes?: SupersededGroupMapping[];
};
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentFragment".
 */
export type DocumentFragment = BlockDocumentFragment | InlineDocumentFragment;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ReplaceTextOperation".
 */
export type ReplaceTextOperation = {
  [k: string]: unknown | undefined;
} & {
  id: OpaqueId;
  type: 'replace-text';
  textNodeId: OpaqueId;
  startUtf16Offset: Utf16Offset;
  endUtf16Offset: Utf16Offset;
  replacement: string;
};
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicEntity".
 */
export type AcademicEntity = ReferenceSnapshot | EvidenceLink | ClaimEntity;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CanonicalSegment".
 */
export type CanonicalSegment = string;
/**
 * Canonical logical URI: lowercase scheme and host; no userinfo, query, fragment, or port; at least two non-empty path segments; no trailing slash. Path case is preserved.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "LogicalResourceUri".
 */
export type LogicalResourceUri = string;
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionMetadata".
 */
export type TransactionMetadata = {
  [k: string]: unknown | undefined;
} & {
  source: 'human-input' | 'command' | 'import' | 'migration' | 'validator-fix' | 'proposal-accept';
  undoGroupId?: OpaqueId;
  proposalId?: OpaqueId;
  proposalRevision?: number;
  cometTaskId?: OpaqueId;
  toolInvocationIds?: OpaqueId[];
  idempotencyKey?: string;
};

/**
 * Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.
 */
export interface IntegrationSchemaTypes {
  contractValue?: CometIntegrationHandshakeRequest;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "HumanActorRef".
 */
export interface HumanActorRef {
  type: 'human';
  id: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CometAgentActorRef".
 */
export interface CometAgentActorRef {
  type: 'comet-agent';
  id: OpaqueId;
  workflowId: string;
  modelRef?: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProductControllerActorRef".
 */
export interface ProductControllerActorRef {
  type: 'product-controller';
  id: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SystemActorRef".
 */
export interface SystemActorRef {
  type: 'system';
  id: OpaqueId;
  role: 'importer' | 'migration' | 'validator' | 'recovery';
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "Diagnostic".
 */
export interface Diagnostic {
  id: OpaqueId;
  source: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  target?: SemanticTargetRef;
  basedOnRevisionId: OpaqueId;
  stale: boolean;
  related?: DiagnosticRelatedInformation[];
  suggestedFix?: ProposedFix;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeTargetRef".
 */
export interface NodeTargetRef {
  kind: 'node';
  document: DocumentRef;
  nodeId: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRef".
 */
export interface DocumentRef {
  uri: DocumentUri;
  revisionId: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityTargetRef".
 */
export interface EntityTargetRef {
  kind: 'academic-entity';
  document: DocumentRef;
  entityId: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "RangeTargetRef".
 */
export interface RangeTargetRef {
  kind: 'range';
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TextPosition".
 */
export interface TextPosition {
  kind: 'text';
  textNodeId: OpaqueId;
  utf16Offset: Utf16Offset;
  affinity: Affinity;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeBoundaryPosition".
 */
export interface NodeBoundaryPosition {
  kind: 'node-boundary';
  parentNodeId: OpaqueId;
  childIndex: number;
  affinity: Affinity;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "MetadataTargetRef".
 */
export interface MetadataTargetRef {
  kind: 'metadata';
  document: DocumentRef;
  field: 'title' | 'authors' | 'abstract' | 'keywords';
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DiagnosticRelatedInformation".
 */
export interface DiagnosticRelatedInformation {
  message: string;
  target: SemanticTargetRef;
}
/**
 * A non-committing draft suggestion. Applying it still requires the normal Proposal or trusted Transaction validation path.
 *
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedFix".
 */
export interface ProposedFix {
  kind: 'proposal-draft' | 'transaction-draft';
  description: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CometDocumentScope".
 */
export interface CometDocumentScope {
  allowedSectionIds?: OpaqueId[];
  allowedNodeIds?: OpaqueId[];
  allowReadOutsideScopeForContext?: boolean;
  maxContextDistance?: number;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "OpenCometSessionResult".
 */
export interface OpenCometSessionResult {
  contractVersion: '0.4-preview.1';
  sessionId: OpaqueId;
  target: DocumentRef;
  grantedCapabilities: IntegrationCapability[];
  scope: CometDocumentScope;
  constraints: CometIntegrationConstraints;
  limits: ContractLimits;
  capabilityGrantId: OpaqueId;
  expiresAt: Rfc3339Timestamp;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "GetSnapshotRequest".
 */
export interface GetSnapshotRequest {
  sessionId: OpaqueId;
  document: DocumentRef;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "GetSnapshotResult".
 */
export interface GetSnapshotResult {
  document: DocumentRef;
  snapshot: DocumentSnapshot;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSnapshot".
 */
export interface DocumentSnapshot {
  format: 'nireco-document';
  formatVersion: '1.0.0-preview.1';
  schemaId: 'nireco.manuscript';
  schemaVersion: '1.0.0-preview.1';
  revisionId: OpaqueId;
  documentHash: ContentHash;
  metadata: ManuscriptMetadata;
  root: ManuscriptNode;
  academicGraph: AcademicGraphSnapshot;
  settings: DocumentSemanticSettings;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ManuscriptAuthor".
 */
export interface ManuscriptAuthor {
  id?: OpaqueId;
  name: string;
  given?: string;
  family?: string;
  orcid?: string;
  affiliations?: string[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ManuscriptNode".
 */
export interface ManuscriptNode {
  id: OpaqueId;
  type: 'manuscript';
  attrs: EmptyAttributes;
  children:
    | [BodyNode]
    | [FrontMatterNode, BodyNode]
    | [BodyNode, BibliographyPlaceholderNode]
    | [FrontMatterNode, BodyNode, BibliographyPlaceholderNode];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "EmptyAttributes".
 */
export interface EmptyAttributes {}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "BodyNode".
 */
export interface BodyNode {
  id: OpaqueId;
  type: 'body';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [BlockNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SectionNode".
 */
export interface SectionNode {
  id: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "HeadingNode".
 */
export interface HeadingNode {
  id: OpaqueId;
  type: 'heading';
  attrs: {
    level: number;
  };
  children: InlineNode[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TextNode".
 */
export interface TextNode {
  id: OpaqueId;
  type: 'text';
  value: string;
  marks: Mark[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SimpleMark".
 */
export interface SimpleMark {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'subscript' | 'superscript';
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "LinkMark".
 */
export interface LinkMark {
  type: 'link';
  href: ResourceUri;
  title?: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationNode".
 */
export interface CitationNode {
  id: OpaqueId;
  type: 'citation';
  attrs: {
    citationId: OpaqueId;
    referenceId: OpaqueId;
    locator?: CitationLocator;
    prefix?: string;
    suffix?: string;
  };
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationLocator".
 */
export interface CitationLocator {
  label: 'page' | 'chapter' | 'section' | 'paragraph' | 'figure' | 'table' | 'timestamp' | 'record';
  value: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CrossReferenceNode".
 */
export interface CrossReferenceNode {
  id: OpaqueId;
  type: 'crossReference';
  attrs: {
    targetEntityId: OpaqueId;
    label?: string;
  };
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "InlineEquationNode".
 */
export interface InlineEquationNode {
  id: OpaqueId;
  type: 'inlineEquation';
  attrs: {
    source: string;
  };
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteReferenceNode".
 */
export interface FootnoteReferenceNode {
  id: OpaqueId;
  type: 'footnoteReference';
  attrs: {
    footnoteNodeId: OpaqueId;
  };
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "HardBreakNode".
 */
export interface HardBreakNode {
  id: OpaqueId;
  type: 'hardBreak';
  attrs: EmptyAttributes;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ParagraphNode".
 */
export interface ParagraphNode {
  id: OpaqueId;
  type: 'paragraph';
  attrs: {
    alignment: 'start' | 'center' | 'end' | 'justify';
  };
  children: InlineNode[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureNode".
 */
export interface FigureNode {
  id: OpaqueId;
  type: 'figure';
  attrs: {
    entityId?: OpaqueId;
    label?: string;
  };
  children: [FigureAssetNode] | [FigureAssetNode, FigureCaptionNode];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureAssetNode".
 */
export interface FigureAssetNode {
  id: OpaqueId;
  type: 'figureAsset';
  attrs: {
    uri: ResourceUri;
    contentHash: ContentHash;
    altText: string;
  };
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureCaptionNode".
 */
export interface FigureCaptionNode {
  id: OpaqueId;
  type: 'figureCaption';
  attrs: EmptyAttributes;
  children: InlineNode[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TableNode".
 */
export interface TableNode {
  id: OpaqueId;
  type: 'table';
  attrs: {
    entityId?: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TableCaptionNode".
 */
export interface TableCaptionNode {
  id: OpaqueId;
  type: 'tableCaption';
  attrs: EmptyAttributes;
  children: InlineNode[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TableRowNode".
 */
export interface TableRowNode {
  id: OpaqueId;
  type: 'tableRow';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [TableCellNode, ...TableCellNode[]];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TableCellNode".
 */
export interface TableCellNode {
  id: OpaqueId;
  type: 'tableCell';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [ParagraphNode, ...LimitedCellBlockNode[]];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "BlockQuoteNode".
 */
export interface BlockQuoteNode {
  id: OpaqueId;
  type: 'blockQuote';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [BlockNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CodeBlockNode".
 */
export interface CodeBlockNode {
  id: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ListNode".
 */
export interface ListNode {
  id: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ListItemNode".
 */
export interface ListItemNode {
  id: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DisplayEquationNode".
 */
export interface DisplayEquationNode {
  id: OpaqueId;
  type: 'displayEquation';
  attrs: {
    source: string;
    label?: string;
    entityId?: OpaqueId;
  };
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "HorizontalRuleNode".
 */
export interface HorizontalRuleNode {
  id: OpaqueId;
  type: 'horizontalRule';
  attrs: EmptyAttributes;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteNode".
 */
export interface FootnoteNode {
  id: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "FrontMatterNode".
 */
export interface FrontMatterNode {
  id: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "BibliographyPlaceholderNode".
 */
export interface BibliographyPlaceholderNode {
  id: OpaqueId;
  type: 'bibliographyPlaceholder';
  attrs: {
    heading: string;
  };
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicGraphSnapshot".
 */
export interface AcademicGraphSnapshot {
  referenceSnapshots: ReferenceSnapshot[];
  evidenceLinks: EvidenceLink[];
  claims: ClaimEntity[];
  claimEvidenceRelations: ClaimEvidenceRelation[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ReferenceSnapshot".
 */
export interface ReferenceSnapshot {
  id: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceLink".
 */
export interface EvidenceLink {
  id: OpaqueId;
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "PageEvidenceLocator".
 */
export interface PageEvidenceLocator {
  kind: 'page';
  page: number;
  pageLabel?: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SectionEvidenceLocator".
 */
export interface SectionEvidenceLocator {
  kind: 'section';
  section: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TextQuoteEvidenceLocator".
 */
export interface TextQuoteEvidenceLocator {
  kind: 'text-quote';
  exact: string;
  prefix?: string;
  suffix?: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TimeEvidenceLocator".
 */
export interface TimeEvidenceLocator {
  kind: 'time';
  startSeconds: number;
  endSeconds?: number;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "RecordEvidenceLocator".
 */
export interface RecordEvidenceLocator {
  kind: 'record';
  recordKey: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ClaimEntity".
 */
export interface ClaimEntity {
  id: OpaqueId;
  anchor: PersistentAnchor;
  textSnapshot: string;
  textHash: ContentHash;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "PersistentAnchor".
 */
export interface PersistentAnchor {
  document: DocumentRef;
  primary: SemanticPosition;
  targetNodeId?: OpaqueId;
  textQuote?: TextQuote;
  pathHint?: OpaqueId[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "TextQuote".
 */
export interface TextQuote {
  exact: string;
  prefix?: string;
  suffix?: string;
  normalizedHash?: ContentHash;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ClaimEvidenceRelation".
 */
export interface ClaimEvidenceRelation {
  claimId: OpaqueId;
  evidenceId: OpaqueId;
  relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only' | 'unclear';
  assessedBy: ActorRef;
  confidence?: number;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSemanticSettings".
 */
export interface DocumentSemanticSettings {
  language: string;
  citationStyle: string;
  headingNumbering: boolean;
  bibliographyEnabled: boolean;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CreateProposalRequest".
 */
export interface CreateProposalRequest {
  sessionId: OpaqueId;
  target: DocumentRef;
  idempotencyKey: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CreateProposalResult".
 */
export interface CreateProposalResult {
  proposal: Proposal;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertionTarget".
 */
export interface InsertionTarget {
  parentNodeId: OpaqueId;
  afterNodeId?: OpaqueId;
  beforeNodeId?: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedText".
 */
export interface ProposedText {
  clientRef: ClientRef;
  type: 'text';
  value: string;
  marks: Mark[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedHardBreak".
 */
export interface ProposedHardBreak {
  clientRef: ClientRef;
  type: 'hardBreak';
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedInlineEquation".
 */
export interface ProposedInlineEquation {
  clientRef: ClientRef;
  type: 'inlineEquation';
  source: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedCrossReference".
 */
export interface ProposedCrossReference {
  clientRef: ClientRef;
  type: 'crossReference';
  targetEntityId: OpaqueId;
  label?: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeExistsPrecondition".
 */
export interface NodeExistsPrecondition {
  kind: 'node-exists';
  nodeId: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeHashPrecondition".
 */
export interface NodeHashPrecondition {
  kind: 'node-hash';
  nodeId: OpaqueId;
  expected: ContentHash;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityExistsPrecondition".
 */
export interface EntityExistsPrecondition {
  kind: 'entity-exists';
  entityId: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SchemaVersionPrecondition".
 */
export interface SchemaVersionPrecondition {
  kind: 'schema-version';
  expected: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentHashPrecondition".
 */
export interface DocumentHashPrecondition {
  kind: 'document-hash';
  expected: ContentHash;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "MoveBlockEdit".
 */
export interface MoveBlockEdit {
  kind: 'move-block';
  targetNodeId: OpaqueId;
  target: InsertionTarget;
  rationale: string;
  preconditions?: SemanticPrecondition[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DeleteBlockEdit".
 */
export interface DeleteBlockEdit {
  kind: 'delete-block';
  targetNodeId: OpaqueId;
  expectedContentHash: ContentHash;
  rationale: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertCitationEdit".
 */
export interface InsertCitationEdit {
  kind: 'insert-citation';
  clientRef: ClientRef;
  target: SemanticPosition;
  claimId?: OpaqueId;
  referenceId: OpaqueId;
  evidenceIds: OpaqueId[];
  relation: CitationRelation;
  locator?: CitationLocator;
  prefix?: string;
  suffix?: string;
  rationale: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ReplaceCitationEdit".
 */
export interface ReplaceCitationEdit {
  kind: 'replace-citation';
  targetCitationNodeId: OpaqueId;
  expectedReferenceId: OpaqueId;
  referenceId: OpaqueId;
  evidenceIds: OpaqueId[];
  relation: CitationRelation;
  locator?: CitationLocator;
  prefix?: string;
  suffix?: string;
  rationale: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "LinkClaimEvidenceEdit".
 */
export interface LinkClaimEvidenceEdit {
  kind: 'link-claim-evidence';
  claimId: OpaqueId;
  evidenceId: OpaqueId;
  relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only' | 'unclear';
  assessedBy: ActorRef;
  confidence?: number;
  rationale: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "UpdateMetadataEdit".
 */
export interface UpdateMetadataEdit {
  kind: 'update-metadata';
  patch: MetadataPatch;
  rationale: string;
  preconditions?: SemanticPrecondition[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroup".
 */
export interface ProposalChangeGroup {
  id: OpaqueId;
  kind: ProposalChangeGroupKind;
  /**
   * @minItems 1
   */
  targetRefs: [SemanticTargetRef, ...SemanticTargetRef[]];
  /**
   * @minItems 1
   */
  operationIds: [OpaqueId, ...OpaqueId[]];
  dependsOn: OpaqueId[];
  before?: DocumentFragment;
  after?: DocumentFragment;
  citationChanges: CitationChange[];
  evidenceChanges: EvidenceChange[];
  rationale?: string;
  warnings: Diagnostic[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "BlockDocumentFragment".
 */
export interface BlockDocumentFragment {
  kind: 'block';
  nodes: BlockNode[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "InlineDocumentFragment".
 */
export interface InlineDocumentFragment {
  kind: 'inline';
  nodes: InlineNode[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationChange".
 */
export interface CitationChange {
  kind: 'added' | 'removed' | 'replaced';
  citationNodeId?: OpaqueId;
  beforeReferenceId?: OpaqueId;
  afterReferenceId?: OpaqueId;
  evidenceIds?: OpaqueId[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceChange".
 */
export interface EvidenceChange {
  kind: 'added' | 'removed' | 'verification-changed' | 'relation-changed' | 'stale';
  evidenceId: OpaqueId;
  claimId?: OpaqueId;
  beforeStatus?: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
  afterStatus?: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SupersededGroupMapping".
 */
export interface SupersededGroupMapping {
  previousGroupId: OpaqueId;
  currentGroupIds: OpaqueId[];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalProvenance".
 */
export interface ProposalProvenance {
  taskId: OpaqueId;
  traceId: OpaqueId;
  sessionId: OpaqueId;
  capabilityGrantId: OpaqueId;
  workflowId: string;
  modelRef?: string;
  toolInvocationIds: OpaqueId[];
  idempotencyKey?: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "StageSemanticEditsRequest".
 */
export interface StageSemanticEditsRequest {
  sessionId: OpaqueId;
  proposal: ProposalRef;
  /**
   * @minItems 1
   */
  semanticEdits: [SemanticEdit, ...SemanticEdit[]];
  idempotencyKey: string;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalRef".
 */
export interface ProposalRef {
  proposalId: OpaqueId;
  expectedProposalRevision: number;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "StageSemanticEditsResult".
 */
export interface StageSemanticEditsResult {
  proposal: Proposal;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertNodeOperation".
 */
export interface InsertNodeOperation {
  id: OpaqueId;
  type: 'insert-node';
  parentNodeId: OpaqueId;
  childIndex: number;
  node: InsertableNode;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DeleteNodeOperation".
 */
export interface DeleteNodeOperation {
  id: OpaqueId;
  type: 'delete-node';
  targetNodeId: OpaqueId;
  expectedNodeHash: ContentHash;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "MoveNodeOperation".
 */
export interface MoveNodeOperation {
  id: OpaqueId;
  type: 'move-node';
  targetNodeId: OpaqueId;
  newParentNodeId: OpaqueId;
  childIndex: number;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SetNodeAttributesOperation".
 */
export interface SetNodeAttributesOperation {
  id: OpaqueId;
  type: 'set-node-attributes';
  nodeId: OpaqueId;
  /**
   * Intentional open exception at the typed operation boundary; the target node schema validates the resulting attributes.
   */
  attributes: {
    [k: string]: JsonValue;
  };
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "AddMarkOperation".
 */
export interface AddMarkOperation {
  id: OpaqueId;
  type: 'add-mark';
  textNodeId: OpaqueId;
  startUtf16Offset: Utf16Offset;
  endUtf16Offset: Utf16Offset;
  mark: Mark;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "RemoveMarkOperation".
 */
export interface RemoveMarkOperation {
  id: OpaqueId;
  type: 'remove-mark';
  textNodeId: OpaqueId;
  startUtf16Offset: Utf16Offset;
  endUtf16Offset: Utf16Offset;
  mark: Mark;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "CreateAcademicEntityOperation".
 */
export interface CreateAcademicEntityOperation {
  id: OpaqueId;
  type: 'create-academic-entity';
  entity: AcademicEntity;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "UpdateAcademicEntityOperation".
 */
export interface UpdateAcademicEntityOperation {
  id: OpaqueId;
  type: 'update-academic-entity';
  entityId: OpaqueId;
  /**
   * @minItems 1
   */
  patch: [EntityPatch, ...EntityPatch[]];
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityPatch".
 */
export interface EntityPatch {
  field: string;
  value: JsonValue;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DeleteAcademicEntityOperation".
 */
export interface DeleteAcademicEntityOperation {
  id: OpaqueId;
  type: 'delete-academic-entity';
  entityId: OpaqueId;
  expectedEntityHash: ContentHash;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "LinkAcademicEntitiesOperation".
 */
export interface LinkAcademicEntitiesOperation {
  id: OpaqueId;
  type: 'link-academic-entities';
  fromEntityId: OpaqueId;
  toEntityId: OpaqueId;
  relation: AcademicRelationKind;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "UnlinkAcademicEntitiesOperation".
 */
export interface UnlinkAcademicEntitiesOperation {
  id: OpaqueId;
  type: 'unlink-academic-entities';
  fromEntityId: OpaqueId;
  toEntityId: OpaqueId;
  relation: AcademicRelationKind;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticRange".
 */
export interface SemanticRange {
  anchor: SemanticPosition;
  focus: SemanticPosition;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeRef".
 */
export interface NodeRef {
  document: DocumentRef;
  nodeId: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicEntityRef".
 */
export interface AcademicEntityRef {
  document: DocumentRef;
  entityId: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRangeRef".
 */
export interface DocumentRangeRef {
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceRef".
 */
export interface ResourceRef {
  uri: ResourceUri;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "MutableDocumentTarget".
 */
export interface MutableDocumentTarget {
  uri: DocumentUri;
  baseRevisionId: OpaqueId;
}
/**
 * This interface was referenced by `IntegrationSchemaTypes`'s JSON-Schema
 * via the `definition` "Transaction".
 */
export interface Transaction {
  id: OpaqueId;
  target: MutableDocumentTarget;
  actor: ActorRef;
  intent?: string;
  /**
   * @minItems 1
   */
  operations: [Operation, ...Operation[]];
  preconditions: SemanticPrecondition[];
  metadata: TransactionMetadata;
  createdAt: Rfc3339Timestamp;
}
