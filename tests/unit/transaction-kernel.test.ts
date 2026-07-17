import { describe, expect, it } from 'vitest';

import { deepFreeze } from '../../src/base/immutability/deep-freeze.js';
import {
  parseNodeId,
  parseOperationId,
  parseRevisionId,
  parseTransactionId,
  type NodeId,
  type OperationId,
  type RevisionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import { serializeCanonicalJson } from '../../src/base/serialization/canonical-json.js';
import type { DocumentUri } from '../../src/base/uri/resource-uri.js';
import { createDocumentIndex } from '../../src/model/node/document-index.js';
import type { Revision } from '../../src/model/revision/revision.js';
import { MAX_INERT_JSON_DEPTH } from '../../src/model/schema/manuscript-runtime-shapes.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import {
  prepareKernelTransaction,
  TRANSACTION_REPLAY_PROFILE,
} from '../../src/model/transaction/transaction-kernel.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import {
  decodeStrictTransactionV1,
  MAX_TRANSACTION_CANONICAL_UTF8_BYTES,
  MAX_TRANSACTION_JSON_VALUES,
  MAX_TRANSACTION_OPERATIONS,
  MAX_TRANSACTION_PRECONDITIONS,
  MAX_TRANSACTION_TOOL_INVOCATION_IDS,
} from '../../src/model/transaction/transaction-runtime.js';
import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../../src/base/hashing/portable-sha-256.js';
import {
  activateKernelDerivedDocumentSnapshotCache,
  cacheVerifiedFrozenDocumentSnapshot,
  getVerifiedDocumentSnapshotCache,
  retireVerifiedDocumentSnapshotCache,
} from '../../src/model/document-snapshot-cache.js';
import {
  createMinimalSnapshot,
  MINIMAL_FIXTURE_IDS,
  validContentHash,
  validDocumentUri,
  validIsoTimestamp,
  validUtf16Offset,
} from '../test-support/fixtures.js';

const URI = validDocumentUri('nireco://workspace-01/document/kernel');
const REVISION_TWO = productionRevisionId('018f0000-0000-7000-8000-000000000201');
const REVISION_THREE = productionRevisionId('018f0000-0000-7000-8000-000000000202');

describe('prepareKernelTransaction', () => {
  it('applies one immutable ReplaceText operation and produces hash, inverse and PositionMap', () => {
    const snapshot = deepFreeze(createMinimalSnapshot());
    const headRevision = createRevision(URI, snapshot);
    const originalText = readText(snapshot);
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: originalText.length,
      end: originalText.length,
      replacement: ' 🌍',
    });

    const prepared = prepareKernelTransaction({
      transaction,
      headRevision,
      headSnapshot: snapshot,
      nextRevisionId: REVISION_TWO,
    });

    expect(prepared.type).toBe('ok');
    if (prepared.type === 'error') {
      throw new Error(prepared.error.safeMessage);
    }
    expect(readText(prepared.value.snapshot)).toBe(`${originalText} 🌍`);
    expect(prepared.value.snapshot.revisionId).toBe(REVISION_TWO);
    expect(prepared.value.snapshot.documentHash).not.toBe(snapshot.documentHash);
    expect(prepared.value.transactionHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(prepared.value.replayInput).toMatchObject({
      profile: TRANSACTION_REPLAY_PROFILE,
    });
    expect(prepared.value.inverse.operations).toEqual([
      {
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(originalText.length),
        endUtf16Offset: validUtf16Offset(originalText.length + 3),
        replacement: '',
      },
    ]);
    expect(
      prepared.value.positionMap.mapPosition({
        kind: 'text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        utf16Offset: validUtf16Offset(originalText.length),
        affinity: 'after',
      }),
    ).toEqual({
      status: 'mapped',
      position: {
        kind: 'text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        utf16Offset: validUtf16Offset(originalText.length + 3),
        affinity: 'after',
      },
    });

    expect(snapshot.root).not.toBe(prepared.value.snapshot.root);
    expect(snapshot.metadata).toBe(prepared.value.snapshot.metadata);
    expect(snapshot.academicGraph).toBe(prepared.value.snapshot.academicGraph);
    expect(readText(snapshot)).toBe(originalText);
  });

  it('restores the original semantic document hash when the inverse plan is applied', () => {
    const snapshot = createMinimalSnapshot();
    const headRevision = createRevision(URI, snapshot);
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 5,
      replacement: 'Welcome',
    });
    const applied = prepareKernelTransaction({
      transaction,
      headRevision,
      headSnapshot: snapshot,
      nextRevisionId: REVISION_TWO,
    });
    if (applied.type === 'error') {
      throw new Error(applied.error.safeMessage);
    }

    const inversePayload = applied.value.inverse.operations[0];
    const inverse: Transaction = {
      id: productionTransactionId('018f0000-0000-7000-8000-000000000302'),
      target: {
        uri: URI,
        baseRevisionId: REVISION_TWO,
      },
      actor: transaction.actor,
      intent: 'Undo the ReplaceText transaction.',
      operations: [
        {
          id: productionOperationId('018f0000-0000-7000-8000-000000000402'),
          ...inversePayload,
        },
      ],
      preconditions: applied.value.inverse.preconditions,
      metadata: {
        source: 'command',
        ...(transaction.metadata.undoGroupId === undefined
          ? {}
          : { undoGroupId: transaction.metadata.undoGroupId }),
      },
      createdAt: validIsoTimestamp('2026-07-20T00:00:01Z'),
    };
    const reverted = prepareKernelTransaction({
      transaction: inverse,
      headRevision: createRevision(URI, applied.value.snapshot, headRevision.sequence + 1),
      headSnapshot: applied.value.snapshot,
      nextRevisionId: REVISION_THREE,
    });

    expect(reverted.type).toBe('ok');
    if (reverted.type === 'error') {
      throw new Error(reverted.error.safeMessage);
    }
    expect(readText(reverted.value.snapshot)).toBe(readText(snapshot));
    expect(reverted.value.snapshot.documentHash).toBe(snapshot.documentHash);
  });

  it('applies ordered draft offsets and reverses a multi-ReplaceText inverse exactly', () => {
    const snapshot = createMinimalSnapshot();
    const first = createReplaceTextTransaction({
      snapshot,
      start: 7,
      end: 13,
      replacement: 'Kernel runtime',
    });
    const firstOperation = first.operations[0];
    if (firstOperation.type !== 'replace-text') {
      throw new Error('Expected a ReplaceText operation.');
    }
    const transaction: Transaction = {
      ...first,
      operations: [
        firstOperation,
        {
          id: productionOperationId('018f0000-0000-7000-8000-000000000402'),
          type: 'replace-text',
          textNodeId: MINIMAL_FIXTURE_IDS.text,
          // The base text ends at 14; this range exists only after operation one.
          startUtf16Offset: validUtf16Offset(14),
          endUtf16Offset: validUtf16Offset(21),
          replacement: 'replay',
        },
      ],
    };

    const applied = prepareKernelTransaction({
      transaction,
      headRevision: createRevision(URI, snapshot),
      headSnapshot: snapshot,
      nextRevisionId: REVISION_TWO,
    });
    expect(applied.type).toBe('ok');
    if (applied.type === 'error') {
      throw new Error(applied.error.safeMessage);
    }
    expect(readText(applied.value.snapshot)).toBe('Hello, Kernel replay.');
    const forwardHashOracle = hashCanonicalJsonPortable(
      HASH_DOMAINS.documentContent,
      createDocumentHashPayload(applied.value.snapshot),
    );
    expect(forwardHashOracle).toMatchObject({
      type: 'ok',
      hash: applied.value.snapshot.documentHash,
    });
    expect(applied.value.inverse.operations).toEqual([
      {
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(14),
        endUtf16Offset: validUtf16Offset(20),
        replacement: 'runtime',
      },
      {
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(7),
        endUtf16Offset: validUtf16Offset(21),
        replacement: 'Nireco',
      },
    ]);
    expect(
      applied.value.positionMap.mapPosition({
        kind: 'text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        utf16Offset: validUtf16Offset(13),
        affinity: 'after',
      }),
    ).toMatchObject({
      status: 'mapped',
      position: { utf16Offset: validUtf16Offset(20) },
    });

    const [undoSecond, undoFirst] = applied.value.inverse.operations;
    if (undoFirst === undefined) {
      throw new Error('Expected a two-operation inverse plan.');
    }
    const inverse: Transaction = {
      id: productionTransactionId('018f0000-0000-7000-8000-000000000302'),
      target: {
        uri: URI,
        baseRevisionId: REVISION_TWO,
      },
      actor: transaction.actor,
      operations: [
        {
          id: productionOperationId('018f0000-0000-7000-8000-000000000403'),
          ...undoSecond,
        },
        {
          id: productionOperationId('018f0000-0000-7000-8000-000000000404'),
          ...undoFirst,
        },
      ],
      preconditions: applied.value.inverse.preconditions,
      metadata: { source: 'command' },
      createdAt: validIsoTimestamp('2026-07-20T00:00:01Z'),
    };
    const reverted = prepareKernelTransaction({
      transaction: inverse,
      headRevision: createRevision(URI, applied.value.snapshot, 1),
      headSnapshot: applied.value.snapshot,
      nextRevisionId: REVISION_THREE,
    });
    expect(reverted.type).toBe('ok');
    if (reverted.type === 'error') {
      throw new Error(reverted.error.safeMessage);
    }
    expect(readText(reverted.value.snapshot)).toBe(readText(snapshot));
    expect(reverted.value.snapshot.documentHash).toBe(snapshot.documentHash);
  });

  it('stages a deeply frozen full-hash cache for a verified multi-operation result', () => {
    const snapshot = deepFreeze(createMinimalSnapshot());
    let derived: DocumentSnapshot | undefined;
    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(snapshot).type).toBe('ok');
      const seed = createReplaceTextTransaction({
        snapshot,
        start: 14,
        end: 14,
        replacement: ' first',
      });
      const firstOperation = seed.operations[0];
      if (firstOperation.type !== 'replace-text') {
        throw new Error('Expected a ReplaceText operation.');
      }
      const prepared = prepareKernelTransaction({
        transaction: {
          ...seed,
          operations: [
            firstOperation,
            {
              id: productionOperationId('018f0000-0000-7000-8000-000000000407'),
              type: 'replace-text',
              textNodeId: MINIMAL_FIXTURE_IDS.text,
              startUtf16Offset: validUtf16Offset(20),
              endUtf16Offset: validUtf16Offset(20),
              replacement: ' second',
            },
          ],
        },
        headRevision: createRevision(URI, snapshot),
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      });
      if (prepared.type === 'error') {
        throw new Error(prepared.error.safeMessage);
      }
      derived = prepared.value.snapshot;
      expect(Object.isFrozen(derived)).toBe(true);
      expect(Object.isFrozen(derived.root)).toBe(true);
      const indexed = createDocumentIndex(derived);
      if (indexed.type === 'error') {
        throw new Error(indexed.error.safeMessage);
      }
      expect(Object.isFrozen(indexed.value.getNode(MINIMAL_FIXTURE_IDS.text))).toBe(true);
      expect(getVerifiedDocumentSnapshotCache(derived)).toBeUndefined();
      expect(activateKernelDerivedDocumentSnapshotCache(snapshot, derived)).toBe(true);
      expect(getVerifiedDocumentSnapshotCache(derived)?.snapshot).toBe(derived);
    } finally {
      if (derived !== undefined) {
        retireVerifiedDocumentSnapshotCache(derived);
      }
      retireVerifiedDocumentSnapshotCache(snapshot);
    }
  });

  it('leaves the source Snapshot untouched when a later ordered Operation fails', () => {
    const snapshot = deepFreeze(createMinimalSnapshot());
    const originalRoot = snapshot.root;
    const originalHash = snapshot.documentHash;
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 14,
      end: 14,
      replacement: ' draft',
    });
    const firstOperation = transaction.operations[0];
    if (firstOperation.type !== 'replace-text') {
      throw new Error('Expected a ReplaceText operation.');
    }

    const failed = prepareKernelTransaction({
      transaction: {
        ...transaction,
        operations: [
          firstOperation,
          {
            id: productionOperationId('018f0000-0000-7000-8000-000000000405'),
            type: 'replace-text',
            textNodeId: MINIMAL_FIXTURE_IDS.text,
            startUtf16Offset: validUtf16Offset(100),
            endUtf16Offset: validUtf16Offset(100),
            replacement: 'never-applied',
          },
        ],
      },
      headRevision: createRevision(URI, snapshot),
      headSnapshot: snapshot,
      nextRevisionId: REVISION_TWO,
    });

    expect(failed).toMatchObject({
      type: 'error',
      error: {
        reason: 'position-invalid',
        operationId: productionOperationId('018f0000-0000-7000-8000-000000000405'),
      },
    });
    expect(snapshot.root).toBe(originalRoot);
    expect(snapshot.documentHash).toBe(originalHash);
    expect(readText(snapshot)).toBe('Hello, Nireco.');
  });

  it('keeps heterogeneous ordered Transactions typed as capability-unsupported', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const operationId = productionOperationId('018f0000-0000-7000-8000-000000000406');

    expect(
      prepareKernelTransaction({
        transaction: {
          ...transaction,
          operations: [
            transaction.operations[0],
            {
              id: operationId,
              type: 'set-node-attributes',
              nodeId: MINIMAL_FIXTURE_IDS.paragraph,
              attributes: { alignment: 'center' },
            },
          ],
        },
        headRevision: createRevision(URI, snapshot),
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'operation-unsupported',
        operationId,
      },
    });
  });

  it('fails closed on stale bases and document-hash precondition mismatches', () => {
    const snapshot = createMinimalSnapshot();
    const headRevision = createRevision(URI, snapshot);
    const stale = createReplaceTextTransaction({
      snapshot,
      baseRevisionId: REVISION_TWO,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const mismatchedHash = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
      documentHash: validContentHash(
        'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      ),
    });

    expect(
      prepareKernelTransaction({
        transaction: stale,
        headRevision,
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'base-revision-mismatch',
      },
    });
    expect(
      prepareKernelTransaction({
        transaction: mismatchedHash,
        headRevision,
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'document-hash-precondition-failed',
      },
    });
    expect(readText(snapshot)).toBe('Hello, Nireco.');
  });

  it('satisfies entity-exists preconditions for metadata Author Entity IDs', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });

    expect(
      prepareKernelTransaction({
        transaction: {
          ...transaction,
          preconditions: [
            ...transaction.preconditions,
            {
              kind: 'entity-exists',
              entityId: MINIMAL_FIXTURE_IDS.author,
            },
          ],
        },
        headRevision: createRevision(URI, snapshot),
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({ type: 'ok' });
  });

  it('rejects a missing target and unsupported operation before producing a Snapshot', () => {
    const snapshot = createMinimalSnapshot();
    const headRevision = createRevision(URI, snapshot);
    const missing = createReplaceTextTransaction({
      snapshot,
      textNodeId: productionNodeId('018f0000-0000-7000-8000-000000000999'),
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const unsupported: Transaction = {
      ...createReplaceTextTransaction({
        snapshot,
        start: 0,
        end: 0,
        replacement: 'x',
      }),
      operations: [
        {
          id: productionOperationId('018f0000-0000-7000-8000-000000000499'),
          type: 'set-node-attributes',
          nodeId: MINIMAL_FIXTURE_IDS.paragraph,
          attributes: {
            alignment: 'center',
          },
        },
      ],
    };

    expect(
      prepareKernelTransaction({
        transaction: missing,
        headRevision,
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'node-precondition-failed',
      },
    });
    expect(
      prepareKernelTransaction({
        transaction: unsupported,
        headRevision,
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'operation-unsupported',
      },
    });
  });

  it('distinguishes invalid offsets from malformed boundary strings', () => {
    const snapshot = withText(createMinimalSnapshot(), 'A🌍B');
    const headRevision = createRevision(URI, snapshot);
    const midpoint = createReplaceTextTransaction({
      snapshot,
      start: 2,
      end: 2,
      replacement: 'x',
    });
    const malformed = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: '\ud800',
    });

    expect(
      prepareKernelTransaction({
        transaction: midpoint,
        headRevision,
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'position-invalid',
      },
    });
    expect(
      prepareKernelTransaction({
        transaction: malformed,
        headRevision,
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'transaction-invalid',
      },
    });
  });

  it('rejects a corrupted head Snapshot before checking the Operation', () => {
    const snapshot = createMinimalSnapshot();
    const corrupted: DocumentSnapshot = {
      ...snapshot,
      documentHash: validContentHash(
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    };

    expect(
      prepareKernelTransaction({
        transaction: createReplaceTextTransaction({
          snapshot: corrupted,
          start: 0,
          end: 0,
          replacement: 'x',
        }),
        headRevision: createRevision(URI, corrupted),
        headSnapshot: corrupted,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'document-hash-mismatch',
      },
    });
  });

  it('fully revalidates frozen but unregistered Snapshot content', () => {
    const original = createMinimalSnapshot();
    const contentDrifted = deepFreeze<DocumentSnapshot>({
      ...withText(original, 'Content changed behind the declared hash.'),
      documentHash: original.documentHash,
    });

    expect(
      prepareKernelTransaction({
        transaction: createReplaceTextTransaction({
          snapshot: contentDrifted,
          start: 0,
          end: 0,
          replacement: 'x',
        }),
        headRevision: createRevision(URI, contentDrifted),
        headSnapshot: contentDrifted,
        nextRevisionId: REVISION_TWO,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'document-hash-mismatch',
      },
    });
  });

  it('returns a typed error for malformed runtime values without throwing', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const operation = transaction.operations[0];
    const getterOperations: unknown[] = [];
    Object.defineProperty(getterOperations, '0', {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('The runtime decoder must not invoke array accessors.');
      },
    });
    let prototypeMapInvoked = false;
    const prototypeTamperedOperations = [operation];
    Object.setPrototypeOf(prototypeTamperedOperations, {
      map() {
        prototypeMapInvoked = true;
        throw new Error('The runtime decoder must not invoke prototype-tampered array methods.');
      },
    });
    const throwingProxy = new Proxy(transaction, {
      getPrototypeOf() {
        throw new Error('The runtime decoder must contain hostile Proxy traps.');
      },
    });
    const candidates: readonly unknown[] = [
      {
        ...transaction,
        operations: [
          {
            ...operation,
            replacement: 7,
          },
        ],
      },
      {
        ...transaction,
        operations: getterOperations,
      },
      {
        ...transaction,
        operations: prototypeTamperedOperations,
      },
      throwingProxy,
    ];

    for (const candidate of candidates) {
      expect(() => decodeStrictTransactionV1(candidate)).not.toThrow();
      expect(decodeStrictTransactionV1(candidate)).toMatchObject({
        type: 'error',
        error: {
          reason: 'transaction-invalid',
        },
      });
    }
    expect(prototypeMapInvoked).toBe(false);

    const prepareMalformed = () =>
      prepareKernelTransaction({
        transaction: candidates[0] as Transaction,
        headRevision: createRevision(URI, snapshot),
        headSnapshot: snapshot,
        nextRevisionId: REVISION_TWO,
      });
    expect(prepareMalformed).not.toThrow();
    expect(prepareMalformed()).toMatchObject({
      type: 'error',
      error: {
        reason: 'transaction-invalid',
      },
    });
  });

  it('fails closed on unknown V1 fields and duplicate Operation IDs', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const operation = transaction.operations[0];
    const candidates: readonly unknown[] = [
      {
        ...transaction,
        futureTransactionField: true,
      },
      {
        ...transaction,
        operations: [
          {
            ...operation,
            futureOperationField: true,
          },
        ],
      },
      {
        ...transaction,
        operations: [operation, { ...operation }],
      },
    ];

    for (const candidate of candidates) {
      expect(decodeStrictTransactionV1(candidate)).toMatchObject({
        type: 'error',
        error: {
          reason: 'transaction-invalid',
        },
      });
      expect(
        prepareKernelTransaction({
          transaction: candidate as Transaction,
          headRevision: createRevision(URI, snapshot),
          headSnapshot: snapshot,
          nextRevisionId: REVISION_TWO,
        }),
      ).toMatchObject({
        type: 'error',
        error: {
          reason: 'transaction-invalid',
        },
      });
    }
  });

  it('bounds Tool Invocation IDs and rejects oversized metadata before enumerating it', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const atLimit = {
      ...transaction,
      metadata: {
        ...transaction.metadata,
        toolInvocationIds: Array.from(
          { length: MAX_TRANSACTION_TOOL_INVOCATION_IDS },
          (_, index) => `tool-${index}`,
        ),
      },
    };
    expect(decodeStrictTransactionV1(atLimit).type).toBe('ok');

    let ownKeysInvoked = false;
    const oversizedIds = new Proxy(new Array(MAX_TRANSACTION_TOOL_INVOCATION_IDS + 1), {
      ownKeys(target) {
        ownKeysInvoked = true;
        return Reflect.ownKeys(target);
      },
    });
    const oversized = {
      ...transaction,
      metadata: {
        ...transaction.metadata,
        toolInvocationIds: oversizedIds,
      },
    };
    expect(decodeStrictTransactionV1(oversized)).toMatchObject({
      type: 'error',
      error: {
        reason: 'transaction-too-large',
      },
    });
    expect(ownKeysInvoked).toBe(false);

    expect(
      decodeStrictTransactionV1({
        ...transaction,
        metadata: {
          ...transaction.metadata,
          toolInvocationIds: ['tool-1', 'tool-1'],
        },
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'transaction-invalid',
      },
    });
  });

  it('rejects oversized Transaction bytes and collections before normalization', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const operation = transaction.operations[0];
    const oversizedJsonArray = new Array(MAX_TRANSACTION_JSON_VALUES);
    let oversizedJsonOwnKeysInvoked = false;
    const guardedOversizedJsonArray = new Proxy(oversizedJsonArray, {
      ownKeys(target) {
        oversizedJsonOwnKeysInvoked = true;
        return Reflect.ownKeys(target);
      },
    });

    const candidates: readonly unknown[] = [
      {
        ...transaction,
        operations: [
          {
            ...operation,
            replacement: 'x'.repeat(MAX_TRANSACTION_CANONICAL_UTF8_BYTES),
          },
        ],
      },
      {
        ...transaction,
        operations: new Array(MAX_TRANSACTION_OPERATIONS + 1).fill(operation),
      },
      {
        ...transaction,
        preconditions: new Array(MAX_TRANSACTION_PRECONDITIONS + 1).fill(
          transaction.preconditions[0],
        ),
      },
      {
        ...transaction,
        operations: [
          {
            ...operation,
            type: 'set-node-attributes',
            nodeId: MINIMAL_FIXTURE_IDS.paragraph,
            attributes: {
              items: guardedOversizedJsonArray,
            },
          },
        ],
      },
    ];

    for (const candidate of candidates) {
      expect(decodeStrictTransactionV1(candidate)).toMatchObject({
        type: 'error',
        error: {
          reason: 'transaction-too-large',
        },
      });
    }
    expect(oversizedJsonOwnKeysInvoked).toBe(false);
  });

  it('captures descriptor values once so a Proxy cannot change the decoded size', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const operation = transaction.operations[0];
    let propertyReads = 0;
    const shiftingOperation = new Proxy(operation, {
      get() {
        propertyReads += 1;
        return 'x'.repeat(MAX_TRANSACTION_CANONICAL_UTF8_BYTES);
      },
    });

    const decoded = decodeStrictTransactionV1({
      ...transaction,
      operations: [shiftingOperation],
    });

    expect(decoded.type).toBe('ok');
    if (decoded.type === 'error') {
      throw new Error(decoded.error.safeMessage);
    }
    expect(decoded.value.operations[0].type).toBe('replace-text');
    expect(
      decoded.value.operations[0].type === 'replace-text'
        ? decoded.value.operations[0].replacement
        : undefined,
    ).toBe('x');
    expect(propertyReads).toBe(0);
    const serialized = serializeCanonicalJson(decoded.value);
    expect(serialized.type).toBe('ok');
    if (serialized.type === 'ok') {
      expect(new TextEncoder().encode(serialized.value).byteLength).toBeLessThanOrEqual(
        MAX_TRANSACTION_CANONICAL_UTF8_BYTES,
      );
    }
  });

  it('preserves an inert own __proto__ JSON key without prototype mutation', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const attributes: unknown = JSON.parse('{"ok":1,"__proto__":{"polluted":true}}');
    const decoded = decodeStrictTransactionV1({
      ...transaction,
      operations: [
        {
          id: productionOperationId('018f0000-0000-7000-8000-000000000413'),
          type: 'set-node-attributes',
          nodeId: MINIMAL_FIXTURE_IDS.paragraph,
          attributes,
        },
      ],
    });

    expect(decoded.type).toBe('ok');
    if (decoded.type === 'error') {
      throw new Error(decoded.error.safeMessage);
    }
    const operation = decoded.value.operations[0];
    if (operation.type !== 'set-node-attributes') {
      throw new Error('Expected a SetNodeAttributes operation.');
    }
    expect(Reflect.getPrototypeOf(operation.attributes)).toBeNull();
    expect(Object.hasOwn(operation.attributes, '__proto__')).toBe(true);
    expect(operation.attributes['__proto__']).toEqual({ polluted: true });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('accepts exactly the canonical UTF-8 byte limit and rejects the next byte', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: '',
    });
    const serialized = serializeCanonicalJson(transaction);
    if (serialized.type === 'error') {
      throw new Error('Expected the byte-boundary Transaction to be canonical JSON.');
    }
    const baseBytes = new TextEncoder().encode(serialized.value).byteLength;
    const replacementLength = MAX_TRANSACTION_CANONICAL_UTF8_BYTES - baseBytes;
    const operation = transaction.operations[0];
    const atLimit = {
      ...transaction,
      operations: [
        {
          ...operation,
          replacement: 'x'.repeat(replacementLength),
        },
      ],
    };

    expect(decodeStrictTransactionV1(atLimit).type).toBe('ok');
    expect(
      decodeStrictTransactionV1({
        ...atLimit,
        operations: [
          {
            ...atLimit.operations[0],
            replacement: `${atLimit.operations[0]?.replacement}x`,
          },
        ],
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'transaction-too-large',
      },
    });
  });

  it('bounds open operation JSON without overflowing the runtime decoder', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const createCandidate = (depth: number): unknown => ({
      ...transaction,
      operations: [
        {
          id: productionOperationId('018f0000-0000-7000-8000-000000000412'),
          type: 'set-node-attributes',
          nodeId: MINIMAL_FIXTURE_IDS.paragraph,
          attributes: createNestedJsonObject(depth),
        },
      ],
    });

    expect(decodeStrictTransactionV1(createCandidate(MAX_INERT_JSON_DEPTH)).type).toBe('ok');
    for (const candidate of [createCandidate(MAX_INERT_JSON_DEPTH + 1), createCandidate(5_000)]) {
      expect(() => decodeStrictTransactionV1(candidate)).not.toThrow();
      expect(decodeStrictTransactionV1(candidate)).toMatchObject({
        type: 'error',
        error: {
          reason: 'transaction-invalid',
        },
      });
    }
  });

  it('deeply rejects malformed InsertNode and AcademicEntity payloads during V1 decode', () => {
    const snapshot = createMinimalSnapshot();
    const transaction = createReplaceTextTransaction({
      snapshot,
      start: 0,
      end: 0,
      replacement: 'x',
    });
    const validInsertOperation = {
      id: productionOperationId('018f0000-0000-7000-8000-000000000410'),
      type: 'insert-node',
      parentNodeId: MINIMAL_FIXTURE_IDS.body,
      childIndex: 1,
      node: {
        id: productionNodeId('018f0000-0000-7000-8000-000000000510'),
        type: 'paragraph',
        attrs: {
          alignment: 'start',
        },
        children: [],
      },
    };
    const validAcademicOperation = {
      id: productionOperationId('018f0000-0000-7000-8000-000000000411'),
      type: 'create-academic-entity',
      entity: {
        id: MINIMAL_FIXTURE_IDS.reference,
        cslJson: {
          title: 'A reference',
        },
        metadataHash: validContentHash(
          'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ),
        capturedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
      },
    };
    const malformedOperations: readonly unknown[] = [
      {
        ...validInsertOperation,
        node: {
          ...validInsertOperation.node,
          children: [
            {
              id: productionNodeId('018f0000-0000-7000-8000-000000000511'),
              type: 'text',
              value: 42,
              marks: [],
            },
          ],
        },
      },
      {
        ...validAcademicOperation,
        entity: {
          id: MINIMAL_FIXTURE_IDS.reference,
        },
      },
    ];

    for (const operation of malformedOperations) {
      const candidate = {
        ...transaction,
        operations: [operation],
      };
      const runtimeCandidate: unknown = candidate;
      expect(decodeStrictTransactionV1(candidate)).toMatchObject({
        type: 'error',
        error: {
          reason: 'transaction-invalid',
        },
      });
      expect(
        prepareKernelTransaction({
          transaction: runtimeCandidate as Transaction,
          headRevision: createRevision(URI, snapshot),
          headSnapshot: snapshot,
          nextRevisionId: REVISION_TWO,
        }),
      ).toMatchObject({
        type: 'error',
        error: {
          reason: 'transaction-invalid',
        },
      });
    }

    for (const operation of [validInsertOperation, validAcademicOperation]) {
      const candidate = {
        ...transaction,
        operations: [operation],
      };
      const runtimeCandidate: unknown = candidate;
      expect(decodeStrictTransactionV1(candidate).type).toBe('ok');
      expect(
        prepareKernelTransaction({
          transaction: runtimeCandidate as Transaction,
          headRevision: createRevision(URI, snapshot),
          headSnapshot: snapshot,
          nextRevisionId: REVISION_TWO,
        }),
      ).toMatchObject({
        type: 'error',
        error: {
          reason: 'operation-unsupported',
        },
      });
    }
  });

  it('rejects reuse of the head Revision ID as the next Revision identity', () => {
    const snapshot = createMinimalSnapshot();

    expect(
      prepareKernelTransaction({
        transaction: createReplaceTextTransaction({
          snapshot,
          start: 0,
          end: 0,
          replacement: 'x',
        }),
        headRevision: createRevision(URI, snapshot),
        headSnapshot: snapshot,
        nextRevisionId: snapshot.revisionId,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        reason: 'next-revision-conflict',
      },
    });
  });
});

interface ReplaceTextTransactionOptions {
  readonly snapshot: DocumentSnapshot;
  readonly baseRevisionId?: RevisionId;
  readonly textNodeId?: NodeId;
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
  readonly documentHash?: DocumentSnapshot['documentHash'];
}

function createReplaceTextTransaction(options: ReplaceTextTransactionOptions): Transaction {
  return {
    id: productionTransactionId('018f0000-0000-7000-8000-000000000301'),
    target: {
      uri: URI,
      baseRevisionId: options.baseRevisionId ?? options.snapshot.revisionId,
    },
    actor: {
      type: 'human',
      id: 'human-1',
    },
    operations: [
      {
        id: productionOperationId('018f0000-0000-7000-8000-000000000401'),
        type: 'replace-text',
        textNodeId: options.textNodeId ?? MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(options.start),
        endUtf16Offset: validUtf16Offset(options.end),
        replacement: options.replacement,
      },
    ],
    preconditions: [
      {
        kind: 'node-exists',
        nodeId: options.textNodeId ?? MINIMAL_FIXTURE_IDS.text,
      },
      {
        kind: 'schema-version',
        expected: options.snapshot.schemaVersion,
      },
      {
        kind: 'document-hash',
        expected: options.documentHash ?? options.snapshot.documentHash,
      },
    ],
    metadata: {
      source: 'human-input',
      undoGroupId: 'typing-1',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

function createRevision(uri: DocumentUri, snapshot: DocumentSnapshot, sequence = 0): Revision {
  return {
    id: snapshot.revisionId,
    uri,
    parentRevisionId: null,
    transactionId: productionTransactionId('018f0000-0000-7000-8000-000000000300'),
    sequence,
    documentHash: snapshot.documentHash,
    actor: {
      type: 'system',
      id: 'recovery',
      role: 'recovery',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
    durability: 'snapshot',
  };
}

function readText(snapshot: DocumentSnapshot): string {
  const indexed = createDocumentIndex(snapshot);
  if (indexed.type === 'error') {
    throw new Error(indexed.error.safeMessage);
  }
  const node = indexed.value.getNode(MINIMAL_FIXTURE_IDS.text);
  if (node?.type !== 'text') {
    throw new Error('Expected the minimal fixture TextNode.');
  }
  return node.value;
}

function withText(snapshot: DocumentSnapshot, value: string): DocumentSnapshot {
  if (snapshot.root.children.length !== 3) {
    throw new Error('Expected the minimal fixture three-part root.');
  }
  const frontMatter = snapshot.root.children[0];
  const body = snapshot.root.children[1];
  const bibliography = snapshot.root.children[2];
  const paragraph = body.children[0];
  if (paragraph.type !== 'paragraph') {
    throw new Error('Expected the minimal fixture ParagraphNode.');
  }
  const text = paragraph.children[0];
  if (text?.type !== 'text') {
    throw new Error('Expected the minimal fixture TextNode.');
  }
  const pending: DocumentSnapshot = {
    ...snapshot,
    root: {
      ...snapshot.root,
      children: [
        frontMatter,
        {
          ...body,
          children: [
            {
              ...paragraph,
              children: [
                {
                  ...text,
                  value,
                },
              ],
            },
          ],
        },
        bibliography,
      ],
    },
  };
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(pending),
  );
  if (hashed.type === 'error') {
    throw new Error('Expected the text fixture to be canonical JSON.');
  }
  return {
    ...pending,
    documentHash: hashed.hash,
  };
}

function createNestedJsonObject(deepestDepth: number): unknown {
  let value: unknown = {};
  for (let depth = 0; depth < deepestDepth; depth += 1) {
    value = {
      nested: value,
    };
  }
  return value;
}

function productionRevisionId(value: string): RevisionId {
  const parsed = parseRevisionId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a production UUIDv7 Revision ID.');
  }
  return parsed.value;
}

function productionTransactionId(value: string): TransactionId {
  const parsed = parseTransactionId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a production UUIDv7 Transaction ID.');
  }
  return parsed.value;
}

function productionOperationId(value: string): OperationId {
  const parsed = parseOperationId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a production UUIDv7 Operation ID.');
  }
  return parsed.value;
}

function productionNodeId(value: string): NodeId {
  const parsed = parseNodeId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a production UUIDv7 Node ID.');
  }
  return parsed.value;
}
