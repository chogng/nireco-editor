import type { Result } from '../../base/errors/nireco-error.js';
import {
  parseContentHash,
  parseEntityId,
  parseNodeId,
  parseOperationId,
  parseProposalId,
  parseRevisionId,
  parseTransactionId,
  parseUtf16Offset,
} from '../../base/ids/identifiers.js';
import {
  isWellFormedUnicodeString,
  MAX_CANONICAL_JSON_DEPTH,
  type JsonPrimitive,
  type JsonValue,
} from '../../base/serialization/canonical-json.js';
import { parseIsoTimestamp } from '../../base/time/clock.js';
import { isCanonicalResourceUri, isDocumentUri } from '../../base/uri/resource-uri.js';
import type { AcademicEntity } from '../academic-graph.js';
import type { ActorRef } from '../actor.js';
import type { InsertableNode, Mark } from '../node/manuscript-node.js';
import type {
  AcademicRelationKind,
  Operation,
  ReplaceTextOperation,
} from '../operation/operation.js';
import {
  isValidAcademicEntityShape,
  MAX_INERT_JSON_DEPTH,
} from '../schema/manuscript-runtime-shapes.js';
import { validateInsertableNode } from '../schema/manuscript-validator.js';
import type {
  Transaction,
  TransactionMetadata,
  TransactionPrecondition,
  TransactionSource,
} from './transaction.js';

export interface TransactionRuntimeDecodeError {
  readonly reason: 'transaction-invalid' | 'transaction-too-large';
  readonly safeMessage: string;
}

export const MAX_TRANSACTION_CANONICAL_UTF8_BYTES = 8 * 1024 * 1024;
/** Root and every serialized array item/object-property value count; object keys do not. */
export const MAX_TRANSACTION_JSON_VALUES = 262_144;
export const MAX_TRANSACTION_OPERATIONS = 1_024;
export const MAX_TRANSACTION_PRECONDITIONS = 4_096;
export const MAX_TRANSACTION_TOOL_INVOCATION_IDS = 1_024;

/**
 * V1 Transaction objects are closed protocol objects. Unknown fields are rejected
 * instead of being dropped so the object that is hashed is exactly the object
 * persisted for replay. Adding a protocol field requires a versioned decoder/hash
 * profile rather than an implicit forward-compatible projection.
 */
export function decodeStrictTransactionV1(
  value: unknown,
): Result<Transaction, TransactionRuntimeDecodeError> {
  try {
    const captured = captureTransactionWithinResourceLimits(value);
    if (captured.type === 'too-large') {
      return tooLargeTransaction();
    }
    if (captured.type === 'invalid') {
      return invalidTransaction();
    }
    return decodeTransaction(captured.value);
  } catch {
    return invalidTransaction();
  }
}

export function decodeStrictActorRef(value: unknown): ActorRef | undefined {
  try {
    return decodeActor(value);
  } catch {
    return undefined;
  }
}

type TransactionResourceInspection = 'within-limits' | 'too-large' | 'invalid';

type CapturedJsonContainer = unknown[] | Record<string, unknown>;

interface PendingResourceValue {
  readonly type: 'value';
  readonly value: unknown;
  readonly depth: number;
  readonly capturedParent?: CapturedJsonContainer;
  readonly capturedKey?: string | number;
}

interface PendingResourceLeave {
  readonly type: 'leave';
  readonly value: object;
}

type PendingResourceInspection = PendingResourceValue | PendingResourceLeave;

/**
 * Performs a bounded, allocation-light pass before normalization. In particular,
 * a caller cannot force the decoder to clone or canonicalize an arbitrarily large
 * replacement string only to discover that the WAL cannot persist it.
 */
type TransactionResourceCapture =
  | {
      readonly type: 'captured';
      readonly value: unknown;
    }
  | {
      readonly type: 'too-large';
    }
  | {
      readonly type: 'invalid';
    };

function captureTransactionWithinResourceLimits(value: unknown): TransactionResourceCapture {
  const transaction = readDataRecord(value);
  if (transaction === undefined) {
    return { type: 'invalid' };
  }
  const collectionLimits = inspectTransactionCollectionLimits(transaction);
  if (collectionLimits !== 'within-limits') {
    return { type: collectionLimits };
  }
  const captured = captureCanonicalTransaction(value);
  if (captured.type !== 'captured') {
    return captured;
  }
  const stableTransaction = readDataRecord(captured.value);
  if (stableTransaction === undefined) {
    return { type: 'invalid' };
  }
  const stableCollectionLimits = inspectTransactionCollectionLimits(stableTransaction);
  return stableCollectionLimits === 'within-limits' ? captured : { type: stableCollectionLimits };
}

function inspectTransactionCollectionLimits(
  transaction: Readonly<Record<string, unknown>>,
): TransactionResourceInspection {
  const operations = inspectArrayLength(
    readDataPropertyValue(transaction, 'operations'),
    MAX_TRANSACTION_OPERATIONS,
  );
  if (operations !== 'within-limits') {
    return operations;
  }
  const preconditions = inspectArrayLength(
    readDataPropertyValue(transaction, 'preconditions'),
    MAX_TRANSACTION_PRECONDITIONS,
  );
  if (preconditions !== 'within-limits') {
    return preconditions;
  }

  const metadataValue = readDataPropertyValue(transaction, 'metadata');
  const metadata = readDataRecord(metadataValue);
  if (metadata === undefined) {
    return 'within-limits';
  }
  return inspectArrayLength(
    readDataPropertyValue(metadata, 'toolInvocationIds'),
    MAX_TRANSACTION_TOOL_INVOCATION_IDS,
    true,
  );
}

function inspectArrayLength(
  value: unknown,
  maximumLength: number,
  optional = false,
): TransactionResourceInspection {
  if (value === undefined && optional) {
    return 'within-limits';
  }
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return 'within-limits';
  }
  const length = readArrayLength(value);
  if (length === undefined) {
    return 'invalid';
  }
  return length > maximumLength ? 'too-large' : 'within-limits';
}

function captureCanonicalTransaction(value: unknown): TransactionResourceCapture {
  const state: TransactionResourceMeasurementState = {
    pending: [{ type: 'value', value, depth: 0 }],
    active: new Set<object>(),
    byteLength: 0,
    valueCount: 0,
    capturedRoot: undefined,
    hasCapturedRoot: false,
  };
  while (state.pending.length > 0) {
    const item = state.pending.pop();
    if (item !== undefined) {
      const inspected = inspectPendingResourceValue(item, state);
      if (inspected !== 'within-limits') {
        return { type: inspected };
      }
    }
  }
  return state.hasCapturedRoot
    ? {
        type: 'captured',
        value: state.capturedRoot,
      }
    : { type: 'invalid' };
}

interface TransactionResourceMeasurementState {
  readonly pending: PendingResourceInspection[];
  readonly active: Set<object>;
  byteLength: number;
  valueCount: number;
  capturedRoot: unknown;
  hasCapturedRoot: boolean;
}

function inspectPendingResourceValue(
  item: PendingResourceInspection,
  state: TransactionResourceMeasurementState,
): TransactionResourceInspection {
  if (item.type === 'leave') {
    state.active.delete(item.value);
    return 'within-limits';
  }
  state.valueCount += 1;
  if (state.valueCount > MAX_TRANSACTION_JSON_VALUES) {
    return 'too-large';
  }
  const measured = measurePrimitive(
    item.value,
    MAX_TRANSACTION_CANONICAL_UTF8_BYTES - state.byteLength,
  );
  if (measured.type === 'invalid') {
    return 'invalid';
  }
  return measured.type === 'measured'
    ? captureMeasuredResourceValue(item, state, measured.byteLength)
    : inspectResourceContainer(item, state);
}

function captureMeasuredResourceValue(
  item: PendingResourceValue,
  state: TransactionResourceMeasurementState,
  byteLength: number,
): TransactionResourceInspection {
  const accounted = accountTransactionBytes(state, byteLength);
  if (accounted === 'within-limits') {
    assignCapturedValue(item, state, item.value);
  }
  return accounted;
}

function inspectResourceContainer(
  item: PendingResourceValue,
  state: TransactionResourceMeasurementState,
): TransactionResourceInspection {
  if (
    item.depth > MAX_CANONICAL_JSON_DEPTH ||
    typeof item.value !== 'object' ||
    item.value === null ||
    state.active.has(item.value)
  ) {
    return 'invalid';
  }
  state.active.add(item.value);
  state.pending.push({ type: 'leave', value: item.value });
  const captured: CapturedJsonContainer = Array.isArray(item.value)
    ? []
    : createNullPrototypeRecord<unknown>();
  assignCapturedValue(item, state, captured);
  const inspected = Array.isArray(item.value)
    ? inspectCanonicalArray(
        item.value,
        item.depth,
        state.pending,
        state.valueCount,
        captured as unknown[],
      )
    : inspectCanonicalRecord(
        item.value,
        item.depth,
        state.pending,
        state.valueCount,
        captured as Record<string, unknown>,
      );
  return inspected.type === 'measured'
    ? accountTransactionBytes(state, inspected.byteLength)
    : inspected.type;
}

function assignCapturedValue(
  item: PendingResourceValue,
  state: TransactionResourceMeasurementState,
  value: unknown,
): void {
  if (item.capturedParent === undefined) {
    state.capturedRoot = value;
    state.hasCapturedRoot = true;
    return;
  }
  if (Array.isArray(item.capturedParent) && typeof item.capturedKey === 'number') {
    item.capturedParent[item.capturedKey] = value;
    return;
  }
  if (!Array.isArray(item.capturedParent) && typeof item.capturedKey === 'string') {
    Object.defineProperty(item.capturedParent, item.capturedKey, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
    return;
  }
  throw new TypeError('Invalid captured Transaction container slot.');
}

function accountTransactionBytes(
  state: TransactionResourceMeasurementState,
  byteLength: number,
): TransactionResourceInspection {
  if (byteLength > MAX_TRANSACTION_CANONICAL_UTF8_BYTES - state.byteLength) {
    return 'too-large';
  }
  state.byteLength += byteLength;
  return 'within-limits';
}

type MeasuredPrimitive =
  | { readonly type: 'measured'; readonly byteLength: number }
  | { readonly type: 'container' }
  | { readonly type: 'invalid' };

function measurePrimitive(value: unknown, remainingBytes: number): MeasuredPrimitive {
  if (value === null) {
    return { type: 'measured', byteLength: 4 };
  }
  if (typeof value === 'string') {
    const measured = measureJsonString(value, remainingBytes);
    return measured === undefined
      ? { type: 'invalid' }
      : { type: 'measured', byteLength: measured };
  }
  if (typeof value === 'boolean') {
    return { type: 'measured', byteLength: value ? 4 : 5 };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { type: 'measured', byteLength: JSON.stringify(value).length }
      : { type: 'invalid' };
  }
  return typeof value === 'object' ? { type: 'container' } : { type: 'invalid' };
}

type ContainerInspection =
  | { readonly type: 'measured'; readonly byteLength: number }
  | { readonly type: 'too-large' }
  | { readonly type: 'invalid' };

function inspectCanonicalArray(
  value: readonly unknown[],
  depth: number,
  pending: PendingResourceInspection[],
  currentValueCount: number,
  captured: unknown[],
): ContainerInspection {
  if (Reflect.getPrototypeOf(value) !== Array.prototype) {
    return { type: 'invalid' };
  }
  const length = readArrayLength(value);
  if (length === undefined || length > MAX_TRANSACTION_JSON_VALUES - currentValueCount) {
    return length === undefined ? { type: 'invalid' } : { type: 'too-large' };
  }
  const keys = Reflect.ownKeys(value);
  if (!hasExactArrayKeys(keys, length)) {
    return { type: 'invalid' };
  }
  const descriptors: PropertyDescriptor[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return { type: 'invalid' };
    }
    descriptors.push(descriptor);
  }
  for (let index = descriptors.length - 1; index >= 0; index -= 1) {
    pending.push({
      type: 'value',
      value: descriptors[index]?.value,
      depth: depth + 1,
      capturedParent: captured,
      capturedKey: index,
    });
  }
  return {
    type: 'measured',
    byteLength: 2 + Math.max(0, length - 1),
  };
}

function inspectCanonicalRecord(
  value: object,
  depth: number,
  pending: PendingResourceInspection[],
  currentValueCount: number,
  captured: Record<string, unknown>,
): ContainerInspection {
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return { type: 'invalid' };
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_TRANSACTION_JSON_VALUES - currentValueCount) {
    return { type: 'too-large' };
  }

  const entries: {
    readonly key: string;
    readonly descriptor: PropertyDescriptor;
  }[] = [];
  let byteLength = 2 + Math.max(0, keys.length - 1) + keys.length;
  for (const key of keys) {
    const entry = inspectCanonicalRecordEntry(
      value,
      key,
      MAX_TRANSACTION_CANONICAL_UTF8_BYTES - byteLength,
    );
    if (entry.type !== 'measured') {
      return entry;
    }
    byteLength += entry.byteLength;
    entries.push({
      key: entry.key,
      descriptor: entry.descriptor,
    });
  }
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined) {
      return { type: 'invalid' };
    }
    pending.push({
      type: 'value',
      value: entry.descriptor.value,
      depth: depth + 1,
      capturedParent: captured,
      capturedKey: entry.key,
    });
  }
  return { type: 'measured', byteLength };
}

type RecordEntryInspection =
  | {
      readonly type: 'measured';
      readonly byteLength: number;
      readonly descriptor: PropertyDescriptor;
      readonly key: string;
    }
  | { readonly type: 'too-large' }
  | { readonly type: 'invalid' };

function inspectCanonicalRecordEntry(
  value: object,
  key: PropertyKey,
  remainingBytes: number,
): RecordEntryInspection {
  if (typeof key !== 'string') {
    return { type: 'invalid' };
  }
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    return { type: 'invalid' };
  }
  const byteLength = measureJsonString(key, remainingBytes);
  if (byteLength === undefined) {
    return { type: 'invalid' };
  }
  return byteLength > remainingBytes
    ? { type: 'too-large' }
    : { type: 'measured', byteLength, descriptor, key };
}

/**
 * Returns the UTF-8 byte length of JSON.stringify(value), without allocating the
 * escaped JSON string. Undefined means the input is not well-formed Unicode.
 */
function measureJsonString(value: string, remainingBytes: number): number | undefined {
  if (value.length + 2 > remainingBytes) {
    return remainingBytes + 1;
  }
  if (!isWellFormedUnicodeString(value)) {
    return undefined;
  }
  let byteLength = 2;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) {
      return undefined;
    }
    byteLength += jsonCodePointByteLength(codePoint);
    if (codePoint > 0xffff) {
      index += 1;
    }
    if (byteLength > remainingBytes) {
      return byteLength;
    }
  }
  return byteLength;
}

function jsonCodePointByteLength(codePoint: number): number {
  if (codePoint === 0x22 || codePoint === 0x5c) {
    return 2;
  }
  if (codePoint <= 0x1f) {
    return codePoint === 0x08 ||
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0c ||
      codePoint === 0x0d
      ? 2
      : 6;
  }
  if (codePoint <= 0x7f) {
    return 1;
  }
  if (codePoint <= 0x7ff) {
    return 2;
  }
  return codePoint <= 0xffff ? 3 : 4;
}

function readDataPropertyValue(record: Readonly<Record<string, unknown>>, key: string): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}

function decodeTransaction(value: unknown): Result<Transaction, TransactionRuntimeDecodeError> {
  const transaction = readDataRecord(value);
  if (
    transaction === undefined ||
    !hasExactKeys(
      transaction,
      ['id', 'target', 'actor', 'operations', 'preconditions', 'metadata', 'createdAt'],
      ['intent'],
    )
  ) {
    return invalidTransaction();
  }

  const id = parseStringIdentifier(transaction['id'], parseTransactionId);
  const target = decodeTarget(transaction['target']);
  const actor = decodeActor(transaction['actor']);
  const operations = decodeOperations(transaction['operations']);
  const preconditions = decodePreconditions(transaction['preconditions']);
  const metadata = decodeMetadata(transaction['metadata']);
  const createdAt = parseTimestamp(transaction['createdAt']);
  const intent = decodeOptionalBoundedString(transaction, 'intent', 2_048);
  if (
    id === undefined ||
    target === undefined ||
    actor === undefined ||
    operations === undefined ||
    preconditions === undefined ||
    metadata === undefined ||
    createdAt === undefined ||
    intent.type === 'invalid'
  ) {
    return invalidTransaction();
  }

  return {
    type: 'ok',
    value: {
      id,
      target,
      actor,
      ...(intent.value === undefined ? {} : { intent: intent.value }),
      operations,
      preconditions,
      metadata,
      createdAt,
    },
  };
}

function decodeTarget(value: unknown): Transaction['target'] | undefined {
  const target = readDataRecord(value);
  if (target === undefined || !hasExactKeys(target, ['uri', 'baseRevisionId'])) {
    return undefined;
  }
  const uri = target['uri'];
  const baseRevisionId = parseStringIdentifier(target['baseRevisionId'], parseRevisionId);
  return typeof uri === 'string' && isDocumentUri(uri) && baseRevisionId !== undefined
    ? {
        uri,
        baseRevisionId,
      }
    : undefined;
}

function decodeActor(value: unknown): ActorRef | undefined {
  const actor = readDataRecord(value);
  if (actor === undefined || typeof actor['type'] !== 'string') {
    return undefined;
  }
  const id = decodeOpaqueId(actor['id']);
  if (id === undefined) {
    return undefined;
  }

  switch (actor['type']) {
    case 'human':
    case 'product-controller':
      return decodeSimpleActor(actor, actor['type'], id);
    case 'comet-agent':
      return decodeCometAgent(actor, id);
    case 'system':
      return decodeSystemActor(actor, id);
    default:
      return undefined;
  }
}

function decodeSimpleActor(
  actor: Readonly<Record<string, unknown>>,
  type: 'human' | 'product-controller',
  id: string,
): ActorRef | undefined {
  return hasExactKeys(actor, ['type', 'id'])
    ? {
        type,
        id,
      }
    : undefined;
}

function decodeCometAgent(
  actor: Readonly<Record<string, unknown>>,
  id: string,
): ActorRef | undefined {
  if (!hasExactKeys(actor, ['type', 'id', 'workflowId'], ['modelRef'])) {
    return undefined;
  }
  const workflowId = decodeBoundedString(actor['workflowId'], 1, 128);
  const modelRef = decodeOptionalBoundedString(actor, 'modelRef', 256, 1);
  return workflowId === undefined || modelRef.type === 'invalid'
    ? undefined
    : {
        type: 'comet-agent',
        id,
        workflowId,
        ...(modelRef.value === undefined ? {} : { modelRef: modelRef.value }),
      };
}

function decodeSystemActor(
  actor: Readonly<Record<string, unknown>>,
  id: string,
): ActorRef | undefined {
  return hasExactKeys(actor, ['type', 'id', 'role']) && isSystemRole(actor['role'])
    ? {
        type: 'system',
        id,
        role: actor['role'],
      }
    : undefined;
}

function decodeOperations(value: unknown): Transaction['operations'] | undefined {
  const items = readDenseArray(value, MAX_TRANSACTION_OPERATIONS);
  if (items === undefined || items.length === 0) {
    return undefined;
  }
  const operations: Operation[] = [];
  const operationIds = new Set<string>();
  for (const item of items) {
    const operation = decodeOperation(item);
    if (operation === undefined || operationIds.has(operation.id)) {
      return undefined;
    }
    operationIds.add(operation.id);
    operations.push(operation);
  }
  return operations as [Operation, ...Operation[]];
}

function decodeOperation(value: unknown): Operation | undefined {
  const operation = readDataRecord(value);
  if (operation === undefined || typeof operation['type'] !== 'string') {
    return undefined;
  }
  return OPERATION_DECODERS[operation['type']]?.(operation);
}

type OperationDecoder = (operation: Readonly<Record<string, unknown>>) => Operation | undefined;

const OPERATION_DECODERS: Readonly<Record<string, OperationDecoder>> = {
  'insert-node': decodeInsertNode,
  'delete-node': decodeDeleteNode,
  'move-node': decodeMoveNode,
  'replace-text': decodeReplaceText,
  'set-node-attributes': decodeSetNodeAttributes,
  'add-mark': (operation) => decodeMarkOperation(operation, 'add-mark'),
  'remove-mark': (operation) => decodeMarkOperation(operation, 'remove-mark'),
  'create-academic-entity': decodeCreateAcademicEntity,
  'update-academic-entity': decodeUpdateAcademicEntity,
  'delete-academic-entity': decodeDeleteAcademicEntity,
  'link-academic-entities': (operation) =>
    decodeAcademicRelationOperation(operation, 'link-academic-entities'),
  'unlink-academic-entities': (operation) =>
    decodeAcademicRelationOperation(operation, 'unlink-academic-entities'),
};

function decodeInsertNode(operation: Readonly<Record<string, unknown>>): Operation | undefined {
  if (!hasExactKeys(operation, ['id', 'type', 'parentNodeId', 'childIndex', 'node'])) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const parentNodeId = parseStringIdentifier(operation['parentNodeId'], parseNodeId);
  const childIndex = decodeNonnegativeSafeInteger(operation['childIndex']);
  const node = cloneJsonValue(operation['node']);
  if (
    id === undefined ||
    parentNodeId === undefined ||
    childIndex === undefined ||
    !isJsonObject(node) ||
    validateInsertableNode(node).type === 'error'
  ) {
    return undefined;
  }
  const insertableNode: unknown = node;
  return {
    id,
    type: 'insert-node',
    parentNodeId,
    childIndex,
    node: insertableNode as InsertableNode,
  };
}

function decodeDeleteNode(operation: Readonly<Record<string, unknown>>): Operation | undefined {
  if (!hasExactKeys(operation, ['id', 'type', 'targetNodeId', 'expectedNodeHash'])) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const targetNodeId = parseStringIdentifier(operation['targetNodeId'], parseNodeId);
  const expectedNodeHash = parseStringIdentifier(operation['expectedNodeHash'], parseContentHash);
  return id === undefined || targetNodeId === undefined || expectedNodeHash === undefined
    ? undefined
    : {
        id,
        type: 'delete-node',
        targetNodeId,
        expectedNodeHash,
      };
}

function decodeMoveNode(operation: Readonly<Record<string, unknown>>): Operation | undefined {
  if (!hasExactKeys(operation, ['id', 'type', 'targetNodeId', 'newParentNodeId', 'childIndex'])) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const targetNodeId = parseStringIdentifier(operation['targetNodeId'], parseNodeId);
  const newParentNodeId = parseStringIdentifier(operation['newParentNodeId'], parseNodeId);
  const childIndex = decodeNonnegativeSafeInteger(operation['childIndex']);
  return id === undefined ||
    targetNodeId === undefined ||
    newParentNodeId === undefined ||
    childIndex === undefined
    ? undefined
    : {
        id,
        type: 'move-node',
        targetNodeId,
        newParentNodeId,
        childIndex,
      };
}

function decodeReplaceText(
  operation: Readonly<Record<string, unknown>>,
): ReplaceTextOperation | undefined {
  if (
    !hasExactKeys(operation, [
      'id',
      'type',
      'textNodeId',
      'startUtf16Offset',
      'endUtf16Offset',
      'replacement',
    ])
  ) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const textNodeId = parseStringIdentifier(operation['textNodeId'], parseNodeId);
  const startUtf16Offset = parseNumberIdentifier(operation['startUtf16Offset'], parseUtf16Offset);
  const endUtf16Offset = parseNumberIdentifier(operation['endUtf16Offset'], parseUtf16Offset);
  return id === undefined ||
    textNodeId === undefined ||
    startUtf16Offset === undefined ||
    endUtf16Offset === undefined ||
    typeof operation['replacement'] !== 'string'
    ? undefined
    : {
        id,
        type: 'replace-text',
        textNodeId,
        startUtf16Offset,
        endUtf16Offset,
        replacement: operation['replacement'],
      };
}

function decodeSetNodeAttributes(
  operation: Readonly<Record<string, unknown>>,
): Operation | undefined {
  if (!hasExactKeys(operation, ['id', 'type', 'nodeId', 'attributes'])) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const nodeId = parseStringIdentifier(operation['nodeId'], parseNodeId);
  const attributes = cloneJsonValue(operation['attributes']);
  return id === undefined ||
    nodeId === undefined ||
    !isJsonObject(attributes) ||
    Object.keys(attributes).length === 0
    ? undefined
    : {
        id,
        type: 'set-node-attributes',
        nodeId,
        attributes,
      };
}

function decodeMarkOperation(
  operation: Readonly<Record<string, unknown>>,
  type: 'add-mark' | 'remove-mark',
): Operation | undefined {
  if (
    !hasExactKeys(operation, [
      'id',
      'type',
      'textNodeId',
      'startUtf16Offset',
      'endUtf16Offset',
      'mark',
    ])
  ) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const textNodeId = parseStringIdentifier(operation['textNodeId'], parseNodeId);
  const startUtf16Offset = parseNumberIdentifier(operation['startUtf16Offset'], parseUtf16Offset);
  const endUtf16Offset = parseNumberIdentifier(operation['endUtf16Offset'], parseUtf16Offset);
  const mark = decodeMark(operation['mark']);
  return id === undefined ||
    textNodeId === undefined ||
    startUtf16Offset === undefined ||
    endUtf16Offset === undefined ||
    mark === undefined
    ? undefined
    : {
        id,
        type,
        textNodeId,
        startUtf16Offset,
        endUtf16Offset,
        mark,
      };
}

function decodeMark(value: unknown): Mark | undefined {
  const mark = readDataRecord(value);
  if (mark === undefined || typeof mark['type'] !== 'string') {
    return undefined;
  }
  if (mark['type'] === 'link') {
    if (!hasExactKeys(mark, ['type', 'href'], ['title'])) {
      return undefined;
    }
    const href = mark['href'];
    const title = decodeOptionalBoundedString(mark, 'title', 2_048);
    return typeof href !== 'string' || !isCanonicalResourceUri(href) || title.type === 'invalid'
      ? undefined
      : {
          type: 'link',
          href,
          ...(title.value === undefined ? {} : { title: title.value }),
        };
  }
  return hasExactKeys(mark, ['type']) && isSimpleMarkType(mark['type'])
    ? {
        type: mark['type'],
      }
    : undefined;
}

function decodeCreateAcademicEntity(
  operation: Readonly<Record<string, unknown>>,
): Operation | undefined {
  if (!hasExactKeys(operation, ['id', 'type', 'entity'])) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const entity = cloneJsonValue(operation['entity']);
  if (id === undefined || !isJsonObject(entity) || !isValidAcademicEntityShape(entity)) {
    return undefined;
  }
  const academicEntity: unknown = entity;
  return {
    id,
    type: 'create-academic-entity',
    entity: academicEntity as AcademicEntity,
  };
}

function decodeUpdateAcademicEntity(
  operation: Readonly<Record<string, unknown>>,
): Operation | undefined {
  if (!hasExactKeys(operation, ['id', 'type', 'entityId', 'patch'])) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const entityId = parseStringIdentifier(operation['entityId'], parseEntityId);
  const patchItems = readDenseArray(operation['patch']);
  if (
    id === undefined ||
    entityId === undefined ||
    patchItems === undefined ||
    patchItems.length === 0
  ) {
    return undefined;
  }
  const patch: { readonly field: string; readonly value: JsonValue }[] = [];
  for (const item of patchItems) {
    const entry = readDataRecord(item);
    if (entry === undefined || !hasExactKeys(entry, ['field', 'value'])) {
      return undefined;
    }
    const field = entry['field'];
    const patchValue = cloneJsonValue(entry['value']);
    if (
      typeof field !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9]*$/u.test(field) ||
      patchValue === undefined
    ) {
      return undefined;
    }
    patch.push({
      field,
      value: patchValue,
    });
  }
  return {
    id,
    type: 'update-academic-entity',
    entityId,
    patch,
  };
}

function decodeDeleteAcademicEntity(
  operation: Readonly<Record<string, unknown>>,
): Operation | undefined {
  if (!hasExactKeys(operation, ['id', 'type', 'entityId', 'expectedEntityHash'])) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const entityId = parseStringIdentifier(operation['entityId'], parseEntityId);
  const expectedEntityHash = parseStringIdentifier(
    operation['expectedEntityHash'],
    parseContentHash,
  );
  return id === undefined || entityId === undefined || expectedEntityHash === undefined
    ? undefined
    : {
        id,
        type: 'delete-academic-entity',
        entityId,
        expectedEntityHash,
      };
}

function decodeAcademicRelationOperation(
  operation: Readonly<Record<string, unknown>>,
  type: 'link-academic-entities' | 'unlink-academic-entities',
): Operation | undefined {
  if (!hasExactKeys(operation, ['id', 'type', 'fromEntityId', 'toEntityId', 'relation'])) {
    return undefined;
  }
  const id = parseStringIdentifier(operation['id'], parseOperationId);
  const fromEntityId = parseStringIdentifier(operation['fromEntityId'], parseEntityId);
  const toEntityId = parseStringIdentifier(operation['toEntityId'], parseEntityId);
  const relation = operation['relation'];
  return id === undefined ||
    fromEntityId === undefined ||
    toEntityId === undefined ||
    !isAcademicRelationKind(relation)
    ? undefined
    : {
        id,
        type,
        fromEntityId,
        toEntityId,
        relation,
      };
}

function decodePreconditions(value: unknown): readonly TransactionPrecondition[] | undefined {
  const items = readDenseArray(value, MAX_TRANSACTION_PRECONDITIONS);
  if (items === undefined) {
    return undefined;
  }
  const preconditions: TransactionPrecondition[] = [];
  for (const item of items) {
    const precondition = decodePrecondition(item);
    if (precondition === undefined) {
      return undefined;
    }
    preconditions.push(precondition);
  }
  return preconditions;
}

function decodePrecondition(value: unknown): TransactionPrecondition | undefined {
  const precondition = readDataRecord(value);
  const kind = precondition?.['kind'];
  if (precondition === undefined || typeof kind !== 'string') {
    return undefined;
  }
  switch (kind) {
    case 'node-exists':
      return decodeNodeExistsPrecondition(precondition);
    case 'node-hash':
      return decodeNodeHashPrecondition(precondition);
    case 'entity-exists':
      return decodeEntityExistsPrecondition(precondition);
    case 'schema-version':
      return decodeSchemaVersionPrecondition(precondition);
    case 'document-hash':
      return decodeDocumentHashPrecondition(precondition);
    default:
      return undefined;
  }
}

function decodeNodeExistsPrecondition(
  value: Readonly<Record<string, unknown>>,
): TransactionPrecondition | undefined {
  if (!hasExactKeys(value, ['kind', 'nodeId'])) {
    return undefined;
  }
  const nodeId = parseStringIdentifier(value['nodeId'], parseNodeId);
  return nodeId === undefined ? undefined : { kind: 'node-exists', nodeId };
}

function decodeNodeHashPrecondition(
  value: Readonly<Record<string, unknown>>,
): TransactionPrecondition | undefined {
  if (!hasExactKeys(value, ['kind', 'nodeId', 'expected'])) {
    return undefined;
  }
  const nodeId = parseStringIdentifier(value['nodeId'], parseNodeId);
  const expected = parseStringIdentifier(value['expected'], parseContentHash);
  return nodeId === undefined || expected === undefined
    ? undefined
    : { kind: 'node-hash', nodeId, expected };
}

function decodeEntityExistsPrecondition(
  value: Readonly<Record<string, unknown>>,
): TransactionPrecondition | undefined {
  if (!hasExactKeys(value, ['kind', 'entityId'])) {
    return undefined;
  }
  const entityId = parseStringIdentifier(value['entityId'], parseEntityId);
  return entityId === undefined ? undefined : { kind: 'entity-exists', entityId };
}

function decodeSchemaVersionPrecondition(
  value: Readonly<Record<string, unknown>>,
): TransactionPrecondition | undefined {
  const expected = decodeBoundedString(value['expected'], 1, 128);
  return hasExactKeys(value, ['kind', 'expected']) && expected !== undefined
    ? {
        kind: 'schema-version',
        expected,
      }
    : undefined;
}

function decodeDocumentHashPrecondition(
  value: Readonly<Record<string, unknown>>,
): TransactionPrecondition | undefined {
  if (!hasExactKeys(value, ['kind', 'expected'])) {
    return undefined;
  }
  const expected = parseStringIdentifier(value['expected'], parseContentHash);
  return expected === undefined ? undefined : { kind: 'document-hash', expected };
}

function decodeMetadata(value: unknown): TransactionMetadata | undefined {
  const metadata = readDataRecord(value);
  if (metadata === undefined || !hasExactMetadataKeys(metadata)) {
    return undefined;
  }
  const source = metadata['source'];
  const optional = decodeMetadataOptionals(metadata);
  if (!isTransactionSource(source) || optional === undefined) {
    return undefined;
  }
  if (source === 'proposal-accept') {
    return optional.proposalId === undefined || optional.proposalRevision === undefined
      ? undefined
      : {
          source: 'proposal-accept',
          ...optional,
          proposalId: optional.proposalId,
          proposalRevision: optional.proposalRevision,
        };
  }
  return {
    source,
    ...optional,
  };
}

function hasExactMetadataKeys(metadata: Readonly<Record<string, unknown>>): boolean {
  return hasExactKeys(
    metadata,
    ['source'],
    [
      'undoGroupId',
      'proposalId',
      'proposalRevision',
      'cometTaskId',
      'toolInvocationIds',
      'idempotencyKey',
    ],
  );
}

interface MetadataOptionals {
  readonly undoGroupId?: string;
  readonly proposalId?: NonNullable<TransactionMetadata['proposalId']>;
  readonly proposalRevision?: number;
  readonly cometTaskId?: string;
  readonly toolInvocationIds?: readonly string[];
  readonly idempotencyKey?: string;
}

function decodeMetadataOptionals(
  metadata: Readonly<Record<string, unknown>>,
): MetadataOptionals | undefined {
  const candidates = {
    undoGroupId: decodeOptionalOpaqueId(metadata, 'undoGroupId'),
    proposalId: decodeOptionalIdentifier(metadata, 'proposalId', parseProposalId),
    proposalRevision: decodeOptionalPositiveSafeInteger(metadata, 'proposalRevision'),
    cometTaskId: decodeOptionalOpaqueId(metadata, 'cometTaskId'),
    toolInvocationIds: decodeOptionalOpaqueIdArray(metadata, 'toolInvocationIds'),
    idempotencyKey: decodeOptionalBoundedString(metadata, 'idempotencyKey', 256, 1),
  };
  if (!areOptionalValuesValid(candidates)) {
    return undefined;
  }
  return {
    ...(candidates.undoGroupId.value === undefined
      ? {}
      : { undoGroupId: candidates.undoGroupId.value }),
    ...(candidates.proposalId.value === undefined
      ? {}
      : { proposalId: candidates.proposalId.value }),
    ...(candidates.proposalRevision.value === undefined
      ? {}
      : { proposalRevision: candidates.proposalRevision.value }),
    ...(candidates.cometTaskId.value === undefined
      ? {}
      : { cometTaskId: candidates.cometTaskId.value }),
    ...(candidates.toolInvocationIds.value === undefined
      ? {}
      : { toolInvocationIds: candidates.toolInvocationIds.value }),
    ...(candidates.idempotencyKey.value === undefined
      ? {}
      : { idempotencyKey: candidates.idempotencyKey.value }),
  };
}

type OptionalValue<TValue> =
  | {
      readonly type: 'valid';
      readonly value: TValue | undefined;
    }
  | {
      readonly type: 'invalid';
    };

type ValidOptionalValues<TValues extends Readonly<Record<string, OptionalValue<unknown>>>> = {
  readonly [TKey in keyof TValues]: Extract<TValues[TKey], { readonly type: 'valid' }>;
};

function areOptionalValuesValid<TValues extends Readonly<Record<string, OptionalValue<unknown>>>>(
  values: TValues,
): values is TValues & ValidOptionalValues<TValues> {
  return Object.values(values).every((candidate) => candidate.type === 'valid');
}

function decodeOptionalBoundedString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  maximum: number,
  minimum = 0,
): OptionalValue<string> {
  if (!Object.hasOwn(record, key)) {
    return {
      type: 'valid',
      value: undefined,
    };
  }
  const value = decodeBoundedString(record[key], minimum, maximum);
  return value === undefined
    ? {
        type: 'invalid',
      }
    : {
        type: 'valid',
        value,
      };
}

function decodeOptionalOpaqueId(
  record: Readonly<Record<string, unknown>>,
  key: string,
): OptionalValue<string> {
  if (!Object.hasOwn(record, key)) {
    return {
      type: 'valid',
      value: undefined,
    };
  }
  const value = decodeOpaqueId(record[key]);
  return value === undefined ? { type: 'invalid' } : { type: 'valid', value };
}

function decodeOptionalIdentifier<TValue>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  parse: (
    candidate: string,
  ) => { readonly type: 'valid'; readonly value: TValue } | { readonly type: 'invalid' },
): OptionalValue<TValue> {
  if (!Object.hasOwn(record, key)) {
    return {
      type: 'valid',
      value: undefined,
    };
  }
  const value = parseStringIdentifier(record[key], parse);
  return value === undefined ? { type: 'invalid' } : { type: 'valid', value };
}

function decodeOptionalPositiveSafeInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
): OptionalValue<number> {
  if (!Object.hasOwn(record, key)) {
    return {
      type: 'valid',
      value: undefined,
    };
  }
  const value = record[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? {
        type: 'valid',
        value,
      }
    : {
        type: 'invalid',
      };
}

function decodeOptionalOpaqueIdArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
): OptionalValue<readonly string[]> {
  if (!Object.hasOwn(record, key)) {
    return {
      type: 'valid',
      value: undefined,
    };
  }
  const items = readDenseArray(record[key], MAX_TRANSACTION_TOOL_INVOCATION_IDS);
  if (items === undefined) {
    return {
      type: 'invalid',
    };
  }
  const values: string[] = [];
  const identities = new Set<string>();
  for (const item of items) {
    const value = decodeOpaqueId(item);
    if (value === undefined || identities.has(value)) {
      return {
        type: 'invalid',
      };
    }
    identities.add(value);
    values.push(value);
  }
  return {
    type: 'valid',
    value: values,
  };
}

function decodeOpaqueId(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z][A-Za-z0-9._:-]*$/u.test(value)
    ? value
    : undefined;
}

function decodeBoundedString(value: unknown, minimum: number, maximum: number): string | undefined {
  return typeof value === 'string' &&
    value.length >= minimum &&
    value.length <= maximum &&
    isWellFormedUnicodeString(value)
    ? value
    : undefined;
}

function decodeNonnegativeSafeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function parseStringIdentifier<TValue>(
  value: unknown,
  parse: (
    candidate: string,
  ) => { readonly type: 'valid'; readonly value: TValue } | { readonly type: 'invalid' },
): TValue | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parse(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function parseNumberIdentifier<TValue>(
  value: unknown,
  parse: (
    candidate: number,
  ) => { readonly type: 'valid'; readonly value: TValue } | { readonly type: 'invalid' },
): TValue | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }
  const parsed = parse(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function parseTimestamp(value: unknown): Transaction['createdAt'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseIsoTimestamp(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function cloneJsonValue(value: unknown): JsonValue | undefined {
  return cloneJsonValueAtDepth(value, 0, new Set<object>());
}

function cloneJsonValueAtDepth(
  value: unknown,
  depth: number,
  active: Set<object>,
): JsonValue | undefined {
  if (depth > MAX_INERT_JSON_DEPTH) {
    return undefined;
  }
  if (isJsonPrimitive(value)) {
    return value;
  }
  if (typeof value !== 'object' || active.has(value)) {
    return undefined;
  }
  active.add(value);
  const items = readDenseArray(value);
  const cloned =
    items === undefined
      ? cloneJsonRecord(value, depth, active)
      : cloneJsonArray(items, depth, active);
  active.delete(value);
  return cloned;
}

function cloneJsonArray(
  items: readonly unknown[],
  depth: number,
  active: Set<object>,
): JsonValue[] | undefined {
  const cloned: JsonValue[] = [];
  for (const item of items) {
    const candidate = cloneJsonValueAtDepth(item, depth + 1, active);
    if (candidate === undefined) {
      return undefined;
    }
    cloned.push(candidate);
  }
  return cloned;
}

function cloneJsonRecord(
  value: object,
  depth: number,
  active: Set<object>,
): Record<string, JsonValue> | undefined {
  const record = readDataRecord(value);
  if (record === undefined) {
    return undefined;
  }
  const cloned = createNullPrototypeRecord<JsonValue>();
  for (const key of Object.keys(record)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      return undefined;
    }
    const candidate = cloneJsonValueAtDepth(descriptor.value, depth + 1, active);
    if (candidate === undefined) {
      return undefined;
    }
    Object.defineProperty(cloned, key, {
      configurable: true,
      enumerable: true,
      value: candidate,
      writable: true,
    });
  }
  return cloned;
}

function createNullPrototypeRecord<TValue>(): Record<string, TValue> {
  const record: Record<string, TValue> = {};
  Object.setPrototypeOf(record, null);
  return record;
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function readDataRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      return undefined;
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return undefined;
    }
  }
  return value as Readonly<Record<string, unknown>>;
}

function readDenseArray(
  value: unknown,
  maximumLength = Number.MAX_SAFE_INTEGER,
): readonly unknown[] | undefined {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return undefined;
  }
  const length = readArrayLength(value);
  if (length === undefined || length > maximumLength) {
    return undefined;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (!hasExactArrayKeys(ownKeys, length) || !hasOnlyDataElements(value, length)) {
    return undefined;
  }
  return value as readonly unknown[];
}

function readArrayLength(value: readonly unknown[]): number | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
  if (descriptor === undefined || descriptor.enumerable || !('value' in descriptor)) {
    return undefined;
  }
  return typeof descriptor.value === 'number' &&
    Number.isSafeInteger(descriptor.value) &&
    descriptor.value >= 0
    ? descriptor.value
    : undefined;
}

function hasExactArrayKeys(keys: readonly PropertyKey[], length: number): boolean {
  if (keys.length !== length + 1) {
    return false;
  }
  const keySet = new Set(keys);
  if (!keySet.has('length')) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (!keySet.has(String(index))) {
      return false;
    }
  }
  return true;
}

function hasOnlyDataElements(value: readonly unknown[], length: number): boolean {
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return false;
    }
  }
  return true;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.length >= required.length &&
    keys.every((key) => allowed.has(key))
  );
}

function isJsonObject(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return (
    value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)
  );
}

function isTransactionSource(value: unknown): value is TransactionSource {
  return (
    value === 'human-input' ||
    value === 'command' ||
    value === 'import' ||
    value === 'migration' ||
    value === 'validator-fix' ||
    value === 'proposal-accept'
  );
}

function isSystemRole(
  value: unknown,
): value is Extract<ActorRef, { readonly type: 'system' }>['role'] {
  return (
    value === 'importer' || value === 'migration' || value === 'validator' || value === 'recovery'
  );
}

function isSimpleMarkType(
  value: string,
): value is Exclude<Mark, { readonly type: 'link' }>['type'] {
  return (
    value === 'bold' ||
    value === 'italic' ||
    value === 'underline' ||
    value === 'strike' ||
    value === 'code' ||
    value === 'subscript' ||
    value === 'superscript'
  );
}

function isAcademicRelationKind(value: unknown): value is AcademicRelationKind {
  return (
    value === 'claim-supports-evidence' ||
    value === 'claim-partially-supports-evidence' ||
    value === 'claim-contradicts-evidence' ||
    value === 'claim-context-only-evidence' ||
    value === 'claim-unclear-evidence' ||
    value === 'citation-references-reference' ||
    value === 'evidence-located-in-source' ||
    value === 'cross-reference-targets'
  );
}

function invalidTransaction(): Result<never, TransactionRuntimeDecodeError> {
  return {
    type: 'error',
    error: {
      reason: 'transaction-invalid',
      safeMessage: 'The Transaction does not match the closed V1 runtime schema.',
    },
  };
}

function tooLargeTransaction(): Result<never, TransactionRuntimeDecodeError> {
  return {
    type: 'error',
    error: {
      reason: 'transaction-too-large',
      safeMessage: 'The Transaction exceeds the supported request size or collection limits.',
    },
  };
}
