import type { CancellationToken } from '../../base/cancellation/cancellation-token.js';
import type { NirecoError, NirecoErrorCode, Result } from '../../base/errors/nireco-error.js';
import { NIRECO_ERROR_CATALOG } from '../../base/errors/nireco-error-catalog.js';
import { encodeUtf8 } from '../../base/hashing/portable-sha-256.js';
import {
  parseDebugId,
  parseEntityId,
  parseNodeId,
  parseRevisionId,
  type NodeId,
} from '../../base/ids/identifiers.js';
import {
  MAX_CANONICAL_JSON_DEPTH,
  isWellFormedUnicodeString,
  serializeCanonicalJson,
} from '../../base/serialization/canonical-json.js';
import { isDocumentUri } from '../../base/uri/resource-uri.js';
import type { Mark } from '../../model/node/manuscript-node.js';
import type { IIdAllocator } from '../../workspace/id-allocator.js';
import type {
  JsonObject1 as GeneratedJsonObject,
  JsonValue as GeneratedJsonValue,
  Mark as GeneratedMark,
  ReadableDocumentNode as GeneratedReadableDocumentNode,
  SemanticPosition as GeneratedSemanticPosition,
  SemanticTargetRef as GeneratedSemanticTargetRef,
} from '../../../contracts/comet-integration/generated-types/integration.js';
import type {
  GetDocumentChangesSinceResult as Preview2GetDocumentChangesSinceValue,
  GetDocumentDiagnosticsResult as Preview2GetDocumentDiagnosticsValue,
  GetDocumentHeadResult as Preview2GetDocumentHeadValue,
  GetDocumentOutlineResult as Preview2GetDocumentOutlineValue,
  GetDocumentSnapshotResult as Preview2GetDocumentSnapshotValue,
  PageResult as Preview2PageValue,
  ResolveModelResult as Preview2ResolveModelValue,
  SearchDocumentResult as Preview2SearchDocumentValue,
} from './contract-types.js';
import type {
  DocumentHead,
  DocumentPageResult,
  DocumentReadService,
  GetDocumentChangesSinceRequest,
  GetDocumentDiagnosticsRequest,
  GetDocumentHeadRequest,
  GetDocumentOutlineRequest,
  GetDocumentSnapshotRequest,
  ReadDocumentNode,
  ReadDocumentNodeNeighborhoodRequest,
  ReadDocumentNodesRequest,
  RevisionBoundReadResult,
  SearchDocumentRequest,
} from '../../services/document-service/document-read-types.js';
import type {
  ResolveModelService,
  ResolveModelValue,
} from '../../services/workspace-service/resolve-model-types.js';

type Preview2ReadDocumentNodesValue = Preview2PageValue<GeneratedReadableDocumentNode>;

type DeepReadonly<TValue> = TValue extends readonly (infer TItem)[]
  ? readonly DeepReadonly<TItem>[]
  : TValue extends object
    ? { readonly [TKey in keyof TValue]: DeepReadonly<TValue[TKey]> }
    : TValue;

export type Preview2WireError = NirecoError & {
  readonly conflictingTargets?: readonly DeepReadonly<GeneratedSemanticTargetRef>[];
};

interface Preview2ReadDocumentNodeNeighborhoodValue extends Preview2PageValue<GeneratedReadableDocumentNode> {
  readonly centerNodeId: NodeId;
}

export type Preview2ResolveModelWireResult = Result<Preview2ResolveModelValue, Preview2WireError>;
export type Preview2GetDocumentHeadWireResult = Result<
  Preview2GetDocumentHeadValue,
  Preview2WireError
>;
export type Preview2GetDocumentSnapshotWireResult = Result<
  Preview2GetDocumentSnapshotValue,
  Preview2WireError
>;
export type Preview2GetDocumentOutlineWireResult = Result<
  Preview2GetDocumentOutlineValue,
  Preview2WireError
>;
export type Preview2ReadDocumentNodesWireResult = Result<
  Preview2ReadDocumentNodesValue,
  Preview2WireError
>;
export type Preview2ReadDocumentNodeNeighborhoodWireResult = Result<
  Preview2ReadDocumentNodeNeighborhoodValue,
  Preview2WireError
>;
export type Preview2SearchDocumentWireResult = Result<
  Preview2SearchDocumentValue,
  Preview2WireError
>;
export type Preview2GetDocumentChangesSinceWireResult = Result<
  Preview2GetDocumentChangesSinceValue,
  Preview2WireError
>;
export type Preview2GetDocumentDiagnosticsWireResult = Result<
  Preview2GetDocumentDiagnosticsValue,
  Preview2WireError
>;

export interface Preview2ReadWireAdapterOptions {
  readonly resolveModel: ResolveModelService;
  readonly documentRead: DocumentReadService;
  readonly ids: Pick<IIdAllocator, 'allocateDebugId'>;
}

/**
 * Response-only Preview.2 boundary.
 *
 * The in-process services deliberately use a nested
 * `RevisionBoundReadResult<TValue>` representation. The Preview.2 schemas put
 * endpoint fields such as `snapshot`, `items`, `centerNodeId`, and
 * `fromRevisionId` beside the Revision binding instead. This adapter performs
 * only that deterministic flattening. It captures service-owned values through
 * inert data descriptors, closes errors to the Preview.2 schema, validates
 * canonical JSON, and returns detached deeply frozen data. It does not decode
 * wire requests, negotiate capabilities, or claim a transport implementation.
 */
export class Preview2ReadWireAdapter {
  readonly #resolveModel: ResolveModelService;
  readonly #documentRead: DocumentReadService;
  readonly #ids: Pick<IIdAllocator, 'allocateDebugId'>;

  constructor(options: Preview2ReadWireAdapterOptions) {
    this.#resolveModel = options.resolveModel;
    this.#documentRead = options.documentRead;
    this.#ids = options.ids;
  }

  resolveModel(request: unknown, cancellation?: CancellationToken): Preview2ResolveModelWireResult {
    return this.#mapResult(
      () => this.#resolveModel.resolve(request, cancellation),
      flattenResolveModel,
    );
  }

  getHead(request: GetDocumentHeadRequest): Preview2GetDocumentHeadWireResult {
    return this.#mapResult(() => this.#documentRead.getHead(request), flattenDocumentHead);
  }

  getSnapshot(request: GetDocumentSnapshotRequest): Preview2GetDocumentSnapshotWireResult {
    return this.#mapResult(
      () => this.#documentRead.getSnapshot(request),
      (value) => {
        if (value.value.revisionId !== value.basedOnRevisionId) {
          throw new TypeError('A Snapshot response did not match its Revision binding.');
        }
        return {
          ...flattenRevisionBinding(value),
          snapshot: value.value,
        } satisfies Preview2GetDocumentSnapshotValue;
      },
    );
  }

  getOutline(request: GetDocumentOutlineRequest): Preview2GetDocumentOutlineWireResult {
    return this.#mapResult(
      () => this.#documentRead.getOutline(request),
      (value) => {
        const page = flattenPage(value, 0);
        return finalizePage((approximateBytes) => ({
          ...page,
          approximateBytes,
        })) satisfies Preview2GetDocumentOutlineValue;
      },
    );
  }

  readNodes(request: ReadDocumentNodesRequest): Preview2ReadDocumentNodesWireResult {
    return this.#mapResult(
      () => this.#documentRead.readNodes(request),
      (value) => {
        const page = flattenReadableNodePage(value, 0);
        return finalizePage((approximateBytes) => ({
          ...page,
          approximateBytes,
        })) satisfies Preview2ReadDocumentNodesValue;
      },
    );
  }

  readNodeNeighborhood(
    request: ReadDocumentNodeNeighborhoodRequest,
  ): Preview2ReadDocumentNodeNeighborhoodWireResult {
    return this.#mapResult(
      () => this.#documentRead.readNodeNeighborhood(request),
      (value) => {
        const page = {
          ...flattenReadableNodePage(value, 0),
          centerNodeId: value.value.centerNodeId,
        };
        return finalizePage((approximateBytes) => ({
          ...page,
          approximateBytes,
        })) satisfies Preview2ReadDocumentNodeNeighborhoodValue;
      },
    );
  }

  search(request: SearchDocumentRequest): Preview2SearchDocumentWireResult {
    return this.#mapResult(
      () => this.#documentRead.search(request),
      (value) => {
        const page = flattenPage(value, 0);
        return finalizePage((approximateBytes) => ({
          ...page,
          approximateBytes,
        })) satisfies Preview2SearchDocumentValue;
      },
    );
  }

  getChangesSince(
    request: GetDocumentChangesSinceRequest,
  ): Preview2GetDocumentChangesSinceWireResult {
    return this.#mapResult(
      () => this.#documentRead.getChangesSince(request),
      (value) => {
        const page = {
          ...flattenPage(value, 0),
          fromRevisionId: value.value.fromRevisionId,
        };
        return finalizePage((approximateBytes) => ({
          ...page,
          approximateBytes,
        })) satisfies Preview2GetDocumentChangesSinceValue;
      },
    );
  }

  getDiagnostics(request: GetDocumentDiagnosticsRequest): Preview2GetDocumentDiagnosticsWireResult {
    return this.#mapResult(
      () => this.#documentRead.getDiagnostics(request),
      (value) => {
        const page = flattenPage(value, 0);
        return finalizePage((approximateBytes) => ({
          ...page,
          approximateBytes,
        })) satisfies Preview2GetDocumentDiagnosticsValue;
      },
    );
  }

  #mapResult<TSource, TTarget>(
    call: () => Result<TSource>,
    map: (value: TSource) => TTarget,
  ): Result<TTarget, Preview2WireError> {
    try {
      const result = captureServiceResult<TSource>(call());
      if (result.type === 'error') {
        return freezeCanonicalTree({ type: 'error', error: result.error });
      }

      const mapped = { type: 'ok', value: map(result.value) } as const;
      assertCanonicalJson(mapped, 'A Preview.2 read response was not canonical JSON data.');
      return freezeCanonicalTree(mapped);
    } catch {
      return freezeCanonicalTree({
        type: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          category: 'internal',
          retryable: true,
          safeMessage: 'The service could not complete the request.',
          debugId: this.#ids.allocateDebugId(),
          suggestedAction: 'retry',
        },
      });
    }
  }
}

type CapturedServiceResult<TValue> =
  | { readonly type: 'ok'; readonly value: TValue }
  | { readonly type: 'error'; readonly error: Preview2WireError };

type CanonicalRecord = Record<string, unknown>;

const ERROR_CATALOG = NIRECO_ERROR_CATALOG;
const ERROR_REQUIRED_KEYS = [
  'code',
  'category',
  'retryable',
  'safeMessage',
  'debugId',
  'suggestedAction',
] as const;
const ERROR_OPTIONAL_KEYS = [
  'currentRevisionId',
  'requiredCapability',
  'conflictingTargets',
] as const;
const REQUIRED_CAPABILITY_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;

function captureServiceResult<TValue>(source: unknown): CapturedServiceResult<TValue> {
  const captured = cloneCanonicalJson(source);
  const result = requireCanonicalRecord(captured);
  if (result['type'] === 'ok') {
    assertExactKeys(result, ['type', 'value']);
    return { type: 'ok', value: result['value'] as TValue };
  }
  if (result['type'] === 'error') {
    assertExactKeys(result, ['type', 'error']);
    return { type: 'error', error: captureWireError(result['error']) };
  }
  throw new TypeError('A service Result did not have a recognized discriminant.');
}

function captureWireError(source: unknown): Preview2WireError {
  const error = requireCanonicalRecord(source);
  assertClosedKeys(error, ERROR_REQUIRED_KEYS, ERROR_OPTIONAL_KEYS);
  const required = captureRequiredErrorFields(error);
  const currentRevisionId = captureCurrentRevisionId(error['currentRevisionId']);
  const requiredCapability = captureRequiredCapability(error['requiredCapability']);
  const conflictingTargets = captureConflictingTargets(error['conflictingTargets']);

  return {
    ...required,
    ...(currentRevisionId === undefined ? {} : { currentRevisionId }),
    ...(requiredCapability === undefined ? {} : { requiredCapability }),
    ...(conflictingTargets === undefined ? {} : { conflictingTargets }),
  };
}

function captureRequiredErrorFields(error: CanonicalRecord): NirecoError {
  const code = error['code'];
  const category = error['category'];
  const retryable = error['retryable'];
  const safeMessage = error['safeMessage'];
  const debugId = error['debugId'];
  const suggestedAction = error['suggestedAction'];
  if (typeof code !== 'string' || !Object.hasOwn(ERROR_CATALOG, code)) {
    throw new TypeError('A service error code was not recognized.');
  }
  const catalog = ERROR_CATALOG[code as NirecoErrorCode];
  if (typeof debugId !== 'string' || parseDebugId(debugId).type !== 'valid') {
    throw new TypeError('A service error debugId was not a Debug ID.');
  }
  if (
    category !== catalog.category ||
    retryable !== catalog.retryable ||
    safeMessage !== catalog.safeMessage ||
    suggestedAction !== catalog.suggestedAction
  ) {
    throw new TypeError('A service error did not match its normative catalog entry.');
  }
  return {
    code: code as NirecoError['code'],
    category: catalog.category,
    retryable: catalog.retryable,
    safeMessage: catalog.safeMessage,
    debugId: debugId as NirecoError['debugId'],
    suggestedAction: catalog.suggestedAction,
  };
}

function captureCurrentRevisionId(
  value: unknown,
): NonNullable<NirecoError['currentRevisionId']> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || parseRevisionId(value).type !== 'valid') {
    throw new TypeError('A service error currentRevisionId was not a Revision ID.');
  }
  return value as NonNullable<NirecoError['currentRevisionId']>;
}

function captureRequiredCapability(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !REQUIRED_CAPABILITY_PATTERN.test(value)) {
    throw new TypeError('A service error requiredCapability was not canonical.');
  }
  return value;
}

function captureConflictingTargets(
  value: unknown,
): readonly DeepReadonly<GeneratedSemanticTargetRef>[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every(isGeneratedSemanticTargetRef)) {
    throw new TypeError('A service error conflictingTargets value was not schema-valid.');
  }
  return value;
}

function isGeneratedSemanticTargetRef(value: unknown): value is GeneratedSemanticTargetRef {
  if (!isCanonicalRecord(value)) {
    return false;
  }
  switch (value['kind']) {
    case 'node':
      return isGeneratedNodeTargetRef(value);
    case 'academic-entity':
      return isGeneratedEntityTargetRef(value);
    case 'range':
      return isGeneratedRangeTargetRef(value);
    case 'metadata':
      return isGeneratedMetadataTargetRef(value);
    default:
      return false;
  }
}

function isGeneratedNodeTargetRef(value: CanonicalRecord): boolean {
  return (
    hasExactKeys(value, ['kind', 'document', 'nodeId']) &&
    isGeneratedDocumentRef(value['document']) &&
    typeof value['nodeId'] === 'string' &&
    parseNodeId(value['nodeId']).type === 'valid'
  );
}

function isGeneratedEntityTargetRef(value: CanonicalRecord): boolean {
  return (
    hasExactKeys(value, ['kind', 'document', 'entityId']) &&
    isGeneratedDocumentRef(value['document']) &&
    typeof value['entityId'] === 'string' &&
    parseEntityId(value['entityId']).type === 'valid'
  );
}

function isGeneratedRangeTargetRef(value: CanonicalRecord): boolean {
  return (
    hasExactKeys(value, ['kind', 'document', 'start', 'end']) &&
    isGeneratedDocumentRef(value['document']) &&
    isGeneratedSemanticPosition(value['start']) &&
    isGeneratedSemanticPosition(value['end'])
  );
}

function isGeneratedMetadataTargetRef(value: CanonicalRecord): boolean {
  const field = value['field'];
  return (
    hasExactKeys(value, ['kind', 'document', 'field']) &&
    isGeneratedDocumentRef(value['document']) &&
    (field === 'title' || field === 'authors' || field === 'abstract' || field === 'keywords')
  );
}

function isGeneratedDocumentRef(value: unknown): boolean {
  return (
    isCanonicalRecord(value) &&
    hasExactKeys(value, ['uri', 'revisionId']) &&
    typeof value['uri'] === 'string' &&
    isDocumentUri(value['uri']) &&
    typeof value['revisionId'] === 'string' &&
    parseRevisionId(value['revisionId']).type === 'valid'
  );
}

function isGeneratedSemanticPosition(value: unknown): value is GeneratedSemanticPosition {
  if (!isCanonicalRecord(value)) {
    return false;
  }
  if (value['kind'] === 'text') {
    return isGeneratedTextPosition(value);
  }
  return value['kind'] === 'node-boundary' && isGeneratedNodeBoundaryPosition(value);
}

function isGeneratedTextPosition(value: CanonicalRecord): boolean {
  return (
    hasExactKeys(value, ['kind', 'textNodeId', 'utf16Offset', 'affinity']) &&
    typeof value['textNodeId'] === 'string' &&
    parseNodeId(value['textNodeId']).type === 'valid' &&
    isGeneratedUtf16Offset(value['utf16Offset']) &&
    isGeneratedAffinity(value['affinity'])
  );
}

function isGeneratedNodeBoundaryPosition(value: CanonicalRecord): boolean {
  return (
    hasExactKeys(value, ['kind', 'parentNodeId', 'childIndex', 'affinity']) &&
    typeof value['parentNodeId'] === 'string' &&
    parseNodeId(value['parentNodeId']).type === 'valid' &&
    isGeneratedUtf16Offset(value['childIndex']) &&
    isGeneratedAffinity(value['affinity'])
  );
}

function isGeneratedUtf16Offset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isGeneratedAffinity(value: unknown): value is 'before' | 'after' {
  return value === 'before' || value === 'after';
}

function cloneCanonicalJson(value: unknown): unknown {
  return cloneCanonicalValue(value, new Set<object>(), 0);
}

function cloneCanonicalValue(value: unknown, active: Set<object>, depth: number): unknown {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (!isWellFormedUnicodeString(value)) {
      throw new TypeError('A service Result contained invalid Unicode.');
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('A service Result contained a non-finite number.');
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError('A service Result contained a non-JSON value.');
  }
  if (depth > MAX_CANONICAL_JSON_DEPTH || active.has(value)) {
    throw new TypeError('A service Result was cyclic or exceeded the canonical JSON depth.');
  }

  active.add(value);
  try {
    return Array.isArray(value)
      ? cloneCanonicalArray(value, active, depth)
      : cloneCanonicalRecord(value, active, depth);
  } finally {
    active.delete(value);
  }
}

function cloneCanonicalArray(
  value: object,
  active: Set<object>,
  depth: number,
): readonly unknown[] {
  if (Reflect.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError('A service Result array had a non-canonical prototype.');
  }
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined || !('value' in lengthDescriptor)) {
    throw new TypeError('A service Result array did not expose an inert length descriptor.');
  }
  const length = lengthDescriptor.value as unknown;
  if (!isCanonicalArrayLength(length)) {
    throw new TypeError('A service Result array length was invalid.');
  }

  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || !keys.every((key) => isCanonicalArrayKey(key, length))) {
    throw new TypeError('A service Result array was sparse or had extra properties.');
  }

  const copied: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('A service Result array item was not an inert data property.');
    }
    copied.push(cloneCanonicalValue(descriptor.value, active, depth + 1));
  }
  return copied;
}

function isCanonicalArrayLength(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCanonicalArrayKey(key: PropertyKey, length: number): boolean {
  if (key === 'length') {
    return true;
  }
  if (typeof key !== 'string') {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function cloneCanonicalRecord(value: object, active: Set<object>, depth: number): CanonicalRecord {
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('A service Result object had a non-canonical prototype.');
  }

  const copied: CanonicalRecord = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !isWellFormedUnicodeString(key)) {
      throw new TypeError('A service Result object key was not canonical Unicode.');
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('A service Result object property was not inert enumerable data.');
    }
    Object.defineProperty(copied, key, {
      value: cloneCanonicalValue(descriptor.value, active, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copied;
}

function assertCanonicalJson(value: unknown, safeMessage: string): void {
  if (serializeCanonicalJson(value).type === 'error') {
    throw new TypeError(safeMessage);
  }
}

function freezeCanonicalTree<TValue>(value: TValue): TValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) {
      freezeCanonicalTree(descriptor.value);
    }
  }
  return Object.freeze(value);
}

function requireCanonicalRecord(value: unknown): CanonicalRecord {
  if (!isCanonicalRecord(value)) {
    throw new TypeError('A Preview.2 response value was not a plain object.');
  }
  return value;
}

function isCanonicalRecord(value: unknown): value is CanonicalRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: CanonicalRecord, expected: readonly string[]): void {
  if (!hasExactKeys(value, expected)) {
    throw new TypeError('A Preview.2 response object was not closed.');
  }
}

function hasExactKeys(value: CanonicalRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function assertClosedKeys(
  value: CanonicalRecord,
  required: readonly string[],
  optional: readonly string[],
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    !required.every((key) => Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new TypeError('A Preview.2 error object was not closed.');
  }
}

function flattenResolveModel(value: ResolveModelValue): Preview2ResolveModelValue {
  if (value.document.revisionId !== value.basedOnRevisionId) {
    throw new TypeError('A Model response did not match its Revision binding.');
  }
  return {
    document: value.document,
    basedOnRevisionId: value.basedOnRevisionId,
    consistency: value.consistency,
    status: value.status,
  };
}

function flattenDocumentHead(
  value: RevisionBoundReadResult<DocumentHead>,
): Preview2GetDocumentHeadValue {
  if (value.status !== 'current') {
    throw new TypeError('A successful document.get_head result must describe the current head.');
  }
  if (value.value.headRevisionId !== value.basedOnRevisionId) {
    throw new TypeError('A document.get_head value did not match its Revision binding.');
  }
  return {
    ...flattenRevisionBinding(value),
    status: value.status,
    headRevisionId: value.value.headRevisionId,
  };
}

function flattenRevisionBinding<TValue>(
  value: RevisionBoundReadResult<TValue>,
): Preview2ResolveModelValue {
  if (value.document.revisionId !== value.basedOnRevisionId) {
    throw new TypeError('A document response did not match its Revision binding.');
  }
  return {
    document: value.document,
    basedOnRevisionId: value.basedOnRevisionId,
    consistency: value.consistency,
    status: value.status,
  };
}

function flattenPage<TItem>(
  value: RevisionBoundReadResult<DocumentPageResult<TItem>>,
  approximateBytes: number,
): Preview2PageValue<TItem> {
  const page = value.value;
  if (page.basedOnRevisionId !== value.basedOnRevisionId) {
    throw new TypeError('A document page did not match its outer Revision binding.');
  }
  assertPageCursorInvariant(page);
  return {
    ...flattenRevisionBinding(value),
    items: [...page.items],
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    truncated: page.truncated,
    approximateBytes,
  };
}

function flattenReadableNodePage(
  value: RevisionBoundReadResult<DocumentPageResult<ReadDocumentNode>>,
  approximateBytes: number,
): Preview2PageValue<GeneratedReadableDocumentNode> {
  const page = value.value;
  if (page.basedOnRevisionId !== value.basedOnRevisionId) {
    throw new TypeError('A readable-node page did not match its outer Revision binding.');
  }
  assertPageCursorInvariant(page);
  return {
    ...flattenRevisionBinding(value),
    items: page.items.map(toGeneratedReadableDocumentNode),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    truncated: page.truncated,
    approximateBytes,
  };
}

function finalizePage<TPage extends { readonly approximateBytes: number }>(
  create: (approximateBytes: number) => TPage,
): TPage {
  let approximateBytes = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = create(approximateBytes);
    const serialized = serializeCanonicalJson({ type: 'ok', value });
    if (serialized.type === 'error') {
      throw new TypeError('A Preview.2 page was not canonical JSON data.');
    }
    const measuredBytes = encodeUtf8(serialized.value).length;
    if (measuredBytes === approximateBytes) {
      return value;
    }
    approximateBytes = measuredBytes;
  }
  throw new TypeError('A Preview.2 page byte measurement did not converge.');
}

function assertPageCursorInvariant(page: DocumentPageResult<unknown>): void {
  if (page.truncated !== (page.nextCursor !== undefined)) {
    throw new TypeError('A document page did not satisfy the truncated/cursor invariant.');
  }
}

function toGeneratedReadableDocumentNode(node: ReadDocumentNode): GeneratedReadableDocumentNode {
  const metadata = {
    nodeId: node.nodeId,
    ...(node.nodeHash === undefined ? {} : { nodeHash: node.nodeHash }),
    ...(node.parentNodeId === undefined ? {} : { parentNodeId: node.parentNodeId }),
    ...(node.authorizedChildIndex === undefined
      ? {}
      : { authorizedChildIndex: node.authorizedChildIndex }),
  };
  if (node.nodeType === 'text') {
    return {
      ...metadata,
      nodeType: node.nodeType,
      text: node.text,
      marks: copyMarks(node.marks),
      childIds: [],
    };
  }
  return {
    ...metadata,
    nodeType: node.nodeType,
    attrs: copyJsonObject(node.attrs),
    childIds: [...node.childIds],
  };
}

function copyMark(mark: Mark): GeneratedMark {
  return mark.type === 'link'
    ? {
        type: mark.type,
        href: mark.href,
        ...(mark.title === undefined ? {} : { title: mark.title }),
      }
    : { type: mark.type };
}

function copyMarks(
  marks: readonly Mark[],
): Exclude<GeneratedReadableDocumentNode['marks'], undefined> {
  const copied = marks.map(copyMark);
  switch (copied.length) {
    case 0:
      return [];
    case 1:
      return [readRequiredMark(copied, 0)];
    case 2:
      return [readRequiredMark(copied, 0), readRequiredMark(copied, 1)];
    case 3:
      return [
        readRequiredMark(copied, 0),
        readRequiredMark(copied, 1),
        readRequiredMark(copied, 2),
      ];
    case 4:
      return [
        readRequiredMark(copied, 0),
        readRequiredMark(copied, 1),
        readRequiredMark(copied, 2),
        readRequiredMark(copied, 3),
      ];
    case 5:
      return [
        readRequiredMark(copied, 0),
        readRequiredMark(copied, 1),
        readRequiredMark(copied, 2),
        readRequiredMark(copied, 3),
        readRequiredMark(copied, 4),
      ];
    case 6:
      return [
        readRequiredMark(copied, 0),
        readRequiredMark(copied, 1),
        readRequiredMark(copied, 2),
        readRequiredMark(copied, 3),
        readRequiredMark(copied, 4),
        readRequiredMark(copied, 5),
      ];
    case 7:
      return [
        readRequiredMark(copied, 0),
        readRequiredMark(copied, 1),
        readRequiredMark(copied, 2),
        readRequiredMark(copied, 3),
        readRequiredMark(copied, 4),
        readRequiredMark(copied, 5),
        readRequiredMark(copied, 6),
      ];
    case 8:
      return [
        readRequiredMark(copied, 0),
        readRequiredMark(copied, 1),
        readRequiredMark(copied, 2),
        readRequiredMark(copied, 3),
        readRequiredMark(copied, 4),
        readRequiredMark(copied, 5),
        readRequiredMark(copied, 6),
        readRequiredMark(copied, 7),
      ];
    default:
      throw new TypeError('A readable Text node exceeded the Preview.2 Mark limit.');
  }
}

function readRequiredMark(marks: readonly GeneratedMark[], index: number): GeneratedMark {
  const mark = marks[index];
  if (mark === undefined) {
    throw new TypeError('A readable Text node Mark tuple was incomplete.');
  }
  return mark;
}

function copyJsonObject(value: object): GeneratedJsonObject {
  const copied: GeneratedJsonObject = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new TypeError('A readable node attribute had a symbol key.');
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('A readable node attribute was not an inert data property.');
    }
    copied[key] = copyJsonValue(descriptor.value);
  }
  return copied;
}

function copyJsonValue(value: unknown): GeneratedJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(copyJsonValue);
  }
  if (typeof value === 'object') {
    return copyJsonObject(value);
  }
  throw new TypeError('A readable node attribute was not JSON-compatible.');
}
