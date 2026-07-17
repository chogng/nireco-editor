import {
  parseContentHash,
  parseEntityId,
  parseNodeId,
  parseRevisionId,
  parseUtf16Offset,
} from '../../base/ids/identifiers.js';
import {
  isWellFormedUnicodeString,
  MAX_CANONICAL_JSON_DEPTH,
  serializeCanonicalJson,
} from '../../base/serialization/canonical-json.js';
import { parseIsoTimestamp } from '../../base/time/clock.js';
import {
  isCanonicalResourceUri,
  isCometResourceUri,
  isDocumentUri,
} from '../../base/uri/resource-uri.js';
import type { AcademicEntity } from '../academic-graph.js';
import type { NodeKind } from '../node/manuscript-node.js';

export type UnknownRecord = Readonly<Record<string, unknown>>;

/**
 * Maximum child-edge distance within an open inert-JSON subtree such as CSL.
 * The 16-level envelope reserve keeps accepted subtrees serializable when nested
 * inside a Snapshot or Transaction, while still leaving enough headroom for a
 * Manuscript tree at its separate production depth limit.
 */
export const MAX_INERT_JSON_DEPTH = MAX_CANONICAL_JSON_DEPTH - 16;

type RecordValidator = (value: unknown) => boolean;

const SNAPSHOT_KEYS = [
  'format',
  'formatVersion',
  'schemaId',
  'schemaVersion',
  'revisionId',
  'documentHash',
  'metadata',
  'root',
  'academicGraph',
  'settings',
] as const;
const METADATA_KEYS = ['title', 'authors', 'abstract', 'keywords'] as const;
const AUTHOR_KEYS = ['id', 'name', 'given', 'family', 'orcid', 'affiliations'] as const;
const SETTINGS_KEYS = [
  'language',
  'citationStyle',
  'headingNumbering',
  'bibliographyEnabled',
] as const;
const CHILD_NODE_KEYS = ['id', 'type', 'attrs', 'children'] as const;
const LEAF_NODE_KEYS = ['id', 'type', 'attrs'] as const;
const TEXT_NODE_KEYS = ['id', 'type', 'value', 'marks'] as const;
const SIMPLE_MARK_TYPES: ReadonlySet<string> = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'subscript',
  'superscript',
]);
const MARK_TYPE_ORDER: ReadonlyMap<string, number> = new Map(
  ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'subscript', 'superscript'].map(
    (type, index) => [type, index],
  ),
);
const CHILD_BEARING_NODE_TYPES: ReadonlySet<NodeKind> = new Set([
  'blockQuote',
  'body',
  'codeBlock',
  'figure',
  'figureCaption',
  'footnote',
  'frontMatter',
  'heading',
  'list',
  'listItem',
  'manuscript',
  'paragraph',
  'section',
  'table',
  'tableCaption',
  'tableCell',
  'tableRow',
]);
const ALIGNMENTS: ReadonlySet<string> = new Set(['start', 'center', 'end', 'justify']);
const CITATION_LOCATOR_LABELS: ReadonlySet<string> = new Set([
  'page',
  'chapter',
  'section',
  'paragraph',
  'figure',
  'table',
  'timestamp',
  'record',
]);
const VERIFICATION_STATUSES: ReadonlySet<string> = new Set([
  'verified',
  'provisional',
  'metadata-only',
  'stale',
  'rejected',
]);
const CLAIM_EVIDENCE_RELATIONS: ReadonlySet<string> = new Set([
  'supports',
  'partially-supports',
  'contradicts',
  'context-only',
  'unclear',
]);
const AFFINITIES: ReadonlySet<string> = new Set(['before', 'after']);
const SYSTEM_ROLES: ReadonlySet<string> = new Set([
  'importer',
  'migration',
  'validator',
  'recovery',
]);
const OPAQUE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const ORCID_PATTERN = /^https:\/\/orcid\.org\/[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9X]{4}$/u;

export function hasValidSnapshotKeys(value: UnknownRecord): boolean {
  return hasOnlyKeys(value, SNAPSHOT_KEYS);
}

export function isValidMetadataShape(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  const authors = readDenseDataArray(record['authors']);
  return allValid([
    hasOnlyKeys(record, METADATA_KEYS),
    isBoundedString(record['title'], 0, 2_048),
    authors !== undefined && authors.length <= 1_024 && authors.every(isValidAuthor),
    isBoundedString(record['abstract'], 0, 100_000),
    isUniqueBoundedStringArray(record['keywords'], 1, 512, 1_024),
  ]);
}

export function isValidSettingsShape(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return allValid([
    hasOnlyKeys(record, SETTINGS_KEYS),
    typeof record['language'] === 'string' && LANGUAGE_TAG_PATTERN.test(record['language']),
    isBoundedString(record['citationStyle'], 1, 256),
    typeof record['headingNumbering'] === 'boolean',
    typeof record['bibliographyEnabled'] === 'boolean',
  ]);
}

export function isValidNodePayloadShape(record: UnknownRecord, nodeType: NodeKind): boolean {
  if (nodeType === 'text') {
    return isValidTextNodePayload(record);
  }
  const expectedKeys = CHILD_BEARING_NODE_TYPES.has(nodeType) ? CHILD_NODE_KEYS : LEAF_NODE_KEYS;
  return hasOnlyKeys(record, expectedKeys) && NODE_ATTRIBUTE_VALIDATORS[nodeType](record['attrs']);
}

export function isValidReferenceSnapshotShape(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return allValid([
    hasOnlyKeys(record, [
      'id',
      'externalUri',
      'cslJson',
      'metadataHash',
      'capturedAt',
      'sourceProvider',
    ]),
    isValidEntityId(record['id']),
    isOptional(record['externalUri'], isCanonicalResourceUriValue),
    isCanonicalJsonObject(record['cslJson']),
    isValidContentHash(record['metadataHash']),
    isValidTimestamp(record['capturedAt']),
    isOptional(record['sourceProvider'], (item) => isBoundedString(item, 0, 256)),
  ]);
}

export function isValidEvidenceLinkShape(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return allValid([
    hasOnlyKeys(record, [
      'id',
      'uri',
      'sourceUri',
      'sourceContentHash',
      'locator',
      'excerpt',
      'excerptHash',
      'verificationStatus',
      'verifiedBy',
      'verifiedAt',
    ]),
    isValidEntityId(record['id']),
    isCometResourceUriValue(record['uri']),
    isCanonicalResourceUriValue(record['sourceUri']),
    isValidContentHash(record['sourceContentHash']),
    isValidEvidenceLocator(record['locator']),
    isOptional(record['excerpt'], isString),
    isOptional(record['excerptHash'], isValidContentHash),
    isStringSetMember(record['verificationStatus'], VERIFICATION_STATUSES),
    isOptional(record['verifiedBy'], isValidActorRef),
    isOptional(record['verifiedAt'], isValidTimestamp),
  ]);
}

export function isValidClaimShape(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return allValid([
    hasOnlyKeys(record, ['id', 'anchor', 'textSnapshot', 'textHash']),
    isValidEntityId(record['id']),
    isValidPersistentAnchor(record['anchor']),
    typeof record['textSnapshot'] === 'string' && isWellFormedUnicodeString(record['textSnapshot']),
    isValidContentHash(record['textHash']),
  ]);
}

export function isValidClaimEvidenceRelationShape(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return allValid([
    hasOnlyKeys(record, ['claimId', 'evidenceId', 'relation', 'assessedBy', 'confidence']),
    isValidEntityId(record['claimId']),
    isValidEntityId(record['evidenceId']),
    isStringSetMember(record['relation'], CLAIM_EVIDENCE_RELATIONS),
    isValidActorRef(record['assessedBy']),
    isOptional(record['confidence'], isUnitInterval),
  ]);
}

export function isValidAcademicEntityShape(value: unknown): value is AcademicEntity {
  return (
    isValidReferenceSnapshotShape(value) ||
    isValidEvidenceLinkShape(value) ||
    isValidClaimShape(value)
  );
}

function isValidAuthor(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return allValid([
    hasOnlyKeys(record, AUTHOR_KEYS),
    isOptional(record['id'], isValidEntityId),
    isBoundedString(record['name'], 1, 1_024),
    isOptional(record['given'], (item) => isBoundedString(item, 0, 512)),
    isOptional(record['family'], (item) => isBoundedString(item, 0, 512)),
    isOptional(record['orcid'], isValidOrcid),
    isOptional(record['affiliations'], (item) => isUniqueBoundedStringArray(item, 1, 1_024)),
  ]);
}

function isValidTextNodePayload(record: UnknownRecord): boolean {
  const marks = readDenseDataArray(record['marks']);
  return (
    hasOnlyKeys(record, TEXT_NODE_KEYS) &&
    typeof record['value'] === 'string' &&
    isWellFormedUnicodeString(record['value']) &&
    marks !== undefined &&
    marks.every(isValidMark) &&
    hasCanonicalMarkOrder(marks) &&
    hasUniqueCanonicalItems(marks)
  );
}

function hasCanonicalMarkOrder(marks: readonly unknown[]): boolean {
  let previousRank = -1;
  const markTypes = new Set<string>();
  for (const mark of marks) {
    const type = asRecord(mark)?.['type'];
    if (typeof type !== 'string') {
      return false;
    }
    const rank = MARK_TYPE_ORDER.get(type);
    if (rank === undefined || rank <= previousRank || markTypes.has(type)) {
      return false;
    }
    previousRank = rank;
    markTypes.add(type);
  }
  return !(markTypes.has('subscript') && markTypes.has('superscript'));
}

const NODE_ATTRIBUTE_VALIDATORS = {
  bibliographyPlaceholder: (value) =>
    matchesRecord(value, ['heading'], [['heading', (item) => isBoundedString(item, 0, 1_024)]]),
  blockQuote: isEmptyRecord,
  body: isEmptyRecord,
  citation: isValidCitationAttributes,
  codeBlock: (value) =>
    matchesRecord(
      value,
      ['language'],
      [['language', (item) => isOptional(item, (part) => isBoundedString(part, 0, 128))]],
    ),
  crossReference: (value) =>
    matchesRecord(
      value,
      ['targetEntityId', 'label'],
      [
        ['targetEntityId', isValidEntityId],
        ['label', (item) => isOptional(item, (part) => isBoundedString(part, 0, 1_024))],
      ],
    ),
  displayEquation: isValidDisplayEquationAttributes,
  figure: isValidLabeledEntityAttributes,
  figureAsset: (value) =>
    matchesRecord(
      value,
      ['uri', 'contentHash', 'altText'],
      [
        ['uri', isCanonicalResourceUriValue],
        ['contentHash', isValidContentHash],
        ['altText', (item) => isBoundedString(item, 0, 10_000)],
      ],
    ),
  figureCaption: isEmptyRecord,
  footnote: (value) =>
    matchesRecord(
      value,
      ['label'],
      [['label', (item) => isOptional(item, (part) => isBoundedString(part, 0, 128))]],
    ),
  footnoteReference: (value) =>
    matchesRecord(value, ['footnoteNodeId'], [['footnoteNodeId', isValidNodeId]]),
  frontMatter: isEmptyRecord,
  hardBreak: isEmptyRecord,
  heading: isValidHeadingLevelAttributes,
  horizontalRule: isEmptyRecord,
  inlineEquation: (value) => matchesRecord(value, ['source'], [['source', isString]]),
  list: isValidListAttributes,
  listItem: isEmptyRecord,
  manuscript: isEmptyRecord,
  paragraph: (value) =>
    matchesRecord(
      value,
      ['alignment'],
      [['alignment', (item) => isStringSetMember(item, ALIGNMENTS)]],
    ),
  section: isValidHeadingLevelAttributes,
  table: isValidLabeledEntityAttributes,
  tableCaption: isEmptyRecord,
  tableCell: isEmptyRecord,
  tableRow: isEmptyRecord,
  text: () => false,
} satisfies Readonly<Record<NodeKind, RecordValidator>>;

function isValidCitationAttributes(value: unknown): boolean {
  return matchesRecord(
    value,
    ['citationId', 'referenceId', 'locator', 'prefix', 'suffix'],
    [
      ['citationId', isValidEntityId],
      ['referenceId', isValidEntityId],
      ['locator', (item) => isOptional(item, isValidCitationLocator)],
      ['prefix', (item) => isOptional(item, isString)],
      ['suffix', (item) => isOptional(item, isString)],
    ],
  );
}

function isValidCitationLocator(value: unknown): boolean {
  return matchesRecord(
    value,
    ['label', 'value'],
    [
      ['label', (item) => isStringSetMember(item, CITATION_LOCATOR_LABELS)],
      ['value', (item) => isBoundedString(item, 1, 1_024)],
    ],
  );
}

function isValidDisplayEquationAttributes(value: unknown): boolean {
  return matchesRecord(
    value,
    ['source', 'entityId', 'label'],
    [
      ['source', isString],
      ['entityId', (item) => isOptional(item, isValidEntityId)],
      ['label', (item) => isOptional(item, (part) => isBoundedString(part, 0, 256))],
    ],
  );
}

function isValidLabeledEntityAttributes(value: unknown): boolean {
  return matchesRecord(
    value,
    ['entityId', 'label'],
    [
      ['entityId', (item) => isOptional(item, isValidEntityId)],
      ['label', (item) => isOptional(item, (part) => isBoundedString(part, 0, 256))],
    ],
  );
}

function isValidHeadingLevelAttributes(value: unknown): boolean {
  return matchesRecord(value, ['level'], [['level', (item) => isIntegerInRange(item, 1, 6)]]);
}

function isValidListAttributes(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  const ordered = record['ordered'];
  const start = record['start'];
  const startIsValid =
    ordered === true ? isOptional(start, (item) => isIntegerInRange(item, 1)) : start === undefined;
  return allValid([
    hasOnlyKeys(record, ['ordered', 'start']),
    typeof ordered === 'boolean',
    startIsValid,
  ]);
}

function isValidMark(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  const type = record['type'];
  if (type === 'link') {
    return allValid([
      hasOnlyKeys(record, ['type', 'href', 'title']),
      isCanonicalResourceUriValue(record['href']),
      isOptional(record['title'], (item) => isBoundedString(item, 0, 2_048)),
    ]);
  }
  return hasOnlyKeys(record, ['type']) && isStringSetMember(type, SIMPLE_MARK_TYPES);
}

function isValidEvidenceLocator(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  const kind = record['kind'];
  if (kind === 'page') {
    return allValid([
      hasOnlyKeys(record, ['kind', 'page', 'pageLabel']),
      isIntegerInRange(record['page'], 1),
      isOptional(record['pageLabel'], (item) => isBoundedString(item, 0, 128)),
    ]);
  }
  if (kind === 'section') {
    return matchesRecord(
      record,
      ['kind', 'section'],
      [['section', (item) => isBoundedString(item, 1, 1_024)]],
    );
  }
  if (kind === 'text-quote') {
    return matchesRecord(
      record,
      ['kind', 'exact', 'prefix', 'suffix'],
      [
        ['exact', (item) => isBoundedString(item, 1)],
        ['prefix', (item) => isOptional(item, isString)],
        ['suffix', (item) => isOptional(item, isString)],
      ],
    );
  }
  if (kind === 'time') {
    return isValidTimeEvidenceLocator(record);
  }
  return kind === 'record'
    ? matchesRecord(
        record,
        ['kind', 'recordKey'],
        [['recordKey', (item) => isBoundedString(item, 1, 1_024)]],
      )
    : false;
}

function isValidTimeEvidenceLocator(record: UnknownRecord): boolean {
  const start = record['startSeconds'];
  const end = record['endSeconds'];
  return allValid([
    hasOnlyKeys(record, ['kind', 'startSeconds', 'endSeconds']),
    isNonNegativeFiniteNumber(start),
    isOptional(end, isNonNegativeFiniteNumber),
    typeof end !== 'number' || typeof start !== 'number' || end >= start,
  ]);
}

function isValidPersistentAnchor(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return allValid([
    hasOnlyKeys(record, ['document', 'primary', 'targetNodeId', 'textQuote', 'pathHint']),
    isValidDocumentRef(record['document']),
    isValidSemanticPosition(record['primary']),
    isOptional(record['targetNodeId'], isValidNodeId),
    isOptional(record['textQuote'], isValidTextQuote),
    isOptional(record['pathHint'], isValidNodeIdArray),
  ]);
}

function isValidDocumentRef(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return allValid([
    hasOnlyKeys(record, ['uri', 'revisionId']),
    typeof record['uri'] === 'string' && isDocumentUri(record['uri']),
    isValidRevisionId(record['revisionId']),
  ]);
}

function isValidSemanticPosition(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  if (record['kind'] === 'text') {
    return allValid([
      hasOnlyKeys(record, ['kind', 'textNodeId', 'utf16Offset', 'affinity']),
      isValidNodeId(record['textNodeId']),
      isValidUtf16Offset(record['utf16Offset']),
      isStringSetMember(record['affinity'], AFFINITIES),
    ]);
  }
  return record['kind'] === 'node-boundary'
    ? allValid([
        hasOnlyKeys(record, ['kind', 'parentNodeId', 'childIndex', 'affinity']),
        isValidNodeId(record['parentNodeId']),
        isIntegerInRange(record['childIndex'], 0),
        isStringSetMember(record['affinity'], AFFINITIES),
      ])
    : false;
}

function isValidTextQuote(value: unknown): boolean {
  return matchesRecord(
    value,
    ['exact', 'prefix', 'suffix', 'normalizedHash'],
    [
      ['exact', isString],
      ['prefix', (item) => isOptional(item, isString)],
      ['suffix', (item) => isOptional(item, isString)],
      ['normalizedHash', (item) => isOptional(item, isValidContentHash)],
    ],
  );
}

function isValidActorRef(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined || !isOpaqueId(record['id'])) {
    return false;
  }
  if (record['type'] === 'comet-agent') {
    return allValid([
      hasOnlyKeys(record, ['type', 'id', 'workflowId', 'modelRef']),
      isBoundedString(record['workflowId'], 1, 128),
      isOptional(record['modelRef'], (item) => isBoundedString(item, 1, 256)),
    ]);
  }
  if (record['type'] === 'system') {
    return (
      hasOnlyKeys(record, ['type', 'id', 'role']) && isStringSetMember(record['role'], SYSTEM_ROLES)
    );
  }
  return (
    (record['type'] === 'human' || record['type'] === 'product-controller') &&
    hasOnlyKeys(record, ['type', 'id'])
  );
}

function matchesRecord(
  value: unknown,
  allowedKeys: readonly string[],
  checks: readonly (readonly [key: string, validate: (item: unknown) => boolean])[],
): boolean {
  const record = asRecord(value);
  if (record === undefined || !hasOnlyKeys(record, allowedKeys)) {
    return false;
  }
  return checks.every(([key, validate]) => validate(record[key]));
}

function hasOnlyKeys(record: UnknownRecord, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function hasUniqueCanonicalItems(items: readonly unknown[]): boolean {
  const identities = new Set<string>();
  for (const item of items) {
    const serialized = serializeCanonicalJson(item);
    if (serialized.type === 'error' || identities.has(serialized.value)) {
      return false;
    }
    identities.add(serialized.value);
  }
  return true;
}

function isCanonicalJsonObject(value: unknown): boolean {
  return isRecord(value) && isInertJsonValue(value, new Set<object>(), 0);
}

function isInertJsonValue(value: unknown, active: Set<object>, depth: number): boolean {
  if (depth > MAX_INERT_JSON_DEPTH) {
    return false;
  }
  if (
    value === null ||
    (typeof value === 'string' && isWellFormedUnicodeString(value)) ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value !== 'object' || active.has(value)) {
    return false;
  }

  active.add(value);
  const items = readDenseDataArray(value);
  if (items !== undefined) {
    const valid = items.every((item) => isInertJsonValue(item, active, depth + 1));
    active.delete(value);
    return valid;
  }
  const record = asRecord(value);
  if (record === undefined) {
    active.delete(value);
    return false;
  }
  const valid = Object.values(record).every((item) => isInertJsonValue(item, active, depth + 1));
  active.delete(value);
  return valid;
}

function isValidOrcid(value: unknown): boolean {
  return typeof value === 'string' && ORCID_PATTERN.test(value);
}

function isCanonicalResourceUriValue(value: unknown): boolean {
  return typeof value === 'string' && isCanonicalResourceUri(value);
}

function isCometResourceUriValue(value: unknown): boolean {
  return typeof value === 'string' && isCometResourceUri(value);
}

function isValidTimestamp(value: unknown): boolean {
  return typeof value === 'string' && parseIsoTimestamp(value).type === 'valid';
}

function isValidRevisionId(value: unknown): boolean {
  return typeof value === 'string' && parseRevisionId(value).type === 'valid';
}

function isValidNodeId(value: unknown): boolean {
  return typeof value === 'string' && parseNodeId(value).type === 'valid';
}

function isValidNodeIdArray(value: unknown): boolean {
  const items = readDenseDataArray(value);
  return items?.every(isValidNodeId) ?? false;
}

function isValidEntityId(value: unknown): boolean {
  return typeof value === 'string' && parseEntityId(value).type === 'valid';
}

function isValidContentHash(value: unknown): boolean {
  return typeof value === 'string' && parseContentHash(value).type === 'valid';
}

function isValidUtf16Offset(value: unknown): boolean {
  return typeof value === 'number' && parseUtf16Offset(value).type === 'valid';
}

function isOpaqueId(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    OPAQUE_ID_PATTERN.test(value)
  );
}

function isUniqueBoundedStringArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  maximumItems = Number.POSITIVE_INFINITY,
): boolean {
  const items = readDenseDataArray(value);
  if (items === undefined || items.length > maximumItems) {
    return false;
  }
  const strings = items.filter((item): item is string =>
    isBoundedString(item, minimumLength, maximumLength),
  );
  return strings.length === items.length && new Set(strings).size === strings.length;
}

function isBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength = Number.POSITIVE_INFINITY,
): boolean {
  return (
    typeof value === 'string' &&
    isWellFormedUnicodeString(value) &&
    value.length >= minimumLength &&
    value.length <= maximumLength
  );
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): boolean {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
  );
}

function isNonNegativeFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isUnitInterval(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && isWellFormedUnicodeString(value);
}

function isStringSetMember(value: unknown, allowed: ReadonlySet<string>): boolean {
  return typeof value === 'string' && allowed.has(value);
}

function isOptional(value: unknown, validate: (item: unknown) => boolean): boolean {
  return value === undefined || validate(value);
}

function isEmptyRecord(value: unknown): boolean {
  const record = asRecord(value);
  return record !== undefined && Object.keys(record).length === 0;
}

function allValid(checks: readonly boolean[]): boolean {
  return checks.every(Boolean);
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return readPlainDataRecord(value);
}

function isRecord(value: unknown): value is UnknownRecord {
  return readPlainDataRecord(value) !== undefined;
}

export function readPlainDataRecord(value: unknown): UnknownRecord | undefined {
  try {
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
    return value as UnknownRecord;
  } catch {
    return undefined;
  }
}

export function readDenseDataArray(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
      return undefined;
    }
    const length = readArrayLength(value);
    if (length === undefined) {
      return undefined;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (!hasExactArrayKeys(ownKeys, length) || !hasOnlyDataElements(value, length)) {
      return undefined;
    }
    return value as readonly unknown[];
  } catch {
    return undefined;
  }
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
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return false;
    }
  }
  return true;
}
