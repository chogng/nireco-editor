export { NIRECO_ERROR_CODES } from '../base/errors/nireco-error.js';
export type {
  ContentHash,
  EntityId,
  NodeId,
  OperationId,
  ProposalChangeGroupId,
  ProposalId,
  RevisionId,
  SessionId,
  TransactionId,
  Utf16Offset,
  WorkspaceId,
} from '../base/ids/identifiers.js';
export {
  HASH_DOMAINS,
  HASH_PREIMAGE_PROFILE,
  createCanonicalHashPreimage,
  hashCanonicalJson,
} from '../base/hashing/hash-preimage.js';
export { PortableSha256ContentHasher } from '../base/hashing/portable-sha-256.js';
export {
  parseDebugId,
  parseEntityId,
  parseNodeId,
  parseOperationId,
  parseProposalChangeGroupId,
  parseProposalId,
  parseRevisionId,
  parseSessionId,
  parseTransactionId,
  parseWorkspaceId,
} from '../base/ids/identifiers.js';
export {
  UuidV7AllocationError,
  UuidV7IdAllocator,
  createUuidV7,
} from '../base/ids/uuid-v7-allocator.js';
export type {
  CometResourceUri,
  DocumentUri,
  ResourceUri,
  ResourceUriParseResult,
} from '../base/uri/resource-uri.js';
export type { ActorRef } from '../model/actor.js';
export type {
  AcademicGraphSnapshot,
  CitationLocator,
  ClaimEntity,
  ClaimEvidenceRelation,
  EvidenceLink,
  ReferenceSnapshot,
} from '../model/academic-graph.js';
export type { Diagnostic } from '../model/diagnostic.js';
export type { Operation } from '../model/operation/operation.js';
export type {
  PersistentAnchor,
  SemanticPosition,
  SemanticRange,
} from '../model/position/semantic-position.js';
export type {
  DocumentRef,
  MutableDocumentTarget,
  ResourceRef,
  SemanticTargetRef,
} from '../model/resource-ref.js';
export type { DocumentContent, DocumentSnapshot } from '../model/snapshot.js';
export {
  DOCUMENT_FORMAT,
  DOCUMENT_FORMAT_VERSION,
  MANUSCRIPT_SCHEMA_ID,
  MANUSCRIPT_SCHEMA_VERSION,
} from '../model/snapshot.js';
export type { Transaction, TransactionPrecondition } from '../model/transaction/transaction.js';
export type { Proposal, ProposalRef, ProposalStatus } from '../proposal/proposal.js';
export {
  SEMANTIC_DIFF_ALGORITHM_VERSION,
  computeProposalGroupDependencyClosure,
} from '../proposal/semantic-diff.js';
export type { ProposalChangeGroup, SemanticDiff } from '../proposal/semantic-diff.js';
export {
  canonicalizeProposalChangeGroupOrder,
  deriveProposalChangeGroupId,
  deriveSupersedesMappings,
} from '../proposal/identity/change-group-identity.js';
export type { SemanticEdit, SemanticEditKind } from '../proposal/semantic-edit.js';
export { SEMANTIC_EDIT_KINDS } from '../proposal/semantic-edit.js';
