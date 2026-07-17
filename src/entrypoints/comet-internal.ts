export { MockCometIntegrationService } from '../integration/comet/mock-service.js';
export { Preview2ReadWireAdapter } from '../integration/comet/preview2-read-wire-adapter.js';
export {
  COMET_CONTRACT_VERSION,
  CURRENT_COMET_CONTRACT_VERSION,
  GATE_1_READ_HARD_LIMITS,
  GATE_1_READ_SERVICES,
  INTEGRATION_CAPABILITIES,
  MOCK_SUPPORTED_CAPABILITIES,
  MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS,
  PREVIOUS_COMET_CONTRACT_VERSION,
  TRANSPORT_FEATURES,
} from '../integration/comet/contract-types.js';

export type {
  CometDocumentScope,
  CometIntegrationConstraints,
  CometIntegrationHandshakeRequest,
  CometIntegrationHandshakeResult,
  ContractLimits,
  Gate1ReadService,
  IntegrationCapability,
  OpenCometSessionRequest,
  OpenCometSessionResult,
  TransportFeature,
} from '../integration/comet/contract-types.js';
export type { MockCometIntegrationServiceOptions } from '../integration/comet/mock-service.js';
export type {
  Preview2GetDocumentChangesSinceWireResult,
  Preview2GetDocumentDiagnosticsWireResult,
  Preview2GetDocumentHeadWireResult,
  Preview2GetDocumentOutlineWireResult,
  Preview2GetDocumentSnapshotWireResult,
  Preview2ReadDocumentNodeNeighborhoodWireResult,
  Preview2ReadDocumentNodesWireResult,
  Preview2ReadWireAdapterOptions,
  Preview2ResolveModelWireResult,
  Preview2SearchDocumentWireResult,
} from '../integration/comet/preview2-read-wire-adapter.js';
export type {
  CreateProposalRequest,
  CreateProposalResult,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Preview.1 compatibility surface.
  GetSnapshotRequest,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Preview.1 compatibility surface.
  GetSnapshotResult,
  StageSemanticEditsRequest,
  StageSemanticEditsResult,
} from '../integration/comet/contract-types.js';
