import type {
  DebugId,
  EntityId,
  NodeId,
  ProposalChangeGroupId,
  ProposalId,
  RevisionId,
  SessionId,
  TransactionId,
} from '../base/ids/identifiers.js';
import type { AcademicEntityKind } from '../model/academic-graph.js';
import type { NodeKind } from '../model/node/manuscript-node.js';

export interface IIdAllocator {
  allocateNodeId(kind: NodeKind): NodeId;
  allocateEntityId(kind: AcademicEntityKind): EntityId;
  allocateTransactionId(): TransactionId;
  allocateRevisionId(): RevisionId;
  allocateProposalId(): ProposalId;
  allocateProposalChangeGroupId(): ProposalChangeGroupId;
  allocateSessionId(): SessionId;
  allocateDebugId(): DebugId;
}
