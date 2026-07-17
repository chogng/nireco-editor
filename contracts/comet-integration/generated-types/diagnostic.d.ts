/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: contracts/comet-integration/schemas/diagnostic.schema.json
 * Generator: json-schema-to-typescript
 * Generator version: 15.0.4
 * Source SHA-256: 6716765646e283adff97699601310bf1e4a5dedac849f56788034eb1cb9a2a56
 */

/**
 * External or integration-owned opaque identity. Nireco-allocated production identities use AllocatedId instead.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "OpaqueId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "RequestId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "TaskId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ToolInvocationId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "CapabilityGrantId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "PolicySnapshotId".
 */
export type OpaqueId = string;
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticTargetRef".
 */
export type SemanticTargetRef =
  NodeTargetRef | EntityTargetRef | RangeTargetRef | MetadataTargetRef;
/**
 * Canonical Nireco document URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentUri".
 */
export type DocumentUri = string;
/**
 * Canonical lowercase RFC 9562 UUIDv7 allocated by a trusted Nireco boundary before reducer entry.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "AllocatedId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "WorkspaceId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "OperationId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "SessionId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "DebugId".
 */
export type AllocatedId = string;
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticPosition".
 */
export type SemanticPosition = TextPosition | NodeBoundaryPosition;
/**
 * Offset measured in UTF-16 code units. A service must additionally reject a value inside a surrogate pair.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "Utf16Offset".
 */
export type Utf16Offset = number;
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "Affinity".
 */
export type Affinity = 'before' | 'after';
/**
 * Canonical lowercase RFC 9562 UUIDv8 deterministically derived from a frozen domain-separated SHA-256 preimage.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "DerivedId".
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupId".
 */
export type DerivedId = string;
/**
 * Untrusted, request-local correlation key. It is never a trusted Nireco identity.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ClientRef".
 */
export type ClientRef = string;
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ContentHash".
 */
export type ContentHash = string;
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonArray".
 */
export type JsonArray = JsonValue[];
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "Rfc3339Timestamp".
 */
export type Rfc3339Timestamp = string;
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ActorRef".
 */
export type ActorRef =
  HumanActorRef | CometAgentActorRef | ProductControllerActorRef | SystemActorRef;
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "CanonicalSegment".
 */
export type CanonicalSegment = string;
/**
 * ASCII-visible canonical wire URI. Raw Unicode is forbidden and must be UTF-8 percent-encoded; percent escapes use uppercase hexadecimal. Nireco and Comet logical URIs are further constrained by LogicalResourceUri.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceUri".
 */
export type ResourceUri = string;
/**
 * Canonical logical URI: lowercase scheme and host; no userinfo, query, fragment, or port; at least two non-empty path segments; no trailing slash. Path case is preserved.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "LogicalResourceUri".
 */
export type LogicalResourceUri = string;
/**
 * Canonical Comet-owned logical resource URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "CometResourceUri".
 */
export type CometResourceUri = string;

/**
 * Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.
 */
export interface DiagnosticSchemaTypes {
  contractValue?: Diagnostic;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeTargetRef".
 */
export interface NodeTargetRef {
  kind: 'node';
  document: DocumentRef;
  nodeId: AllocatedId;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRef".
 */
export interface DocumentRef {
  uri: DocumentUri;
  revisionId: AllocatedId;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityTargetRef".
 */
export interface EntityTargetRef {
  kind: 'academic-entity';
  document: DocumentRef;
  entityId: AllocatedId;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "RangeTargetRef".
 */
export interface RangeTargetRef {
  kind: 'range';
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "TextPosition".
 */
export interface TextPosition {
  kind: 'text';
  textNodeId: AllocatedId;
  utf16Offset: Utf16Offset;
  affinity: Affinity;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeBoundaryPosition".
 */
export interface NodeBoundaryPosition {
  kind: 'node-boundary';
  parentNodeId: AllocatedId;
  childIndex: number;
  affinity: Affinity;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "MetadataTargetRef".
 */
export interface MetadataTargetRef {
  kind: 'metadata';
  document: DocumentRef;
  field: 'title' | 'authors' | 'abstract' | 'keywords';
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "DiagnosticRelatedInformation".
 */
export interface DiagnosticRelatedInformation {
  message: string;
  target: SemanticTargetRef;
}
/**
 * A non-committing draft suggestion. Applying it still requires the normal Proposal or trusted Transaction validation path.
 *
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposedFix".
 */
export interface ProposedFix {
  kind: 'proposal-draft' | 'transaction-draft';
  description: string;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "GovernanceManifestHashPayload".
 */
export interface GovernanceManifestHashPayload {
  engineeringStandardVersion: string;
  files: GovernanceManifestFileHash[];
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "GovernanceManifestFileHash".
 */
export interface GovernanceManifestFileHash {
  path: string;
  rawSha256: ContentHash;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "HumanActorRef".
 */
export interface HumanActorRef {
  type: 'human';
  id: OpaqueId;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "CometAgentActorRef".
 */
export interface CometAgentActorRef {
  type: 'comet-agent';
  id: OpaqueId;
  workflowId: string;
  modelRef?: string;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ProductControllerActorRef".
 */
export interface ProductControllerActorRef {
  type: 'product-controller';
  id: OpaqueId;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "SystemActorRef".
 */
export interface SystemActorRef {
  type: 'system';
  id: OpaqueId;
  role: 'importer' | 'migration' | 'validator' | 'recovery';
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticRange".
 */
export interface SemanticRange {
  anchor: SemanticPosition;
  focus: SemanticPosition;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeRef".
 */
export interface NodeRef {
  document: DocumentRef;
  nodeId: AllocatedId;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicEntityRef".
 */
export interface AcademicEntityRef {
  document: DocumentRef;
  entityId: AllocatedId;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRangeRef".
 */
export interface DocumentRangeRef {
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "TextQuote".
 */
export interface TextQuote {
  exact: string;
  prefix?: string;
  suffix?: string;
  normalizedHash?: ContentHash;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceRef".
 */
export interface ResourceRef {
  uri: ResourceUri;
}
/**
 * This interface was referenced by `DiagnosticSchemaTypes`'s JSON-Schema
 * via the `definition` "MutableDocumentTarget".
 */
export interface MutableDocumentTarget {
  uri: DocumentUri;
  baseRevisionId: AllocatedId;
}
