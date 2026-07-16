export { MockCometIntegrationService } from '../integration/comet/mock-service.js';
export {
  COMET_CONTRACT_VERSION,
  INTEGRATION_CAPABILITIES,
  MOCK_SUPPORTED_CAPABILITIES,
  MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS,
  TRANSPORT_FEATURES,
} from '../integration/comet/contract-types.js';

export type {
  CometDocumentScope,
  CometIntegrationConstraints,
  CometIntegrationHandshakeRequest,
  CometIntegrationHandshakeResult,
  ContractLimits,
  IntegrationCapability,
  OpenCometSessionRequest,
  OpenCometSessionResult,
  TransportFeature,
} from '../integration/comet/contract-types.js';
export type { MockCometIntegrationServiceOptions } from '../integration/comet/mock-service.js';
export type {
  CreateProposalRequest,
  CreateProposalResult,
  GetSnapshotRequest,
  GetSnapshotResult,
  StageSemanticEditsRequest,
  StageSemanticEditsResult,
} from '../integration/comet/contract-types.js';
