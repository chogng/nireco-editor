import { HASH_DOMAINS } from '../../base/hashing/hash-preimage.js';
import {
  hashCanonicalJsonPortable,
  hashTrustedCanonicalJsonTextPortable,
  patchTrustedCanonicalUtf8Text,
  type PatchedTrustedCanonicalUtf8Text,
  type TrustedCanonicalUtf8Text,
} from '../../base/hashing/portable-sha-256.js';
import type {
  ContentHash,
  EntityId,
  NodeId,
  OperationId,
  RevisionId,
  Utf16Offset,
} from '../../base/ids/identifiers.js';
import { parseRevisionId, parseUtf16Offset } from '../../base/ids/identifiers.js';
import type { JsonValue } from '../../base/serialization/canonical-json.js';
import { serializeCanonicalJson } from '../../base/serialization/canonical-json.js';
import type { AcademicGraphSnapshot, ClaimEntity } from '../academic-graph.js';
import type { PositionMap } from '../mapping/position-map.js';
import {
  createReplaceTextTransactionPositionMap,
  type ReplaceTextPositionMapStep,
} from '../mapping/replace-text-position-map.js';
import {
  createDocumentIndex,
  deriveDocumentIndexWithNodeReplacements,
  type DocumentIndex,
} from '../node/document-index.js';
import type { DocumentNode, ManuscriptNode, TextNode } from '../node/manuscript-node.js';
import type { ReplaceTextOperation } from '../operation/operation.js';
import { validateUtf16Boundary, type SemanticPosition } from '../position/semantic-position.js';
import type { Revision } from '../revision/revision.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../snapshot.js';
import {
  cacheKernelDerivedDocumentSnapshot,
  getVerifiedDocumentSnapshotCache,
  type VerifiedDocumentSnapshotCache,
} from '../document-snapshot-cache.js';
import type { Transaction, TransactionPrecondition } from './transaction.js';
import { decodeStrictTransactionV1 } from './transaction-runtime.js';

export const TRANSACTION_REPLAY_PROFILE = 'nireco-transaction-replay-1';

export type TransactionKernelErrorReason =
  | 'base-revision-mismatch'
  | 'canonical-json-invalid'
  | 'claim-anchor-mapping-failed'
  | 'document-hash-mismatch'
  | 'document-hash-precondition-failed'
  | 'entity-precondition-failed'
  | 'node-hash-precondition-failed'
  | 'node-precondition-failed'
  | 'next-revision-conflict'
  | 'operation-count-unsupported'
  | 'operation-unsupported'
  | 'position-invalid'
  | 'schema-version-precondition-failed'
  | 'snapshot-invalid'
  | 'target-node-not-found'
  | 'target-node-not-text'
  | 'transaction-invalid'
  | 'transaction-too-large';

export interface TransactionKernelError {
  readonly reason: TransactionKernelErrorReason;
  readonly safeMessage: string;
  readonly nodeId?: NodeId;
  readonly entityId?: EntityId;
  readonly operationId?: OperationId;
}

export interface ReplaceTextInverseOperationPayload {
  readonly type: 'replace-text';
  readonly textNodeId: NodeId;
  readonly startUtf16Offset: Utf16Offset;
  readonly endUtf16Offset: Utf16Offset;
  readonly replacement: string;
}

export interface TransactionInversePlan {
  readonly operations: readonly [
    ReplaceTextInverseOperationPayload,
    ...ReplaceTextInverseOperationPayload[],
  ];
  readonly preconditions: readonly TransactionPrecondition[];
}

export interface TransactionReplayInput extends Readonly<Record<string, JsonValue>> {
  readonly profile: typeof TRANSACTION_REPLAY_PROFILE;
  readonly transaction: JsonValue;
}

export interface PreparedKernelTransaction {
  readonly snapshot: DocumentSnapshot;
  readonly transactionHash: ContentHash;
  readonly positionMap: PositionMap;
  readonly inverse: TransactionInversePlan;
  readonly replayInput: TransactionReplayInput;
}

export interface PrepareKernelTransactionOptions {
  readonly transaction: Transaction;
  readonly headRevision: Revision;
  readonly headSnapshot: DocumentSnapshot;
  readonly nextRevisionId: RevisionId;
}

export function prepareKernelTransaction(
  options: PrepareKernelTransactionOptions,
): Result<PreparedKernelTransaction> {
  const decodedTransaction = decodeStrictTransactionV1(options.transaction);
  if (decodedTransaction.type === 'error') {
    return errorResult(decodedTransaction.error.reason, decodedTransaction.error.safeMessage);
  }
  const transaction = decodedTransaction.value;
  const consistency = validateHeadConsistency(options, transaction);
  if (consistency.type === 'error') {
    return consistency;
  }

  const verifiedCache = getVerifiedDocumentSnapshotCache(options.headSnapshot);
  const indexed = readDocumentIndex(options.headSnapshot, verifiedCache);
  if (indexed.type === 'error') {
    return indexed;
  }
  const currentHash = validateCurrentDocumentHash(options.headSnapshot, verifiedCache);
  if (currentHash.type === 'error') {
    return currentHash;
  }

  const preconditions = validatePreconditions(
    transaction.preconditions,
    options.headSnapshot,
    indexed.value,
  );
  if (preconditions.type === 'error') {
    return preconditions;
  }

  const supportedOperations = readSupportedOperations(transaction);
  if (supportedOperations.type === 'error') {
    return supportedOperations;
  }
  return prepareReplaceTextTransaction(
    options,
    transaction,
    indexed.value,
    verifiedCache,
    supportedOperations.value,
  );
}

function prepareReplaceTextTransaction(
  options: PrepareKernelTransactionOptions,
  transaction: Transaction,
  sourceIndex: DocumentIndex,
  verifiedCache: VerifiedDocumentSnapshotCache | undefined,
  operations: readonly [ReplaceTextOperation, ...ReplaceTextOperation[]],
): Result<PreparedKernelTransaction> {
  if (operations.length > 1) {
    return prepareMultipleReplaceTextTransaction(
      options,
      transaction,
      sourceIndex,
      verifiedCache,
      operations,
    );
  }
  const operation = operations[0];

  const positionMap = createReplaceTextTransactionPositionMap({
    fromRevisionId: options.headRevision.id,
    toRevisionId: options.nextRevisionId,
    steps: [positionMapStep(operation)],
  });

  const applied = applyReplaceText(options.headSnapshot.root, sourceIndex, operation);
  if (applied.type === 'error') {
    return applied;
  }

  const rebasedAcademicGraph = rebaseClaimAnchors(
    options.headSnapshot.academicGraph,
    positionMap,
    options.nextRevisionId,
  );
  if (rebasedAcademicGraph.type === 'error') {
    return rebasedAcademicGraph;
  }

  const pendingSnapshot: DocumentSnapshot = {
    ...options.headSnapshot,
    revisionId: options.nextRevisionId,
    root: applied.value.root,
    academicGraph: rebasedAcademicGraph.value.academicGraph,
  };
  const nextHash = computeNextDocumentHash(
    pendingSnapshot,
    verifiedCache,
    applied.value,
    rebasedAcademicGraph.value,
  );
  if (nextHash.type === 'error') {
    return nextHash;
  }
  const unhashedSnapshot: DocumentSnapshot = {
    ...pendingSnapshot,
    documentHash: nextHash.value.hash,
  };

  const transactionHash = computeTransactionHash(transaction);
  if (transactionHash.type === 'error') {
    return transactionHash;
  }
  const replayTransaction = JSON.parse(transactionHash.value.canonicalJson) as JsonValue;

  const snapshot = stageVerifiedDerivedSnapshot({
    sourceSnapshot: options.headSnapshot,
    snapshot: unhashedSnapshot,
    verifiedCache,
    sourceIndex,
    applied: applied.value,
    rebasedAcademicGraph: rebasedAcademicGraph.value,
    canonicalDocumentPayload: nextHash.value.canonicalJson,
    ...(nextHash.value.canonicalUtf8 === undefined
      ? {}
      : { canonicalDocumentPayloadUtf8: nextHash.value.canonicalUtf8 }),
  });

  return {
    type: 'ok',
    value: {
      snapshot,
      transactionHash: transactionHash.value.hash,
      positionMap,
      inverse: {
        operations: [
          {
            type: 'replace-text',
            textNodeId: operation.textNodeId,
            startUtf16Offset: operation.startUtf16Offset,
            endUtf16Offset: validUtf16Offset(
              operation.startUtf16Offset + operation.replacement.length,
            ),
            replacement: applied.value.replacedText,
          },
        ],
        preconditions: [
          {
            kind: 'node-exists',
            nodeId: operation.textNodeId,
          },
          {
            kind: 'document-hash',
            expected: nextHash.value.hash,
          },
        ],
      },
      replayInput: {
        profile: TRANSACTION_REPLAY_PROFILE,
        transaction: replayTransaction,
      },
    },
  };
}

function readSupportedOperations(
  transaction: Transaction,
): Result<readonly [ReplaceTextOperation, ...ReplaceTextOperation[]]> {
  if (transaction.operations.length === 0) {
    return errorResult(
      'operation-count-unsupported',
      'The current Transaction Kernel slice requires at least one Operation.',
    );
  }
  const operations: ReplaceTextOperation[] = [];
  for (const operation of transaction.operations) {
    if (operation.type !== 'replace-text') {
      return errorResult(
        'operation-unsupported',
        'The current Transaction Kernel slice only accepts ordered ReplaceText operations.',
        {
          operationId: operation.id,
        },
      );
    }
    operations.push(operation);
  }
  return {
    type: 'ok',
    value: operations as [ReplaceTextOperation, ...ReplaceTextOperation[]],
  };
}

function prepareMultipleReplaceTextTransaction(
  options: PrepareKernelTransactionOptions,
  transaction: Transaction,
  sourceIndex: DocumentIndex,
  verifiedCache: VerifiedDocumentSnapshotCache | undefined,
  operations: readonly [ReplaceTextOperation, ...ReplaceTextOperation[]],
): Result<PreparedKernelTransaction> {
  let draftRoot = options.headSnapshot.root;
  let draftIndex = sourceIndex;
  const applications: ReplaceTextApplication[] = [];
  for (const operation of operations) {
    const applied = applyReplaceText(draftRoot, draftIndex, operation);
    if (applied.type === 'error') {
      return applied;
    }
    applications.push(applied.value);
    draftRoot = applied.value.root;
    const nextIndex = deriveDocumentIndexWithNodeReplacements(
      draftIndex,
      applied.value.updatedNodes,
    );
    if (nextIndex === undefined) {
      return errorResult(
        'snapshot-invalid',
        'The ordered ReplaceText draft could not derive a stable document index.',
        { operationId: operation.id },
      );
    }
    draftIndex = nextIndex;
  }

  const positionMap = createReplaceTextTransactionPositionMap({
    fromRevisionId: options.headRevision.id,
    toRevisionId: options.nextRevisionId,
    steps: operations.map(positionMapStep) as [
      ReplaceTextPositionMapStep,
      ...ReplaceTextPositionMapStep[],
    ],
  });
  const rebasedAcademicGraph = rebaseClaimAnchors(
    options.headSnapshot.academicGraph,
    positionMap,
    options.nextRevisionId,
  );
  if (rebasedAcademicGraph.type === 'error') {
    return rebasedAcademicGraph;
  }

  const pendingSnapshot: DocumentSnapshot = {
    ...options.headSnapshot,
    revisionId: options.nextRevisionId,
    root: draftRoot,
    academicGraph: rebasedAcademicGraph.value.academicGraph,
  };
  const validated = createDocumentIndex(pendingSnapshot);
  if (validated.type === 'error') {
    return errorResult(
      'snapshot-invalid',
      'The ordered ReplaceText draft does not satisfy the canonical manuscript invariants.',
    );
  }
  const nextHash = computeDocumentHash(pendingSnapshot);
  if (nextHash.type === 'error') {
    return nextHash;
  }
  const unhashedSnapshot: DocumentSnapshot = {
    ...pendingSnapshot,
    documentHash: nextHash.value.hash,
  };
  const transactionHash = computeTransactionHash(transaction);
  if (transactionHash.type === 'error') {
    return transactionHash;
  }
  const replayTransaction = JSON.parse(transactionHash.value.canonicalJson) as JsonValue;
  const updatedNodes = applications.flatMap((application) => application.updatedNodes);
  const snapshot = stageVerifiedMultipleDerivedSnapshot({
    sourceSnapshot: options.headSnapshot,
    snapshot: unhashedSnapshot,
    verifiedCache,
    index: validated.value,
    updatedNodes,
    rebasedAcademicGraph: rebasedAcademicGraph.value,
    canonicalDocumentPayload: nextHash.value.canonicalJson,
  });

  return {
    type: 'ok',
    value: {
      snapshot,
      transactionHash: transactionHash.value.hash,
      positionMap,
      inverse: {
        operations: createInverseOperations(operations, applications),
        preconditions: createInversePreconditions(operations, nextHash.value.hash),
      },
      replayInput: {
        profile: TRANSACTION_REPLAY_PROFILE,
        transaction: replayTransaction,
      },
    },
  };
}

function positionMapStep(operation: ReplaceTextOperation): ReplaceTextPositionMapStep {
  return {
    textNodeId: operation.textNodeId,
    startUtf16Offset: operation.startUtf16Offset,
    endUtf16Offset: operation.endUtf16Offset,
    replacementUtf16Length: operation.replacement.length,
  };
}

function createInverseOperations(
  operations: readonly [ReplaceTextOperation, ...ReplaceTextOperation[]],
  applications: readonly ReplaceTextApplication[],
): [ReplaceTextInverseOperationPayload, ...ReplaceTextInverseOperationPayload[]] {
  const inverse: ReplaceTextInverseOperationPayload[] = [];
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];
    const application = applications[index];
    if (operation === undefined || application === undefined) {
      throw new RangeError('The ordered ReplaceText inverse plan is incomplete.');
    }
    inverse.push({
      type: 'replace-text',
      textNodeId: operation.textNodeId,
      startUtf16Offset: operation.startUtf16Offset,
      endUtf16Offset: validUtf16Offset(operation.startUtf16Offset + operation.replacement.length),
      replacement: application.replacedText,
    });
  }
  return inverse as [ReplaceTextInverseOperationPayload, ...ReplaceTextInverseOperationPayload[]];
}

function createInversePreconditions(
  operations: readonly ReplaceTextOperation[],
  expectedDocumentHash: ContentHash,
): readonly TransactionPrecondition[] {
  const seenNodeIds = new Set<NodeId>();
  const preconditions: TransactionPrecondition[] = [];
  for (const operation of operations) {
    if (!seenNodeIds.has(operation.textNodeId)) {
      seenNodeIds.add(operation.textNodeId);
      preconditions.push({
        kind: 'node-exists',
        nodeId: operation.textNodeId,
      });
    }
  }
  preconditions.push({
    kind: 'document-hash',
    expected: expectedDocumentHash,
  });
  return preconditions;
}

interface ReplaceTextApplication {
  readonly root: ManuscriptNode;
  readonly replacedText: string;
  readonly previousTextNode: TextNode;
  readonly nextTextNode: TextNode;
  readonly updatedNodes: readonly DocumentNode[];
}

function readDocumentIndex(
  snapshot: DocumentSnapshot,
  verifiedCache: VerifiedDocumentSnapshotCache | undefined,
): Result<DocumentIndex> {
  if (verifiedCache !== undefined) {
    return {
      type: 'ok',
      value: verifiedCache.index,
    };
  }
  const indexed = createDocumentIndex(snapshot);
  return indexed.type === 'error'
    ? errorResult(
        'snapshot-invalid',
        'The current Snapshot does not satisfy the canonical manuscript invariants.',
      )
    : indexed;
}

function validateHeadConsistency(
  options: PrepareKernelTransactionOptions,
  transaction: Transaction,
): Result<void> {
  if (
    transaction.target.uri !== options.headRevision.uri ||
    transaction.target.baseRevisionId !== options.headRevision.id ||
    options.headSnapshot.revisionId !== options.headRevision.id
  ) {
    return errorResult(
      'base-revision-mismatch',
      'The Transaction base Revision does not match the current head.',
    );
  }
  if (options.headRevision.documentHash !== options.headSnapshot.documentHash) {
    return errorResult(
      'document-hash-mismatch',
      'The head Revision and Snapshot do not agree on the document hash.',
    );
  }
  if (
    typeof options.nextRevisionId !== 'string' ||
    parseRevisionId(options.nextRevisionId).type === 'invalid' ||
    options.nextRevisionId === options.headRevision.id
  ) {
    return errorResult(
      'next-revision-conflict',
      'The next Revision ID must be a new production UUIDv7 identifier.',
    );
  }
  return {
    type: 'ok',
    value: undefined,
  };
}

function validatePreconditions(
  preconditions: readonly TransactionPrecondition[],
  snapshot: DocumentSnapshot,
  index: DocumentIndex,
): Result<void> {
  for (const precondition of preconditions) {
    const validated = validatePrecondition(precondition, snapshot, index);
    if (validated.type === 'error') {
      return validated;
    }
  }
  return {
    type: 'ok',
    value: undefined,
  };
}

function validatePrecondition(
  precondition: TransactionPrecondition,
  snapshot: DocumentSnapshot,
  index: DocumentIndex,
): Result<void> {
  switch (precondition.kind) {
    case 'node-exists':
      return index.getNode(precondition.nodeId) === undefined
        ? errorResult('node-precondition-failed', 'A required Transaction node does not exist.', {
            nodeId: precondition.nodeId,
          })
        : okResult();
    case 'node-hash':
      return validateNodeHashPrecondition(precondition, index);
    case 'entity-exists':
      return index.hasEntity(precondition.entityId)
        ? okResult()
        : errorResult('entity-precondition-failed', 'A required academic entity does not exist.', {
            entityId: precondition.entityId,
          });
    case 'schema-version':
      return precondition.expected === snapshot.schemaVersion
        ? okResult()
        : errorResult(
            'schema-version-precondition-failed',
            'The Transaction requires a different manuscript schema version.',
          );
    case 'document-hash':
      return precondition.expected === snapshot.documentHash
        ? okResult()
        : errorResult(
            'document-hash-precondition-failed',
            'The Transaction document-hash precondition does not match the current Snapshot.',
          );
  }
}

function validateNodeHashPrecondition(
  precondition: Extract<TransactionPrecondition, { readonly kind: 'node-hash' }>,
  index: DocumentIndex,
): Result<void> {
  const node = index.getNode(precondition.nodeId);
  if (node === undefined) {
    return errorResult(
      'node-precondition-failed',
      'A node-hash precondition targets a missing node.',
      {
        nodeId: precondition.nodeId,
      },
    );
  }
  const hashed = hashCanonicalJsonPortable(HASH_DOMAINS.node, node);
  if (hashed.type === 'error') {
    return errorResult(
      'canonical-json-invalid',
      'The target node cannot be represented as canonical JSON.',
      {
        nodeId: precondition.nodeId,
      },
    );
  }
  return hashed.hash === precondition.expected
    ? okResult()
    : errorResult(
        'node-hash-precondition-failed',
        'The node-hash precondition does not match the current node.',
        {
          nodeId: precondition.nodeId,
        },
      );
}

function applyReplaceText(
  root: ManuscriptNode,
  index: DocumentIndex,
  operation: ReplaceTextOperation,
): Result<ReplaceTextApplication> {
  const target = index.getNode(operation.textNodeId);
  if (target === undefined) {
    return errorResult('target-node-not-found', 'The ReplaceText target node does not exist.', {
      nodeId: operation.textNodeId,
      operationId: operation.id,
    });
  }
  if (target.type !== 'text') {
    return errorResult('target-node-not-text', 'The ReplaceText target must be a TextNode.', {
      nodeId: operation.textNodeId,
      operationId: operation.id,
    });
  }

  const range = validateReplaceTextRange(target, operation);
  if (range.type === 'error') {
    return range;
  }

  const updated = replaceTextNode(root, index, target, operation);
  if (updated.type === 'error') {
    return updated;
  }
  return {
    type: 'ok',
    value: {
      root: updated.value.root,
      replacedText: target.value.slice(operation.startUtf16Offset, operation.endUtf16Offset),
      previousTextNode: target,
      nextTextNode: updated.value.nextTextNode,
      updatedNodes: updated.value.updatedNodes,
    },
  };
}

function validateReplaceTextRange(node: TextNode, operation: ReplaceTextOperation): Result<void> {
  if (operation.startUtf16Offset > operation.endUtf16Offset) {
    return positionError(operation);
  }
  if (
    validateUtf16Boundary(node.value, operation.startUtf16Offset).type === 'invalid' ||
    validateUtf16Boundary(node.value, operation.endUtf16Offset).type === 'invalid' ||
    !hasWellFormedUtf16(operation.replacement)
  ) {
    return positionError(operation);
  }
  return okResult();
}

function positionError(operation: ReplaceTextOperation): Result<never> {
  return errorResult(
    'position-invalid',
    'ReplaceText offsets and replacement text must use valid UTF-16 boundaries.',
    {
      nodeId: operation.textNodeId,
      operationId: operation.id,
    },
  );
}

function hasWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (isHighSurrogate(current)) {
      if (index + 1 >= value.length || !isLowSurrogate(value.charCodeAt(index + 1))) {
        return false;
      }
      index += 1;
    } else if (isLowSurrogate(current)) {
      return false;
    }
  }
  return true;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function replaceTextNode(
  root: ManuscriptNode,
  index: DocumentIndex,
  target: TextNode,
  operation: ReplaceTextOperation,
): Result<{
  readonly root: ManuscriptNode;
  readonly nextTextNode: TextNode;
  readonly updatedNodes: readonly DocumentNode[];
}> {
  const path = index.getNodePath(operation.textNodeId);
  if (
    path?.nodes[0] !== root ||
    path.nodes[path.nodes.length - 1] !== target ||
    path.childIndices.length + 1 !== path.nodes.length
  ) {
    return errorResult(
      'target-node-not-found',
      'The ReplaceText target disappeared while applying the immutable update.',
      {
        nodeId: operation.textNodeId,
        operationId: operation.id,
      },
    );
  }
  const nextTextNode: TextNode = {
    ...target,
    value: `${target.value.slice(0, operation.startUtf16Offset)}${operation.replacement}${target.value.slice(operation.endUtf16Offset)}`,
  };
  const updatedNodes: DocumentNode[] = [nextTextNode];
  let updated: DocumentNode = nextTextNode;
  for (let pathIndex = path.nodes.length - 2; pathIndex >= 0; pathIndex -= 1) {
    const parent = path.nodes[pathIndex];
    const childIndex = path.childIndices[pathIndex];
    if (
      parent === undefined ||
      childIndex === undefined ||
      !hasDocumentChildren(parent) ||
      parent.children[childIndex]?.id !== updated.id
    ) {
      return errorResult(
        'target-node-not-found',
        'The ReplaceText target path is inconsistent with the immutable DocumentIndex.',
        {
          nodeId: operation.textNodeId,
          operationId: operation.id,
        },
      );
    }
    const children = [...parent.children];
    children[childIndex] = updated;
    updated = cloneWithChildren(parent, children);
    updatedNodes.push(updated);
  }
  if (updated.type !== 'manuscript') {
    return errorResult(
      'target-node-not-found',
      'The ReplaceText target path did not resolve to the Manuscript root.',
      {
        nodeId: operation.textNodeId,
        operationId: operation.id,
      },
    );
  }
  return {
    type: 'ok',
    value: {
      root: updated,
      nextTextNode,
      updatedNodes,
    },
  };
}

interface DocumentNodeWithChildren {
  readonly children: readonly DocumentNode[];
}

function hasDocumentChildren(node: DocumentNode): node is DocumentNode & DocumentNodeWithChildren {
  return 'children' in node;
}

function cloneWithChildren(
  node: DocumentNode & DocumentNodeWithChildren,
  children: readonly DocumentNode[],
): DocumentNode {
  return {
    ...node,
    children,
  } as DocumentNode;
}

function rebaseClaimAnchors(
  academicGraph: AcademicGraphSnapshot,
  positionMap: PositionMap,
  nextRevisionId: RevisionId,
): Result<RebasedAcademicGraph> {
  if (academicGraph.claims.length === 0) {
    return {
      type: 'ok',
      value: {
        academicGraph,
        claimReplacements: [],
        updatedObjects: [],
      },
    };
  }

  const claims: ClaimEntity[] = [];
  const claimReplacements: ClaimCanonicalReplacement[] = [];
  const updatedObjects: object[] = [];
  for (let index = 0; index < academicGraph.claims.length; index += 1) {
    const claim = academicGraph.claims[index];
    if (claim === undefined) {
      return errorResult(
        'claim-anchor-mapping-failed',
        'A Claim anchor could not be mapped into the next Revision.',
      );
    }
    const mapped = positionMap.mapPosition(claim.anchor.primary);
    if (mapped.status !== 'mapped') {
      return errorResult(
        'claim-anchor-mapping-failed',
        'A Claim anchor could not be mapped exactly into the next Revision.',
        {
          entityId: claim.id,
        },
      );
    }
    const primary: SemanticPosition = { ...mapped.position };
    const document = {
      ...claim.anchor.document,
      revisionId: nextRevisionId,
    };
    const anchor = {
      ...claim.anchor,
      document,
      primary,
    };
    const nextClaim: ClaimEntity = {
      ...claim,
      anchor,
    };
    claims.push(nextClaim);
    claimReplacements.push({
      index,
      previous: claim,
      next: nextClaim,
    });
    updatedObjects.push(primary, document, anchor, nextClaim);
  }
  const nextClaims: readonly ClaimEntity[] = claims;
  const nextAcademicGraph: AcademicGraphSnapshot = {
    ...academicGraph,
    claims: nextClaims,
  };
  updatedObjects.push(nextClaims, nextAcademicGraph);
  return {
    type: 'ok',
    value: {
      academicGraph: nextAcademicGraph,
      claimReplacements,
      updatedObjects,
    },
  };
}

interface CanonicalHashValue {
  readonly hash: ContentHash;
  readonly canonicalJson: string;
  readonly canonicalUtf8?: TrustedCanonicalUtf8Text;
}

interface ClaimCanonicalReplacement {
  readonly index: number;
  readonly previous: ClaimEntity;
  readonly next: ClaimEntity;
}

interface RebasedAcademicGraph {
  readonly academicGraph: AcademicGraphSnapshot;
  readonly claimReplacements: readonly ClaimCanonicalReplacement[];
  readonly updatedObjects: readonly object[];
}

function computeDocumentHash(snapshot: DocumentSnapshot): Result<CanonicalHashValue> {
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(snapshot),
  );
  return hashed.type === 'error'
    ? errorResult(
        'canonical-json-invalid',
        'The manuscript content cannot be represented as canonical JSON.',
      )
    : {
        type: 'ok',
        value: {
          hash: hashed.hash,
          canonicalJson: hashed.canonicalJson,
        },
      };
}

function computeNextDocumentHash(
  snapshot: DocumentSnapshot,
  cache: VerifiedDocumentSnapshotCache | undefined,
  application: ReplaceTextApplication,
  rebasedAcademicGraph: RebasedAcademicGraph,
): Result<CanonicalHashValue> {
  if (cache === undefined) {
    return computeDocumentHash(snapshot);
  }

  const verifiedPath = cache.index.getNodePath(application.previousTextNode.id);
  if (
    verifiedPath?.nodes[0] !== cache.snapshot.root ||
    verifiedPath.nodes[verifiedPath.nodes.length - 1] !== application.previousTextNode ||
    !hasVerifiedClaimReplacementSources(cache.snapshot, rebasedAcademicGraph.claimReplacements)
  ) {
    return computeDocumentHash(snapshot);
  }

  const patched = patchCanonicalDocumentPayload(
    cache.canonicalDocumentPayload,
    cache.canonicalDocumentPayloadUtf8,
    [
      {
        previous: application.previousTextNode,
        next: application.nextTextNode,
      },
      ...rebasedAcademicGraph.claimReplacements,
    ],
  );
  if (patched.type === 'error') {
    return patched;
  }
  if (patched.value === undefined) {
    return computeDocumentHash(snapshot);
  }
  const hashed = hashTrustedCanonicalJsonTextPortable(
    HASH_DOMAINS.documentContent,
    patched.value.utf8,
  );
  if (hashed === undefined) {
    return computeDocumentHash(snapshot);
  }
  if (hashed.type === 'error') {
    return errorResult(
      'canonical-json-invalid',
      'The edited manuscript content cannot be represented as canonical JSON.',
    );
  }
  return {
    type: 'ok',
    value: {
      hash: hashed.hash,
      canonicalJson: hashed.canonicalJson,
      canonicalUtf8: patched.value.utf8,
    },
  };
}

interface CanonicalReplacement {
  readonly previous: unknown;
  readonly next: unknown;
}

interface CanonicalReplacementRange {
  readonly start: number;
  readonly end: number;
  readonly nextCanonical: string;
  readonly nextIdentity?: object;
  readonly startUtf8Offset?: number;
  readonly endUtf8Offset?: number;
}

interface CanonicalIdentityRange {
  readonly start: number;
  readonly end: number;
  readonly startUtf8Offset: number;
  readonly endUtf8Offset: number;
}

const TRUSTED_CANONICAL_IDENTITY_RANGES = new WeakMap<
  TrustedCanonicalUtf8Text,
  WeakMap<object, CanonicalIdentityRange>
>();

function patchCanonicalDocumentPayload(
  source: string,
  sourceUtf8: TrustedCanonicalUtf8Text,
  replacements: readonly CanonicalReplacement[],
): Result<PatchedTrustedCanonicalUtf8Text | undefined> {
  const ranges: CanonicalReplacementRange[] = [];
  const trustedRanges = TRUSTED_CANONICAL_IDENTITY_RANGES.get(sourceUtf8);
  for (const replacement of replacements) {
    const range = readCanonicalReplacementRange(source, trustedRanges, replacement);
    if (range.type === 'error') {
      return range;
    }
    if (range.value === undefined) {
      return {
        type: 'ok',
        value: undefined,
      };
    }
    ranges.push(range.value);
  }
  ranges.sort((left, right) => left.start - right.start);
  if (hasOverlappingRanges(ranges)) {
    return {
      type: 'ok',
      value: undefined,
    };
  }

  const patched = patchTrustedCanonicalUtf8Text(
    sourceUtf8,
    ranges.map((range) => ({
      startUtf16Offset: range.start,
      endUtf16Offset: range.end,
      replacement: range.nextCanonical,
      ...(range.startUtf8Offset === undefined ? {} : { startUtf8Offset: range.startUtf8Offset }),
      ...(range.endUtf8Offset === undefined ? {} : { endUtf8Offset: range.endUtf8Offset }),
    })),
  );
  if (patched !== undefined) {
    cacheNextCanonicalIdentityRanges(patched, ranges);
  }
  return {
    type: 'ok',
    value: patched,
  };
}

function readCanonicalReplacementRange(
  source: string,
  trustedRanges: WeakMap<object, CanonicalIdentityRange> | undefined,
  replacement: CanonicalReplacement,
): Result<CanonicalReplacementRange | undefined> {
  const previousCanonical = serializeCanonicalJson(replacement.previous);
  const nextCanonical = serializeCanonicalJson(replacement.next);
  if (previousCanonical.type === 'error' || nextCanonical.type === 'error') {
    return errorResult(
      'canonical-json-invalid',
      'The edited manuscript fragment cannot be represented as canonical JSON.',
    );
  }
  const previousIdentity = objectIdentity(replacement.previous);
  const nextIdentity = objectIdentity(replacement.next);
  const cachedRange =
    previousIdentity === undefined ? undefined : trustedRanges?.get(previousIdentity);
  const cachedRangeMatches =
    cachedRange !== undefined &&
    source.slice(cachedRange.start, cachedRange.end) === previousCanonical.value;
  const start = cachedRangeMatches
    ? cachedRange.start
    : findUniqueOccurrence(source, previousCanonical.value);
  return {
    type: 'ok',
    value:
      start === undefined
        ? undefined
        : {
            start,
            end: start + previousCanonical.value.length,
            nextCanonical: nextCanonical.value,
            ...(nextIdentity === undefined ? {} : { nextIdentity }),
            ...(cachedRangeMatches
              ? {
                  startUtf8Offset: cachedRange.startUtf8Offset,
                  endUtf8Offset: cachedRange.endUtf8Offset,
                }
              : {}),
          },
  };
}

function cacheNextCanonicalIdentityRanges(
  patched: PatchedTrustedCanonicalUtf8Text,
  ranges: readonly CanonicalReplacementRange[],
): void {
  const nextRanges = new WeakMap<object, CanonicalIdentityRange>();
  let offsetDelta = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const applied = patched.replacements[index];
    if (range === undefined || applied === undefined) {
      return;
    }
    const start = range.start + offsetDelta;
    const end = start + range.nextCanonical.length;
    if (range.nextIdentity !== undefined) {
      nextRanges.set(range.nextIdentity, {
        start,
        end,
        startUtf8Offset: applied.nextStartUtf8Offset,
        endUtf8Offset: applied.nextEndUtf8Offset,
      });
    }
    offsetDelta += range.nextCanonical.length - (range.end - range.start);
  }
  TRUSTED_CANONICAL_IDENTITY_RANGES.set(patched.utf8, nextRanges);
}

function hasOverlappingRanges(ranges: readonly CanonicalReplacementRange[]): boolean {
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (previous !== undefined && current !== undefined && previous.end > current.start) {
      return true;
    }
  }
  return false;
}

function hasVerifiedClaimReplacementSources(
  snapshot: DocumentSnapshot,
  replacements: readonly ClaimCanonicalReplacement[],
): boolean {
  return replacements.every(
    (replacement) => snapshot.academicGraph.claims[replacement.index] === replacement.previous,
  );
}

function findUniqueOccurrence(haystack: string, needle: string): number | undefined {
  const first = haystack.indexOf(needle);
  if (first < 0 || haystack.includes(needle, first + 1)) {
    return undefined;
  }
  return first;
}

function objectIdentity(value: unknown): object | undefined {
  return value !== null && typeof value === 'object' ? value : undefined;
}

function validateCurrentDocumentHash(
  snapshot: DocumentSnapshot,
  cache: VerifiedDocumentSnapshotCache | undefined,
): Result<void> {
  if (cache !== undefined) {
    return okResult();
  }
  const currentHash = computeDocumentHash(snapshot);
  if (currentHash.type === 'error') {
    return currentHash;
  }
  return currentHash.value.hash === snapshot.documentHash
    ? okResult()
    : errorResult(
        'document-hash-mismatch',
        'The current Snapshot content does not match its declared document hash.',
      );
}

interface StageVerifiedDerivedSnapshotOptions {
  readonly sourceSnapshot: DocumentSnapshot;
  readonly snapshot: DocumentSnapshot;
  readonly verifiedCache: VerifiedDocumentSnapshotCache | undefined;
  readonly sourceIndex: DocumentIndex;
  readonly applied: ReplaceTextApplication;
  readonly rebasedAcademicGraph: RebasedAcademicGraph;
  readonly canonicalDocumentPayload: string;
  readonly canonicalDocumentPayloadUtf8?: TrustedCanonicalUtf8Text;
}

interface StageVerifiedMultipleDerivedSnapshotOptions {
  readonly sourceSnapshot: DocumentSnapshot;
  readonly snapshot: DocumentSnapshot;
  readonly verifiedCache: VerifiedDocumentSnapshotCache | undefined;
  readonly index: DocumentIndex;
  readonly updatedNodes: readonly DocumentNode[];
  readonly rebasedAcademicGraph: RebasedAcademicGraph;
  readonly canonicalDocumentPayload: string;
}

function stageVerifiedMultipleDerivedSnapshot(
  options: StageVerifiedMultipleDerivedSnapshotOptions,
): DocumentSnapshot {
  if (options.verifiedCache === undefined) {
    return options.snapshot;
  }
  const snapshot = freezeDerivedSnapshot(
    options.snapshot,
    options.updatedNodes,
    options.rebasedAcademicGraph.updatedObjects,
  );
  cacheKernelDerivedDocumentSnapshot({
    sourceSnapshot: options.sourceSnapshot,
    snapshot,
    index: options.index,
    canonicalDocumentPayload: options.canonicalDocumentPayload,
    updatedNodes: options.updatedNodes,
    updatedAcademicGraphObjects: options.rebasedAcademicGraph.updatedObjects,
  });
  return snapshot;
}

function stageVerifiedDerivedSnapshot(
  options: StageVerifiedDerivedSnapshotOptions,
): DocumentSnapshot {
  if (options.verifiedCache === undefined) {
    return options.snapshot;
  }
  const snapshot = freezeDerivedSnapshot(
    options.snapshot,
    options.applied.updatedNodes,
    options.rebasedAcademicGraph.updatedObjects,
  );
  const derivedIndex = deriveDocumentIndexWithNodeReplacements(
    options.sourceIndex,
    options.applied.updatedNodes,
  );
  if (derivedIndex !== undefined) {
    cacheKernelDerivedDocumentSnapshot({
      sourceSnapshot: options.sourceSnapshot,
      snapshot,
      index: derivedIndex,
      canonicalDocumentPayload: options.canonicalDocumentPayload,
      ...(options.canonicalDocumentPayloadUtf8 === undefined
        ? {}
        : { canonicalDocumentPayloadUtf8: options.canonicalDocumentPayloadUtf8 }),
      updatedNodes: options.applied.updatedNodes,
      updatedAcademicGraphObjects: options.rebasedAcademicGraph.updatedObjects,
    });
  }
  return snapshot;
}

function freezeDerivedSnapshot(
  snapshot: DocumentSnapshot,
  updatedNodes: readonly DocumentNode[],
  updatedAcademicGraphObjects: readonly object[],
): DocumentSnapshot {
  for (const node of updatedNodes) {
    if ('children' in node) {
      Object.freeze(node.children);
    }
    Object.freeze(node);
  }
  for (const value of updatedAcademicGraphObjects) {
    Object.freeze(value);
  }
  return Object.freeze(snapshot);
}

function computeTransactionHash(transaction: Transaction): Result<CanonicalHashValue> {
  const hashed = hashCanonicalJsonPortable(HASH_DOMAINS.transaction, transaction);
  return hashed.type === 'error'
    ? errorResult(
        'canonical-json-invalid',
        'The Transaction cannot be represented as canonical JSON.',
      )
    : {
        type: 'ok',
        value: {
          hash: hashed.hash,
          canonicalJson: hashed.canonicalJson,
        },
      };
}

function validUtf16Offset(value: number): Utf16Offset {
  const parsed = parseUtf16Offset(value);
  if (parsed.type === 'invalid') {
    throw new RangeError('A ReplaceText inverse offset exceeded the UTF-16 offset profile.');
  }
  return parsed.value;
}

interface ErrorDetails {
  readonly nodeId?: NodeId;
  readonly entityId?: EntityId;
  readonly operationId?: OperationId;
}

type Result<TValue> =
  | {
      readonly type: 'ok';
      readonly value: TValue;
    }
  | {
      readonly type: 'error';
      readonly error: TransactionKernelError;
    };

function okResult(): Result<void> {
  return {
    type: 'ok',
    value: undefined,
  };
}

function errorResult(
  reason: TransactionKernelErrorReason,
  safeMessage: string,
  details: ErrorDetails = {},
): Result<never> {
  return {
    type: 'error',
    error: {
      reason,
      safeMessage,
      ...(details.nodeId === undefined ? {} : { nodeId: details.nodeId }),
      ...(details.entityId === undefined ? {} : { entityId: details.entityId }),
      ...(details.operationId === undefined ? {} : { operationId: details.operationId }),
    },
  };
}
