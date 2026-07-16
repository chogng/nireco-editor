import type { NodeId, SessionId } from '../../base/ids/identifiers.js';
import type { IsoTimestamp } from '../../base/time/clock.js';
import type { ActorRef } from '../../model/actor.js';
import type { DocumentRef } from '../../model/resource-ref.js';
import type {
  DOCUMENT_FORMAT_VERSION,
  MANUSCRIPT_SCHEMA_VERSION,
  DocumentSnapshot,
} from '../../model/snapshot.js';
import type { Proposal, ProposalRef } from '../../proposal/proposal.js';
import type { SemanticEdit, SemanticEditKind } from '../../proposal/semantic-edit.js';

export const COMET_CONTRACT_VERSION = '0.4-preview.1';

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

export interface GetSnapshotRequest {
  readonly sessionId: SessionId;
  readonly document: DocumentRef;
}

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
