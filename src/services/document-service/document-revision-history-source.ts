import type { CancellationToken } from '../../base/cancellation/cancellation-token.js';
import type { NirecoErrorCode, Result } from '../../base/errors/nireco-error.js';
import {
  createNirecoCatalogError,
  isNirecoErrorCode,
} from '../../base/errors/nireco-error-catalog.js';
import { deepFreeze } from '../../base/immutability/deep-freeze.js';
import {
  parseContentHash,
  parseRevisionId,
  parseTransactionId,
  type RevisionId,
} from '../../base/ids/identifiers.js';
import { parseIsoTimestamp } from '../../base/time/clock.js';
import type { DocumentUri, ResourceUri } from '../../base/uri/resource-uri.js';
import { isDocumentUri } from '../../base/uri/resource-uri.js';
import type { Revision } from '../../model/revision/revision.js';
import { decodeStrictActorRef } from '../../model/transaction/transaction-runtime.js';
import type { IIdAllocator } from '../../workspace/id-allocator.js';
import type { SingleDocumentAuthority } from '../../workspace/document-authority/single-document-authority.js';

export const MAX_DOCUMENT_REVISION_HISTORY_WALK_REVISIONS = 4_096;
export const MAX_DOCUMENT_REVISION_HISTORY_TIMESTAMP_CHARACTERS = 64;

export interface DocumentRevisionHistoryRequest {
  readonly uri: ResourceUri;
  readonly sinceRevisionId: RevisionId;
  readonly throughRevisionId: RevisionId;
  readonly cancellation: CancellationToken;
}

export type DocumentRevisionHistoryResult = Result<readonly Revision[]>;

export interface DocumentRevisionHistorySource {
  getRevisions(request: DocumentRevisionHistoryRequest): DocumentRevisionHistoryResult;
}

export type SingleDocumentAuthorityRevisionReader = Pick<SingleDocumentAuthority, 'getRevision'>;

export interface SingleDocumentAuthorityRevisionHistorySourceOptions {
  readonly uri: DocumentUri;
  readonly authority: SingleDocumentAuthorityRevisionReader;
  readonly ids: Pick<IIdAllocator, 'allocateDebugId'>;
  readonly maxWalkRevisions?: number;
}

interface ValidatedHistoryRequest extends DocumentRevisionHistoryRequest {
  readonly uri: DocumentUri;
}

interface HistoryEndpoints {
  readonly since: Revision;
  readonly through: Revision;
}

type RevisionWithoutParent = Omit<Revision, 'parentRevisionId'>;

/**
 * Adapts the concrete Authority's exact Revision lookup without widening
 * `IDocumentAuthority`. Results exclude `since`, include `through`, and are
 * returned oldest-to-newest as detached, deeply frozen values.
 *
 * `SingleDocumentAuthority#getRevision` retains only the current Authority
 * lifetime. A missing parent is therefore reported as unsupported retention,
 * not misclassified as durable-store corruption.
 */
export class SingleDocumentAuthorityRevisionHistorySource implements DocumentRevisionHistorySource {
  readonly #uri: DocumentUri;
  readonly #authority: SingleDocumentAuthorityRevisionReader;
  readonly #ids: Pick<IIdAllocator, 'allocateDebugId'>;
  readonly #maxWalkRevisions: number;

  constructor(options: SingleDocumentAuthorityRevisionHistorySourceOptions) {
    if (!isDocumentUri(options.uri)) {
      throw new TypeError('The Revision history adapter requires a canonical document URI.');
    }
    this.#uri = options.uri;
    this.#authority = options.authority;
    this.#ids = options.ids;
    this.#maxWalkRevisions = readMaxWalkRevisions(options.maxWalkRevisions);
  }

  getRevisions(request: DocumentRevisionHistoryRequest): DocumentRevisionHistoryResult {
    try {
      return this.#getRevisions(request);
    } catch {
      return this.#error('INTERNAL_ERROR');
    }
  }

  #getRevisions(request: DocumentRevisionHistoryRequest): DocumentRevisionHistoryResult {
    const validated = this.#validateRequest(request);
    if (validated.type === 'error') {
      return validated;
    }
    const endpoints = this.#readEndpoints(validated.value);
    if (endpoints.type === 'error') {
      return endpoints;
    }
    if (endpoints.value.since.id === endpoints.value.through.id) {
      const empty: Revision[] = [];
      return { type: 'ok', value: deepFreeze(empty) };
    }
    return this.#walkHistory(validated.value, endpoints.value);
  }

  #validateRequest(request: DocumentRevisionHistoryRequest): Result<ValidatedHistoryRequest> {
    if (isCancelled(request.cancellation)) {
      return this.#cancelled();
    }
    if (!isDocumentUri(request.uri)) {
      return this.#error('INVALID_RESOURCE_URI');
    }
    if (request.uri !== this.#uri) {
      return this.#modelNotFound();
    }
    if (
      parseRevisionId(request.sinceRevisionId).type === 'invalid' ||
      parseRevisionId(request.throughRevisionId).type === 'invalid'
    ) {
      return this.#error('SCHEMA_INVALID');
    }
    return {
      type: 'ok',
      value: {
        uri: request.uri,
        sinceRevisionId: request.sinceRevisionId,
        throughRevisionId: request.throughRevisionId,
        cancellation: request.cancellation,
      },
    };
  }

  #readEndpoints(request: ValidatedHistoryRequest): Result<HistoryEndpoints> {
    const since = this.#readAuthorityRevision(request.sinceRevisionId);
    if (since.type === 'error') {
      return since;
    }
    if (isCancelled(request.cancellation)) {
      return this.#cancelled();
    }
    const through =
      request.sinceRevisionId === request.throughRevisionId
        ? since
        : this.#readAuthorityRevision(request.throughRevisionId);
    if (through.type === 'error') {
      return through;
    }
    if (isCancelled(request.cancellation)) {
      return this.#cancelled();
    }
    if (since.value.uri !== this.#uri || through.value.uri !== this.#uri) {
      return this.#corrupt(request.throughRevisionId);
    }
    if (through.value.id !== since.value.id && through.value.sequence <= since.value.sequence) {
      return this.#baseMismatch(request.throughRevisionId);
    }
    if (through.value.sequence - since.value.sequence > this.#maxWalkRevisions) {
      return this.#requestTooLarge();
    }
    return {
      type: 'ok',
      value: {
        since: since.value,
        through: through.value,
      },
    };
  }

  #walkHistory(
    request: ValidatedHistoryRequest,
    endpoints: HistoryEndpoints,
  ): DocumentRevisionHistoryResult {
    const newestFirst: Revision[] = [];
    const visited = new Set<RevisionId>();
    let current = endpoints.through;
    while (current.id !== endpoints.since.id) {
      const ready = this.#validateWalkStep(
        request,
        endpoints,
        current,
        visited,
        newestFirst.length,
      );
      if (ready.type === 'error') {
        return ready;
      }
      visited.add(current.id);
      newestFirst.push(current);
      const parent = this.#readParent(request, endpoints.since, current, visited);
      if (parent.type === 'error') {
        return parent;
      }
      current = parent.value;
    }

    const chronological = newestFirst.reverse().map(cloneRevision);
    if (!isStrictlyOrderedHistory(endpoints.since, endpoints.through, chronological)) {
      return this.#corrupt(endpoints.through.id);
    }
    return { type: 'ok', value: deepFreeze(chronological) };
  }

  #validateWalkStep(
    request: ValidatedHistoryRequest,
    endpoints: HistoryEndpoints,
    current: Revision,
    visited: ReadonlySet<RevisionId>,
    walked: number,
  ): Result<void> {
    if (isCancelled(request.cancellation)) {
      return this.#cancelled();
    }
    if (visited.has(current.id)) {
      return this.#corrupt(endpoints.through.id);
    }
    if (current.sequence <= endpoints.since.sequence) {
      return this.#baseMismatch(endpoints.through.id);
    }
    if (walked >= this.#maxWalkRevisions) {
      return this.#requestTooLarge();
    }
    return { type: 'ok', value: undefined };
  }

  #readParent(
    request: ValidatedHistoryRequest,
    since: Revision,
    current: Revision,
    visited: ReadonlySet<RevisionId>,
  ): Result<Revision> {
    const parentRevisionId = current.parentRevisionId;
    if (parentRevisionId === null || visited.has(parentRevisionId)) {
      return this.#corrupt(current.id);
    }
    const parent: Result<Revision> =
      parentRevisionId === since.id
        ? { type: 'ok', value: since }
        : this.#readParentRevision(parentRevisionId);
    if (parent.type === 'error') {
      return parent;
    }
    if (isCancelled(request.cancellation)) {
      return this.#cancelled();
    }
    if (parent.value.uri !== request.uri || parent.value.sequence !== current.sequence - 1) {
      return this.#corrupt(current.id);
    }
    return parent;
  }

  #readAuthorityRevision(revisionId: RevisionId): Result<Revision> {
    try {
      const read = this.#authority.getRevision(revisionId);
      if (read.type === 'error') {
        const code = isNirecoErrorCode(read.error.code) ? read.error.code : 'INTERNAL_ERROR';
        return {
          type: 'error',
          error: createNirecoCatalogError(code, this.#ids.allocateDebugId(), {
            currentRevisionId: revisionId,
          }),
        };
      }
      const normalized = normalizeHistoryRevision(read.value, revisionId);
      return normalized === undefined
        ? this.#corrupt(revisionId)
        : { type: 'ok', value: normalized };
    } catch {
      return this.#error('INTERNAL_ERROR');
    }
  }

  #readParentRevision(revisionId: RevisionId): Result<Revision> {
    const read = this.#readAuthorityRevision(revisionId);
    return read.type === 'error' && read.error.code === 'REVISION_NOT_FOUND'
      ? this.#historyUnavailable()
      : read;
  }

  #historyUnavailable<TValue>(): Result<TValue> {
    return this.#error('CAPABILITY_UNSUPPORTED');
  }

  #cancelled<TValue>(): Result<TValue> {
    return this.#error('CANCELLED');
  }

  #modelNotFound<TValue>(): Result<TValue> {
    return this.#error('MODEL_NOT_FOUND');
  }

  #baseMismatch<TValue>(throughRevisionId: RevisionId): Result<TValue> {
    return this.#error('BASE_REVISION_MISMATCH', throughRevisionId);
  }

  #corrupt<TValue>(currentRevisionId: RevisionId): Result<TValue> {
    return this.#error('STORAGE_CORRUPT', currentRevisionId);
  }

  #requestTooLarge<TValue>(): Result<TValue> {
    return this.#error('REQUEST_TOO_LARGE');
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

function readMaxWalkRevisions(value: number | undefined): number {
  const maximum = value ?? MAX_DOCUMENT_REVISION_HISTORY_WALK_REVISIONS;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum <= 0 ||
    maximum > MAX_DOCUMENT_REVISION_HISTORY_WALK_REVISIONS
  ) {
    throw new RangeError(
      `Revision history maxWalkRevisions must be between 1 and ${MAX_DOCUMENT_REVISION_HISTORY_WALK_REVISIONS}.`,
    );
  }
  return maximum;
}

function isCancelled(cancellation: CancellationToken): boolean {
  return cancellation.isCancellationRequested;
}

function normalizeHistoryRevision(value: unknown, expectedId: RevisionId): Revision | undefined {
  const revision = captureClosedDataRecord(value, [
    'id',
    'uri',
    'parentRevisionId',
    'transactionId',
    'sequence',
    'documentHash',
    'actor',
    'createdAt',
    'durability',
  ]);
  if (revision === undefined) {
    return undefined;
  }
  const fields = readRevisionWithoutParent(revision, expectedId);
  if (fields === undefined) {
    return undefined;
  }
  const parentRevisionId = readParentRevisionId(revision.get('parentRevisionId'));
  if (
    parentRevisionId === undefined ||
    !hasValidParentShape(fields.id, fields.sequence, parentRevisionId)
  ) {
    return undefined;
  }
  return {
    ...fields,
    parentRevisionId,
  };
}

function readRevisionWithoutParent(
  revision: ReadonlyMap<string, unknown>,
  expectedId: RevisionId,
): RevisionWithoutParent | undefined {
  const id = parseString(revision.get('id'), parseRevisionId);
  if (id !== expectedId) {
    return undefined;
  }
  const uri = readDocumentUri(revision.get('uri'));
  if (uri === undefined) {
    return undefined;
  }
  const transactionId = parseString(revision.get('transactionId'), parseTransactionId);
  if (transactionId === undefined) {
    return undefined;
  }
  const sequence = readRevisionSequence(revision.get('sequence'));
  if (sequence === undefined) {
    return undefined;
  }
  const documentHash = parseString(revision.get('documentHash'), parseContentHash);
  if (documentHash === undefined) {
    return undefined;
  }
  const actor = decodeStrictActorRef(revision.get('actor'));
  if (actor === undefined) {
    return undefined;
  }
  const createdAt = readRevisionTimestamp(revision.get('createdAt'));
  if (createdAt === undefined) {
    return undefined;
  }
  const durability = readDurabilityLevel(revision.get('durability'));
  if (durability === undefined) {
    return undefined;
  }
  return {
    id,
    uri,
    transactionId,
    sequence,
    documentHash,
    actor,
    createdAt,
    durability,
  };
}

function readDocumentUri(value: unknown): DocumentUri | undefined {
  return typeof value === 'string' && isDocumentUri(value) ? value : undefined;
}

function readRevisionSequence(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < Number.MAX_SAFE_INTEGER
    ? value
    : undefined;
}

function readParentRevisionId(value: unknown): RevisionId | null | undefined {
  return value === null ? null : parseString(value, parseRevisionId);
}

function readRevisionTimestamp(value: unknown): Revision['createdAt'] | undefined {
  return typeof value === 'string' &&
    value.length <= MAX_DOCUMENT_REVISION_HISTORY_TIMESTAMP_CHARACTERS
    ? parseString(value, parseIsoTimestamp)
    : undefined;
}

function readDurabilityLevel(value: unknown): Revision['durability'] | undefined {
  return isDurabilityLevel(value) ? value : undefined;
}

function hasValidParentShape(
  id: RevisionId,
  sequence: number,
  parentRevisionId: RevisionId | null,
): boolean {
  return (
    ((sequence === 0 && parentRevisionId === null) ||
      (sequence > 0 && parentRevisionId !== null)) &&
    parentRevisionId !== id
  );
}

function captureClosedDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): ReadonlyMap<string, unknown> | undefined {
  try {
    if (!isPlainRecordObject(value)) {
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return undefined;
    }
    const captured = new Map<string, unknown>();
    for (const key of expectedKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        return undefined;
      }
      captured.set(key, descriptor.value);
    }
    return captured;
  } catch {
    return undefined;
  }
}

function isPlainRecordObject(value: unknown): value is object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseString<TValue>(
  value: unknown,
  parse: (
    input: string,
  ) => { readonly type: 'valid'; readonly value: TValue } | { readonly type: 'invalid' },
): TValue | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parse(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

function isDurabilityLevel(value: unknown): value is Revision['durability'] {
  return value === 'memory' || value === 'wal' || value === 'snapshot';
}

function isStrictlyOrderedHistory(
  since: Revision,
  through: Revision,
  revisions: readonly Revision[],
): boolean {
  if (revisions.length !== through.sequence - since.sequence) {
    return false;
  }
  let expectedParentRevisionId = since.id;
  let expectedSequence = since.sequence + 1;
  for (const revision of revisions) {
    if (
      revision.parentRevisionId !== expectedParentRevisionId ||
      revision.sequence !== expectedSequence
    ) {
      return false;
    }
    expectedParentRevisionId = revision.id;
    expectedSequence += 1;
  }
  return revisions[revisions.length - 1]?.id === through.id;
}

function cloneRevision(revision: Revision): Revision {
  return {
    ...revision,
    actor: { ...revision.actor },
  };
}
