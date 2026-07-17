import type { NirecoErrorCode, Result } from '../../base/errors/nireco-error.js';
import { createNirecoCatalogError } from '../../base/errors/nireco-error-catalog.js';
import { deepFreeze } from '../../base/immutability/deep-freeze.js';
import {
  parseNodeId,
  parseRevisionId,
  parseSessionId,
  type NodeId,
  type SessionId,
} from '../../base/ids/identifiers.js';
import { parseIsoTimestamp, type IClock } from '../../base/time/clock.js';
import { isDocumentUri } from '../../base/uri/resource-uri.js';
import type { IIdAllocator } from '../../workspace/id-allocator.js';
import {
  MAX_DOCUMENT_READ_CONTEXT_DISTANCE,
  MAX_DOCUMENT_READ_SCOPE_IDS,
  type DocumentReadScope,
  type DocumentReadSessionGrant,
  type DocumentReadSessionResolution,
  type DocumentReadSessionSource,
} from './document-read-types.js';

const DOCUMENT_KEYS = ['revisionId', 'uri'] as const;
const SCOPE_KEYS = [
  'allowReadOutsideScopeForContext',
  'allowedNodeIds',
  'allowedSectionIds',
  'maxContextDistance',
] as const;

export interface OpenDocumentReadSessionInput {
  readonly sessionId: unknown;
  readonly document: unknown;
  readonly scope: unknown;
  readonly expiresAt: unknown;
}

export interface InMemoryDocumentReadSessionStoreOptions {
  readonly clock: IClock;
  readonly ids: Pick<IIdAllocator, 'allocateDebugId'>;
}

interface StoredDocumentReadSession {
  readonly grant: DocumentReadSessionGrant;
  readonly expiresAt: CapturedTimestamp;
}

const EXPIRED_SESSION = Object.freeze({ status: 'expired' as const });
const SESSION_CLOCK_UNAVAILABLE = Object.freeze({ status: 'clock-unavailable' as const });

/**
 * Process-local Session authority for revision-bound reads.
 *
 * Inputs are captured through inert own data descriptors before validation.
 * The stored grant is a fresh deeply frozen value, so mutating an object that
 * was supplied to `open` cannot widen a later read.
 */
export class InMemoryDocumentReadSessionStore implements DocumentReadSessionSource {
  readonly #clock: IClock;
  readonly #ids: Pick<IIdAllocator, 'allocateDebugId'>;
  readonly #sessions = new Map<SessionId, StoredDocumentReadSession>();
  readonly #expiredSessionIds = new Set<SessionId>();
  readonly #seenSessionIds = new Set<SessionId>();
  #disposed = false;

  constructor(options: InMemoryDocumentReadSessionStoreOptions) {
    this.#clock = options.clock;
    this.#ids = options.ids;
  }

  open(input: OpenDocumentReadSessionInput): Result<DocumentReadSessionGrant> {
    if (this.#disposed) {
      return this.#error('SESSION_REVOKED');
    }

    const sessionId = readSessionId(input.sessionId);
    const document = readDocumentRef(input.document);
    const scope = readDocumentReadScope(input.scope);
    const expiresAt = readTimestamp(input.expiresAt);
    if (
      sessionId === undefined ||
      document === undefined ||
      scope === undefined ||
      expiresAt === undefined
    ) {
      return this.#invalidInput();
    }
    if (this.#seenSessionIds.has(sessionId)) {
      return this.#error('IDEMPOTENCY_CONFLICT');
    }

    const now = readClockTimestamp(this.#clock);
    if (now === undefined) {
      return this.#error('INTERNAL_ERROR');
    }
    if (compareTimestamps(expiresAt, now) <= 0) {
      return this.#error('SESSION_EXPIRED');
    }

    const grant = deepFreeze<DocumentReadSessionGrant>({
      document,
      scope,
    });
    this.#seenSessionIds.add(sessionId);
    this.#sessions.set(sessionId, {
      grant,
      expiresAt,
    });
    return { type: 'ok', value: grant };
  }

  resolve(sessionId: SessionId): DocumentReadSessionResolution {
    if (this.#disposed || readSessionId(sessionId) === undefined) {
      return undefined;
    }
    if (this.#expiredSessionIds.has(sessionId)) {
      return EXPIRED_SESSION;
    }
    const stored = this.#sessions.get(sessionId);
    if (stored === undefined) {
      return undefined;
    }
    const now = readClockTimestamp(this.#clock);
    if (now === undefined) {
      return SESSION_CLOCK_UNAVAILABLE;
    }
    if (compareTimestamps(now, stored.expiresAt) >= 0) {
      this.#sessions.delete(sessionId);
      this.#expiredSessionIds.add(sessionId);
      return EXPIRED_SESSION;
    }
    return stored.grant;
  }

  revoke(sessionId: SessionId): boolean {
    const wasActive = this.#sessions.delete(sessionId);
    const wasExpired = this.#expiredSessionIds.delete(sessionId);
    return wasActive || wasExpired;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#sessions.clear();
    this.#expiredSessionIds.clear();
  }

  #invalidInput<TValue>(): Result<TValue> {
    return this.#error('SCHEMA_INVALID');
  }

  #error<TValue>(code: NirecoErrorCode): Result<TValue> {
    return {
      type: 'error',
      error: createNirecoCatalogError(code, this.#ids.allocateDebugId()),
    };
  }
}

interface CapturedTimestamp {
  readonly epochSecond: number;
  readonly fractionalSecond: string;
}

function readClockTimestamp(clock: IClock): CapturedTimestamp | undefined {
  try {
    return readTimestamp(clock.now());
  } catch {
    return undefined;
  }
}

function readTimestamp(value: unknown): CapturedTimestamp | undefined {
  if (typeof value !== 'string' || value.length > 64) {
    return undefined;
  }
  const parsed = parseIsoTimestamp(value);
  if (parsed.type === 'invalid') {
    return undefined;
  }
  const parts = /^(.{19})(?:\.(\d+))?Z$/u.exec(parsed.value);
  if (parts === null) {
    return undefined;
  }
  const milliseconds = Date.parse(`${parts[1]}Z`);
  return Number.isFinite(milliseconds)
    ? {
        epochSecond: Math.floor(milliseconds / 1_000),
        fractionalSecond: (parts[2] ?? '').replace(/0+$/u, ''),
      }
    : undefined;
}

function compareTimestamps(left: CapturedTimestamp, right: CapturedTimestamp): number {
  if (left.epochSecond !== right.epochSecond) {
    return left.epochSecond < right.epochSecond ? -1 : 1;
  }
  const width = Math.max(left.fractionalSecond.length, right.fractionalSecond.length);
  const leftFraction = left.fractionalSecond.padEnd(width, '0');
  const rightFraction = right.fractionalSecond.padEnd(width, '0');
  return leftFraction === rightFraction ? 0 : leftFraction < rightFraction ? -1 : 1;
}

function readSessionId(value: unknown): SessionId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parseSessionId(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function readDocumentRef(value: unknown): DocumentReadSessionGrant['document'] | undefined {
  const record = captureExactRecord(value, DOCUMENT_KEYS);
  if (record === undefined) {
    return undefined;
  }
  const uri = record.get('uri');
  const revisionId = record.get('revisionId');
  if (typeof uri !== 'string' || !isDocumentUri(uri) || typeof revisionId !== 'string') {
    return undefined;
  }
  const parsedRevisionId = parseRevisionId(revisionId);
  return parsedRevisionId.type === 'valid'
    ? {
        uri,
        revisionId: parsedRevisionId.value,
      }
    : undefined;
}

function readDocumentReadScope(value: unknown): DocumentReadScope | undefined {
  const record = capturePartialRecord(value, SCOPE_KEYS);
  if (record === undefined) {
    return undefined;
  }
  const ids = readScopeIds(record);
  const context = readScopeContext(record);
  if (ids === undefined || context === undefined) {
    return undefined;
  }
  return {
    ...(ids.allowedNodeIds === undefined ? {} : { allowedNodeIds: ids.allowedNodeIds }),
    ...(ids.allowedSectionIds === undefined ? {} : { allowedSectionIds: ids.allowedSectionIds }),
    ...(context.allowContext === undefined
      ? {}
      : { allowReadOutsideScopeForContext: context.allowContext }),
    ...(context.maxContextDistance === undefined
      ? {}
      : { maxContextDistance: context.maxContextDistance }),
  };
}

interface CapturedScopeIds {
  readonly allowedNodeIds?: readonly NodeId[];
  readonly allowedSectionIds?: readonly NodeId[];
}

function readScopeIds(record: ReadonlyMap<string, unknown>): CapturedScopeIds | undefined {
  const allowedNodeIds = readOptionalNodeIds(record, 'allowedNodeIds');
  const allowedSectionIds = readOptionalNodeIds(record, 'allowedSectionIds');
  if (allowedNodeIds === null || allowedSectionIds === null) {
    return undefined;
  }
  if (
    (allowedNodeIds?.length ?? 0) + (allowedSectionIds?.length ?? 0) >
    MAX_DOCUMENT_READ_SCOPE_IDS
  ) {
    return undefined;
  }
  if (hasOverlappingScopeIds(allowedNodeIds, allowedSectionIds)) {
    return undefined;
  }
  return {
    ...(allowedNodeIds === undefined ? {} : { allowedNodeIds }),
    ...(allowedSectionIds === undefined ? {} : { allowedSectionIds }),
  };
}

function hasOverlappingScopeIds(
  allowedNodeIds: readonly NodeId[] | undefined,
  allowedSectionIds: readonly NodeId[] | undefined,
): boolean {
  return allowedNodeIds?.some((nodeId) => allowedSectionIds?.includes(nodeId) === true) === true;
}

interface CapturedScopeContext {
  readonly allowContext?: boolean;
  readonly maxContextDistance?: number;
}

function readScopeContext(record: ReadonlyMap<string, unknown>): CapturedScopeContext | undefined {
  const allowContext = readOptionalBoolean(record, 'allowReadOutsideScopeForContext');
  const maxContextDistance = readOptionalNonnegativeInteger(record, 'maxContextDistance');
  return allowContext === null ||
    maxContextDistance === null ||
    (maxContextDistance !== undefined && maxContextDistance > MAX_DOCUMENT_READ_CONTEXT_DISTANCE)
    ? undefined
    : {
        ...(allowContext === undefined ? {} : { allowContext }),
        ...(maxContextDistance === undefined ? {} : { maxContextDistance }),
      };
}

function readOptionalNodeIds(
  record: ReadonlyMap<string, unknown>,
  key: string,
): readonly NodeId[] | null | undefined {
  if (!record.has(key)) {
    return undefined;
  }
  const values = captureDenseArray(record.get(key));
  if (values === undefined || values.length > MAX_DOCUMENT_READ_SCOPE_IDS) {
    return null;
  }
  const ids: NodeId[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      return null;
    }
    const parsed = parseNodeId(value);
    if (parsed.type === 'invalid') {
      return null;
    }
    ids.push(parsed.value);
  }
  if (new Set(ids).size !== ids.length) {
    return null;
  }
  return ids.sort();
}

function readOptionalBoolean(
  record: ReadonlyMap<string, unknown>,
  key: string,
): boolean | null | undefined {
  if (!record.has(key)) {
    return undefined;
  }
  const value = record.get(key);
  return typeof value === 'boolean' ? value : null;
}

function readOptionalNonnegativeInteger(
  record: ReadonlyMap<string, unknown>,
  key: string,
): number | null | undefined {
  if (!record.has(key)) {
    return undefined;
  }
  const value = record.get(key);
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function captureExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): ReadonlyMap<string, unknown> | undefined {
  const record = capturePartialRecord(value, expectedKeys);
  return record?.size === expectedKeys.length ? record : undefined;
}

function capturePartialRecord(
  value: unknown,
  allowedKeys: readonly string[],
): ReadonlyMap<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    if (!recordKeysAreAllowed(keys, allowedKeys)) {
      return undefined;
    }
    return captureRecordValues(value, keys);
  } catch {
    return undefined;
  }
}

function recordKeysAreAllowed(
  keys: readonly PropertyKey[],
  allowedKeys: readonly string[],
): keys is readonly string[] {
  const allowed = new Set(allowedKeys);
  return (
    keys.every((key) => typeof key === 'string' && allowed.has(key)) &&
    new Set(keys).size === keys.length
  );
}

function captureRecordValues(
  value: object,
  keys: readonly string[],
): ReadonlyMap<string, unknown> | undefined {
  const captured = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!isEnumerableDataDescriptor(descriptor)) {
      return undefined;
    }
    captured.set(key, descriptor.value);
  }
  return captured;
}

function captureDenseArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  try {
    if (Reflect.getPrototypeOf(value) !== Array.prototype) {
      return undefined;
    }
    const length = readArrayLength(value);
    if (length === undefined || !arrayKeysAreExact(Reflect.ownKeys(value), length)) {
      return undefined;
    }
    return captureArrayValues(value, length);
  } catch {
    return undefined;
  }
}

function readArrayLength(value: readonly unknown[]): number | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
  return descriptor !== undefined &&
    'value' in descriptor &&
    Number.isSafeInteger(descriptor.value) &&
    descriptor.value >= 0
    ? descriptor.value
    : undefined;
}

function arrayKeysAreExact(keys: readonly PropertyKey[], length: number): boolean {
  return (
    keys.length === length + 1 &&
    keys.includes('length') &&
    keys.every((key) => key === 'length' || isArrayIndexInRange(key, length))
  );
}

function isArrayIndexInRange(key: PropertyKey, length: number): boolean {
  return typeof key === 'string' && /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < length;
}

function captureArrayValues(
  value: readonly unknown[],
  length: number,
): readonly unknown[] | undefined {
  const captured: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (!isEnumerableDataDescriptor(descriptor)) {
      return undefined;
    }
    captured.push(descriptor.value);
  }
  return captured;
}

function isEnumerableDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { readonly value: unknown } {
  return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true;
}
