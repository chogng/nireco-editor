import { HASH_DOMAINS } from '../../base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../../base/hashing/portable-sha-256.js';
import type { ContentHash, NodeId } from '../../base/ids/identifiers.js';
import type { ClaimEntity } from '../../model/academic-graph.js';
import type { DocumentIndex } from '../../model/node/document-index.js';
import type { DocumentNode, HeadingNode } from '../../model/node/manuscript-node.js';
import type { DocumentRef } from '../../model/resource-ref.js';
import type { DocumentSnapshot } from '../../model/snapshot.js';
import type {
  DocumentOutlineItem,
  DocumentReadScope,
  DocumentSearchKind,
  DocumentSearchMatch,
  DocumentSearchTarget,
  ReadDocumentNode,
} from './document-read-types.js';

export type ScopeAccess = 'context' | 'exact' | 'none';

export interface DerivedPage<TItem> {
  readonly items: readonly TItem[];
  readonly hasMore: boolean;
  readonly cancelled: boolean;
  readonly error?: 'node-hash';
}

type OutlineItemProjection =
  | { readonly type: 'item'; readonly value: DocumentOutlineItem }
  | { readonly type: 'skip' }
  | { readonly type: 'error' };

interface NodeVisit {
  readonly node: DocumentNode;
  readonly path: readonly NodeId[];
  readonly parentType?: DocumentNode['type'];
  readonly insideHeading: boolean;
}

interface DocumentSearchCollectionOptions {
  readonly document: DocumentRef;
  readonly index: DocumentIndex;
  readonly snapshot: DocumentSnapshot;
  readonly scope: DocumentReadScope;
  readonly sectionIds: ReadonlySet<NodeId> | undefined;
  readonly query: string;
  readonly kinds: ReadonlySet<DocumentSearchKind>;
  readonly start: number;
  readonly limit: number;
  readonly isCancelled: () => boolean;
}

interface SearchCollectionState {
  readonly items: DocumentSearchMatch[];
  logicalIndex: number;
  cancelled: boolean;
}

export function isDocumentWideScope(scope: DocumentReadScope): boolean {
  return scope.allowedNodeIds === undefined && scope.allowedSectionIds === undefined;
}

export function readScopeAccess(
  scope: DocumentReadScope,
  nodeId: NodeId,
  path: readonly NodeId[],
): ScopeAccess {
  if (isDocumentWideScope(scope)) {
    return 'context';
  }
  if (scope.allowedSectionIds?.some((sectionId) => path.includes(sectionId)) === true) {
    return 'context';
  }
  return scope.allowedNodeIds?.includes(nodeId) === true ? 'exact' : 'none';
}

export function projectReadableNode(
  node: DocumentNode,
  pathNodes: readonly DocumentNode[],
  scope: DocumentReadScope,
): ReadDocumentNode | undefined {
  const path = pathNodes.map(({ id }) => id);
  const access = readScopeAccess(scope, node.id, path);
  if (access === 'none') {
    return undefined;
  }
  const mayExposeNodeHash = access === 'context' || node.type === 'text';
  const nodeHash = mayExposeNodeHash ? readCanonicalNodeHash(node) : undefined;
  if (mayExposeNodeHash && nodeHash === undefined) {
    return undefined;
  }
  const hashMetadata = nodeHash === undefined ? {} : { nodeHash };
  const childIds = readChildren(node).flatMap((child) =>
    readScopeAccess(scope, child.id, [...path, child.id]) === 'none' ? [] : [child.id],
  );
  const parentMetadata = readableParentMetadata(pathNodes, scope);
  if (node.type === 'text') {
    return {
      nodeId: node.id,
      nodeType: node.type,
      childIds: [],
      text: node.value,
      marks: node.marks,
      ...hashMetadata,
      ...parentMetadata,
    };
  }
  return {
    nodeId: node.id,
    nodeType: node.type,
    attrs: node.attrs,
    childIds,
    ...hashMetadata,
    ...parentMetadata,
  };
}

export function collectDocumentOutline(options: {
  readonly snapshot: DocumentSnapshot;
  readonly scope: DocumentReadScope;
  readonly start: number;
  readonly limit: number;
  readonly maxDepth: number;
  readonly isCancelled: () => boolean;
}): DerivedPage<DocumentOutlineItem> {
  const items: DocumentOutlineItem[] = [];
  let logicalIndex = 0;
  const pending: NodeVisit[] = [
    { node: options.snapshot.root, path: [options.snapshot.root.id], insideHeading: false },
  ];
  while (pending.length > 0) {
    if (options.isCancelled()) {
      return { items, hasMore: false, cancelled: true };
    }
    const visit = pending.pop();
    if (visit === undefined) {
      break;
    }
    const projected = outlineItem(visit, options.scope, options.maxDepth);
    if (projected.type === 'error') {
      return { items, hasMore: false, cancelled: false, error: 'node-hash' };
    }
    if (projected.type === 'item') {
      if (logicalIndex >= options.start) {
        items.push(projected.value);
        if (items.length > options.limit) {
          return { items, hasMore: true, cancelled: false };
        }
      }
      logicalIndex += 1;
    }
    pushChildren(pending, visit);
  }
  return { items, hasMore: false, cancelled: false };
}

export function collectDocumentSearchMatches(
  options: DocumentSearchCollectionOptions,
): DerivedPage<DocumentSearchMatch> {
  const state: SearchCollectionState = { items: [], logicalIndex: 0, cancelled: false };
  const pending: NodeVisit[] = [
    { node: options.snapshot.root, path: [options.snapshot.root.id], insideHeading: false },
  ];
  while (pending.length > 0) {
    if (options.isCancelled()) {
      return { items: state.items, hasMore: false, cancelled: true };
    }
    const visit = pending.pop();
    if (visit === undefined) {
      break;
    }
    appendNodeSearchMatches(state, visit, options);
    if (state.cancelled) {
      return { items: state.items, hasMore: false, cancelled: true };
    }
    if (state.items.length > options.limit) {
      return { items: state.items, hasMore: true, cancelled: false };
    }
    pushChildren(pending, visit);
  }
  for (const claim of options.snapshot.academicGraph.claims) {
    if (options.isCancelled()) {
      return { items: state.items, hasMore: false, cancelled: true };
    }
    appendClaimSearchMatches(state, claim, options);
    if (state.cancelled) {
      return { items: state.items, hasMore: false, cancelled: true };
    }
    if (state.items.length > options.limit) {
      return { items: state.items, hasMore: true, cancelled: false };
    }
  }
  return { items: state.items, hasMore: false, cancelled: false };
}

function outlineItem(
  visit: NodeVisit,
  scope: DocumentReadScope,
  maxDepth: number,
): OutlineItemProjection {
  if (readContextAccess(scope, visit.path) === 'none') {
    return { type: 'skip' };
  }
  let depth: number;
  let title: string;
  if (visit.node.type === 'section') {
    const heading = visit.node.children[0];
    depth = heading.attrs.level;
    title = readHeadingText(heading);
  } else {
    if (visit.node.type !== 'heading' || visit.parentType === 'section') {
      return { type: 'skip' };
    }
    depth = visit.node.attrs.level;
    title = readHeadingText(visit.node);
  }
  if (depth > maxDepth) {
    return { type: 'skip' };
  }
  const nodeHash = readCanonicalNodeHash(visit.node);
  if (nodeHash === undefined) {
    return { type: 'error' };
  }
  const parentNodeId = authorizedParentNodeId(scope, visit.path);
  return {
    type: 'item',
    value: {
      nodeId: visit.node.id,
      ...(parentNodeId === undefined ? {} : { parentNodeId }),
      nodeType: visit.node.type,
      depth,
      title,
      authorizedChildCount: authorizedChildIds(visit.node, visit.path, scope).length,
      nodeHash,
    },
  };
}

function readCanonicalNodeHash(node: DocumentNode): ContentHash | undefined {
  const hashed = hashCanonicalJsonPortable(HASH_DOMAINS.node, node);
  return hashed.type === 'ok' ? hashed.hash : undefined;
}

function authorizedChildIds(
  node: DocumentNode,
  path: readonly NodeId[],
  scope: DocumentReadScope,
): readonly NodeId[] {
  return readChildren(node).flatMap((child) =>
    readScopeAccess(scope, child.id, [...path, child.id]) === 'none' ? [] : [child.id],
  );
}

function authorizedParentNodeId(
  scope: DocumentReadScope,
  path: readonly NodeId[],
): NodeId | undefined {
  if (path.length < 2) {
    return undefined;
  }
  const parentPath = path.slice(0, -1);
  const parentNodeId = parentPath[parentPath.length - 1];
  return parentNodeId !== undefined && readScopeAccess(scope, parentNodeId, parentPath) !== 'none'
    ? parentNodeId
    : undefined;
}

function readableParentMetadata(
  pathNodes: readonly DocumentNode[],
  scope: DocumentReadScope,
): Pick<ReadDocumentNode, 'parentNodeId' | 'authorizedChildIndex'> {
  if (pathNodes.length < 2) {
    return {};
  }
  const parent = pathNodes[pathNodes.length - 2];
  const node = pathNodes[pathNodes.length - 1];
  if (parent === undefined || node === undefined) {
    return {};
  }
  const parentPath = pathNodes.slice(0, -1).map(({ id }) => id);
  if (readScopeAccess(scope, parent.id, parentPath) === 'none') {
    return {};
  }
  const authorizedSiblings = authorizedChildIds(parent, parentPath, scope);
  const authorizedChildIndex = authorizedSiblings.indexOf(node.id);
  return authorizedChildIndex < 0
    ? {}
    : {
        parentNodeId: parent.id,
        authorizedChildIndex,
      };
}

function readContextAccess(scope: DocumentReadScope, path: readonly NodeId[]): ScopeAccess {
  if (isDocumentWideScope(scope)) {
    return 'context';
  }
  return scope.allowedSectionIds?.some((sectionId) => path.includes(sectionId)) === true
    ? 'context'
    : 'none';
}

function readHeadingText(heading: HeadingNode): string {
  return heading.children
    .flatMap((child) => {
      if (child.type === 'text') {
        return [child.value];
      }
      if (child.type === 'inlineEquation') {
        return [child.attrs.source];
      }
      if (child.type === 'hardBreak') {
        return [' '];
      }
      return [];
    })
    .join('');
}

interface ScalarMatchCollection {
  readonly items: readonly DocumentSearchMatch[];
  readonly nextLogicalIndex: number;
  readonly cancelled: boolean;
}

function appendNodeSearchMatches(
  state: SearchCollectionState,
  visit: NodeVisit,
  options: DocumentSearchCollectionOptions,
): void {
  if (!isSearchPathAuthorized(options.scope, options.sectionIds, visit.node.id, visit.path)) {
    return;
  }
  if (visit.node.type === 'text') {
    const kind = visit.insideHeading ? 'heading' : 'text';
    if (options.kinds.has(kind)) {
      appendScalarMatches(state, {
        value: visit.node.value,
        target: { kind: 'node', nodeId: visit.node.id },
        kind,
        options,
      });
    }
    return;
  }
  if (visit.node.type === 'citation' && options.kinds.has('citation')) {
    for (const value of citationSearchScalars(visit.node)) {
      appendScalarMatches(state, {
        value,
        target: { kind: 'node', nodeId: visit.node.id },
        kind: 'citation',
        options,
      });
      if (state.cancelled || state.items.length > options.limit) {
        return;
      }
    }
  }
}

function appendClaimSearchMatches(
  state: SearchCollectionState,
  claim: ClaimEntity,
  options: DocumentSearchCollectionOptions,
): void {
  if (!options.kinds.has('claim') || !isClaimSearchable(claim, options)) {
    return;
  }
  appendScalarMatches(state, {
    value: claim.textSnapshot,
    target: { kind: 'academic-entity', entityId: claim.id },
    kind: 'claim',
    options,
  });
}

function isClaimSearchable(claim: ClaimEntity, options: DocumentSearchCollectionOptions): boolean {
  if (
    claim.anchor.document.uri !== options.document.uri ||
    claim.anchor.document.revisionId !== options.document.revisionId
  ) {
    return false;
  }
  const primaryNodeId =
    claim.anchor.primary.kind === 'text'
      ? claim.anchor.primary.textNodeId
      : claim.anchor.primary.parentNodeId;
  if (!isIndexedNodeSearchable(primaryNodeId, options)) {
    return false;
  }
  return (
    claim.anchor.targetNodeId === undefined ||
    isIndexedNodeSearchable(claim.anchor.targetNodeId, options)
  );
}

function isIndexedNodeSearchable(
  nodeId: NodeId,
  options: DocumentSearchCollectionOptions,
): boolean {
  const path = options.index.getNodePath(nodeId);
  return (
    path !== undefined &&
    isSearchPathAuthorized(
      options.scope,
      options.sectionIds,
      nodeId,
      path.nodes.map(({ id }) => id),
    )
  );
}

function isSearchPathAuthorized(
  scope: DocumentReadScope,
  sectionIds: ReadonlySet<NodeId> | undefined,
  nodeId: NodeId,
  path: readonly NodeId[],
): boolean {
  return (
    readScopeAccess(scope, nodeId, path) !== 'none' &&
    (sectionIds === undefined || path.some((pathNodeId) => sectionIds.has(pathNodeId)))
  );
}

function citationSearchScalars(
  citation: Extract<DocumentNode, { readonly type: 'citation' }>,
): readonly string[] {
  return [
    ...(citation.attrs.prefix === undefined ? [] : [citation.attrs.prefix]),
    ...(citation.attrs.locator === undefined
      ? []
      : [citation.attrs.locator.label, citation.attrs.locator.value]),
    ...(citation.attrs.suffix === undefined ? [] : [citation.attrs.suffix]),
    citation.attrs.citationId,
    citation.attrs.referenceId,
  ];
}

function appendScalarMatches(
  state: SearchCollectionState,
  input: {
    readonly value: string;
    readonly target: DocumentSearchTarget;
    readonly kind: DocumentSearchKind;
    readonly options: DocumentSearchCollectionOptions;
  },
): void {
  const collected = collectScalarMatches({
    value: input.value,
    target: input.target,
    query: input.options.query,
    kind: input.kind,
    logicalIndex: state.logicalIndex,
    start: input.options.start,
    limit: input.options.limit - state.items.length,
    isCancelled: input.options.isCancelled,
  });
  state.items.push(...collected.items);
  state.logicalIndex = collected.nextLogicalIndex;
  state.cancelled = collected.cancelled;
}

function collectScalarMatches(options: {
  readonly value: string;
  readonly target: DocumentSearchTarget;
  readonly query: string;
  readonly kind: DocumentSearchKind;
  readonly logicalIndex: number;
  readonly start: number;
  readonly limit: number;
  readonly isCancelled: () => boolean;
}): ScalarMatchCollection {
  const items: DocumentSearchMatch[] = [];
  let logicalIndex = options.logicalIndex;
  if (options.query.length === 0 || options.query.length > MAX_SEARCH_SNIPPET_UTF16_UNITS) {
    return { items, nextLogicalIndex: logicalIndex, cancelled: false };
  }
  let searchFrom = 0;
  while (searchFrom <= options.value.length) {
    if (options.isCancelled()) {
      return { items, nextLogicalIndex: logicalIndex, cancelled: true };
    }
    const matchStart = options.value.indexOf(options.query, searchFrom);
    if (matchStart < 0) {
      break;
    }
    const matchEnd = matchStart + options.query.length;
    if (logicalIndex >= options.start) {
      items.push({
        kind: options.kind,
        target: options.target,
        match: 'substring',
        snippet: createExcerpt(options.value, matchStart, matchEnd),
      });
      if (items.length > options.limit) {
        return { items, nextLogicalIndex: logicalIndex + 1, cancelled: false };
      }
    }
    logicalIndex += 1;
    searchFrom = matchEnd;
  }
  return { items, nextLogicalIndex: logicalIndex, cancelled: false };
}

const MAX_SEARCH_SNIPPET_UTF16_UNITS = 4_096;
const MAX_SEARCH_CONTEXT_UTF16_UNITS_PER_SIDE = 80;

function createExcerpt(value: string, start: number, end: number): string {
  const matchLength = end - start;
  const remaining = Math.max(0, MAX_SEARCH_SNIPPET_UTF16_UNITS - matchLength);
  let excerptStart = moveLeftByUtf16Budget(
    value,
    start,
    Math.min(MAX_SEARCH_CONTEXT_UTF16_UNITS_PER_SIDE, Math.floor(remaining / 2)),
  );
  let leftLength = start - excerptStart;
  let excerptEnd = moveRightByUtf16Budget(
    value,
    end,
    Math.min(MAX_SEARCH_CONTEXT_UTF16_UNITS_PER_SIDE, remaining - leftLength),
  );
  const rightLength = excerptEnd - end;
  excerptStart = moveLeftByUtf16Budget(
    value,
    start,
    Math.min(MAX_SEARCH_CONTEXT_UTF16_UNITS_PER_SIDE, remaining - rightLength),
  );
  leftLength = start - excerptStart;
  excerptEnd = moveRightByUtf16Budget(
    value,
    end,
    Math.min(MAX_SEARCH_CONTEXT_UTF16_UNITS_PER_SIDE, remaining - leftLength),
  );
  return value.slice(excerptStart, excerptEnd);
}

function moveLeftByUtf16Budget(value: string, offset: number, budget: number): number {
  let position = offset;
  let used = 0;
  while (position > 0) {
    const last = value.charCodeAt(position - 1);
    const width = last >= 0xdc00 && last <= 0xdfff && position > 1 ? 2 : 1;
    if (used + width > budget) {
      break;
    }
    position -= width;
    used += width;
  }
  return position;
}

function moveRightByUtf16Budget(value: string, offset: number, budget: number): number {
  let position = offset;
  let used = 0;
  while (position < value.length) {
    const first = value.charCodeAt(position);
    const width = first >= 0xd800 && first <= 0xdbff && position + 1 < value.length ? 2 : 1;
    if (used + width > budget) {
      break;
    }
    position += width;
    used += width;
  }
  return position;
}

function pushChildren(pending: NodeVisit[], visit: NodeVisit): void {
  const children = readChildren(visit.node);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child !== undefined) {
      pending.push({
        node: child,
        path: [...visit.path, child.id],
        parentType: visit.node.type,
        insideHeading: visit.insideHeading || visit.node.type === 'heading',
      });
    }
  }
}

function readChildren(node: DocumentNode): readonly DocumentNode[] {
  return 'children' in node ? node.children : [];
}
