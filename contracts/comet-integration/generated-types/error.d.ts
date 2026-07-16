/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: contracts/comet-integration/schemas/error.schema.json
 * Generator: json-schema-to-typescript
 * Generator version: 15.0.4
 * Source SHA-256: 49ecfb4dc9225570b5a6adfe8ad52a4eb3dfbc320be0c312f1bcf06937a92819
 */

/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
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
  | 'STORAGE_CORRUPT'
  | 'INTERNAL_ERROR';
/**
 * Opaque identity. The preview contract intentionally does not freeze a UUID representation.
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "OpaqueId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "WorkspaceId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "SessionId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "DebugId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "RequestId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "TaskId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ToolInvocationId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "CapabilityGrantId".
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "PolicySnapshotId".
 */
export type OpaqueId = string;
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticTargetRef".
 */
export type SemanticTargetRef =
  NodeTargetRef | EntityTargetRef | RangeTargetRef | MetadataTargetRef;
/**
 * Canonical Nireco document URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentUri".
 */
export type DocumentUri = string;
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticPosition".
 */
export type SemanticPosition = TextPosition | NodeBoundaryPosition;
/**
 * Offset measured in UTF-16 code units. A service must additionally reject a value inside a surrogate pair.
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "Utf16Offset".
 */
export type Utf16Offset = number;
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "Affinity".
 */
export type Affinity = 'before' | 'after';
/**
 * Untrusted, request-local correlation key. It is never a trusted Nireco identity.
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ClientRef".
 */
export type ClientRef = string;
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ContentHash".
 */
export type ContentHash = string;
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "Rfc3339Timestamp".
 */
export type Rfc3339Timestamp = string;
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ActorRef".
 */
export type ActorRef =
  HumanActorRef | CometAgentActorRef | ProductControllerActorRef | SystemActorRef;
/**
 * A JSON value used only at explicitly declared extension or patch boundaries.
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonArray".
 */
export type JsonArray = JsonValue[];
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "CanonicalSegment".
 */
export type CanonicalSegment = string;
/**
 * ASCII-visible canonical wire URI. Raw Unicode is forbidden and must be UTF-8 percent-encoded; percent escapes use uppercase hexadecimal. Nireco and Comet logical URIs are further constrained by LogicalResourceUri.
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceUri".
 */
export type ResourceUri = string;
/**
 * Canonical logical URI: lowercase scheme and host; no userinfo, query, fragment, or port; at least two non-empty path segments; no trailing slash. Path case is preserved.
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "LogicalResourceUri".
 */
export type LogicalResourceUri = string;
/**
 * Canonical Comet-owned logical resource URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "CometResourceUri".
 */
export type CometResourceUri = string;

/**
 * Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.
 */
export interface ErrorSchemaTypes {
  contractValue?: NirecoError;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
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
  debugId: OpaqueId;
  currentRevisionId?: OpaqueId;
  requiredCapability?: string;
  conflictingTargets?: SemanticTargetRef[];
  suggestedAction: 'retry' | 'reread' | 'rebase' | 'request-permission' | 'user-review' | 'abort';
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeTargetRef".
 */
export interface NodeTargetRef {
  kind: 'node';
  document: DocumentRef;
  nodeId: OpaqueId;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRef".
 */
export interface DocumentRef {
  uri: DocumentUri;
  revisionId: OpaqueId;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityTargetRef".
 */
export interface EntityTargetRef {
  kind: 'academic-entity';
  document: DocumentRef;
  entityId: OpaqueId;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "RangeTargetRef".
 */
export interface RangeTargetRef {
  kind: 'range';
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "TextPosition".
 */
export interface TextPosition {
  kind: 'text';
  textNodeId: OpaqueId;
  utf16Offset: Utf16Offset;
  affinity: Affinity;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeBoundaryPosition".
 */
export interface NodeBoundaryPosition {
  kind: 'node-boundary';
  parentNodeId: OpaqueId;
  childIndex: number;
  affinity: Affinity;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "MetadataTargetRef".
 */
export interface MetadataTargetRef {
  kind: 'metadata';
  document: DocumentRef;
  field: 'title' | 'authors' | 'abstract' | 'keywords';
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "HumanActorRef".
 */
export interface HumanActorRef {
  type: 'human';
  id: OpaqueId;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "CometAgentActorRef".
 */
export interface CometAgentActorRef {
  type: 'comet-agent';
  id: OpaqueId;
  workflowId: string;
  modelRef?: string;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ProductControllerActorRef".
 */
export interface ProductControllerActorRef {
  type: 'product-controller';
  id: OpaqueId;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "SystemActorRef".
 */
export interface SystemActorRef {
  type: 'system';
  id: OpaqueId;
  role: 'importer' | 'migration' | 'validator' | 'recovery';
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticRange".
 */
export interface SemanticRange {
  anchor: SemanticPosition;
  focus: SemanticPosition;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeRef".
 */
export interface NodeRef {
  document: DocumentRef;
  nodeId: OpaqueId;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicEntityRef".
 */
export interface AcademicEntityRef {
  document: DocumentRef;
  entityId: OpaqueId;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRangeRef".
 */
export interface DocumentRangeRef {
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "TextQuote".
 */
export interface TextQuote {
  exact: string;
  prefix?: string;
  suffix?: string;
  normalizedHash?: ContentHash;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceRef".
 */
export interface ResourceRef {
  uri: ResourceUri;
}
/**
 * This interface was referenced by `ErrorSchemaTypes`'s JSON-Schema
 * via the `definition` "MutableDocumentTarget".
 */
export interface MutableDocumentTarget {
  uri: DocumentUri;
  baseRevisionId: OpaqueId;
}
