import type {
  DebugId,
  EntityId,
  NodeId,
  OperationId,
  ProposalId,
  RevisionId,
  SessionId,
  TransactionId,
  WorkspaceId,
} from '../base/ids/identifiers.js';
import type { AcademicEntityKind } from '../model/academic-graph.js';
import type { NodeKind } from '../model/node/manuscript-node.js';

export interface IIdAllocator {
  allocateWorkspaceId(): WorkspaceId;
  allocateNodeId(kind: NodeKind): NodeId;
  allocateEntityId(kind: AcademicEntityKind): EntityId;
  allocateTransactionId(): TransactionId;
  allocateOperationId(): OperationId;
  allocateRevisionId(): RevisionId;
  allocateProposalId(): ProposalId;
  allocateSessionId(): SessionId;
  allocateDebugId(): DebugId;
}
