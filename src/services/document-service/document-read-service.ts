import type { NirecoError, NirecoErrorCode, Result } from '../../base/errors/nireco-error.js';
import {
  createNirecoCatalogError,
  isNirecoErrorCode,
} from '../../base/errors/nireco-error-catalog.js';
import {
  nonCancellingToken,
  type CancellationToken,
} from '../../base/cancellation/cancellation-token.js';
import { encodeUtf8 } from '../../base/hashing/portable-sha-256.js';
import type { ContentHash, NodeId, RevisionId } from '../../base/ids/identifiers.js';
import {
  isWellFormedUnicodeString,
  serializeCanonicalJson,
} from '../../base/serialization/canonical-json.js';
import type { ResourceUri } from '../../base/uri/resource-uri.js';
import type { Diagnostic } from '../../model/diagnostic.js';
import { createDocumentIndex, type DocumentIndex } from '../../model/node/document-index.js';
import type { DocumentNode } from '../../model/node/manuscript-node.js';
import type { Revision } from '../../model/revision/revision.js';
import type { DocumentSnapshot } from '../../model/snapshot.js';
import type { IIdAllocator } from '../../workspace/id-allocator.js';
import type { INirecoModel } from '../../workspace/model.js';
import type {
  DocumentReadCursorAdapter,
  DocumentReadCursorBinding,
  DocumentReadCursorService,
} from './cursor-codec.js';
import {
  collectDocumentOutline,
  collectDocumentSearchMatches,
  isDocumentWideScope,
  projectReadableNode,
  readScopeAccess,
} from './document-read-derivations.js';
import type { DocumentRevisionHistorySource } from './document-revision-history-source.js';
import {
  MAX_DOCUMENT_READ_SCOPE_IDS,
  type DocumentDiagnosticSeverity,
  type DocumentDiagnosticsSource,
  type DocumentPageResult,
  type DocumentReadContext,
  type DocumentReadScope,
  type DocumentReadService,
  type DocumentReadSessionSource,
  type DocumentSearchKind,
  type GetDocumentChangesSinceRequest,
  type GetDocumentChangesSinceResult,
  type GetDocumentDiagnosticsRequest,
  type GetDocumentDiagnosticsResult,
  type GetDocumentHeadRequest,
  type GetDocumentHeadResult,
  type GetDocumentOutlineRequest,
  type GetDocumentOutlineResult,
  type GetDocumentSnapshotRequest,
  type GetDocumentSnapshotResult,
  type ReadDocumentNode,
  type ReadDocumentNodeNeighborhoodRequest,
  type ReadDocumentNodeNeighborhoodResult,
  type ReadDocumentNodesRequest,
  type ReadDocumentNodesResult,
  type RevisionBoundReadResult,
  type SearchDocumentRequest,
  type SearchDocumentResult,
} from './document-read-types.js';
import { MAX_DOCUMENT_SEARCH_SECTION_IDS, createDocumentReadQueryHash } from './read-query-hash.js';

export const DEFAULT_DOCUMENT_READ_LIMITS = Object.freeze({
  maxPageItems: 1_000,
  maxRequestNodeIds: 1_000,
  maxResponseBytes: 4_194_304,
  maxQueryUtf16Units: 4_096,
});

export const MAX_DOCUMENT_OUTLINE_DEPTH = 256;
export const MAX_DOCUMENT_NEIGHBORHOOD_BLOCKS_PER_DIRECTION = 100;

export interface DocumentReadLimits {
  readonly maxPageItems: number;
  readonly maxRequestNodeIds: number;
  readonly maxResponseBytes: number;
  readonly maxQueryUtf16Units: number;
}

/** The source port deliberately exposes only already-open Models. */
export interface DocumentReadModelSource {
  get(uri: ResourceUri): INirecoModel | undefined;
}

export interface InProcessDocumentReadServiceOptions {
  readonly source: DocumentReadModelSource;
  readonly sessions: DocumentReadSessionSource;
  readonly ids: Pick<IIdAllocator, 'allocateDebugId'>;
  readonly cursorAdapter?: DocumentReadCursorAdapter;
  /** Lifetime-retained history only; this does not claim durable reconstruction. */
  readonly revisionHistorySource?: DocumentRevisionHistorySource;
  readonly diagnosticsSource?: DocumentDiagnosticsSource;
  readonly limits?: Partial<DocumentReadLimits>;
}

interface ExactSnapshotRead {
  readonly model: INirecoModel;
  readonly snapshot: DocumentSnapshot;
}

interface IndexedSnapshotRead extends ExactSnapshotRead {
  readonly index: DocumentIndex;
}

interface PageBinding {
  readonly context: AuthorizedDocumentReadContext;
  readonly model: INirecoModel;
  readonly service: DocumentReadCursorService;
  readonly queryHash: ContentHash;
  readonly start: number;
}

interface AuthorizedDocumentReadContext extends DocumentReadContext {
  readonly scope: DocumentReadScope;
}

interface AuthorizedBlockVisit {
  readonly node: DocumentNode;
  readonly pathNodes: readonly DocumentNode[];
}

interface NeighborhoodCenter {
  readonly visit: AuthorizedBlockVisit;
  readonly anchorBlockId: NodeId;
}

interface PreparedDocumentSearch {
  readonly kinds: ReadonlySet<DocumentSearchKind>;
  readonly pageSize: number;
  readonly queryHash: ContentHash;
}

export class InProcessDocumentReadService implements DocumentReadService {
  readonly #source: DocumentReadModelSource;
  readonly #sessions: DocumentReadSessionSource;
  readonly #ids: Pick<IIdAllocator, 'allocateDebugId'>;
  readonly #cursorAdapter: DocumentReadCursorAdapter | undefined;
  readonly #revisionHistorySource: DocumentRevisionHistorySource | undefined;
  readonly #diagnosticsSource: DocumentDiagnosticsSource | undefined;
  readonly #limits: DocumentReadLimits;

  constructor(options: InProcessDocumentReadServiceOptions) {
    this.#source = options.source;
    this.#sessions = options.sessions;
    this.#ids = options.ids;
    this.#cursorAdapter = options.cursorAdapter;
    this.#revisionHistorySource = options.revisionHistorySource;
    this.#diagnosticsSource = options.diagnosticsSource;
    this.#limits = readLimits(options.limits);
  }

  getHead(request: GetDocumentHeadRequest): GetDocumentHeadResult {
    const authorized = this.#authorize(request);
    if (authorized.type === 'error') {
      return authorized;
    }
    const model = this.#getModel(authorized.value.document.uri);
    if (model.type === 'error') {
      return model;
    }
    const headRevisionId = model.value.headRevisionId;
    return this.#boundedExactResult(
      model.value,
      {
        uri: authorized.value.document.uri,
        revisionId: headRevisionId,
      },
      { headRevisionId },
    );
  }

  getSnapshot(request: GetDocumentSnapshotRequest): GetDocumentSnapshotResult {
    const authorized = this.#authorize(request);
    if (authorized.type === 'error') {
      return authorized;
    }
    if (!isDocumentWideScope(authorized.value.scope)) {
      return this.#error('SCOPE_VIOLATION');
    }
    const read = this.#readExactSnapshot(authorized.value);
    return read.type === 'error'
      ? read
      : this.#boundedExactResult(read.value.model, authorized.value.document, read.value.snapshot);
  }

  readNodes(request: ReadDocumentNodesRequest): ReadDocumentNodesResult {
    const authorized = this.#authorize(request);
    if (authorized.type === 'error') {
      return authorized;
    }
    if (request.nodeIds.length > this.#limits.maxRequestNodeIds) {
      return this.#requestTooLarge();
    }
    const pageSize = this.#readPageSize(request.maxResults);
    if (pageSize.type === 'error') {
      return pageSize;
    }
    const queryHash = this.#queryHash({
      maxResults: pageSize.value,
      nodeIds: request.nodeIds,
      service: 'document.read_nodes',
    });
    if (queryHash.type === 'error') {
      return queryHash;
    }
    const binding = this.#cursorBinding(authorized.value, 'document.read_nodes', queryHash.value);
    const start = this.#readCursorStart(request.cursor, binding);
    if (start.type === 'error') {
      return start;
    }
    if (start.value > request.nodeIds.length) {
      return this.#invalidCursor();
    }
    const read = this.#readIndexedSnapshot(authorized.value);
    if (read.type === 'error') {
      return read;
    }
    const selectedIds = request.nodeIds.slice(start.value, start.value + pageSize.value);
    const projected = this.#projectNodePage(authorized.value, read.value.index, selectedIds);
    if (projected.type === 'error') {
      return projected;
    }
    const items = projected.value;
    return this.#pagedResult({
      binding: {
        context: authorized.value,
        model: read.value.model,
        service: 'document.read_nodes',
        queryHash: queryHash.value,
        start: start.value,
      },
      items,
      hasMore: start.value + items.length < request.nodeIds.length,
    });
  }

  #projectNodePage(
    context: AuthorizedDocumentReadContext,
    index: DocumentIndex,
    nodeIds: readonly ReadDocumentNode['nodeId'][],
  ): Result<readonly ReadDocumentNode[]> {
    const items: ReadDocumentNode[] = [];
    for (const nodeId of nodeIds) {
      if (this.#isCancelled(context)) {
        return this.#cancelled();
      }
      const path = index.getNodePath(nodeId);
      const pathIds = path?.nodes.map((node) => node.id);
      if (
        path === undefined ||
        pathIds === undefined ||
        readScopeAccess(context.scope, nodeId, pathIds) === 'none'
      ) {
        return this.#hiddenNode();
      }
      const node = path.nodes[path.nodes.length - 1];
      if (node === undefined) {
        return this.#hiddenNode();
      }
      const projected = projectReadableNode(node, path.nodes, context.scope);
      if (projected === undefined) {
        return this.#error('INTERNAL_ERROR', context.document.revisionId);
      }
      items.push(projected);
    }
    return { type: 'ok', value: items };
  }

  readNodeNeighborhood(
    request: ReadDocumentNodeNeighborhoodRequest,
  ): ReadDocumentNodeNeighborhoodResult {
    const authorized = this.#authorize(request);
    if (authorized.type === 'error') {
      return authorized;
    }
    const beforeBlocks = readNeighborhoodBlockCount(request.beforeBlocks);
    const afterBlocks = readNeighborhoodBlockCount(request.afterBlocks);
    if (beforeBlocks === undefined || afterBlocks === undefined) {
      return this.#schemaInvalid();
    }
    const pageSize = this.#readPageSize(request.maxResults);
    if (pageSize.type === 'error') {
      return pageSize;
    }
    const queryHash = this.#queryHash({
      afterBlocks,
      beforeBlocks,
      maxResults: pageSize.value,
      nodeId: request.nodeId,
      service: 'document.read_node_neighborhood',
    });
    if (queryHash.type === 'error') {
      return queryHash;
    }
    const binding = this.#cursorBinding(
      authorized.value,
      'document.read_node_neighborhood',
      queryHash.value,
    );
    const start = this.#readCursorStart(request.cursor, binding);
    if (start.type === 'error') {
      return start;
    }
    const read = this.#readIndexedSnapshot(authorized.value);
    if (read.type === 'error') {
      return read;
    }
    const neighborhood = this.#projectNodeNeighborhood({
      afterBlocks,
      beforeBlocks,
      centerNodeId: request.nodeId,
      context: authorized.value,
      index: read.value.index,
      snapshot: read.value.snapshot,
    });
    if (neighborhood.type === 'error') {
      return neighborhood;
    }
    if (start.value > neighborhood.value.length) {
      return this.#invalidCursor();
    }
    const items = neighborhood.value.slice(start.value, start.value + pageSize.value);
    return this.#pagedResult({
      binding: {
        context: authorized.value,
        model: read.value.model,
        service: 'document.read_node_neighborhood',
        queryHash: queryHash.value,
        start: start.value,
      },
      extra: { centerNodeId: request.nodeId },
      items,
      hasMore: start.value + items.length < neighborhood.value.length,
    });
  }

  #projectNodeNeighborhood(options: {
    readonly afterBlocks: number;
    readonly beforeBlocks: number;
    readonly centerNodeId: NodeId;
    readonly context: AuthorizedDocumentReadContext;
    readonly index: DocumentIndex;
    readonly snapshot: DocumentSnapshot;
  }): Result<readonly ReadDocumentNode[]> {
    const center = this.#readNeighborhoodCenter(
      options.context,
      options.index,
      options.centerNodeId,
    );
    if (center.type === 'error') {
      return center;
    }
    const orderedBlocks = this.#collectOrderedBlocks(options.context, options.snapshot);
    if (orderedBlocks.type === 'error') {
      return orderedBlocks;
    }
    const selected = selectNeighborhoodVisits({
      afterBlocks: options.afterBlocks,
      beforeBlocks: options.beforeBlocks,
      center: center.value,
      orderedBlocks: orderedBlocks.value,
      scope: options.context.scope,
    });
    return selected === undefined
      ? this.#hiddenNode()
      : this.#projectNeighborhoodVisits(options.context, selected);
  }

  #readNeighborhoodCenter(
    context: AuthorizedDocumentReadContext,
    index: DocumentIndex,
    centerNodeId: NodeId,
  ): Result<NeighborhoodCenter> {
    const centerPath = index.getNodePath(centerNodeId);
    const centerNode = centerPath?.nodes[centerPath.nodes.length - 1];
    const centerPathIds = centerPath?.nodes.map(({ id }) => id);
    if (
      centerPath === undefined ||
      centerNode === undefined ||
      centerPathIds === undefined ||
      readScopeAccess(context.scope, centerNode.id, centerPathIds) === 'none'
    ) {
      return this.#hiddenNode();
    }
    const anchorBlock = [...centerPath.nodes].reverse().find(isDocumentBlockNode);
    return anchorBlock === undefined
      ? this.#hiddenNode()
      : {
          type: 'ok',
          value: {
            visit: { node: centerNode, pathNodes: centerPath.nodes },
            anchorBlockId: anchorBlock.id,
          },
        };
  }

  #collectOrderedBlocks(
    context: AuthorizedDocumentReadContext,
    snapshot: DocumentSnapshot,
  ): Result<readonly AuthorizedBlockVisit[]> {
    const orderedBlocks: AuthorizedBlockVisit[] = [];
    const pending: AuthorizedBlockVisit[] = [{ node: snapshot.root, pathNodes: [snapshot.root] }];
    while (pending.length > 0) {
      if (this.#isCancelled(context)) {
        return this.#cancelled();
      }
      const visit = pending.pop();
      if (visit === undefined) {
        break;
      }
      if (isDocumentBlockNode(visit.node)) {
        orderedBlocks.push(visit);
      }
      pushDocumentChildren(pending, visit);
    }
    return { type: 'ok', value: orderedBlocks };
  }

  #projectNeighborhoodVisits(
    context: AuthorizedDocumentReadContext,
    visits: readonly AuthorizedBlockVisit[],
  ): Result<readonly ReadDocumentNode[]> {
    const items: ReadDocumentNode[] = [];
    for (const visit of visits) {
      if (this.#isCancelled(context)) {
        return this.#cancelled();
      }
      const projected = projectReadableNode(visit.node, visit.pathNodes, context.scope);
      if (projected === undefined) {
        return this.#error('INTERNAL_ERROR', context.document.revisionId);
      }
      items.push(projected);
    }
    return { type: 'ok', value: items };
  }

  getOutline(request: GetDocumentOutlineRequest): GetDocumentOutlineResult {
    const authorized = this.#authorize(request);
    if (authorized.type === 'error') {
      return authorized;
    }
    const maxDepth = readMaxDepth(request.maxDepth);
    if (maxDepth === undefined) {
      return this.#schemaInvalid();
    }
    const pageSize = this.#readPageSize(request.maxResults);
    if (pageSize.type === 'error') {
      return pageSize;
    }
    const queryHash = this.#queryHash({
      maxDepth,
      maxResults: pageSize.value,
      service: 'document.get_outline',
    });
    if (queryHash.type === 'error') {
      return queryHash;
    }
    const binding = this.#cursorBinding(authorized.value, 'document.get_outline', queryHash.value);
    const start = this.#readCursorStart(request.cursor, binding);
    if (start.type === 'error') {
      return start;
    }
    const read = this.#readIndexedSnapshot(authorized.value);
    if (read.type === 'error') {
      return read;
    }
    const derived = collectDocumentOutline({
      snapshot: read.value.snapshot,
      scope: authorized.value.scope,
      start: start.value,
      limit: pageSize.value,
      maxDepth,
      isCancelled: () => this.#isCancelled(authorized.value),
    });
    if (derived.cancelled) {
      return this.#cancelled();
    }
    if (derived.error === 'node-hash') {
      return this.#error('INTERNAL_ERROR', authorized.value.document.revisionId);
    }
    return this.#pagedResult({
      binding: {
        context: authorized.value,
        model: read.value.model,
        service: 'document.get_outline',
        queryHash: queryHash.value,
        start: start.value,
      },
      items: derived.items.slice(0, pageSize.value),
      hasMore: derived.hasMore || derived.items.length > pageSize.value,
    });
  }

  search(request: SearchDocumentRequest): SearchDocumentResult {
    const captured = this.#captureSearchRequest(request);
    if (captured.type === 'error') {
      return captured;
    }
    const input = captured.value;
    const authorized = this.#authorize(input);
    if (authorized.type === 'error') {
      return authorized;
    }
    const prepared = this.#prepareSearch(input);
    if (prepared.type === 'error') {
      return prepared;
    }
    const binding = this.#cursorBinding(
      authorized.value,
      'document.search',
      prepared.value.queryHash,
    );
    const start = this.#readCursorStart(input.cursor, binding);
    if (start.type === 'error') {
      return start;
    }
    const read = this.#readIndexedSnapshot(authorized.value);
    if (read.type === 'error') {
      return read;
    }
    const sectionIds = this.#validateSearchSections(
      authorized.value,
      read.value.index,
      input.sectionIds,
    );
    if (sectionIds.type === 'error') {
      return sectionIds;
    }
    const derived = collectDocumentSearchMatches({
      document: authorized.value.document,
      index: read.value.index,
      snapshot: read.value.snapshot,
      scope: authorized.value.scope,
      sectionIds: sectionIds.value,
      query: input.query,
      kinds: prepared.value.kinds,
      start: start.value,
      limit: prepared.value.pageSize,
      isCancelled: () => this.#isCancelled(authorized.value),
    });
    if (derived.cancelled) {
      return this.#cancelled();
    }
    return this.#pagedResult({
      binding: {
        context: authorized.value,
        model: read.value.model,
        service: 'document.search',
        queryHash: prepared.value.queryHash,
        start: start.value,
      },
      items: derived.items.slice(0, prepared.value.pageSize),
      hasMore: derived.hasMore || derived.items.length > prepared.value.pageSize,
    });
  }

  #captureSearchRequest(value: unknown): Result<SearchDocumentRequest> {
    const captured = captureSearchDocumentRequest(value);
    if (captured.type === 'ok') {
      return captured;
    }
    return captured.reason === 'request-too-large'
      ? this.#requestTooLarge()
      : this.#schemaInvalid();
  }

  #prepareSearch(input: SearchDocumentRequest): Result<PreparedDocumentSearch> {
    if (!isWellFormedUnicodeString(input.query) || input.query.length === 0) {
      return this.#schemaInvalid();
    }
    if (input.query.length > this.#limits.maxQueryUtf16Units) {
      return this.#requestTooLarge();
    }
    const kinds = readSearchKinds(input.kinds);
    if (kinds === undefined) {
      return this.#schemaInvalid();
    }
    const pageSize = this.#readPageSize(input.maxResults);
    if (pageSize.type === 'error') {
      return pageSize;
    }
    const queryHash = this.#queryHash({
      kinds: [...kinds],
      maxResults: pageSize.value,
      query: input.query,
      ...(input.sectionIds === undefined ? {} : { sectionIds: input.sectionIds }),
      service: 'document.search',
    });
    return queryHash.type === 'error'
      ? queryHash
      : {
          type: 'ok',
          value: { kinds, pageSize: pageSize.value, queryHash: queryHash.value },
        };
  }

  getChangesSince(request: GetDocumentChangesSinceRequest): GetDocumentChangesSinceResult {
    const authorized = this.#authorize(request);
    if (authorized.type === 'error') {
      return authorized;
    }
    if (!isDocumentWideScope(authorized.value.scope)) {
      return this.#error('SCOPE_VIOLATION');
    }
    if (this.#revisionHistorySource === undefined) {
      return this.#capabilityUnsupported();
    }
    const model = this.#getModel(authorized.value.document.uri);
    if (model.type === 'error') {
      return model;
    }
    const throughRevisionId = model.value.headRevisionId;
    const historyContext: AuthorizedDocumentReadContext = {
      ...authorized.value,
      document: {
        uri: authorized.value.document.uri,
        revisionId: throughRevisionId,
      },
    };
    const pageSize = this.#readPageSize(request.maxResults);
    if (pageSize.type === 'error') {
      return pageSize;
    }
    const queryHash = this.#queryHash({
      maxResults: pageSize.value,
      service: 'document.get_changes_since',
      sinceRevisionId: request.sinceRevisionId,
    });
    if (queryHash.type === 'error') {
      return queryHash;
    }
    const binding = this.#cursorBinding(
      historyContext,
      'document.get_changes_since',
      queryHash.value,
    );
    const start = this.#readCursorStart(request.cursor, binding);
    if (start.type === 'error') {
      return start;
    }
    const revisions = this.#readRevisionHistory({
      context: historyContext,
      sinceRevisionId: request.sinceRevisionId,
      throughRevisionId,
    });
    if (revisions.type === 'error') {
      return revisions;
    }
    if (start.value > revisions.value.length) {
      return this.#invalidCursor();
    }
    const items = revisions.value
      .slice(start.value, start.value + pageSize.value)
      .map((revision) => ({ revision }));
    return this.#pagedResult({
      binding: {
        context: historyContext,
        model: model.value,
        service: 'document.get_changes_since',
        queryHash: queryHash.value,
        start: start.value,
      },
      extra: { fromRevisionId: request.sinceRevisionId },
      items,
      hasMore: start.value + items.length < revisions.value.length,
    });
  }

  #readRevisionHistory(options: {
    readonly context: AuthorizedDocumentReadContext;
    readonly sinceRevisionId: RevisionId;
    readonly throughRevisionId: RevisionId;
  }): Result<readonly Revision[]> {
    const read = this.#callRevisionHistorySource(options);
    if (read.type === 'error') {
      return read;
    }
    if (!Array.isArray(read.value)) {
      return this.#invalidRevisionHistory(options.throughRevisionId);
    }
    const revisions = [...(read.value as readonly Revision[])];
    const validated = this.#validateRevisionHistory(options, revisions);
    return validated.type === 'error' ? validated : { type: 'ok', value: revisions };
  }

  #callRevisionHistorySource(options: {
    readonly context: AuthorizedDocumentReadContext;
    readonly sinceRevisionId: RevisionId;
    readonly throughRevisionId: RevisionId;
  }): Result<readonly Revision[]> {
    let read: ReturnType<DocumentRevisionHistorySource['getRevisions']>;
    try {
      read =
        this.#revisionHistorySource?.getRevisions({
          uri: options.context.document.uri,
          sinceRevisionId: options.sinceRevisionId,
          throughRevisionId: options.throughRevisionId,
          cancellation: options.context.cancellation ?? nonCancellingToken,
        }) ?? this.#capabilityUnsupported();
    } catch {
      return this.#error('INTERNAL_ERROR', options.throughRevisionId);
    }
    return read.type === 'error'
      ? this.#normalizeDependencyError(read.error, options.throughRevisionId)
      : read;
  }

  #validateRevisionHistory(
    options: {
      readonly context: AuthorizedDocumentReadContext;
      readonly sinceRevisionId: RevisionId;
      readonly throughRevisionId: RevisionId;
    },
    revisions: readonly Revision[],
  ): Result<void> {
    if (options.sinceRevisionId === options.throughRevisionId) {
      return revisions.length === 0
        ? { type: 'ok', value: undefined }
        : this.#invalidRevisionHistory(options.throughRevisionId);
    }
    let expectedParentRevisionId = options.sinceRevisionId;
    let previousSequence: number | undefined;
    const seen = new Set<RevisionId>();
    for (const revision of revisions) {
      if (this.#isCancelled(options.context)) {
        return this.#cancelled();
      }
      if (
        !isValidRevisionHistoryStep(
          revision,
          options.context.document.uri,
          expectedParentRevisionId,
          previousSequence,
          seen,
        )
      ) {
        return this.#invalidRevisionHistory(options.throughRevisionId);
      }
      seen.add(revision.id);
      expectedParentRevisionId = revision.id;
      previousSequence = revision.sequence;
    }
    return revisions.length > 0 && revisions[revisions.length - 1]?.id === options.throughRevisionId
      ? { type: 'ok', value: undefined }
      : this.#invalidRevisionHistory(options.throughRevisionId);
  }

  getDiagnostics(request: GetDocumentDiagnosticsRequest): GetDocumentDiagnosticsResult {
    const authorized = this.#authorize(request);
    if (authorized.type === 'error') {
      return authorized;
    }
    if (!isDocumentWideScope(authorized.value.scope)) {
      return this.#error('SCOPE_VIOLATION');
    }
    if (this.#diagnosticsSource === undefined) {
      return this.#capabilityUnsupported();
    }
    const prepared = this.#prepareDiagnosticsQuery(request);
    if (prepared.type === 'error') {
      return prepared;
    }
    const binding = this.#cursorBinding(
      authorized.value,
      'document.get_diagnostics',
      prepared.value.queryHash,
    );
    const start = this.#readCursorStart(request.cursor, binding);
    if (start.type === 'error') {
      return start;
    }
    const read = this.#readExactSnapshot(authorized.value);
    if (read.type === 'error') {
      return read;
    }
    const diagnostics = this.#readDiagnostics(authorized.value);
    if (diagnostics.type === 'error') {
      return diagnostics;
    }
    const filtered = this.#filterDiagnostics(
      authorized.value,
      diagnostics.value,
      prepared.value.filters,
    );
    if (filtered.type === 'error') {
      return filtered;
    }
    if (start.value > filtered.value.length) {
      return this.#invalidCursor();
    }
    const items = filtered.value.slice(start.value, start.value + prepared.value.pageSize);
    return this.#pagedResult({
      binding: {
        context: authorized.value,
        model: read.value.model,
        service: 'document.get_diagnostics',
        queryHash: prepared.value.queryHash,
        start: start.value,
      },
      items,
      hasMore: start.value + items.length < filtered.value.length,
    });
  }

  #prepareDiagnosticsQuery(request: GetDocumentDiagnosticsRequest): Result<{
    readonly filters: SuccessfulDiagnosticFilters;
    readonly pageSize: number;
    readonly queryHash: ContentHash;
  }> {
    const filters = readDiagnosticFilters(request.severities, request.codes);
    if (filters.type === 'error') {
      return this.#schemaInvalid();
    }
    const pageSize = this.#readPageSize(request.maxResults);
    if (pageSize.type === 'error') {
      return pageSize;
    }
    const queryHash = this.#queryHash({
      ...(filters.codes === undefined ? {} : { codes: filters.codes }),
      maxResults: pageSize.value,
      service: 'document.get_diagnostics',
      severities: filters.severities,
    });
    return queryHash.type === 'error'
      ? queryHash
      : {
          type: 'ok',
          value: { filters, pageSize: pageSize.value, queryHash: queryHash.value },
        };
  }

  #filterDiagnostics(
    context: AuthorizedDocumentReadContext,
    diagnostics: readonly Diagnostic[],
    filters: SuccessfulDiagnosticFilters,
  ): Result<readonly Diagnostic[]> {
    const severitySet = new Set(filters.severities);
    const codeSet = filters.codes === undefined ? undefined : new Set(filters.codes);
    const filtered: Diagnostic[] = [];
    for (const diagnostic of diagnostics) {
      if (this.#isCancelled(context)) {
        return this.#cancelled();
      }
      if (
        severitySet.has(diagnostic.severity) &&
        (codeSet === undefined || codeSet.has(diagnostic.code))
      ) {
        filtered.push(diagnostic);
      }
    }
    return { type: 'ok', value: filtered };
  }

  #readDiagnostics(context: AuthorizedDocumentReadContext): Result<readonly Diagnostic[]> {
    const read = this.#callDiagnosticsSource(context);
    if (read.type === 'error') {
      return read;
    }
    if (!Array.isArray(read.value)) {
      return this.#invalidDiagnostics(context.document.revisionId);
    }
    return this.#normalizeDiagnostics(context, read.value as readonly Diagnostic[]);
  }

  #callDiagnosticsSource(context: AuthorizedDocumentReadContext): Result<readonly Diagnostic[]> {
    let read: ReturnType<DocumentDiagnosticsSource['getDiagnostics']>;
    try {
      read =
        this.#diagnosticsSource?.getDiagnostics({
          document: context.document,
          scope: context.scope,
          cancellation: context.cancellation ?? nonCancellingToken,
        }) ?? this.#capabilityUnsupported();
    } catch {
      return this.#error('INTERNAL_ERROR', context.document.revisionId);
    }
    return read.type === 'error'
      ? this.#normalizeDependencyError(read.error, context.document.revisionId)
      : read;
  }

  #normalizeDiagnostics(
    context: AuthorizedDocumentReadContext,
    sourceDiagnostics: readonly Diagnostic[],
  ): Result<readonly Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    for (const diagnostic of sourceDiagnostics) {
      if (this.#isCancelled(context)) {
        return this.#cancelled();
      }
      const projected = projectDiagnosticForWire(diagnostic, context.document);
      if (projected === undefined) {
        return this.#invalidDiagnostics(context.document.revisionId);
      }
      diagnostics.push(projected);
    }
    return { type: 'ok', value: diagnostics };
  }

  #readExactSnapshot(context: AuthorizedDocumentReadContext): Result<ExactSnapshotRead> {
    const model = this.#getModel(context.document.uri);
    if (model.type === 'error') {
      return model;
    }
    const snapshot = model.value.getSnapshot(context.document.revisionId);
    if (snapshot.type === 'error') {
      return this.#normalizeDependencyError(snapshot.error, model.value.headRevisionId);
    }
    if (snapshot.value.revisionId !== context.document.revisionId) {
      return this.#error('INTERNAL_ERROR', model.value.headRevisionId);
    }
    return {
      type: 'ok',
      value: {
        model: model.value,
        snapshot: snapshot.value,
      },
    };
  }

  #readIndexedSnapshot(context: AuthorizedDocumentReadContext): Result<IndexedSnapshotRead> {
    const read = this.#readExactSnapshot(context);
    if (read.type === 'error') {
      return read;
    }
    const indexed = createDocumentIndex(read.value.snapshot);
    if (indexed.type === 'error') {
      return this.#error('SCHEMA_INVALID', read.value.model.headRevisionId);
    }
    const sectionScope = this.#validateSectionScope(context.scope, indexed.value);
    if (sectionScope.type === 'error') {
      return sectionScope;
    }
    return {
      type: 'ok',
      value: {
        ...read.value,
        index: indexed.value,
      },
    };
  }

  #getModel(uri: ResourceUri): Result<INirecoModel> {
    const model = this.#source.get(uri);
    if (model === undefined) {
      return this.#error('MODEL_NOT_FOUND');
    }
    if (model.isDisposed) {
      return this.#error('MODEL_DISPOSED', model.headRevisionId);
    }
    return { type: 'ok', value: model };
  }

  #authorize(request: DocumentReadContext): Result<AuthorizedDocumentReadContext> {
    if (this.#isCancelled(request)) {
      return this.#cancelled();
    }
    const resolution = this.#sessions.resolve(request.sessionId);
    if (resolution === undefined) {
      return this.#error('SESSION_REVOKED');
    }
    if ('status' in resolution) {
      return resolution.status === 'expired'
        ? this.#error('SESSION_EXPIRED')
        : this.#error('INTERNAL_ERROR');
    }
    const grant = resolution;
    if (!sameDocumentRef(request.document, grant.document)) {
      return this.#error('SCOPE_VIOLATION');
    }
    const scopeItemCount =
      (grant.scope.allowedNodeIds?.length ?? 0) + (grant.scope.allowedSectionIds?.length ?? 0);
    if (scopeItemCount > MAX_DOCUMENT_READ_SCOPE_IDS) {
      return this.#error('SCOPE_VIOLATION');
    }
    return {
      type: 'ok',
      value: {
        sessionId: request.sessionId,
        document: grant.document,
        scope: grant.scope,
        ...(request.cancellation === undefined ? {} : { cancellation: request.cancellation }),
      },
    };
  }

  #validateSectionScope(scope: DocumentReadScope, index: DocumentIndex): Result<void> {
    for (const sectionId of scope.allowedSectionIds ?? []) {
      if (index.getNode(sectionId)?.type !== 'section') {
        return this.#error('SCOPE_VIOLATION');
      }
    }
    return { type: 'ok', value: undefined };
  }

  #validateSearchSections(
    context: AuthorizedDocumentReadContext,
    index: DocumentIndex,
    sectionIds: readonly NodeId[] | undefined,
  ): Result<ReadonlySet<NodeId> | undefined> {
    if (sectionIds === undefined) {
      return { type: 'ok', value: undefined };
    }
    if (sectionIds.length > MAX_DOCUMENT_SEARCH_SECTION_IDS) {
      return this.#requestTooLarge();
    }
    const validated = new Set<NodeId>();
    for (const sectionId of sectionIds) {
      if (this.#isCancelled(context)) {
        return this.#cancelled();
      }
      const path = index.getNodePath(sectionId);
      const section = path?.nodes[path.nodes.length - 1];
      const pathIds = path?.nodes.map(({ id }) => id);
      if (
        section?.type !== 'section' ||
        pathIds === undefined ||
        readScopeAccess(context.scope, sectionId, pathIds) === 'none'
      ) {
        return this.#hiddenNode();
      }
      validated.add(sectionId);
    }
    return { type: 'ok', value: validated };
  }

  #readPageSize(value: number | undefined): Result<number> {
    if (value === undefined) {
      return { type: 'ok', value: this.#limits.maxPageItems };
    }
    if (!Number.isSafeInteger(value) || value <= 0) {
      return this.#schemaInvalid();
    }
    return value > this.#limits.maxPageItems ? this.#requestTooLarge() : { type: 'ok', value };
  }

  #queryHash(value: unknown): Result<ContentHash> {
    const hashed = createDocumentReadQueryHash(value);
    if (hashed.type === 'ok') {
      return { type: 'ok', value: hashed.hash };
    }
    if (hashed.reason === 'query-too-large') {
      return this.#requestTooLarge();
    }
    if (hashed.reason === 'invalid-query') {
      return this.#schemaInvalid();
    }
    return this.#error('INTERNAL_ERROR');
  }

  #cursorBinding(
    context: AuthorizedDocumentReadContext,
    service: DocumentReadCursorService,
    queryHash: ContentHash,
  ): DocumentReadCursorBinding {
    return {
      sessionId: context.sessionId,
      revisionId: context.document.revisionId,
      service,
      scope: context.scope,
      queryHash,
    };
  }

  #readCursorStart(cursor: string | undefined, binding: DocumentReadCursorBinding): Result<number> {
    if (cursor === undefined) {
      return { type: 'ok', value: 0 };
    }
    if (this.#cursorAdapter === undefined) {
      return this.#cursorUnavailable();
    }
    const decoded = this.#cursorAdapter.decode(cursor, binding);
    if (decoded.type === 'ok') {
      return { type: 'ok', value: decoded.position };
    }
    return decoded.reason === 'clock-invalid'
      ? this.#error('INTERNAL_ERROR')
      : this.#invalidCursor();
  }

  #pagedResult<TItem, TExtra extends object = Record<never, never>>(options: {
    readonly binding: PageBinding;
    readonly items: readonly TItem[];
    readonly hasMore: boolean;
    readonly extra?: TExtra;
  }): Result<RevisionBoundReadResult<DocumentPageResult<TItem> & TExtra>> {
    const items = [...options.items];
    let hasMore = options.hasMore;
    for (let attemptsRemaining = items.length + 1; attemptsRemaining > 0; attemptsRemaining -= 1) {
      if (hasMore && items.length === 0) {
        return this.#requestTooLarge();
      }
      const cursor = this.#issueNextCursor(options.binding, items.length, hasMore);
      if (cursor.type === 'error') {
        return cursor;
      }
      const measured = this.#measuredPageResult(
        options.binding,
        items,
        hasMore,
        cursor.value,
        options.extra,
      );
      if (measured.type === 'error') {
        return measured;
      }
      if (measured.value.bytes <= this.#limits.maxResponseBytes) {
        return { type: 'ok', value: measured.value.result };
      }
      if (items.length === 0) {
        return this.#requestTooLarge();
      }
      items.pop();
      hasMore = true;
    }
    return this.#error('INTERNAL_ERROR');
  }

  #issueNextCursor(
    binding: PageBinding,
    itemCount: number,
    hasMore: boolean,
  ): Result<string | undefined> {
    if (!hasMore) {
      return { type: 'ok', value: undefined };
    }
    if (this.#cursorAdapter === undefined) {
      return this.#cursorUnavailable();
    }
    const issued = this.#cursorAdapter.issue({
      ...this.#cursorBinding(binding.context, binding.service, binding.queryHash),
      position: binding.start + itemCount,
    });
    if (issued.type === 'ok') {
      return { type: 'ok', value: issued.cursor };
    }
    return issued.reason === 'cursor-too-large'
      ? this.#requestTooLarge()
      : this.#error('INTERNAL_ERROR');
  }

  #measuredPageResult<TItem, TExtra extends object>(
    binding: PageBinding,
    items: readonly TItem[],
    truncated: boolean,
    nextCursor: string | undefined,
    extra: TExtra | undefined,
  ): Result<{
    readonly result: RevisionBoundReadResult<DocumentPageResult<TItem> & TExtra>;
    readonly bytes: number;
  }> {
    let approximateBytes = 0;
    let result = this.#pageResult(binding, items, truncated, nextCursor, approximateBytes, extra);
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const bytes = measureResponseBytes(result);
      if (bytes === undefined) {
        return this.#responseSerializationError();
      }
      if (bytes === approximateBytes) {
        return { type: 'ok', value: { result, bytes } };
      }
      approximateBytes = bytes;
      result = this.#pageResult(binding, items, truncated, nextCursor, approximateBytes, extra);
    }
    const bytes = measureResponseBytes(result);
    if (bytes === undefined) {
      return this.#responseSerializationError();
    }
    return bytes === approximateBytes
      ? { type: 'ok', value: { result, bytes } }
      : this.#error('INTERNAL_ERROR');
  }

  #pageResult<TItem, TExtra extends object>(
    binding: PageBinding,
    items: readonly TItem[],
    truncated: boolean,
    nextCursor: string | undefined,
    approximateBytes: number,
    extra: TExtra | undefined,
  ): RevisionBoundReadResult<DocumentPageResult<TItem> & TExtra> {
    const page = {
      ...(extra ?? {}),
      items,
      ...(nextCursor === undefined ? {} : { nextCursor }),
      truncated,
      basedOnRevisionId: binding.context.document.revisionId,
      approximateBytes,
    } as DocumentPageResult<TItem> & TExtra;
    return this.#exactResult(binding.model, binding.context.document, page);
  }

  #boundedExactResult<TValue>(
    model: INirecoModel,
    document: DocumentReadContext['document'],
    value: TValue,
  ): Result<RevisionBoundReadResult<TValue>> {
    const result = this.#exactResult(model, document, value);
    const bytes = measureResponseBytes(result);
    return bytes !== undefined && bytes <= this.#limits.maxResponseBytes
      ? { type: 'ok', value: result }
      : bytes === undefined
        ? this.#responseSerializationError()
        : this.#requestTooLarge();
  }

  #exactResult<TValue>(
    model: INirecoModel,
    document: DocumentReadContext['document'],
    value: TValue,
  ): RevisionBoundReadResult<TValue> {
    return {
      document,
      basedOnRevisionId: document.revisionId,
      consistency: 'exact',
      status: model.headRevisionId === document.revisionId ? 'current' : 'stale',
      value,
    };
  }

  #isCancelled(context: DocumentReadContext): boolean {
    return context.cancellation?.isCancellationRequested === true;
  }

  #cancelled<TValue>(): Result<TValue> {
    return this.#error('CANCELLED');
  }

  #hiddenNode<TValue>(): Result<TValue> {
    return this.#error('NODE_NOT_FOUND');
  }

  #invalidCursor<TValue>(): Result<TValue> {
    return this.#schemaInvalid();
  }

  #cursorUnavailable<TValue>(): Result<TValue> {
    return this.#capabilityUnsupported();
  }

  #capabilityUnsupported<TValue>(): Result<TValue> {
    return this.#error('CAPABILITY_UNSUPPORTED');
  }

  #invalidRevisionHistory<TValue>(throughRevisionId: RevisionId): Result<TValue> {
    return this.#error('INTERNAL_ERROR', throughRevisionId);
  }

  #invalidDiagnostics<TValue>(revisionId: RevisionId): Result<TValue> {
    return this.#error('INTERNAL_ERROR', revisionId);
  }

  #requestTooLarge<TValue>(): Result<TValue> {
    return this.#error('REQUEST_TOO_LARGE');
  }

  #schemaInvalid<TValue>(): Result<TValue> {
    return this.#error('SCHEMA_INVALID');
  }

  #responseSerializationError<TValue>(): Result<TValue> {
    return this.#error('INTERNAL_ERROR');
  }

  #normalizeDependencyError<TValue>(
    error: NirecoError,
    currentRevisionId?: RevisionId,
  ): Result<TValue> {
    const code = isNirecoErrorCode(error.code) ? error.code : 'INTERNAL_ERROR';
    return {
      type: 'error',
      error: createNirecoCatalogError(code, this.#ids.allocateDebugId(), {
        ...(currentRevisionId === undefined ? {} : { currentRevisionId }),
      }),
    };
  }

  #error<TValue>(code: NirecoErrorCode, currentRevisionId?: RevisionId): Result<TValue> {
    return {
      type: 'error',
      error: createNirecoCatalogError(code, this.#ids.allocateDebugId(), {
        ...(currentRevisionId === undefined ? {} : { currentRevisionId }),
      }),
    };
  }
}

const DOCUMENT_BLOCK_NODE_TYPES: ReadonlySet<DocumentNode['type']> = new Set([
  'section',
  'paragraph',
  'heading',
  'figure',
  'table',
  'displayEquation',
  'blockQuote',
  'codeBlock',
  'list',
  'horizontalRule',
  'footnote',
]);

const DOCUMENT_DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const;
const DOCUMENT_DIAGNOSTIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const MAX_DOCUMENT_DIAGNOSTIC_CODE_UTF16_UNITS = 128;

function readNeighborhoodBlockCount(value: number): number | undefined {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_DOCUMENT_NEIGHBORHOOD_BLOCKS_PER_DIRECTION
    ? value
    : undefined;
}

function isDocumentBlockNode(node: DocumentNode): boolean {
  return DOCUMENT_BLOCK_NODE_TYPES.has(node.type);
}

function readDocumentChildren(node: DocumentNode): readonly DocumentNode[] {
  return 'children' in node ? node.children : [];
}

function pushDocumentChildren(pending: AuthorizedBlockVisit[], visit: AuthorizedBlockVisit): void {
  const children = readDocumentChildren(visit.node);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child !== undefined) {
      pending.push({ node: child, pathNodes: [...visit.pathNodes, child] });
    }
  }
}

function selectNeighborhoodVisits(options: {
  readonly afterBlocks: number;
  readonly beforeBlocks: number;
  readonly center: NeighborhoodCenter;
  readonly orderedBlocks: readonly AuthorizedBlockVisit[];
  readonly scope: DocumentReadScope;
}): readonly AuthorizedBlockVisit[] | undefined {
  const anchorIndex = options.orderedBlocks.findIndex(
    ({ node }) => node.id === options.center.anchorBlockId,
  );
  if (anchorIndex < 0) {
    return undefined;
  }
  const isAuthorized = (visit: AuthorizedBlockVisit): boolean =>
    readScopeAccess(
      options.scope,
      visit.node.id,
      visit.pathNodes.map(({ id }) => id),
    ) !== 'none';
  const authorizedBefore = options.orderedBlocks.slice(0, anchorIndex).filter(isAuthorized);
  const before = options.beforeBlocks === 0 ? [] : authorizedBefore.slice(-options.beforeBlocks);
  const after = options.orderedBlocks
    .slice(anchorIndex + 1)
    .filter(isAuthorized)
    .slice(0, options.afterBlocks);
  return [...before, options.center.visit, ...after];
}

function isValidRevisionHistoryStep(
  revision: Revision,
  expectedUri: ResourceUri,
  expectedParentRevisionId: RevisionId,
  previousSequence: number | undefined,
  seen: ReadonlySet<RevisionId>,
): boolean {
  return (
    revision.uri === expectedUri &&
    revision.parentRevisionId === expectedParentRevisionId &&
    !seen.has(revision.id) &&
    Number.isSafeInteger(revision.sequence) &&
    revision.sequence >= 0 &&
    (previousSequence === undefined || revision.sequence === previousSequence + 1)
  );
}

function diagnosticTargetMatchesDocument(
  target: Diagnostic['target'],
  document: DocumentReadContext['document'],
): boolean {
  return target === undefined || sameDocumentRef(target.document, document);
}

function projectDiagnosticForWire(
  diagnostic: Diagnostic,
  document: DocumentReadContext['document'],
): Diagnostic | undefined {
  if (
    diagnostic.basedOnRevisionId !== document.revisionId ||
    !diagnosticTargetMatchesDocument(diagnostic.target, document) ||
    diagnostic.related?.some(
      ({ target }) => target !== undefined && !diagnosticTargetMatchesDocument(target, document),
    ) === true
  ) {
    return undefined;
  }
  const related = diagnostic.related?.filter(({ target }) => target !== undefined);
  return {
    ...diagnostic,
    ...(related === undefined ? {} : { related }),
  };
}

type DiagnosticFiltersResult =
  | {
      readonly type: 'ok';
      readonly severities: readonly DocumentDiagnosticSeverity[];
      readonly codes?: readonly string[];
    }
  | { readonly type: 'error' };

type SuccessfulDiagnosticFilters = Extract<DiagnosticFiltersResult, { readonly type: 'ok' }>;

function readDiagnosticFilters(
  severityValues: readonly DocumentDiagnosticSeverity[] | undefined,
  codeValues: readonly string[] | undefined,
): DiagnosticFiltersResult {
  const severities = severityValues ?? DOCUMENT_DIAGNOSTIC_SEVERITIES;
  if (
    severities.some((severity) => !DOCUMENT_DIAGNOSTIC_SEVERITIES.includes(severity)) ||
    new Set(severities).size !== severities.length
  ) {
    return { type: 'error' };
  }
  const normalizedSeverities = DOCUMENT_DIAGNOSTIC_SEVERITIES.filter((severity) =>
    severities.includes(severity),
  );
  if (codeValues === undefined) {
    return { type: 'ok', severities: normalizedSeverities };
  }
  if (
    codeValues.length > 256 ||
    codeValues.some(
      (code) =>
        typeof code !== 'string' ||
        code.length > MAX_DOCUMENT_DIAGNOSTIC_CODE_UTF16_UNITS ||
        !DOCUMENT_DIAGNOSTIC_CODE_PATTERN.test(code),
    ) ||
    new Set(codeValues).size !== codeValues.length
  ) {
    return { type: 'error' };
  }
  return {
    type: 'ok',
    severities: normalizedSeverities,
    codes: [...codeValues].sort(compareDocumentStrings),
  };
}

function compareDocumentStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readLimits(overrides: Partial<DocumentReadLimits> | undefined): DocumentReadLimits {
  const limits = {
    ...DEFAULT_DOCUMENT_READ_LIMITS,
    ...overrides,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`Document read limit ${name} must be a positive safe integer.`);
    }
  }
  for (const name of ['maxPageItems', 'maxRequestNodeIds', 'maxQueryUtf16Units'] as const) {
    if (limits[name] > DEFAULT_DOCUMENT_READ_LIMITS[name]) {
      throw new RangeError(`Document read limit ${name} cannot exceed its Preview.2 hard cap.`);
    }
  }
  if (limits.maxPageItems > limits.maxRequestNodeIds) {
    throw new RangeError('Document read maxPageItems cannot exceed maxRequestNodeIds.');
  }
  return limits;
}

function readMaxDepth(value: number | undefined): number | undefined {
  if (value === undefined) {
    return MAX_DOCUMENT_OUTLINE_DEPTH;
  }
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_DOCUMENT_OUTLINE_DEPTH
    ? value
    : undefined;
}

function readSearchKinds(
  value: readonly unknown[] | undefined,
): ReadonlySet<DocumentSearchKind> | undefined {
  const canonicalOrder = ['text', 'citation', 'claim', 'heading'] as const;
  if (value === undefined) {
    return new Set<DocumentSearchKind>(canonicalOrder);
  }
  if (
    value.some((kind) => !canonicalOrder.some((candidate) => candidate === kind)) ||
    new Set(value).size !== value.length
  ) {
    return undefined;
  }
  const kinds = new Set<DocumentSearchKind>();
  for (const kind of canonicalOrder) {
    if (value.includes(kind)) {
      kinds.add(kind);
    }
  }
  return kinds;
}

type SearchRequestCaptureResult =
  | { readonly type: 'ok'; readonly value: SearchDocumentRequest }
  | { readonly type: 'error'; readonly reason: 'invalid-request' | 'request-too-large' };

type SearchDataRecordCaptureResult =
  | { readonly type: 'ok'; readonly values: ReadonlyMap<string, unknown> }
  | { readonly type: 'error' };

type SearchArrayCaptureResult =
  | { readonly type: 'ok'; readonly values: readonly unknown[] | undefined }
  | { readonly type: 'error'; readonly reason: 'invalid-request' | 'request-too-large' };

type SearchCancellationCaptureResult =
  | { readonly type: 'ok'; readonly value: CancellationToken | undefined }
  | { readonly type: 'error' };

type MutableSearchDocumentRequest = {
  -readonly [TKey in keyof SearchDocumentRequest]: SearchDocumentRequest[TKey];
};

const SEARCH_REQUEST_FIELDS: ReadonlySet<string> = new Set([
  'sessionId',
  'document',
  'cancellation',
  'query',
  'sectionIds',
  'kinds',
  'cursor',
  'maxResults',
]);
const SEARCH_DOCUMENT_FIELDS: ReadonlySet<string> = new Set(['uri', 'revisionId']);

/** Captures the whole Search boundary once without invoking request accessors. */
function captureSearchDocumentRequest(value: unknown): SearchRequestCaptureResult {
  const request = captureSearchDataRecord(value, SEARCH_REQUEST_FIELDS);
  if (request.type === 'error') {
    return { type: 'error', reason: 'invalid-request' };
  }
  const sessionId = request.values.get('sessionId');
  const query = request.values.get('query');
  const cursor = request.values.get('cursor');
  const maxResults = request.values.get('maxResults');
  if (!areCapturedSearchScalarsValid(sessionId, query, cursor, maxResults)) {
    return { type: 'error', reason: 'invalid-request' };
  }
  const document = captureSearchDocumentRef(request.values.get('document'));
  const cancellation = captureSearchCancellation(request.values.get('cancellation'));
  if (document === undefined) {
    return { type: 'error', reason: 'invalid-request' };
  }
  if (cancellation.type === 'error') {
    return { type: 'error', reason: 'invalid-request' };
  }
  const sectionIds = captureSearchArray(
    request.values.get('sectionIds'),
    MAX_DOCUMENT_SEARCH_SECTION_IDS,
  );
  const kinds = captureSearchArray(request.values.get('kinds'), 4);
  if (sectionIds.type === 'error') {
    return sectionIds;
  }
  if (kinds.type === 'error') {
    return kinds;
  }
  return {
    type: 'ok',
    value: buildCapturedSearchRequest({
      sessionId: sessionId as SearchDocumentRequest['sessionId'],
      document,
      query: query as string,
      cancellation: cancellation.value,
      sectionIds: sectionIds.values,
      kinds: kinds.values,
      cursor,
      maxResults,
    }),
  };
}

function areCapturedSearchScalarsValid(
  sessionId: unknown,
  query: unknown,
  cursor: unknown,
  maxResults: unknown,
): sessionId is string {
  return (
    typeof sessionId === 'string' &&
    typeof query === 'string' &&
    (cursor === undefined || typeof cursor === 'string') &&
    (maxResults === undefined || typeof maxResults === 'number')
  );
}

function buildCapturedSearchRequest(options: {
  readonly sessionId: SearchDocumentRequest['sessionId'];
  readonly document: SearchDocumentRequest['document'];
  readonly query: string;
  readonly cancellation: CancellationToken | undefined;
  readonly sectionIds: readonly unknown[] | undefined;
  readonly kinds: readonly unknown[] | undefined;
  readonly cursor: unknown;
  readonly maxResults: unknown;
}): SearchDocumentRequest {
  const request: MutableSearchDocumentRequest = {
    sessionId: options.sessionId,
    document: options.document,
    query: options.query,
  };
  if (options.cancellation !== undefined) {
    request.cancellation = options.cancellation;
  }
  if (options.sectionIds !== undefined) {
    request.sectionIds = options.sectionIds as NonNullable<SearchDocumentRequest['sectionIds']>;
  }
  if (options.kinds !== undefined) {
    request.kinds = options.kinds as NonNullable<SearchDocumentRequest['kinds']>;
  }
  if (typeof options.cursor === 'string') {
    request.cursor = options.cursor;
  }
  if (typeof options.maxResults === 'number') {
    request.maxResults = options.maxResults;
  }
  return request;
}

function captureSearchDocumentRef(value: unknown): SearchDocumentRequest['document'] | undefined {
  const document = captureSearchDataRecord(value, SEARCH_DOCUMENT_FIELDS);
  if (document.type === 'error') {
    return undefined;
  }
  const uri = document.values.get('uri');
  const revisionId = document.values.get('revisionId');
  return typeof uri === 'string' && typeof revisionId === 'string'
    ? {
        uri: uri as SearchDocumentRequest['document']['uri'],
        revisionId: revisionId as SearchDocumentRequest['document']['revisionId'],
      }
    : undefined;
}

function captureSearchCancellation(value: unknown): SearchCancellationCaptureResult {
  if (value === undefined) {
    return { type: 'ok', value: undefined };
  }
  if (value === null || typeof value !== 'object') {
    return { type: 'error' };
  }
  const source = value as CancellationToken;
  const isCancellationRequested = (): boolean => {
    try {
      return source.isCancellationRequested;
    } catch {
      return true;
    }
  };
  return {
    type: 'ok',
    value: Object.freeze({
      get isCancellationRequested(): boolean {
        return isCancellationRequested();
      },
      throwIfCancellationRequested(): void {
        if (isCancellationRequested()) {
          throw new Error('The document Search was cancelled.');
        }
      },
    }),
  };
}

function captureSearchDataRecord(
  value: unknown,
  allowedFields: ReadonlySet<string>,
): SearchDataRecordCaptureResult {
  try {
    if (value === null || typeof value !== 'object') {
      return { type: 'error' };
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { type: 'error' };
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > allowedFields.size) {
      return { type: 'error' };
    }
    const values = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== 'string' || !allowedFields.has(key)) {
        return { type: 'error' };
      }
      const property = captureSearchDataProperty(value, key, true);
      if (property.type === 'error') {
        return { type: 'error' };
      }
      values.set(key, property.value);
    }
    return { type: 'ok', values };
  } catch {
    return { type: 'error' };
  }
}

function captureSearchArray(value: unknown, maxItems: number): SearchArrayCaptureResult {
  if (value === undefined) {
    return { type: 'ok', values: undefined };
  }
  try {
    if (!isPlainSearchArray(value)) {
      return { type: 'error', reason: 'invalid-request' };
    }
    const length = readSearchArrayLength(value);
    if (length === undefined) {
      return { type: 'error', reason: 'invalid-request' };
    }
    if (length > maxItems) {
      return { type: 'error', reason: 'request-too-large' };
    }
    if (!hasDenseSearchArrayKeys(value, length)) {
      return { type: 'error', reason: 'invalid-request' };
    }
    return captureSearchArrayItems(value, length);
  } catch {
    return { type: 'error', reason: 'invalid-request' };
  }
}

function isPlainSearchArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && Reflect.getPrototypeOf(value) === Array.prototype;
}

function readSearchArrayLength(value: readonly unknown[]): number | undefined {
  const lengthProperty = captureSearchDataProperty(value, 'length', false);
  const length = lengthProperty.type === 'ok' ? lengthProperty.value : undefined;
  return typeof length === 'number' && Number.isSafeInteger(length) && length >= 0
    ? length
    : undefined;
}

function hasDenseSearchArrayKeys(value: readonly unknown[], length: number): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === length + 1 && keys.every((key) => isSearchArrayOwnKey(key, length));
}

function captureSearchArrayItems(
  value: readonly unknown[],
  length: number,
): SearchArrayCaptureResult {
  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const property = captureSearchDataProperty(value, String(index), true);
    if (property.type === 'error') {
      return { type: 'error', reason: 'invalid-request' };
    }
    values.push(property.value);
  }
  return { type: 'ok', values };
}

function captureSearchDataProperty(
  value: object,
  key: string,
  enumerable: boolean,
): { readonly type: 'ok'; readonly value: unknown } | { readonly type: 'error' } {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === enumerable
    ? { type: 'ok', value: descriptor.value }
    : { type: 'error' };
}

function isSearchArrayOwnKey(key: PropertyKey, length: number): boolean {
  if (key === 'length') {
    return true;
  }
  if (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function sameDocumentRef(
  left: DocumentReadContext['document'],
  right: DocumentReadContext['document'],
): boolean {
  return left.uri === right.uri && left.revisionId === right.revisionId;
}

function measureResponseBytes(value: unknown): number | undefined {
  const serialized = serializeCanonicalJson({ type: 'ok', value });
  return serialized.type === 'error' ? undefined : encodeUtf8(serialized.value).length;
}
