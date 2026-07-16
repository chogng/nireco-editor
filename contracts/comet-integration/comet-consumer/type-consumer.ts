import {
  COMET_CONTRACT_VERSION,
  type CometIntegrationHandshakeRequest as PublicHandshakeRequest,
  type CreateProposalRequest as PublicCreateProposalRequest,
  type GetSnapshotRequest as PublicGetSnapshotRequest,
  type OpenCometSessionRequest as PublicOpenSessionRequest,
  type StageSemanticEditsRequest as PublicStageSemanticEditsRequest,
} from '@comet-internal/nireco-editor/comet-internal';
import { canonicalizeResourceUri, isDocumentUri } from '@comet-internal/nireco-editor';
import type {
  NodeId,
  ProposalId,
  RevisionId,
  SessionId,
} from '@comet-internal/nireco-editor/protocol';
import type {
  CometIntegrationHandshakeRequest as GeneratedHandshakeRequest,
  CreateProposalRequest as GeneratedCreateProposalRequest,
  CreateProposalResult as GeneratedCreateProposalResult,
  GetSnapshotRequest as GeneratedGetSnapshotRequest,
  GetSnapshotResult as GeneratedGetSnapshotResult,
  OpenCometSessionRequest as GeneratedOpenSessionRequest,
  OpenCometSessionResult as GeneratedOpenSessionResult,
  StageSemanticEditsRequest as GeneratedStageSemanticEditsRequest,
  StageSemanticEditsResult as GeneratedStageSemanticEditsResult,
} from '@comet-internal/nireco-editor/contract-types/integration';

const uriResult = canonicalizeResourceUri('nireco://workspace-01/document/generated-consumer');
if (uriResult.type !== 'valid' || !isDocumentUri(uriResult.value)) {
  throw new Error('The generated-type consumer requires a canonical document URI.');
}

const document = {
  uri: uriResult.value,
  revisionId: '018f0000-0000-7000-8000-000000000001' as RevisionId,
};

export const generatedHandshakeRequest = {
  requestedContractVersion: COMET_CONTRACT_VERSION,
  cometBuildId: 'comet-generated-consumer',
  adapterVersion: 'generated-consumer-1',
  workflowId: 'workflow-generated-consumer',
  requiredCapabilities: ['document.content.read', 'proposal.create', 'proposal.edit'],
  requiredSemanticEdits: ['insert-block'],
  requiredTransportFeatures: ['in-process', 'idempotency'],
} satisfies GeneratedHandshakeRequest;

export const publicHandshakeRequest: PublicHandshakeRequest = generatedHandshakeRequest;

export const generatedOpenSessionRequest = {
  contractVersion: COMET_CONTRACT_VERSION,
  target: document,
  taskId: 'task-generated-consumer',
  traceId: 'trace-generated-consumer',
  actor: {
    type: 'comet-agent',
    id: 'agent-generated-consumer',
    workflowId: 'workflow-generated-consumer',
  },
  requestedCapabilities: ['document.content.read', 'proposal.create', 'proposal.edit'],
  scope: {},
  constraints: {
    requireEvidenceForCitation: true,
    requireVerifiedEvidence: true,
    allowMetadataOnlyCitation: false,
    allowDelete: false,
    allowStructureMove: false,
  },
  policySnapshotId: 'policy-generated-consumer',
} satisfies GeneratedOpenSessionRequest;

export const publicOpenSessionRequest: PublicOpenSessionRequest = generatedOpenSessionRequest;

export const generatedSnapshotRequest = {
  sessionId: '018f0000-0000-7000-8000-000000700001' as SessionId,
  document,
} satisfies GeneratedGetSnapshotRequest;

export const publicSnapshotRequest: PublicGetSnapshotRequest = generatedSnapshotRequest;

export const generatedCreateProposalRequest = {
  sessionId: generatedSnapshotRequest.sessionId,
  target: document,
  idempotencyKey: 'create-generated-consumer',
} satisfies GeneratedCreateProposalRequest;

export const publicCreateProposalRequest: PublicCreateProposalRequest =
  generatedCreateProposalRequest;

export const generatedStageSemanticEditsRequest = {
  sessionId: generatedSnapshotRequest.sessionId,
  proposal: {
    proposalId: '018f0000-0000-7000-8000-000000500001' as ProposalId,
    expectedProposalRevision: 1,
  },
  semanticEdits: [
    {
      kind: 'insert-block',
      clientRef: 'edit-generated-consumer',
      target: {
        parentNodeId: '018f0000-0000-7000-8000-000000000103' as NodeId,
        afterNodeId: '018f0000-0000-7000-8000-000000000104' as NodeId,
      },
      block: {
        clientRef: 'paragraph-generated-consumer',
        type: 'paragraph',
        attrs: {
          alignment: 'start',
        },
        children: [
          {
            clientRef: 'text-generated-consumer',
            type: 'text',
            value: 'Generated declaration consumer.',
            marks: [],
          },
        ],
      },
      rationale: 'Compile generated request types against the public Mock entrypoint.',
    },
  ],
  idempotencyKey: 'stage-generated-consumer',
} satisfies GeneratedStageSemanticEditsRequest;

export const publicStageSemanticEditsRequest: PublicStageSemanticEditsRequest =
  generatedStageSemanticEditsRequest;

export interface GeneratedResultEvidence {
  readonly openSession: GeneratedOpenSessionResult;
  readonly snapshot: GeneratedGetSnapshotResult;
  readonly createProposal: GeneratedCreateProposalResult;
  readonly stageSemanticEdits: GeneratedStageSemanticEditsResult;
}
