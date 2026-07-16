import type {
  ContentHash,
  EntityId,
  NodeId,
  ProposalId,
  TransactionId,
} from '../../base/ids/identifiers.js';
import type { IsoTimestamp } from '../../base/time/clock.js';
import type { ActorRef } from '../actor.js';
import type { Operation } from '../operation/operation.js';
import type { MutableDocumentTarget } from '../resource-ref.js';

export type TransactionSource =
  'human-input' | 'command' | 'import' | 'migration' | 'validator-fix' | 'proposal-accept';

interface TransactionMetadataBase {
  readonly undoGroupId?: string;
  readonly cometTaskId?: string;
  readonly toolInvocationIds?: readonly string[];
  readonly idempotencyKey?: string;
}

export type TransactionMetadata = TransactionMetadataBase &
  (
    | {
        readonly source: 'proposal-accept';
        readonly proposalId: ProposalId;
        readonly proposalRevision: number;
      }
    | {
        readonly source: Exclude<TransactionSource, 'proposal-accept'>;
        readonly proposalId?: ProposalId;
        readonly proposalRevision?: number;
      }
  );

export type TransactionPrecondition =
  | {
      readonly kind: 'node-exists';
      readonly nodeId: NodeId;
    }
  | {
      readonly kind: 'node-hash';
      readonly nodeId: NodeId;
      readonly expected: ContentHash;
    }
  | {
      readonly kind: 'entity-exists';
      readonly entityId: EntityId;
    }
  | {
      readonly kind: 'schema-version';
      readonly expected: string;
    }
  | {
      readonly kind: 'document-hash';
      readonly expected: ContentHash;
    };

export interface Transaction {
  readonly id: TransactionId;
  readonly target: MutableDocumentTarget;
  readonly actor: ActorRef;
  readonly intent?: string;
  readonly operations: readonly [Operation, ...Operation[]];
  readonly preconditions: readonly TransactionPrecondition[];
  readonly metadata: TransactionMetadata;
  readonly createdAt: IsoTimestamp;
}
