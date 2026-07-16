/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: contracts/comet-integration/schemas/revision.schema.json
 * Generator: json-schema-to-typescript
 * Generator version: 15.0.4
 * Source SHA-256: 73f17223b1871e873d281e29b3cfd86a89d4b4135ea2dad4dcde42445084dda7
 */

/**
 * Opaque identity. The preview contract intentionally does not freeze a UUID representation.
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "OpaqueId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "WorkspaceId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "SessionId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "DebugId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "RequestId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "TaskId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ToolInvocationId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "CapabilityGrantId".
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "PolicySnapshotId".
 */
export type OpaqueId = string;
/**
 * Canonical Nireco document URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentUri".
 */
export type DocumentUri = string;
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ContentHash".
 */
export type ContentHash = string;
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ActorRef".
 */
export type ActorRef =
  HumanActorRef | CometAgentActorRef | ProductControllerActorRef | SystemActorRef;
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "Rfc3339Timestamp".
 */
export type Rfc3339Timestamp = string;
/**
 * Untrusted, request-local correlation key. It is never a trusted Nireco identity.
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ClientRef".
 */
export type ClientRef = string;
/**
 * Offset measured in UTF-16 code units. A service must additionally reject a value inside a surrogate pair.
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "Utf16Offset".
 */
export type Utf16Offset = number;
/**
 * A JSON value used only at explicitly declared extension or patch boundaries.
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonArray".
 */
export type JsonArray = JsonValue[];
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "CanonicalSegment".
 */
export type CanonicalSegment = string;
/**
 * ASCII-visible canonical wire URI. Raw Unicode is forbidden and must be UTF-8 percent-encoded; percent escapes use uppercase hexadecimal. Nireco and Comet logical URIs are further constrained by LogicalResourceUri.
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceUri".
 */
export type ResourceUri = string;
/**
 * Canonical logical URI: lowercase scheme and host; no userinfo, query, fragment, or port; at least two non-empty path segments; no trailing slash. Path case is preserved.
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "LogicalResourceUri".
 */
export type LogicalResourceUri = string;
/**
 * Canonical Comet-owned logical resource URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "CometResourceUri".
 */
export type CometResourceUri = string;

/**
 * Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.
 */
export interface RevisionSchemaTypes {
  contractValue?: Revision;
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "Revision".
 */
export interface Revision {
  id: OpaqueId;
  uri: DocumentUri;
  parentRevisionId: OpaqueId | null;
  transactionId: OpaqueId;
  sequence: number;
  documentHash: ContentHash;
  actor: ActorRef;
  createdAt: Rfc3339Timestamp;
  durability: 'memory' | 'wal' | 'snapshot';
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "HumanActorRef".
 */
export interface HumanActorRef {
  type: 'human';
  id: OpaqueId;
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "CometAgentActorRef".
 */
export interface CometAgentActorRef {
  type: 'comet-agent';
  id: OpaqueId;
  workflowId: string;
  modelRef?: string;
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ProductControllerActorRef".
 */
export interface ProductControllerActorRef {
  type: 'product-controller';
  id: OpaqueId;
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "SystemActorRef".
 */
export interface SystemActorRef {
  type: 'system';
  id: OpaqueId;
  role: 'importer' | 'migration' | 'validator' | 'recovery';
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceRef".
 */
export interface ResourceRef {
  uri: ResourceUri;
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRef".
 */
export interface DocumentRef {
  uri: DocumentUri;
  revisionId: OpaqueId;
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "MutableDocumentTarget".
 */
export interface MutableDocumentTarget {
  uri: DocumentUri;
  baseRevisionId: OpaqueId;
}
/**
 * This interface was referenced by `RevisionSchemaTypes`'s JSON-Schema
 * via the `definition` "CommitResult".
 */
export interface CommitResult {
  revision: Revision;
  transactionHash: ContentHash;
}
