/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: contracts/comet-integration/schemas/common.schema.json
 * Generator: json-schema-to-typescript
 * Generator version: 15.0.4
 * Source SHA-256: 9a80e79f0858bde1d300f627669f4227d521a2d3a701c2c9c6bfc6ffd5ba008e
 */

/**
 * Opaque identity. The preview contract intentionally does not freeze a UUID representation.
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "OpaqueId".
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
 * via the `definition` "NodeId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "SessionId".
 *
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "DebugId".
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
 * Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.
 */
export interface CommonSchemaTypes {}
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
/**
 * This interface was referenced by `CommonSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
