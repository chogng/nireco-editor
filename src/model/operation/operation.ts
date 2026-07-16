import type {
  ContentHash,
  EntityId,
  NodeId,
  OperationId,
  Utf16Offset,
} from '../../base/ids/identifiers.js';
import type { JsonValue } from '../../base/serialization/canonical-json.js';
import type { AcademicEntity } from '../academic-graph.js';
import type { InsertableNode, Mark } from '../node/manuscript-node.js';

interface OperationBase {
  readonly id: OperationId;
}

export interface InsertNodeOperation extends OperationBase {
  readonly type: 'insert-node';
  readonly parentNodeId: NodeId;
  readonly childIndex: number;
  readonly node: InsertableNode;
}

export interface DeleteNodeOperation extends OperationBase {
  readonly type: 'delete-node';
  readonly targetNodeId: NodeId;
  readonly expectedNodeHash: ContentHash;
}

export interface MoveNodeOperation extends OperationBase {
  readonly type: 'move-node';
  readonly targetNodeId: NodeId;
  readonly newParentNodeId: NodeId;
  readonly childIndex: number;
}

export interface ReplaceTextOperation extends OperationBase {
  readonly type: 'replace-text';
  readonly textNodeId: NodeId;
  readonly startUtf16Offset: Utf16Offset;
  readonly endUtf16Offset: Utf16Offset;
  readonly replacement: string;
}

export interface SetNodeAttributesOperation extends OperationBase {
  readonly type: 'set-node-attributes';
  readonly nodeId: NodeId;
  readonly attributes: Readonly<Record<string, JsonValue>>;
}

export interface AddMarkOperation extends OperationBase {
  readonly type: 'add-mark';
  readonly textNodeId: NodeId;
  readonly startUtf16Offset: Utf16Offset;
  readonly endUtf16Offset: Utf16Offset;
  readonly mark: Mark;
}

export interface RemoveMarkOperation extends OperationBase {
  readonly type: 'remove-mark';
  readonly textNodeId: NodeId;
  readonly startUtf16Offset: Utf16Offset;
  readonly endUtf16Offset: Utf16Offset;
  readonly mark: Mark;
}

export interface CreateAcademicEntityOperation extends OperationBase {
  readonly type: 'create-academic-entity';
  readonly entity: AcademicEntity;
}

export interface UpdateAcademicEntityOperation extends OperationBase {
  readonly type: 'update-academic-entity';
  readonly entityId: EntityId;
  readonly patch: readonly {
    readonly field: string;
    readonly value: JsonValue;
  }[];
}

export interface DeleteAcademicEntityOperation extends OperationBase {
  readonly type: 'delete-academic-entity';
  readonly entityId: EntityId;
  readonly expectedEntityHash: ContentHash;
}

export interface LinkAcademicEntitiesOperation extends OperationBase {
  readonly type: 'link-academic-entities';
  readonly fromEntityId: EntityId;
  readonly toEntityId: EntityId;
  readonly relation: AcademicRelationKind;
}

export interface UnlinkAcademicEntitiesOperation extends OperationBase {
  readonly type: 'unlink-academic-entities';
  readonly fromEntityId: EntityId;
  readonly toEntityId: EntityId;
  readonly relation: AcademicRelationKind;
}

export type AcademicRelationKind =
  | 'claim-supports-evidence'
  | 'claim-partially-supports-evidence'
  | 'claim-contradicts-evidence'
  | 'claim-context-only-evidence'
  | 'claim-unclear-evidence'
  | 'citation-references-reference'
  | 'evidence-located-in-source'
  | 'cross-reference-targets';

export type Operation =
  | InsertNodeOperation
  | DeleteNodeOperation
  | MoveNodeOperation
  | ReplaceTextOperation
  | SetNodeAttributesOperation
  | AddMarkOperation
  | RemoveMarkOperation
  | CreateAcademicEntityOperation
  | UpdateAcademicEntityOperation
  | DeleteAcademicEntityOperation
  | LinkAcademicEntitiesOperation
  | UnlinkAcademicEntitiesOperation;
