import {
  parseContentHash,
  parseNodeId,
  parseRevisionId,
  type ContentHash,
} from '../../base/ids/identifiers.js';
import { encodeUtf8, sha256Utf8 } from '../../base/hashing/portable-sha-256.js';
import {
  isWellFormedUnicodeString,
  serializeCanonicalJson,
  type JsonValue,
} from '../../base/serialization/canonical-json.js';

export const DOCUMENT_READ_QUERY_HASH_PREIMAGE_PREFIX = 'NIRECO\0DOCUMENT_READ_QUERY\0V1\0';
export const MAX_DOCUMENT_READ_QUERY_CANONICAL_BYTES = 64 * 1_024;
export const MAX_DOCUMENT_READ_QUERY_ITEMS = 1_000;
export const MAX_DOCUMENT_READ_QUERY_PAGE_ITEMS = 1_000;
export const MAX_DOCUMENT_READ_QUERY_STRING_UTF16_UNITS = 4_096;
export const MAX_DOCUMENT_READ_OUTLINE_DEPTH = 256;
export const MAX_DOCUMENT_READ_NEIGHBORHOOD_BLOCKS = 100;
export const MAX_DOCUMENT_SEARCH_SECTION_IDS = 256;
export const MAX_DOCUMENT_DIAGNOSTIC_CODES = 256;

export const DOCUMENT_READ_QUERY_SERVICES = [
  'workspace.resolve_model',
  'document.get_head',
  'document.get_snapshot',
  'document.get_outline',
  'document.read_nodes',
  'document.read_node_neighborhood',
  'document.search',
  'document.get_changes_since',
  'document.get_diagnostics',
] as const;

export type DocumentReadQueryService = (typeof DOCUMENT_READ_QUERY_SERVICES)[number];

export type DocumentReadQueryHashResult =
  | {
      readonly type: 'ok';
      readonly hash: ContentHash;
      readonly canonicalJson: string;
      readonly preimage: string;
    }
  | {
      readonly type: 'error';
      readonly reason:
        'invalid-query' | 'query-too-large' | 'canonicalization-failed' | 'hash-failed';
    };

type QueryErrorReason = Extract<DocumentReadQueryHashResult, { readonly type: 'error' }>['reason'];

type NormalizeResult =
  | {
      readonly type: 'ok';
      readonly value: JsonValue;
    }
  | {
      readonly type: 'error';
      readonly reason: 'invalid-query' | 'query-too-large';
    };

type RecordCaptureResult =
  | {
      readonly type: 'ok';
      readonly values: ReadonlyMap<string, unknown>;
    }
  | {
      readonly type: 'error';
      readonly reason: 'invalid-query' | 'query-too-large';
    };

type ArrayCaptureResult =
  | {
      readonly type: 'ok';
      readonly values: readonly unknown[];
    }
  | {
      readonly type: 'error';
      readonly reason: 'invalid-query' | 'query-too-large';
    };

interface QueryFieldDefinition {
  readonly name: string;
  readonly normalize: (value: unknown) => NormalizeResult;
}

const MAX_DOCUMENT_READ_QUERY_FIELDS = 8;
const MAX_DIAGNOSTIC_CODE_UTF16_UNITS = 128;
const DIAGNOSTIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const SEARCH_KINDS = ['text', 'citation', 'claim', 'heading'] as const;
const DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const;

const MAX_RESULTS_FIELD: QueryFieldDefinition = {
  name: 'maxResults',
  normalize: normalizeMaxResults,
};

const QUERY_FIELDS: Readonly<Record<DocumentReadQueryService, readonly QueryFieldDefinition[]>> = {
  'workspace.resolve_model': [],
  'document.get_head': [],
  'document.get_snapshot': [],
  'document.get_outline': [
    { name: 'maxDepth', normalize: normalizeOutlineDepth },
    MAX_RESULTS_FIELD,
  ],
  'document.read_nodes': [
    { name: 'nodeIds', normalize: normalizeOrderedNodeIds },
    MAX_RESULTS_FIELD,
  ],
  'document.read_node_neighborhood': [
    { name: 'nodeId', normalize: normalizeNodeId },
    { name: 'beforeBlocks', normalize: normalizeNeighborhoodBlocks },
    { name: 'afterBlocks', normalize: normalizeNeighborhoodBlocks },
    MAX_RESULTS_FIELD,
  ],
  'document.search': [
    { name: 'query', normalize: normalizeSearchQuery },
    { name: 'sectionIds', normalize: normalizeSortedNodeIds },
    { name: 'kinds', normalize: normalizeSearchKinds },
    MAX_RESULTS_FIELD,
  ],
  'document.get_changes_since': [
    { name: 'sinceRevisionId', normalize: normalizeRevisionId },
    MAX_RESULTS_FIELD,
  ],
  'document.get_diagnostics': [
    { name: 'severities', normalize: normalizeDiagnosticSeverities },
    { name: 'codes', normalize: normalizeDiagnosticCodes },
    MAX_RESULTS_FIELD,
  ],
};

/**
 * Captures and normalizes a read query before hashing it under a dedicated
 * protocol preimage. Cursor position, cursor text, Session, document and Scope
 * are deliberately not query fields; the cursor codec binds those separately.
 *
 * Optional values must already reflect the effective service defaults before
 * this function is called. This keeps negotiated limits out of the hash module
 * while still rejecting accessor, Proxy drift, unknown fields and non-canonical
 * endpoint values at the hashing boundary.
 */
export function createDocumentReadQueryHash(input: unknown): DocumentReadQueryHashResult {
  const captured = capturePlainRecord(input);
  if (captured.type === 'error') {
    return queryError(captured.reason);
  }
  const service = parseQueryService(captured.values.get('service'));
  if (service === undefined) {
    return queryError('invalid-query');
  }
  const normalized = normalizeCapturedQuery(service, captured.values);
  if (normalized.type === 'error') {
    return queryError(normalized.reason);
  }

  const canonical = serializeCanonicalJson(normalized.value);
  if (canonical.type === 'error') {
    return queryError('canonicalization-failed');
  }
  if (encodeUtf8(canonical.value).length > MAX_DOCUMENT_READ_QUERY_CANONICAL_BYTES) {
    return queryError('query-too-large');
  }

  const preimage = `${DOCUMENT_READ_QUERY_HASH_PREIMAGE_PREFIX}${canonical.value}`;
  const hash = parseContentHash(`sha256:${sha256Utf8(preimage)}`);
  return hash.type === 'valid'
    ? {
        type: 'ok',
        hash: hash.value,
        canonicalJson: canonical.value,
        preimage,
      }
    : queryError('hash-failed');
}

function normalizeCapturedQuery(
  service: DocumentReadQueryService,
  values: ReadonlyMap<string, unknown>,
): NormalizeResult {
  const fields = QUERY_FIELDS[service];
  const allowedFields = new Set(['service', ...fields.map(({ name }) => name)]);
  if ([...values.keys()].some((key) => !allowedFields.has(key))) {
    return normalizeError('invalid-query');
  }

  const normalized: Record<string, JsonValue> = { service };
  for (const field of fields) {
    if (!values.has(field.name)) {
      continue;
    }
    const value = field.normalize(values.get(field.name));
    if (value.type === 'error') {
      return value;
    }
    normalized[field.name] = value.value;
  }
  return { type: 'ok', value: normalized };
}

function capturePlainRecord(value: unknown): RecordCaptureResult {
  try {
    if (value === null || typeof value !== 'object') {
      return captureError('invalid-query');
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return captureError('invalid-query');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_DOCUMENT_READ_QUERY_FIELDS) {
      return captureError('query-too-large');
    }

    const values = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== 'string') {
        return captureError('invalid-query');
      }
      const property = captureDataProperty(value, key, true);
      if (property.type === 'error') {
        return captureError('invalid-query');
      }
      values.set(key, property.value);
    }
    return { type: 'ok', values };
  } catch {
    return captureError('invalid-query');
  }
}

function capturePlainArray(
  value: unknown,
  maxItems = MAX_DOCUMENT_READ_QUERY_ITEMS,
): ArrayCaptureResult {
  try {
    if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
      return arrayError('invalid-query');
    }
    const lengthProperty = captureDataProperty(value, 'length', false);
    const length = lengthProperty.type === 'ok' ? lengthProperty.value : undefined;
    if (!isSafeNonnegativeInteger(length)) {
      return arrayError('invalid-query');
    }
    if (length > maxItems) {
      return arrayError('query-too-large');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || keys.some((key) => !isAllowedArrayKey(key, length))) {
      return arrayError('invalid-query');
    }

    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const property = captureDataProperty(value, String(index), true);
      if (property.type === 'error') {
        return arrayError('invalid-query');
      }
      values.push(property.value);
    }
    return { type: 'ok', values };
  } catch {
    return arrayError('invalid-query');
  }
}

function captureDataProperty(
  value: object,
  key: string,
  enumerable: boolean,
): { readonly type: 'ok'; readonly value: unknown } | { readonly type: 'error' } {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === enumerable
    ? { type: 'ok', value: descriptor.value }
    : { type: 'error' };
}

function normalizeMaxResults(value: unknown): NormalizeResult {
  return isSafePositiveInteger(value) && value <= MAX_DOCUMENT_READ_QUERY_PAGE_ITEMS
    ? { type: 'ok', value }
    : normalizeError('invalid-query');
}

function normalizeOutlineDepth(value: unknown): NormalizeResult {
  return isSafeNonnegativeInteger(value) && value <= MAX_DOCUMENT_READ_OUTLINE_DEPTH
    ? { type: 'ok', value }
    : normalizeError('invalid-query');
}

function normalizeNeighborhoodBlocks(value: unknown): NormalizeResult {
  return isSafeNonnegativeInteger(value) && value <= MAX_DOCUMENT_READ_NEIGHBORHOOD_BLOCKS
    ? { type: 'ok', value }
    : normalizeError('invalid-query');
}

function normalizeNodeId(value: unknown): NormalizeResult {
  if (typeof value !== 'string') {
    return normalizeError('invalid-query');
  }
  const parsed = parseNodeId(value);
  return parsed.type === 'valid'
    ? { type: 'ok', value: parsed.value }
    : normalizeError('invalid-query');
}

function normalizeRevisionId(value: unknown): NormalizeResult {
  if (typeof value !== 'string') {
    return normalizeError('invalid-query');
  }
  const parsed = parseRevisionId(value);
  return parsed.type === 'valid'
    ? { type: 'ok', value: parsed.value }
    : normalizeError('invalid-query');
}

function normalizeOrderedNodeIds(value: unknown): NormalizeResult {
  return normalizeNodeIds(value, false);
}

function normalizeSortedNodeIds(value: unknown): NormalizeResult {
  return normalizeNodeIds(value, true, MAX_DOCUMENT_SEARCH_SECTION_IDS);
}

function normalizeNodeIds(
  value: unknown,
  sort: boolean,
  maxItems = MAX_DOCUMENT_READ_QUERY_ITEMS,
): NormalizeResult {
  const captured = capturePlainArray(value, maxItems);
  if (captured.type === 'error') {
    return normalizeError(captured.reason);
  }
  const ids: string[] = [];
  for (const item of captured.values) {
    const normalized = normalizeNodeId(item);
    if (normalized.type === 'error' || typeof normalized.value !== 'string') {
      return normalizeError('invalid-query');
    }
    ids.push(normalized.value);
  }
  if (new Set(ids).size !== ids.length) {
    return normalizeError('invalid-query');
  }
  if (sort) {
    ids.sort(compareStrings);
  }
  return { type: 'ok', value: ids };
}

function normalizeSearchQuery(value: unknown): NormalizeResult {
  if (typeof value !== 'string' || value.length === 0 || !isWellFormedUnicodeString(value)) {
    return normalizeError('invalid-query');
  }
  return value.length <= MAX_DOCUMENT_READ_QUERY_STRING_UTF16_UNITS
    ? { type: 'ok', value }
    : normalizeError('query-too-large');
}

function normalizeSearchKinds(value: unknown): NormalizeResult {
  return normalizeKnownStringSet(value, SEARCH_KINDS);
}

function normalizeDiagnosticSeverities(value: unknown): NormalizeResult {
  return normalizeKnownStringSet(value, DIAGNOSTIC_SEVERITIES);
}

function normalizeKnownStringSet(
  value: unknown,
  canonicalOrder: readonly string[],
): NormalizeResult {
  const captured = capturePlainArray(value, canonicalOrder.length);
  if (captured.type === 'error') {
    return normalizeError(captured.reason);
  }
  if (captured.values.some((item) => typeof item !== 'string' || !canonicalOrder.includes(item))) {
    return normalizeError('invalid-query');
  }
  const strings = captured.values.filter((item): item is string => typeof item === 'string');
  if (new Set(strings).size !== strings.length) {
    return normalizeError('invalid-query');
  }
  return {
    type: 'ok',
    value: canonicalOrder.filter((item) => strings.includes(item)),
  };
}

function normalizeDiagnosticCodes(value: unknown): NormalizeResult {
  const captured = capturePlainArray(value, MAX_DOCUMENT_DIAGNOSTIC_CODES);
  if (captured.type === 'error') {
    return normalizeError(captured.reason);
  }
  const codes: string[] = [];
  for (const item of captured.values) {
    if (
      typeof item !== 'string' ||
      item.length === 0 ||
      item.length > MAX_DIAGNOSTIC_CODE_UTF16_UNITS ||
      !isWellFormedUnicodeString(item) ||
      !DIAGNOSTIC_CODE_PATTERN.test(item)
    ) {
      return normalizeError('invalid-query');
    }
    codes.push(item);
  }
  if (new Set(codes).size !== codes.length) {
    return normalizeError('invalid-query');
  }
  codes.sort(compareStrings);
  return { type: 'ok', value: codes };
}

function parseQueryService(value: unknown): DocumentReadQueryService | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  for (const service of DOCUMENT_READ_QUERY_SERVICES) {
    if (service === value) {
      return service;
    }
  }
  return undefined;
}

function isAllowedArrayKey(key: PropertyKey, length: number): boolean {
  if (key === 'length') {
    return true;
  }
  if (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return isSafeNonnegativeInteger(value) && value > 0;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeError(reason: 'invalid-query' | 'query-too-large'): NormalizeResult {
  return { type: 'error', reason };
}

function captureError(reason: 'invalid-query' | 'query-too-large'): RecordCaptureResult {
  return { type: 'error', reason };
}

function arrayError(reason: 'invalid-query' | 'query-too-large'): ArrayCaptureResult {
  return { type: 'error', reason };
}

function queryError(reason: QueryErrorReason): DocumentReadQueryHashResult {
  return { type: 'error', reason };
}
