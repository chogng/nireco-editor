import type { NodeId, RevisionId } from '../../base/ids/identifiers.js';
import type { SemanticPosition } from '../position/semantic-position.js';

export type MappedPositionResult =
  | {
      readonly status: 'mapped';
      readonly position: SemanticPosition;
    }
  | {
      readonly status: 'deleted';
      readonly nearest?: SemanticPosition;
    }
  | {
      readonly status: 'ambiguous';
      readonly candidates: readonly SemanticPosition[];
    }
  | {
      readonly status: 'orphaned';
    };

export type MappedNodeResult =
  | {
      readonly status: 'mapped';
      readonly nodeId: NodeId;
    }
  | {
      readonly status: 'deleted';
    }
  | {
      readonly status: 'ambiguous';
      readonly candidates: readonly NodeId[];
    };

export interface PositionMap {
  readonly fromRevisionId: RevisionId;
  readonly toRevisionId: RevisionId;
  mapPosition(position: SemanticPosition): MappedPositionResult;
  mapNodeId(nodeId: NodeId): MappedNodeResult;
  compose(next: PositionMap): PositionMap;
}
