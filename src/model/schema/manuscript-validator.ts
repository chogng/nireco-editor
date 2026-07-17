import type { Result } from '../../base/errors/nireco-error.js';
import {
  parseContentHash,
  parseEntityId,
  parseNodeId,
  parseRevisionId,
  type Utf16Offset,
} from '../../base/ids/identifiers.js';
import type { NodeKind } from '../node/manuscript-node.js';
import { validateUtf16Boundary } from '../position/semantic-position.js';
import {
  DOCUMENT_FORMAT,
  DOCUMENT_FORMAT_VERSION,
  MANUSCRIPT_SCHEMA_ID,
  MANUSCRIPT_SCHEMA_VERSION,
} from '../snapshot.js';
import {
  hasValidSnapshotKeys,
  isValidClaimEvidenceRelationShape,
  isValidClaimShape,
  isValidEvidenceLinkShape,
  isValidMetadataShape,
  isValidNodePayloadShape,
  isValidReferenceSnapshotShape,
  isValidSettingsShape,
  readDenseDataArray,
  readPlainDataRecord,
  type UnknownRecord,
} from './manuscript-runtime-shapes.js';

export type ManuscriptValidationErrorReason =
  | 'document-not-object'
  | 'document-shape-invalid'
  | 'format-unsupported'
  | 'format-version-unsupported'
  | 'schema-id-unsupported'
  | 'schema-version-unsupported'
  | 'revision-id-invalid'
  | 'document-hash-invalid'
  | 'metadata-invalid'
  | 'settings-invalid'
  | 'root-invalid'
  | 'node-kind-invalid'
  | 'node-shape-invalid'
  | 'node-children-invalid'
  | 'node-depth-exceeded'
  | 'duplicate-node-id'
  | 'academic-graph-invalid'
  | 'academic-entity-id-invalid'
  | 'duplicate-entity-id'
  | 'duplicate-academic-entity-id'
  | 'academic-relation-invalid'
  | 'dangling-academic-relation'
  | 'dangling-citation-reference'
  | 'dangling-cross-reference'
  | 'dangling-footnote-reference'
  | 'claim-anchor-invalid';

export interface ManuscriptValidationError {
  readonly reason: ManuscriptValidationErrorReason;
  readonly path: string;
  readonly safeMessage: string;
}

interface AcademicGraphRecord extends UnknownRecord {
  readonly referenceSnapshots: readonly unknown[];
  readonly evidenceLinks: readonly unknown[];
  readonly claims: readonly unknown[];
  readonly claimEvidenceRelations: readonly unknown[];
}

interface TreeVisit {
  readonly value: unknown;
  readonly path: string;
  readonly depth: number;
  readonly parentNodeId?: string;
}

interface ValidatedTreeNode {
  readonly nodeType: NodeKind;
  readonly parentNodeId?: string;
  readonly record: UnknownRecord;
}

interface PendingEntityReference {
  readonly entityId: string;
  readonly path: string;
}

interface PendingNodeReference {
  readonly nodeId: string;
  readonly path: string;
}

interface TreeValidationState {
  readonly allEntityIds: Set<string>;
  readonly citationReferences: PendingEntityReference[];
  readonly crossReferences: PendingEntityReference[];
  readonly footnoteReferences: PendingNodeReference[];
  readonly nodesById: Map<string, ValidatedTreeNode>;
}

interface AcademicGraphValidationState {
  readonly claims: { readonly path: string; readonly record: UnknownRecord }[];
  readonly claimIds: Set<string>;
  readonly evidenceIds: Set<string>;
  readonly referenceIds: Set<string>;
}

interface ChildrenRule {
  readonly presence: 'forbidden' | 'required';
  readonly accepts: (types: readonly NodeKind[]) => boolean;
}

/**
 * Maximum child-edge distance from the validated tree root. The document
 * Manuscript node and an InsertableNode root both start at depth zero.
 *
 * This production guard keeps every accepted tree comfortably below the
 * recursion limits of the canonical JSON and immutable Snapshot boundaries.
 */
export const MAX_MANUSCRIPT_TREE_DEPTH = 256;

const BLOCK_NODE_TYPES: ReadonlySet<string> = new Set([
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
const SECTION_BODY_NODE_TYPES: ReadonlySet<string> = new Set(
  [...BLOCK_NODE_TYPES].filter((type) => type !== 'heading'),
);
const FOOTNOTE_BLOCK_NODE_TYPES: ReadonlySet<string> = new Set([
  'paragraph',
  'blockQuote',
  'codeBlock',
  'list',
]);
const TABLE_CELL_BLOCK_NODE_TYPES: ReadonlySet<string> = new Set([
  'paragraph',
  'blockQuote',
  'codeBlock',
  'list',
]);
const INLINE_NODE_TYPES: ReadonlySet<string> = new Set([
  'text',
  'citation',
  'crossReference',
  'inlineEquation',
  'footnoteReference',
  'hardBreak',
]);
const KNOWN_NODE_TYPES: ReadonlySet<string> = new Set([
  'bibliographyPlaceholder',
  'blockQuote',
  'body',
  'citation',
  'codeBlock',
  'crossReference',
  'displayEquation',
  'figure',
  'figureAsset',
  'figureCaption',
  'footnote',
  'footnoteReference',
  'frontMatter',
  'hardBreak',
  'heading',
  'horizontalRule',
  'inlineEquation',
  'list',
  'listItem',
  'manuscript',
  'paragraph',
  'section',
  'table',
  'tableCaption',
  'tableCell',
  'tableRow',
  'text',
]);
const CHILDREN_RULES = {
  bibliographyPlaceholder: forbiddenChildren(),
  blockQuote: requiredChildren((types) => allTypesIn(types, BLOCK_NODE_TYPES, 1)),
  body: requiredChildren((types) => allTypesIn(types, BLOCK_NODE_TYPES, 1)),
  citation: forbiddenChildren(),
  codeBlock: requiredChildren(
    (types) => types.length === 0 || (types.length === 1 && types[0] === 'text'),
  ),
  crossReference: forbiddenChildren(),
  displayEquation: forbiddenChildren(),
  figure: requiredChildren(
    (types) =>
      (types.length === 1 && types[0] === 'figureAsset') ||
      (types.length === 2 && types[0] === 'figureAsset' && types[1] === 'figureCaption'),
  ),
  figureAsset: forbiddenChildren(),
  figureCaption: requiredChildren((types) => allTypesIn(types, INLINE_NODE_TYPES)),
  footnote: requiredChildren((types) => allTypesIn(types, FOOTNOTE_BLOCK_NODE_TYPES, 1)),
  footnoteReference: forbiddenChildren(),
  frontMatter: requiredChildren((types) => types.length === 0),
  hardBreak: forbiddenChildren(),
  heading: requiredChildren((types) => allTypesIn(types, INLINE_NODE_TYPES)),
  horizontalRule: forbiddenChildren(),
  inlineEquation: forbiddenChildren(),
  list: requiredChildren((types) => allTypesAre(types, 'listItem', 1)),
  listItem: requiredChildren(
    (types) =>
      types.length >= 1 && types[0] === 'paragraph' && allTypesIn(types.slice(1), BLOCK_NODE_TYPES),
  ),
  manuscript: requiredChildren(acceptsManuscriptChildren),
  paragraph: requiredChildren((types) => allTypesIn(types, INLINE_NODE_TYPES)),
  section: requiredChildren(
    (types) =>
      types.length >= 1 &&
      types[0] === 'heading' &&
      allTypesIn(types.slice(1), SECTION_BODY_NODE_TYPES),
  ),
  table: requiredChildren(acceptsTableChildren),
  tableCaption: requiredChildren((types) => allTypesIn(types, INLINE_NODE_TYPES)),
  tableCell: requiredChildren(
    (types) =>
      types.length >= 1 &&
      types[0] === 'paragraph' &&
      allTypesIn(types.slice(1), TABLE_CELL_BLOCK_NODE_TYPES),
  ),
  tableRow: requiredChildren((types) => allTypesAre(types, 'tableCell', 1)),
  text: forbiddenChildren(),
} satisfies Readonly<Record<NodeKind, ChildrenRule>>;

export function validateDocumentSnapshot(value: unknown): Result<void, ManuscriptValidationError> {
  try {
    return validateDocumentSnapshotValue(value);
  } catch {
    return failure(
      'document-shape-invalid',
      '$',
      'The document Snapshot could not be inspected as inert data.',
    );
  }
}

function validateDocumentSnapshotValue(value: unknown): Result<void, ManuscriptValidationError> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return failure('document-not-object', '$', 'The document Snapshot must be a plain object.');
  }
  const document = asRecord(value);
  if (document === undefined) {
    return failure(
      'document-shape-invalid',
      '$',
      'The document Snapshot must contain only inert plain-data fields.',
    );
  }

  const headerError = validateDocumentHeader(document);
  if (headerError !== undefined) {
    return { type: 'error', error: headerError };
  }

  const contentError = validateDocumentContent(document);
  return contentError === undefined
    ? { type: 'ok', value: undefined }
    : { type: 'error', error: contentError };
}

function validateDocumentContent(document: UnknownRecord): ManuscriptValidationError | undefined {
  const metadataError = validateMetadata(document['metadata']);
  if (metadataError !== undefined) {
    return metadataError;
  }

  const allEntityIds = new Set<string>();
  const metadataEntityError = collectMetadataAuthorEntityIds(document['metadata'], allEntityIds);
  if (metadataEntityError !== undefined) {
    return metadataEntityError;
  }

  const settingsError = validateSettings(document['settings']);
  if (settingsError !== undefined) {
    return settingsError;
  }

  const root = document['root'];
  if (!isRecord(root) || root['type'] !== 'manuscript') {
    return validationError(
      'root-invalid',
      '$.root',
      'The document root must be a Manuscript node.',
    );
  }

  return validateDocumentRelationships(document, root, allEntityIds);
}

function validateDocumentRelationships(
  document: UnknownRecord,
  root: UnknownRecord,
  allEntityIds: Set<string>,
): ManuscriptValidationError | undefined {
  const treeState: TreeValidationState = {
    allEntityIds,
    citationReferences: [],
    crossReferences: [],
    footnoteReferences: [],
    nodesById: new Map(),
  };
  const treeError = validateTree(root, '$.root', treeState);
  if (treeError !== undefined) {
    return treeError;
  }

  const nonAcademicEntityIds = new Set(allEntityIds);
  const academicState: AcademicGraphValidationState = {
    claims: [],
    claimIds: new Set(),
    evidenceIds: new Set(),
    referenceIds: new Set(),
  };
  const academicGraphError = validateAcademicGraph(
    document['academicGraph'],
    allEntityIds,
    nonAcademicEntityIds,
    academicState,
  );
  if (academicGraphError !== undefined) {
    return academicGraphError;
  }

  const referenceError = validateTreeReferences(treeState, academicState.referenceIds);
  if (referenceError !== undefined) {
    return referenceError;
  }

  return validateClaimAnchors(
    academicState.claims,
    document['revisionId'] as string,
    treeState.nodesById,
  );
}

export function validateInsertableNode(value: unknown): Result<void, ManuscriptValidationError> {
  try {
    const record = asRecord(value);
    const nodeType = record === undefined ? undefined : readNodeKind(record['type']);
    if (record === undefined || nodeType === undefined || nodeType === 'manuscript') {
      return failure(
        'node-shape-invalid',
        '$.node',
        'The inserted node must be an inert, supported InsertableNode payload.',
      );
    }
    const error = validateTree(record, '$.node', {
      allEntityIds: new Set(),
      citationReferences: [],
      crossReferences: [],
      footnoteReferences: [],
      nodesById: new Map(),
    });
    return error === undefined ? { type: 'ok', value: undefined } : { type: 'error', error };
  } catch {
    return failure(
      'node-shape-invalid',
      '$.node',
      'The inserted node could not be inspected as inert data.',
    );
  }
}

function validateDocumentHeader(value: UnknownRecord): ManuscriptValidationError | undefined {
  if (!hasValidSnapshotKeys(value)) {
    return validationError(
      'document-shape-invalid',
      '$',
      'The document Snapshot contains unsupported or misplaced fields.',
    );
  }
  if (value['format'] !== DOCUMENT_FORMAT) {
    return validationError(
      'format-unsupported',
      '$.format',
      'The document format is not supported.',
    );
  }
  if (value['formatVersion'] !== DOCUMENT_FORMAT_VERSION) {
    return validationError(
      'format-version-unsupported',
      '$.formatVersion',
      'The document format version is not supported.',
    );
  }
  if (value['schemaId'] !== MANUSCRIPT_SCHEMA_ID) {
    return validationError(
      'schema-id-unsupported',
      '$.schemaId',
      'The Manuscript schema identifier is not supported.',
    );
  }
  if (value['schemaVersion'] !== MANUSCRIPT_SCHEMA_VERSION) {
    return validationError(
      'schema-version-unsupported',
      '$.schemaVersion',
      'The Manuscript schema version is not supported.',
    );
  }
  if (!isValidRevisionId(value['revisionId'])) {
    return validationError(
      'revision-id-invalid',
      '$.revisionId',
      'The document Revision ID is invalid.',
    );
  }
  return isValidContentHash(value['documentHash'])
    ? undefined
    : validationError(
        'document-hash-invalid',
        '$.documentHash',
        'The document content hash is invalid.',
      );
}

function validateMetadata(value: unknown): ManuscriptValidationError | undefined {
  if (!isValidMetadataShape(value)) {
    return validationError(
      'metadata-invalid',
      '$.metadata',
      'The document metadata does not have the required shape.',
    );
  }
  return undefined;
}

function collectMetadataAuthorEntityIds(
  value: unknown,
  entityIds: Set<string>,
): ManuscriptValidationError | undefined {
  const metadata = asRecord(value);
  const authors = readDenseDataArray(metadata?.['authors']);
  if (authors === undefined) {
    return validationError(
      'metadata-invalid',
      '$.metadata.authors',
      'The document metadata does not have the required author collection.',
    );
  }
  for (const [index, author] of authors.entries()) {
    const authorId = asRecord(author)?.['id'];
    if (authorId === undefined) {
      continue;
    }
    if (typeof authorId !== 'string' || entityIds.has(authorId)) {
      return validationError(
        'duplicate-entity-id',
        `$.metadata.authors[${index}].id`,
        'Author Entity IDs must be globally unique within a document Snapshot.',
      );
    }
    entityIds.add(authorId);
  }
  return undefined;
}

function validateSettings(value: unknown): ManuscriptValidationError | undefined {
  if (!isValidSettingsShape(value)) {
    return validationError(
      'settings-invalid',
      '$.settings',
      'The document semantic settings do not have the required shape.',
    );
  }
  return undefined;
}

function validateTree(
  root: UnknownRecord,
  rootPath: string,
  state: TreeValidationState,
): ManuscriptValidationError | undefined {
  const nodeIds = new Set<string>();
  const pending: TreeVisit[] = [{ value: root, path: rootPath, depth: 0 }];

  while (pending.length > 0) {
    const visit = pending.pop();
    if (visit === undefined) {
      break;
    }
    if (visit.depth > MAX_MANUSCRIPT_TREE_DEPTH) {
      return validationError(
        'node-depth-exceeded',
        visit.path,
        `The Manuscript tree exceeds the maximum supported depth of ${MAX_MANUSCRIPT_TREE_DEPTH}.`,
      );
    }
    const nodeError = validateNodeRecord(visit, nodeIds);
    if (nodeError !== undefined) {
      return nodeError;
    }
    const record = asRecord(visit.value);
    const nodeType = record === undefined ? undefined : readNodeKind(record['type']);
    if (record === undefined || nodeType === undefined) {
      return validationError(
        'node-shape-invalid',
        visit.path,
        'A Manuscript node does not have the required shape.',
      );
    }
    const entityError = collectDeclaredTreeEntityId(
      record,
      nodeType,
      visit.path,
      state.allEntityIds,
    );
    if (entityError !== undefined) {
      return entityError;
    }
    const children = validateAndReadChildren(record, nodeType, visit.path);
    if (children.type === 'error') {
      return children.error;
    }
    const nodeId = record['id'];
    if (typeof nodeId !== 'string') {
      return validationError(
        'node-shape-invalid',
        `${visit.path}.id`,
        'A Manuscript node has an invalid Node ID.',
      );
    }
    state.nodesById.set(nodeId, {
      nodeType,
      ...(visit.parentNodeId === undefined ? {} : { parentNodeId: visit.parentNodeId }),
      record,
    });
    collectTreeReferences(record, nodeType, visit.path, state);
    pushChildren(pending, children.value, visit.path, visit.depth, nodeId);
  }

  return undefined;
}

function collectDeclaredTreeEntityId(
  node: UnknownRecord,
  nodeType: NodeKind,
  path: string,
  entityIds: Set<string>,
): ManuscriptValidationError | undefined {
  const attrs = asRecord(node['attrs']);
  const key = nodeType === 'citation' ? 'citationId' : 'entityId';
  const declaresEntity =
    nodeType === 'citation' ||
    nodeType === 'displayEquation' ||
    nodeType === 'figure' ||
    nodeType === 'table';
  const entityId = declaresEntity ? attrs?.[key] : undefined;
  if (entityId === undefined) {
    return undefined;
  }
  if (typeof entityId !== 'string' || entityIds.has(entityId)) {
    return validationError(
      'duplicate-entity-id',
      `${path}.attrs.${key}`,
      'Entity IDs declared in the Manuscript tree must be globally unique.',
    );
  }
  entityIds.add(entityId);
  return undefined;
}

function collectTreeReferences(
  node: UnknownRecord,
  nodeType: NodeKind,
  path: string,
  state: TreeValidationState,
): void {
  const attrs = asRecord(node['attrs']);
  if (attrs === undefined) {
    return;
  }
  if (nodeType === 'citation') {
    const referenceId = attrs['referenceId'];
    if (typeof referenceId === 'string') {
      state.citationReferences.push({
        entityId: referenceId,
        path: `${path}.attrs.referenceId`,
      });
    }
    return;
  }
  if (nodeType === 'crossReference') {
    const targetEntityId = attrs['targetEntityId'];
    if (typeof targetEntityId === 'string') {
      state.crossReferences.push({
        entityId: targetEntityId,
        path: `${path}.attrs.targetEntityId`,
      });
    }
    return;
  }
  if (nodeType === 'footnoteReference') {
    const footnoteNodeId = attrs['footnoteNodeId'];
    if (typeof footnoteNodeId === 'string') {
      state.footnoteReferences.push({
        nodeId: footnoteNodeId,
        path: `${path}.attrs.footnoteNodeId`,
      });
    }
  }
}

function validateNodeRecord(
  visit: TreeVisit,
  nodeIds: Set<string>,
): ManuscriptValidationError | undefined {
  const record = asRecord(visit.value);
  if (record === undefined) {
    return validationError(
      'node-shape-invalid',
      visit.path,
      'A Manuscript node must be a plain object.',
    );
  }
  if (!isValidNodeId(record['id'])) {
    return validationError(
      'node-shape-invalid',
      `${visit.path}.id`,
      'A Manuscript node has an invalid Node ID.',
    );
  }
  if (nodeIds.has(record['id'])) {
    return validationError(
      'duplicate-node-id',
      `${visit.path}.id`,
      'Node IDs must be unique within a document Snapshot.',
    );
  }
  nodeIds.add(record['id']);

  const nodeType = readNodeKind(record['type']);
  if (nodeType === undefined) {
    return validationError(
      'node-kind-invalid',
      `${visit.path}.type`,
      'A Manuscript node has an unsupported node kind.',
    );
  }
  return validateNodePayload(record, nodeType, visit.path);
}

function validateNodePayload(
  record: UnknownRecord,
  nodeType: NodeKind,
  path: string,
): ManuscriptValidationError | undefined {
  return isValidNodePayloadShape(record, nodeType)
    ? undefined
    : validationError(
        'node-shape-invalid',
        path,
        'A Manuscript node payload does not match its closed runtime shape.',
      );
}

function validateAndReadChildren(
  record: UnknownRecord,
  nodeType: NodeKind,
  path: string,
): Result<readonly unknown[], ManuscriptValidationError> {
  const rule = CHILDREN_RULES[nodeType];
  if (rule.presence === 'forbidden') {
    return record['children'] === undefined
      ? { type: 'ok', value: [] }
      : failure(
          'node-children-invalid',
          `${path}.children`,
          'This Manuscript node kind cannot contain child nodes.',
        );
  }
  const children = readDenseDataArray(record['children']);
  if (children === undefined) {
    return failure(
      'node-children-invalid',
      `${path}.children`,
      'This Manuscript node kind requires a child-node array.',
    );
  }

  const childTypes = readChildTypes(children, path);
  if (childTypes.type === 'error') {
    return childTypes;
  }
  return rule.accepts(childTypes.value)
    ? { type: 'ok', value: children }
    : failure(
        'node-children-invalid',
        `${path}.children`,
        'The child-node sequence is invalid for this Manuscript node kind.',
      );
}

function readChildTypes(
  children: readonly unknown[],
  path: string,
): Result<readonly NodeKind[], ManuscriptValidationError> {
  const types: NodeKind[] = [];
  for (const [index, child] of children.entries()) {
    const record = asRecord(child);
    const type = record === undefined ? undefined : readNodeKind(record['type']);
    if (type === undefined) {
      return failure(
        'node-kind-invalid',
        `${path}.children[${index}].type`,
        'A child node has an unsupported or missing node kind.',
      );
    }
    types.push(type);
  }
  return { type: 'ok', value: types };
}

function pushChildren(
  pending: TreeVisit[],
  children: readonly unknown[],
  path: string,
  parentDepth: number,
  parentNodeId: string,
): void {
  for (let index = children.length - 1; index >= 0; index -= 1) {
    pending.push({
      value: children[index],
      path: `${path}.children[${index}]`,
      depth: parentDepth + 1,
      parentNodeId,
    });
  }
}

function validateAcademicGraph(
  value: unknown,
  allEntityIds: Set<string>,
  nonAcademicEntityIds: ReadonlySet<string>,
  state: AcademicGraphValidationState,
): ManuscriptValidationError | undefined {
  if (!isAcademicGraphRecord(value)) {
    return validationError(
      'academic-graph-invalid',
      '$.academicGraph',
      'The Academic Graph does not have the required collection shape.',
    );
  }

  const collections = [
    {
      value: value.referenceSnapshots,
      path: '$.academicGraph.referenceSnapshots',
      referenceIds: state.referenceIds,
      accepts: isValidReferenceSnapshotShape,
    },
    {
      value: value.evidenceLinks,
      path: '$.academicGraph.evidenceLinks',
      referenceIds: state.evidenceIds,
      accepts: isValidEvidenceLinkShape,
    },
    {
      value: value.claims,
      path: '$.academicGraph.claims',
      referenceIds: state.claimIds,
      accepts: isValidClaimShape,
    },
  ] as const;

  for (const collection of collections) {
    const collectionError = collectAcademicEntityIds(
      collection.value,
      collection.path,
      allEntityIds,
      nonAcademicEntityIds,
      collection.referenceIds,
      collection.accepts,
    );
    if (collectionError !== undefined) {
      return collectionError;
    }
  }

  for (const [index, claim] of value.claims.entries()) {
    const record = asRecord(claim);
    if (record !== undefined) {
      state.claims.push({ path: `$.academicGraph.claims[${index}]`, record });
    }
  }

  return validateAcademicRelations(value.claimEvidenceRelations, state.claimIds, state.evidenceIds);
}

function isAcademicGraphRecord(value: unknown): value is AcademicGraphRecord {
  return (
    isRecord(value) &&
    Object.keys(value).length === 4 &&
    Object.hasOwn(value, 'referenceSnapshots') &&
    Object.hasOwn(value, 'evidenceLinks') &&
    Object.hasOwn(value, 'claims') &&
    Object.hasOwn(value, 'claimEvidenceRelations') &&
    readDenseDataArray(value['referenceSnapshots']) !== undefined &&
    readDenseDataArray(value['evidenceLinks']) !== undefined &&
    readDenseDataArray(value['claims']) !== undefined &&
    readDenseDataArray(value['claimEvidenceRelations']) !== undefined
  );
}

function collectAcademicEntityIds(
  entities: readonly unknown[],
  path: string,
  allEntityIds: Set<string>,
  nonAcademicEntityIds: ReadonlySet<string>,
  kindEntityIds: Set<string>,
  accepts: (value: unknown) => boolean,
): ManuscriptValidationError | undefined {
  for (const [index, entity] of entities.entries()) {
    const record = asRecord(entity);
    if (record === undefined || !accepts(record) || !isValidEntityId(record['id'])) {
      return validationError(
        'academic-graph-invalid',
        `${path}[${index}]`,
        'An Academic Graph entity does not match its closed runtime shape.',
      );
    }
    if (allEntityIds.has(record['id'])) {
      return validationError(
        nonAcademicEntityIds.has(record['id'])
          ? 'duplicate-entity-id'
          : 'duplicate-academic-entity-id',
        `${path}[${index}].id`,
        nonAcademicEntityIds.has(record['id'])
          ? 'Entity IDs must be unique across metadata, the Manuscript tree, and Academic Graph.'
          : 'Academic Graph Entity IDs must be unique across entity kinds.',
      );
    }
    allEntityIds.add(record['id']);
    kindEntityIds.add(record['id']);
  }
  return undefined;
}

function validateAcademicRelations(
  relations: readonly unknown[],
  claimIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
): ManuscriptValidationError | undefined {
  for (const [index, relation] of relations.entries()) {
    const record = asRecord(relation);
    const path = `$.academicGraph.claimEvidenceRelations[${index}]`;
    if (record === undefined || !isValidClaimEvidenceRelationShape(record)) {
      return validationError(
        'academic-relation-invalid',
        path,
        'An Academic Graph relation does not have the required shape.',
      );
    }
    const claimId = record['claimId'];
    const evidenceId = record['evidenceId'];
    if (
      typeof claimId !== 'string' ||
      typeof evidenceId !== 'string' ||
      !claimIds.has(claimId) ||
      !evidenceIds.has(evidenceId)
    ) {
      return validationError(
        'dangling-academic-relation',
        path,
        'An Academic Graph relation references a missing Claim or Evidence Link.',
      );
    }
  }
  return undefined;
}

function validateTreeReferences(
  state: TreeValidationState,
  referenceIds: ReadonlySet<string>,
): ManuscriptValidationError | undefined {
  for (const reference of state.citationReferences) {
    if (!referenceIds.has(reference.entityId)) {
      return validationError(
        'dangling-citation-reference',
        reference.path,
        'A Citation must reference an existing Reference Snapshot.',
      );
    }
  }
  for (const reference of state.crossReferences) {
    if (!state.allEntityIds.has(reference.entityId)) {
      return validationError(
        'dangling-cross-reference',
        reference.path,
        'A Cross Reference must target an existing document Entity ID.',
      );
    }
  }
  for (const reference of state.footnoteReferences) {
    if (state.nodesById.get(reference.nodeId)?.nodeType !== 'footnote') {
      return validationError(
        'dangling-footnote-reference',
        reference.path,
        'A Footnote Reference must target an existing Footnote node.',
      );
    }
  }
  return undefined;
}

function validateClaimAnchors(
  claims: readonly { readonly path: string; readonly record: UnknownRecord }[],
  revisionId: string,
  nodesById: ReadonlyMap<string, ValidatedTreeNode>,
): ManuscriptValidationError | undefined {
  for (const claim of claims) {
    const error = validateClaimAnchor(claim, revisionId, nodesById);
    if (error !== undefined) {
      return error;
    }
  }
  return undefined;
}

function validateClaimAnchor(
  claim: { readonly path: string; readonly record: UnknownRecord },
  revisionId: string,
  nodesById: ReadonlyMap<string, ValidatedTreeNode>,
): ManuscriptValidationError | undefined {
  const anchor = asRecord(claim.record['anchor']);
  const document = asRecord(anchor?.['document']);
  if (anchor === undefined || document === undefined) {
    return invalidClaimAnchor(claim.path, 'anchor', 'A Claim must contain a valid anchor.');
  }
  if (document['revisionId'] !== revisionId) {
    return invalidClaimAnchor(
      claim.path,
      'anchor.document.revisionId',
      'A Claim anchor must be bound to the containing Snapshot Revision.',
    );
  }

  const primaryNodeId = validateClaimPrimaryPosition(
    claim.path,
    asRecord(anchor['primary']),
    nodesById,
  );
  if (typeof primaryNodeId !== 'string') {
    return primaryNodeId;
  }

  const targetNodeId = anchor['targetNodeId'];
  if (typeof targetNodeId === 'string' && !nodesById.has(targetNodeId)) {
    return invalidClaimAnchor(
      claim.path,
      'anchor.targetNodeId',
      'A Claim anchor target must exist in the containing Snapshot.',
    );
  }

  return validateClaimPathHint(claim.path, anchor, primaryNodeId, nodesById);
}

function validateClaimPathHint(
  claimPath: string,
  anchor: UnknownRecord,
  primaryNodeId: string,
  nodesById: ReadonlyMap<string, ValidatedTreeNode>,
): ManuscriptValidationError | undefined {
  const pathHint = readDenseDataArray(anchor['pathHint']);
  if (pathHint === undefined) {
    return undefined;
  }
  const primaryPath = readValidatedNodePath(primaryNodeId, nodesById);
  const targetNodeId = anchor['targetNodeId'];
  const targetPath =
    typeof targetNodeId === 'string' ? readValidatedNodePath(targetNodeId, nodesById) : undefined;
  if (
    primaryPath !== undefined &&
    (sameStringPath(pathHint, primaryPath) ||
      (targetPath !== undefined && sameStringPath(pathHint, targetPath)))
  ) {
    return undefined;
  }
  return invalidClaimAnchor(
    claimPath,
    'anchor.pathHint',
    'A Claim anchor path hint must match a current root-to-anchor node path.',
  );
}

function validateClaimPrimaryPosition(
  claimPath: string,
  primary: UnknownRecord | undefined,
  nodesById: ReadonlyMap<string, ValidatedTreeNode>,
): string | ManuscriptValidationError {
  if (primary?.['kind'] === 'text') {
    return validateClaimTextPosition(claimPath, primary, nodesById);
  }

  if (primary?.['kind'] === 'node-boundary') {
    return validateClaimNodeBoundary(claimPath, primary, nodesById);
  }

  return invalidClaimAnchor(
    claimPath,
    'anchor.primary',
    'A Claim anchor must contain a valid semantic position.',
  );
}

function validateClaimTextPosition(
  claimPath: string,
  primary: UnknownRecord,
  nodesById: ReadonlyMap<string, ValidatedTreeNode>,
): string | ManuscriptValidationError {
  const textNodeId = primary['textNodeId'];
  const textNode = typeof textNodeId === 'string' ? nodesById.get(textNodeId) : undefined;
  if (typeof textNodeId !== 'string' || textNode?.nodeType !== 'text') {
    return invalidClaimAnchor(
      claimPath,
      'anchor.primary.textNodeId',
      'A text Claim anchor must target an existing Text node.',
    );
  }
  const text = textNode.record['value'];
  const utf16Offset = primary['utf16Offset'];
  if (
    typeof text !== 'string' ||
    typeof utf16Offset !== 'number' ||
    validateUtf16Boundary(text, utf16Offset as Utf16Offset).type === 'invalid'
  ) {
    return invalidClaimAnchor(
      claimPath,
      'anchor.primary.utf16Offset',
      'A text Claim anchor offset must be a valid UTF-16 boundary in its Text node.',
    );
  }
  return textNodeId;
}

function validateClaimNodeBoundary(
  claimPath: string,
  primary: UnknownRecord,
  nodesById: ReadonlyMap<string, ValidatedTreeNode>,
): string | ManuscriptValidationError {
  const parentNodeId = primary['parentNodeId'];
  const parentNode = typeof parentNodeId === 'string' ? nodesById.get(parentNodeId) : undefined;
  const children = readDenseDataArray(parentNode?.record['children']);
  const childIndex = primary['childIndex'];
  if (
    typeof parentNodeId !== 'string' ||
    children === undefined ||
    typeof childIndex !== 'number' ||
    childIndex > children.length
  ) {
    return invalidClaimAnchor(
      claimPath,
      'anchor.primary',
      'A boundary Claim anchor must identify an existing parent and child boundary.',
    );
  }
  return parentNodeId;
}

function readValidatedNodePath(
  nodeId: string,
  nodesById: ReadonlyMap<string, ValidatedTreeNode>,
): readonly string[] | undefined {
  const reversed: string[] = [];
  const visited = new Set<string>();
  let currentNodeId: string | undefined = nodeId;
  while (currentNodeId !== undefined) {
    if (visited.has(currentNodeId)) {
      return undefined;
    }
    visited.add(currentNodeId);
    const node = nodesById.get(currentNodeId);
    if (node === undefined) {
      return undefined;
    }
    reversed.push(currentNodeId);
    currentNodeId = node.parentNodeId;
  }
  return reversed.reverse();
}

function sameStringPath(candidate: readonly unknown[], expected: readonly string[]): boolean {
  return (
    candidate.length === expected.length &&
    candidate.every((nodeId, index) => nodeId === expected[index])
  );
}

function invalidClaimAnchor(
  claimPath: string,
  relativePath: string,
  safeMessage: string,
): ManuscriptValidationError {
  return validationError('claim-anchor-invalid', `${claimPath}.${relativePath}`, safeMessage);
}

function acceptsManuscriptChildren(types: readonly NodeKind[]): boolean {
  const withoutFrontMatter = types[0] === 'frontMatter' ? types.slice(1) : types;
  const lastType = withoutFrontMatter[withoutFrontMatter.length - 1];
  const withoutBibliography =
    lastType === 'bibliographyPlaceholder'
      ? withoutFrontMatter.slice(0, withoutFrontMatter.length - 1)
      : withoutFrontMatter;
  return withoutBibliography.length === 1 && withoutBibliography[0] === 'body';
}

function acceptsTableChildren(types: readonly NodeKind[]): boolean {
  const rows = types[0] === 'tableCaption' ? types.slice(1) : types;
  return allTypesAre(rows, 'tableRow', 1);
}

function allTypesIn(
  types: readonly NodeKind[],
  allowed: ReadonlySet<string>,
  minimum = 0,
): boolean {
  return types.length >= minimum && types.every((type) => allowed.has(type));
}

function allTypesAre(types: readonly NodeKind[], expected: NodeKind, minimum = 0): boolean {
  return types.length >= minimum && types.every((type) => type === expected);
}

function forbiddenChildren(): ChildrenRule {
  return {
    presence: 'forbidden',
    accepts: (types) => types.length === 0,
  };
}

function requiredChildren(accepts: ChildrenRule['accepts']): ChildrenRule {
  return {
    presence: 'required',
    accepts,
  };
}

function readNodeKind(value: unknown): NodeKind | undefined {
  return typeof value === 'string' && KNOWN_NODE_TYPES.has(value) ? (value as NodeKind) : undefined;
}

function isValidRevisionId(value: unknown): value is string {
  return typeof value === 'string' && parseRevisionId(value).type === 'valid';
}

function isValidNodeId(value: unknown): value is string {
  return typeof value === 'string' && parseNodeId(value).type === 'valid';
}

function isValidEntityId(value: unknown): value is string {
  return typeof value === 'string' && parseEntityId(value).type === 'valid';
}

function isValidContentHash(value: unknown): value is string {
  return typeof value === 'string' && parseContentHash(value).type === 'valid';
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return readPlainDataRecord(value);
}

function isRecord(value: unknown): value is UnknownRecord {
  return readPlainDataRecord(value) !== undefined;
}

function failure(
  reason: ManuscriptValidationErrorReason,
  path: string,
  safeMessage: string,
): Result<never, ManuscriptValidationError> {
  return {
    type: 'error',
    error: validationError(reason, path, safeMessage),
  };
}

function validationError(
  reason: ManuscriptValidationErrorReason,
  path: string,
  safeMessage: string,
): ManuscriptValidationError {
  return { reason, path, safeMessage };
}
