/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: contracts/comet-integration/schemas/common.schema.json
 * Generator: json-schema-to-typescript
 * Generator version: 15.0.4
 * Source SHA-256: 42dd511c0b6ad3b8db4d5fea5aa9283cf574579e1db8ac95980c590305e023fc
 */

/**
 * External or integration-owned opaque identity. Nireco-allocated production identities use AllocatedId instead.
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "OpaqueId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "RequestId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "TaskId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ToolInvocationId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "CapabilityGrantId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "PolicySnapshotId".
 */
export type OpaqueId = string;
/**
 * Canonical lowercase RFC 9562 UUIDv7 allocated by a trusted Nireco boundary before reducer entry.
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "AllocatedId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "WorkspaceId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "OperationId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "SessionId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "DebugId".
 */
export type AllocatedId = string;
/**
 * Canonical lowercase RFC 9562 UUIDv8 deterministically derived from a frozen domain-separated SHA-256 preimage.
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "DerivedId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupId".
 */
export type DerivedId = string;
/**
 * Untrusted, request-local correlation key. It is never a trusted Nireco identity.
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ClientRef".
 */
export type ClientRef = string;
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ContentHash".
 */
export type ContentHash = string;
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonArray".
 */
export type JsonArray = JsonValue[];
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "Rfc3339Timestamp".
 */
export type Rfc3339Timestamp = string;
/**
 * Offset measured in UTF-16 code units. A service must additionally reject a value inside a surrogate pair.
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "Utf16Offset".
 */
export type Utf16Offset = number;
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ActorRef".
 */
export type ActorRef =
  HumanActorRef | CometAgentActorRef | ProductControllerActorRef | SystemActorRef;

/**
 * Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.
 */
export interface CommonSchemaTypes {}
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "GovernanceManifestHashPayload".
 */
export interface GovernanceManifestHashPayload {
  engineeringStandardVersion: string;
  files: GovernanceManifestFileHash[];
}
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "GovernanceManifestFileHash".
 */
export interface GovernanceManifestFileHash {
  path: string;
  rawSha256: ContentHash;
}
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "HumanActorRef".
 */
export interface HumanActorRef {
  type: 'human';
  id: OpaqueId;
}
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "CometAgentActorRef".
 */
export interface CometAgentActorRef {
  type: 'comet-agent';
  id: OpaqueId;
  workflowId: string;
  modelRef?: string;
}
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ProductControllerActorRef".
 */
export interface ProductControllerActorRef {
  type: 'product-controller';
  id: OpaqueId;
}
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "SystemActorRef".
 */
export interface SystemActorRef {
  type: 'system';
  id: OpaqueId;
  role: 'importer' | 'migration' | 'validator' | 'recovery';
}
