import { describe, expect, it } from 'vitest';

import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../../src/base/hashing/portable-sha-256.js';
import { deepFreeze } from '../../src/base/immutability/deep-freeze.js';
import {
  parseOperationId,
  parseRevisionId,
  parseTransactionId,
  type OperationId,
  type RevisionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import type { DocumentUri } from '../../src/base/uri/resource-uri.js';
import {
  activateKernelDerivedDocumentSnapshotCache,
  cacheVerifiedFrozenDocumentSnapshot,
  getDocumentSnapshotCacheDiagnostics,
  getVerifiedDocumentSnapshotCache,
  retireVerifiedDocumentSnapshotCache,
} from '../../src/model/document-snapshot-cache.js';
import { createDocumentIndex } from '../../src/model/node/document-index.js';
import type { TextNode } from '../../src/model/node/manuscript-node.js';
import type { Revision } from '../../src/model/revision/revision.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import { prepareKernelTransaction } from '../../src/model/transaction/transaction-kernel.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import {
  createMinimalSnapshot,
  MINIMAL_FIXTURE_IDS,
  validContentHash,
  validDocumentUri,
  validIsoTimestamp,
  validUtf16Offset,
} from '../test-support/fixtures.js';

const URI = validDocumentUri('nireco://workspace-01/document/snapshot-cache');

describe('verified frozen DocumentSnapshot cache', () => {
  it('rejects mutable and hash-drifted inputs without polluting the identity cache', () => {
    const mutable = createMinimalSnapshot();
    expect(cacheVerifiedFrozenDocumentSnapshot(mutable)).toMatchObject({
      type: 'error',
      error: {
        reason: 'snapshot-mutable',
      },
    });
    expect(getVerifiedDocumentSnapshotCache(mutable)).toBeUndefined();

    const hashDrifted = deepFreeze<DocumentSnapshot>({
      ...createMinimalSnapshot(),
      metadata: {
        ...mutable.metadata,
        title: 'Content changed without recomputing the hash',
      },
    });
    expect(cacheVerifiedFrozenDocumentSnapshot(hashDrifted)).toMatchObject({
      type: 'error',
      error: {
        reason: 'document-hash-mismatch',
      },
    });
    expect(getVerifiedDocumentSnapshotCache(hashDrifted)).toBeUndefined();
  });

  it('trusts only the exact verified frozen object identity', () => {
    const snapshot = deepFreeze(createMinimalSnapshot());
    const structurallyEqualClone = deepFreeze<DocumentSnapshot>({
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
      },
    });

    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(snapshot)).toEqual({
        type: 'ok',
        value: snapshot,
      });
      expect(getVerifiedDocumentSnapshotCache(snapshot)?.snapshot).toBe(snapshot);
      expect(getVerifiedDocumentSnapshotCache(structurallyEqualClone)).toBeUndefined();

      const prepared = prepareKernelTransaction({
        transaction: createReplaceTextTransaction(structurallyEqualClone, 0),
        headRevision: createRevision(URI, structurallyEqualClone, 0),
        headSnapshot: structurallyEqualClone,
        nextRevisionId: productionRevisionId(201),
      });
      expect(prepared.type).toBe('ok');
      if (prepared.type === 'ok') {
        expect(getVerifiedDocumentSnapshotCache(prepared.value.snapshot)).toBeUndefined();
      }
    } finally {
      retireVerifiedDocumentSnapshotCache(snapshot);
      retireVerifiedDocumentSnapshotCache(structurallyEqualClone);
    }
  });

  it('retires every superseded canonical payload across a multi-revision chain', () => {
    const baseline = getDocumentSnapshotCacheDiagnostics();
    let head = deepFreeze(createMinimalSnapshot());
    const historicalSnapshots: DocumentSnapshot[] = [];
    let initialCanonicalLength = 0;

    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(head).type).toBe('ok');
      initialCanonicalLength =
        getVerifiedDocumentSnapshotCache(head)?.canonicalDocumentPayload.length ?? 0;
      expect(initialCanonicalLength).toBeGreaterThan(0);

      for (let sequence = 0; sequence < 12; sequence += 1) {
        const previous = head;
        const prepared = prepareKernelTransaction({
          transaction: createReplaceTextTransaction(previous, sequence),
          headRevision: createRevision(URI, previous, sequence),
          headSnapshot: previous,
          nextRevisionId: productionRevisionId(201 + sequence),
        });
        expect(prepared.type).toBe('ok');
        if (prepared.type === 'error') {
          throw new Error(prepared.error.safeMessage);
        }
        expect(getVerifiedDocumentSnapshotCache(previous)?.snapshot).toBe(previous);
        expect(getVerifiedDocumentSnapshotCache(prepared.value.snapshot)).toBeUndefined();
        expect(getDocumentSnapshotCacheDiagnostics().activeEntryCount).toBe(
          baseline.activeEntryCount + 1,
        );
        expect(activateKernelDerivedDocumentSnapshotCache(previous, prepared.value.snapshot)).toBe(
          true,
        );
        historicalSnapshots.push(previous);
        head = prepared.value.snapshot;

        expect(getVerifiedDocumentSnapshotCache(previous)).toBeUndefined();
        expect(getVerifiedDocumentSnapshotCache(head)?.snapshot).toBe(head);
        expect(getDocumentSnapshotCacheDiagnostics()).toEqual({
          activeEntryCount: baseline.activeEntryCount + 1,
          retainedCanonicalPayloadCodeUnits:
            baseline.retainedCanonicalPayloadCodeUnits + initialCanonicalLength + sequence + 1,
        });
      }

      for (const historical of historicalSnapshots) {
        expect(getVerifiedDocumentSnapshotCache(historical)).toBeUndefined();
      }
    } finally {
      retireVerifiedDocumentSnapshotCache(head);
    }

    expect(getDocumentSnapshotCacheDiagnostics()).toEqual(baseline);
  });

  it('falls back to a full document hash when the old TextNode canonical form is non-unique', () => {
    const snapshot = deepFreeze(withDuplicateCanonicalTextNode(createMinimalSnapshot()));

    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(snapshot).type).toBe('ok');
      const prepared = prepareKernelTransaction({
        transaction: createReplaceTextTransaction(snapshot, 0),
        headRevision: createRevision(URI, snapshot, 0),
        headSnapshot: snapshot,
        nextRevisionId: productionRevisionId(201),
      });
      expect(prepared.type).toBe('ok');
      if (prepared.type === 'error') {
        throw new Error(prepared.error.safeMessage);
      }
      expect(activateKernelDerivedDocumentSnapshotCache(snapshot, prepared.value.snapshot)).toBe(
        true,
      );

      const oracle = hashCanonicalJsonPortable(
        HASH_DOMAINS.documentContent,
        createDocumentHashPayload(prepared.value.snapshot),
      );
      expect(oracle.type).toBe('ok');
      if (oracle.type === 'ok') {
        expect(prepared.value.snapshot.documentHash).toBe(oracle.hash);
        expect(
          getVerifiedDocumentSnapshotCache(prepared.value.snapshot)?.canonicalDocumentPayload,
        ).toBe(oracle.canonicalJson);
      }
      retireVerifiedDocumentSnapshotCache(prepared.value.snapshot);
    } finally {
      retireVerifiedDocumentSnapshotCache(snapshot);
    }
  });

  it('rebases Claim anchors through consecutive committed fast-path revisions', () => {
    let head = deepFreeze(withClaimAtOffset(createMinimalSnapshot(), 5));

    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(head).type).toBe('ok');
      for (let sequence = 0; sequence < 2; sequence += 1) {
        const previous = head;
        const nextRevisionId = productionRevisionId(201 + sequence);
        const prepared = prepareKernelTransaction({
          transaction: createReplaceTextTransaction(previous, sequence),
          headRevision: createRevision(URI, previous, sequence),
          headSnapshot: previous,
          nextRevisionId,
        });
        expect(prepared.type).toBe('ok');
        if (prepared.type === 'error') {
          throw new Error(prepared.error.safeMessage);
        }

        const oracle = hashCanonicalJsonPortable(
          HASH_DOMAINS.documentContent,
          createDocumentHashPayload(prepared.value.snapshot),
        );
        expect(oracle.type).toBe('ok');
        expect(activateKernelDerivedDocumentSnapshotCache(previous, prepared.value.snapshot)).toBe(
          true,
        );
        head = prepared.value.snapshot;

        const claim = head.academicGraph.claims[0];
        expect(claim?.anchor.document.revisionId).toBe(nextRevisionId);
        expect(claim?.anchor.primary).toMatchObject({
          kind: 'text',
          utf16Offset: 6 + sequence,
        });
        expect(createDocumentIndex(head).type).toBe('ok');
        if (oracle.type === 'ok') {
          expect(head.documentHash).toBe(oracle.hash);
          expect(getVerifiedDocumentSnapshotCache(head)?.canonicalDocumentPayload).toBe(
            oracle.canonicalJson,
          );
        }
      }
    } finally {
      retireVerifiedDocumentSnapshotCache(head);
    }
  });

  it('keeps the committed head cache active when Claim mapping rejects a prepare', () => {
    const snapshot = deepFreeze(withClaimAtOffset(createMinimalSnapshot(), 5));
    const baseline = getDocumentSnapshotCacheDiagnostics();

    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(snapshot).type).toBe('ok');
      const cached = getDocumentSnapshotCacheDiagnostics();
      const prepared = prepareKernelTransaction({
        transaction: createReplaceTextTransaction(snapshot, 0, {
          start: 0,
          end: 10,
          replacement: '',
        }),
        headRevision: createRevision(URI, snapshot, 0),
        headSnapshot: snapshot,
        nextRevisionId: productionRevisionId(201),
      });

      expect(prepared).toMatchObject({
        type: 'error',
        error: {
          reason: 'claim-anchor-mapping-failed',
          entityId: MINIMAL_FIXTURE_IDS.reference,
        },
      });
      expect(getVerifiedDocumentSnapshotCache(snapshot)?.snapshot).toBe(snapshot);
      expect(getDocumentSnapshotCacheDiagnostics()).toEqual(cached);
    } finally {
      retireVerifiedDocumentSnapshotCache(snapshot);
    }
    expect(getDocumentSnapshotCacheDiagnostics()).toEqual(baseline);
  });

  it('binds a provisional cache promotion to its exact verified source head', () => {
    const source = deepFreeze(createMinimalSnapshot());
    const unrelatedHead = deepFreeze(createMinimalSnapshot(productionRevisionId(250)));
    let resultSnapshot: DocumentSnapshot | undefined;

    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(source).type).toBe('ok');
      expect(cacheVerifiedFrozenDocumentSnapshot(unrelatedHead).type).toBe('ok');
      const prepared = prepareKernelTransaction({
        transaction: createReplaceTextTransaction(source, 0),
        headRevision: createRevision(URI, source, 0),
        headSnapshot: source,
        nextRevisionId: productionRevisionId(201),
      });
      expect(prepared.type).toBe('ok');
      if (prepared.type === 'error') {
        throw new Error(prepared.error.safeMessage);
      }
      resultSnapshot = prepared.value.snapshot;

      expect(activateKernelDerivedDocumentSnapshotCache(unrelatedHead, resultSnapshot)).toBe(false);
      expect(getVerifiedDocumentSnapshotCache(source)?.snapshot).toBe(source);
      expect(getVerifiedDocumentSnapshotCache(unrelatedHead)?.snapshot).toBe(unrelatedHead);
      expect(getVerifiedDocumentSnapshotCache(resultSnapshot)).toBeUndefined();
      expect(activateKernelDerivedDocumentSnapshotCache(source, resultSnapshot)).toBe(true);
    } finally {
      retireVerifiedDocumentSnapshotCache(source);
      retireVerifiedDocumentSnapshotCache(unrelatedHead);
      if (resultSnapshot !== undefined) {
        retireVerifiedDocumentSnapshotCache(resultSnapshot);
      }
    }
  });

  it('retains at most one provisional derived cache per verified source head', () => {
    const source = deepFreeze(createMinimalSnapshot());
    let firstSnapshot: DocumentSnapshot | undefined;
    let secondSnapshot: DocumentSnapshot | undefined;

    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(source).type).toBe('ok');
      const first = prepareKernelTransaction({
        transaction: createReplaceTextTransaction(source, 0),
        headRevision: createRevision(URI, source, 0),
        headSnapshot: source,
        nextRevisionId: productionRevisionId(201),
      });
      const second = prepareKernelTransaction({
        transaction: createReplaceTextTransaction(source, 1),
        headRevision: createRevision(URI, source, 0),
        headSnapshot: source,
        nextRevisionId: productionRevisionId(202),
      });
      expect(first.type).toBe('ok');
      expect(second.type).toBe('ok');
      if (first.type === 'error' || second.type === 'error') {
        throw new Error('Expected both competing prepares to succeed.');
      }
      firstSnapshot = first.value.snapshot;
      secondSnapshot = second.value.snapshot;

      expect(activateKernelDerivedDocumentSnapshotCache(source, firstSnapshot)).toBe(false);
      expect(getVerifiedDocumentSnapshotCache(source)?.snapshot).toBe(source);
      expect(activateKernelDerivedDocumentSnapshotCache(source, secondSnapshot)).toBe(true);
      expect(getVerifiedDocumentSnapshotCache(source)).toBeUndefined();
      expect(getVerifiedDocumentSnapshotCache(secondSnapshot)?.snapshot).toBe(secondSnapshot);
    } finally {
      retireVerifiedDocumentSnapshotCache(source);
      if (firstSnapshot !== undefined) {
        retireVerifiedDocumentSnapshotCache(firstSnapshot);
      }
      if (secondSnapshot !== undefined) {
        retireVerifiedDocumentSnapshotCache(secondSnapshot);
      }
    }
  });

  it('invalidates a provisional derived cache when its source head is retired', () => {
    const source = deepFreeze(createMinimalSnapshot());
    let derivedSnapshot: DocumentSnapshot | undefined;

    try {
      expect(cacheVerifiedFrozenDocumentSnapshot(source).type).toBe('ok');
      const prepared = prepareKernelTransaction({
        transaction: createReplaceTextTransaction(source, 0),
        headRevision: createRevision(URI, source, 0),
        headSnapshot: source,
        nextRevisionId: productionRevisionId(201),
      });
      expect(prepared.type).toBe('ok');
      if (prepared.type === 'error') {
        throw new Error(prepared.error.safeMessage);
      }
      derivedSnapshot = prepared.value.snapshot;

      expect(retireVerifiedDocumentSnapshotCache(source)).toBe(true);
      expect(activateKernelDerivedDocumentSnapshotCache(source, derivedSnapshot)).toBe(false);
      expect(getVerifiedDocumentSnapshotCache(derivedSnapshot)).toBeUndefined();
    } finally {
      retireVerifiedDocumentSnapshotCache(source);
      if (derivedSnapshot !== undefined) {
        retireVerifiedDocumentSnapshotCache(derivedSnapshot);
      }
    }
  });
});

interface ReplaceTextTestEdit {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

function createReplaceTextTransaction(
  snapshot: DocumentSnapshot,
  sequence: number,
  edit: ReplaceTextTestEdit = {
    start: 0,
    end: 0,
    replacement: 'x',
  },
): Transaction {
  return {
    id: productionTransactionId(301 + sequence),
    target: {
      uri: URI,
      baseRevisionId: snapshot.revisionId,
    },
    actor: {
      type: 'human',
      id: 'snapshot-cache-test',
    },
    operations: [
      {
        id: productionOperationId(401 + sequence),
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(edit.start),
        endUtf16Offset: validUtf16Offset(edit.end),
        replacement: edit.replacement,
      },
    ],
    preconditions: [
      {
        kind: 'document-hash',
        expected: snapshot.documentHash,
      },
    ],
    metadata: {
      source: 'human-input',
      undoGroupId: `cache-chain-${sequence}`,
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

function withClaimAtOffset(snapshot: DocumentSnapshot, utf16Offset: number): DocumentSnapshot {
  const pending: DocumentSnapshot = {
    ...snapshot,
    academicGraph: {
      ...snapshot.academicGraph,
      claims: [
        {
          id: MINIMAL_FIXTURE_IDS.reference,
          anchor: {
            document: {
              uri: URI,
              revisionId: snapshot.revisionId,
            },
            primary: {
              kind: 'text',
              textNodeId: MINIMAL_FIXTURE_IDS.text,
              utf16Offset: validUtf16Offset(utf16Offset),
              affinity: 'after',
            },
            targetNodeId: MINIMAL_FIXTURE_IDS.text,
            pathHint: [
              MINIMAL_FIXTURE_IDS.manuscript,
              MINIMAL_FIXTURE_IDS.body,
              MINIMAL_FIXTURE_IDS.paragraph,
              MINIMAL_FIXTURE_IDS.text,
            ],
          },
          textSnapshot: 'Hello, Nireco.',
          textHash: validContentHash(
            'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          ),
        },
      ],
    },
  };
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(pending),
  );
  if (hashed.type === 'error') {
    throw new Error('Expected the Claim Snapshot to be canonical JSON.');
  }
  return {
    ...pending,
    documentHash: hashed.hash,
  };
}

function createRevision(uri: DocumentUri, snapshot: DocumentSnapshot, sequence: number): Revision {
  return {
    id: snapshot.revisionId,
    uri,
    parentRevisionId: null,
    transactionId: productionTransactionId(501 + sequence),
    sequence,
    documentHash: snapshot.documentHash,
    actor: {
      type: 'system',
      id: 'snapshot-cache-test',
      role: 'validator',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
    durability: 'snapshot',
  };
}

function withDuplicateCanonicalTextNode(snapshot: DocumentSnapshot): DocumentSnapshot {
  const target = readTextNode(snapshot);
  const pending: DocumentSnapshot = {
    ...snapshot,
    academicGraph: {
      ...snapshot.academicGraph,
      referenceSnapshots: [
        {
          id: MINIMAL_FIXTURE_IDS.reference,
          cslJson: {
            duplicate: {
              ...target,
              marks: [...target.marks],
            },
          },
          metadataHash: validContentHash(
            'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          ),
          capturedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
        },
      ],
    },
  };
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(pending),
  );
  if (hashed.type === 'error') {
    throw new Error('Expected the duplicate-node Snapshot to be canonical JSON.');
  }
  return {
    ...pending,
    documentHash: hashed.hash,
  };
}

function readTextNode(snapshot: DocumentSnapshot): TextNode {
  const indexed = createDocumentIndex(snapshot);
  if (indexed.type === 'error') {
    throw new Error(indexed.error.safeMessage);
  }
  const node = indexed.value.getNode(MINIMAL_FIXTURE_IDS.text);
  if (node?.type !== 'text') {
    throw new Error('Expected the minimal fixture TextNode.');
  }
  return node;
}

function productionRevisionId(sequence: number): RevisionId {
  return parseProductionId(parseRevisionId, sequence, 'Revision ID');
}

function productionTransactionId(sequence: number): TransactionId {
  return parseProductionId(parseTransactionId, sequence, 'Transaction ID');
}

function productionOperationId(sequence: number): OperationId {
  return parseProductionId(parseOperationId, sequence, 'Operation ID');
}

function parseProductionId<TValue>(
  parse: (
    value: string,
  ) =>
    | { readonly type: 'valid'; readonly value: TValue }
    | { readonly type: 'invalid'; readonly reason: string },
  sequence: number,
  label: string,
): TValue {
  const parsed = parse(`018f0000-0000-7000-8000-${sequence.toString().padStart(12, '0')}`);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected a production UUIDv7 ${label}.`);
  }
  return parsed.value;
}
