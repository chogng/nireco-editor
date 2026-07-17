import type { Result } from '../../base/errors/nireco-error.js';
import type { EntityId, NodeId } from '../../base/ids/identifiers.js';
import type { DocumentSnapshot } from '../snapshot.js';
import {
  validateDocumentSnapshot,
  type ManuscriptValidationError,
} from '../schema/manuscript-validator.js';
import type { DocumentNode } from './manuscript-node.js';

export type DocumentIndexError = ManuscriptValidationError;

export interface DocumentIndex {
  readonly nodeCount: number;
  readonly entityCount: number;
  getNode(nodeId: NodeId): DocumentNode | undefined;
  getNodePath(nodeId: NodeId): DocumentNodePath | undefined;
  hasEntity(entityId: EntityId): boolean;
}

export interface DocumentNodePath {
  readonly nodes: readonly DocumentNode[];
  readonly childIndices: readonly number[];
}

interface ParentLink {
  readonly parentNodeId: NodeId;
  readonly childIndex: number;
}

interface NodeIndexData {
  readonly nodesById: ReadonlyMap<NodeId, DocumentNode>;
  readonly parentsById: ReadonlyMap<NodeId, ParentLink>;
}

const MAX_NODE_REPLACEMENT_LAYERS = 32;

class ImmutableDocumentIndex implements DocumentIndex {
  readonly #baseNodesById: ReadonlyMap<NodeId, DocumentNode>;
  readonly #entityIds: ReadonlySet<EntityId>;
  readonly #parentsById: ReadonlyMap<NodeId, ParentLink>;
  readonly #nodeReplacementLayers: readonly ReadonlyMap<NodeId, DocumentNode>[];

  constructor(
    baseNodesById: ReadonlyMap<NodeId, DocumentNode>,
    entityIds: ReadonlySet<EntityId>,
    parentsById: ReadonlyMap<NodeId, ParentLink>,
    nodeReplacementLayers: readonly ReadonlyMap<NodeId, DocumentNode>[] = [],
  ) {
    this.#baseNodesById = baseNodesById;
    this.#entityIds = entityIds;
    this.#parentsById = parentsById;
    this.#nodeReplacementLayers = nodeReplacementLayers;
  }

  get nodeCount(): number {
    return this.#baseNodesById.size;
  }

  get entityCount(): number {
    return this.#entityIds.size;
  }

  getNode(nodeId: NodeId): DocumentNode | undefined {
    for (let index = this.#nodeReplacementLayers.length - 1; index >= 0; index -= 1) {
      const replacement = this.#nodeReplacementLayers[index]?.get(nodeId);
      if (replacement !== undefined) {
        return replacement;
      }
    }
    return this.#baseNodesById.get(nodeId);
  }

  getNodePath(nodeId: NodeId): DocumentNodePath | undefined {
    const nodes: DocumentNode[] = [];
    const childIndices: number[] = [];
    const visited = new Set<NodeId>();
    let current = this.getNode(nodeId);
    while (current !== undefined) {
      if (visited.has(current.id)) {
        return undefined;
      }
      visited.add(current.id);
      nodes.push(current);
      const parent = this.#parentsById.get(current.id);
      if (parent === undefined) {
        break;
      }
      childIndices.push(parent.childIndex);
      current = this.getNode(parent.parentNodeId);
    }
    if (nodes.length === 0 || current === undefined) {
      return undefined;
    }
    return {
      nodes: nodes.reverse(),
      childIndices: childIndices.reverse(),
    };
  }

  hasEntity(entityId: EntityId): boolean {
    return this.#entityIds.has(entityId);
  }

  withNodeReplacements(replacements: readonly DocumentNode[]): DocumentIndex | undefined {
    const replacementLayer = new Map<NodeId, DocumentNode>();
    for (const replacement of replacements) {
      const previous = this.getNode(replacement.id);
      if (previous === undefined || !hasStableIndexShape(previous, replacement)) {
        return undefined;
      }
      replacementLayer.set(replacement.id, replacement);
    }
    if (this.#nodeReplacementLayers.length + 1 >= MAX_NODE_REPLACEMENT_LAYERS) {
      const flattened = new Map(this.#baseNodesById);
      for (const layer of this.#nodeReplacementLayers) {
        for (const [nodeId, node] of layer) {
          flattened.set(nodeId, node);
        }
      }
      for (const [nodeId, node] of replacementLayer) {
        flattened.set(nodeId, node);
      }
      return new ImmutableDocumentIndex(flattened, this.#entityIds, this.#parentsById);
    }
    return new ImmutableDocumentIndex(this.#baseNodesById, this.#entityIds, this.#parentsById, [
      ...this.#nodeReplacementLayers,
      replacementLayer,
    ]);
  }
}

export function createDocumentIndex(snapshot: unknown): Result<DocumentIndex, DocumentIndexError> {
  const validation = validateDocumentSnapshot(snapshot);
  if (validation.type === 'error') {
    return validation;
  }
  return {
    type: 'ok',
    value: createDocumentIndexFromValidatedSnapshot(snapshot as DocumentSnapshot),
  };
}

/** @internal The caller must already have validated the complete Snapshot. */
export function createDocumentIndexFromValidatedSnapshot(
  snapshot: DocumentSnapshot,
): DocumentIndex {
  const indexed = indexNodes(snapshot.root);

  return new ImmutableDocumentIndex(
    indexed.nodesById,
    indexEntityIds(snapshot),
    indexed.parentsById,
  );
}

/** @internal Derives an immutable index when node identities and parent links are unchanged. */
export function deriveDocumentIndexWithNodeReplacements(
  index: DocumentIndex,
  replacements: readonly DocumentNode[],
): DocumentIndex | undefined {
  return index instanceof ImmutableDocumentIndex
    ? index.withNodeReplacements(replacements)
    : undefined;
}

function indexNodes(root: DocumentNode): NodeIndexData {
  const nodes = new Map<NodeId, DocumentNode>();
  const parents = new Map<NodeId, ParentLink>();
  const pending: {
    readonly node: DocumentNode;
    readonly parent?: ParentLink;
  }[] = [{ node: root }];

  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) {
      break;
    }
    const { node } = item;
    nodes.set(node.id, node);
    if (item.parent !== undefined) {
      parents.set(node.id, item.parent);
    }
    const children = readChildren(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        pending.push({
          node: child,
          parent: {
            parentNodeId: node.id,
            childIndex: index,
          },
        });
      }
    }
  }

  return {
    nodesById: nodes,
    parentsById: parents,
  };
}

function indexEntityIds(snapshot: DocumentSnapshot): ReadonlySet<EntityId> {
  const entityIds = new Set([
    ...snapshot.metadata.authors.flatMap((author) => (author.id === undefined ? [] : [author.id])),
    ...snapshot.academicGraph.referenceSnapshots.map((entity) => entity.id),
    ...snapshot.academicGraph.evidenceLinks.map((entity) => entity.id),
    ...snapshot.academicGraph.claims.map((entity) => entity.id),
  ]);
  const pending: DocumentNode[] = [snapshot.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      break;
    }
    if (node.type === 'citation') {
      entityIds.add(node.attrs.citationId);
    } else if (node.type === 'displayEquation' || node.type === 'figure' || node.type === 'table') {
      if (node.attrs.entityId !== undefined) {
        entityIds.add(node.attrs.entityId);
      }
    }
    const children = readChildren(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        pending.push(child);
      }
    }
  }
  return entityIds;
}

function readChildren(node: DocumentNode): readonly DocumentNode[] {
  return 'children' in node ? node.children : [];
}

function hasStableIndexShape(previous: DocumentNode, replacement: DocumentNode): boolean {
  if (
    previous.type !== replacement.type ||
    readDeclaredEntityId(previous) !== readDeclaredEntityId(replacement)
  ) {
    return false;
  }
  const previousChildren = readChildren(previous);
  const replacementChildren = readChildren(replacement);
  return (
    previousChildren.length === replacementChildren.length &&
    previousChildren.every((child, index) => child.id === replacementChildren[index]?.id)
  );
}

function readDeclaredEntityId(node: DocumentNode): EntityId | undefined {
  if (node.type === 'citation') {
    return node.attrs.citationId;
  }
  return node.type === 'displayEquation' || node.type === 'figure' || node.type === 'table'
    ? node.attrs.entityId
    : undefined;
}
