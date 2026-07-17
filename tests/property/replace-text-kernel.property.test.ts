import fc from 'fast-check';
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
  getVerifiedDocumentSnapshotCache,
  retireVerifiedDocumentSnapshotCache,
} from '../../src/model/document-snapshot-cache.js';
import { createReplaceTextPositionMap } from '../../src/model/mapping/replace-text-position-map.js';
import type { MappedPositionResult } from '../../src/model/mapping/position-map.js';
import { createDocumentIndex } from '../../src/model/node/document-index.js';
import type { PositionAffinity } from '../../src/model/position/semantic-position.js';
import type { Revision } from '../../src/model/revision/revision.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import { prepareKernelTransaction } from '../../src/model/transaction/transaction-kernel.js';
import type {
  Transaction,
  TransactionPrecondition,
} from '../../src/model/transaction/transaction.js';
import {
  createMinimalSnapshot,
  MINIMAL_FIXTURE_IDS,
  validDocumentUri,
  validIsoTimestamp,
  validUtf16Offset,
} from '../test-support/fixtures.js';

const URI = validDocumentUri('nireco://workspace-01/document/property-kernel');
const REVISION_TWO = productionRevisionId('018f0000-0000-7000-8000-000000000201');
const REVISION_THREE = productionRevisionId('018f0000-0000-7000-8000-000000000202');
const FORWARD_TRANSACTION_ID = productionTransactionId('018f0000-0000-7000-8000-000000000301');
const INVERSE_TRANSACTION_ID = productionTransactionId('018f0000-0000-7000-8000-000000000302');
const FORWARD_OPERATION_ID = productionOperationId('018f0000-0000-7000-8000-000000000401');
const INVERSE_OPERATION_ID = productionOperationId('018f0000-0000-7000-8000-000000000402');
const FORWARD_OPERATION_TWO_ID = productionOperationId('018f0000-0000-7000-8000-000000000403');
const INVERSE_OPERATION_TWO_ID = productionOperationId('018f0000-0000-7000-8000-000000000404');

const unicodeAtomArbitrary = fc.oneof(
  fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }),
  fc.constantFrom('e\u0301', 'n\u0303', '\u0915\u093c', '\u306f\u3099'),
  fc.constantFrom('\ud83c\udf0d', '\ud83e\uddea', '\ud83d\udc69\u200d\ud83d\udd2c', '\ud835\udefc'),
);
const unicodeTextArbitrary = fc
  .array(unicodeAtomArbitrary, { maxLength: 16 })
  .map((atoms) => atoms.join(''));
const nonEmptyUnicodeTextArbitrary = fc
  .array(unicodeAtomArbitrary, { minLength: 1, maxLength: 8 })
  .map((atoms) => atoms.join(''));
const replaceCaseArbitrary = unicodeTextArbitrary.chain((text) => {
  const boundaries = utf16Boundaries(text);
  return fc
    .tuple(
      unicodeTextArbitrary,
      fc.integer({ min: 0, max: boundaries.length - 1 }),
      fc.integer({ min: 0, max: boundaries.length - 1 }),
    )
    .map(([replacement, firstIndex, secondIndex]) => ({
      text,
      replacement,
      start: boundaries[Math.min(firstIndex, secondIndex)] ?? 0,
      end: boundaries[Math.max(firstIndex, secondIndex)] ?? 0,
    }));
});

describe('ReplaceText Kernel properties', () => {
  it('restores the exact text and semantic document hash through its inverse plan', () => {
    fc.assert(
      fc.property(replaceCaseArbitrary, (replaceCase) => {
        const initialSnapshot = withText(createMinimalSnapshot(), replaceCase.text);
        const forward = prepareKernelTransaction({
          transaction: createReplaceTextTransaction({
            snapshot: initialSnapshot,
            start: replaceCase.start,
            end: replaceCase.end,
            replacement: replaceCase.replacement,
          }),
          headRevision: createRevision(URI, initialSnapshot),
          headSnapshot: initialSnapshot,
          nextRevisionId: REVISION_TWO,
        });

        expect(forward.type).toBe('ok');
        if (forward.type === 'error') {
          return;
        }
        expect(readText(forward.value.snapshot)).toBe(
          `${replaceCase.text.slice(0, replaceCase.start)}${replaceCase.replacement}${replaceCase.text.slice(replaceCase.end)}`,
        );

        const inversePayload = forward.value.inverse.operations[0];
        const inverse = prepareKernelTransaction({
          transaction: createReplaceTextTransaction({
            snapshot: forward.value.snapshot,
            baseRevisionId: REVISION_TWO,
            start: inversePayload.startUtf16Offset,
            end: inversePayload.endUtf16Offset,
            replacement: inversePayload.replacement,
            preconditions: forward.value.inverse.preconditions,
            transactionId: INVERSE_TRANSACTION_ID,
            operationId: INVERSE_OPERATION_ID,
          }),
          headRevision: createRevision(URI, forward.value.snapshot, 1),
          headSnapshot: forward.value.snapshot,
          nextRevisionId: REVISION_THREE,
        });

        expect(inverse.type).toBe('ok');
        if (inverse.type === 'error') {
          return;
        }
        expect(readText(inverse.value.snapshot)).toBe(replaceCase.text);
        expect(inverse.value.snapshot.documentHash).toBe(initialSnapshot.documentHash);
      }),
      {
        numRuns: 80,
        seed: 20_260_721,
      },
    );
  });

  it('restores ordered append pairs whose second offset exists only in the draft', () => {
    fc.assert(
      fc.property(
        unicodeTextArbitrary,
        nonEmptyUnicodeTextArbitrary,
        unicodeTextArbitrary,
        (text, firstAppend, secondAppend) => {
          const initialSnapshot = withText(createMinimalSnapshot(), text);
          const seed = createReplaceTextTransaction({
            snapshot: initialSnapshot,
            start: text.length,
            end: text.length,
            replacement: firstAppend,
          });
          const firstOperation = seed.operations[0];
          if (firstOperation.type !== 'replace-text') {
            throw new Error('Expected a ReplaceText operation.');
          }
          const forwardTransaction: Transaction = {
            ...seed,
            operations: [
              firstOperation,
              {
                id: FORWARD_OPERATION_TWO_ID,
                type: 'replace-text',
                textNodeId: MINIMAL_FIXTURE_IDS.text,
                startUtf16Offset: validUtf16Offset(text.length + firstAppend.length),
                endUtf16Offset: validUtf16Offset(text.length + firstAppend.length),
                replacement: secondAppend,
              },
            ],
          };
          const forward = prepareKernelTransaction({
            transaction: forwardTransaction,
            headRevision: createRevision(URI, initialSnapshot),
            headSnapshot: initialSnapshot,
            nextRevisionId: REVISION_TWO,
          });

          expect(forward.type).toBe('ok');
          if (forward.type === 'error') {
            return;
          }
          expect(readText(forward.value.snapshot)).toBe(`${text}${firstAppend}${secondAppend}`);
          const [undoSecond, undoFirst] = forward.value.inverse.operations;
          if (undoFirst === undefined) {
            throw new Error('Expected a two-operation inverse plan.');
          }
          const inverseSeed = createReplaceTextTransaction({
            snapshot: forward.value.snapshot,
            baseRevisionId: REVISION_TWO,
            start: undoSecond.startUtf16Offset,
            end: undoSecond.endUtf16Offset,
            replacement: undoSecond.replacement,
            preconditions: forward.value.inverse.preconditions,
            transactionId: INVERSE_TRANSACTION_ID,
            operationId: INVERSE_OPERATION_ID,
          });
          const inverseTransaction: Transaction = {
            ...inverseSeed,
            operations: [
              inverseSeed.operations[0],
              {
                id: INVERSE_OPERATION_TWO_ID,
                ...undoFirst,
              },
            ],
          };
          const inverse = prepareKernelTransaction({
            transaction: inverseTransaction,
            headRevision: createRevision(URI, forward.value.snapshot, 1),
            headSnapshot: forward.value.snapshot,
            nextRevisionId: REVISION_THREE,
          });

          expect(inverse.type).toBe('ok');
          if (inverse.type === 'error') {
            return;
          }
          expect(readText(inverse.value.snapshot)).toBe(text);
          expect(inverse.value.snapshot.documentHash).toBe(initialSnapshot.documentHash);
        },
      ),
      {
        numRuns: 60,
        seed: 20_260_724,
      },
    );
  });

  it('matches the full canonical byte oracle on the verified identity fast path', () => {
    fc.assert(
      fc.property(replaceCaseArbitrary, (replaceCase) => {
        const initialSnapshot = deepFreeze(withText(createMinimalSnapshot(), replaceCase.text));
        let resultSnapshot: DocumentSnapshot | undefined;
        try {
          expect(cacheVerifiedFrozenDocumentSnapshot(initialSnapshot).type).toBe('ok');
          const prepared = prepareKernelTransaction({
            transaction: createReplaceTextTransaction({
              snapshot: initialSnapshot,
              start: replaceCase.start,
              end: replaceCase.end,
              replacement: replaceCase.replacement,
            }),
            headRevision: createRevision(URI, initialSnapshot),
            headSnapshot: initialSnapshot,
            nextRevisionId: REVISION_TWO,
          });

          expect(prepared.type).toBe('ok');
          if (prepared.type === 'error') {
            return;
          }
          resultSnapshot = prepared.value.snapshot;
          expect(activateKernelDerivedDocumentSnapshotCache(initialSnapshot, resultSnapshot)).toBe(
            true,
          );
          const oracle = hashCanonicalJsonPortable(
            HASH_DOMAINS.documentContent,
            createDocumentHashPayload(resultSnapshot),
          );
          expect(oracle.type).toBe('ok');
          if (oracle.type === 'ok') {
            expect(resultSnapshot.documentHash).toBe(oracle.hash);
            expect(getVerifiedDocumentSnapshotCache(resultSnapshot)?.canonicalDocumentPayload).toBe(
              oracle.canonicalJson,
            );
          }
        } finally {
          retireVerifiedDocumentSnapshotCache(initialSnapshot);
          if (resultSnapshot !== undefined) {
            retireVerifiedDocumentSnapshotCache(resultSnapshot);
          }
        }
      }),
      {
        numRuns: 80,
        seed: 20_260_724,
      },
    );
  });

  it('keeps mapped offsets and affinities in bounds and composes only adjacent revisions', () => {
    fc.assert(
      fc.property(replaceCaseArbitrary, (replaceCase) => {
        const forward = createReplaceTextPositionMap({
          fromRevisionId: MINIMAL_FIXTURE_IDS.revision,
          toRevisionId: REVISION_TWO,
          textNodeId: MINIMAL_FIXTURE_IDS.text,
          startUtf16Offset: validUtf16Offset(replaceCase.start),
          endUtf16Offset: validUtf16Offset(replaceCase.end),
          replacementUtf16Length: replaceCase.replacement.length,
        });
        const inverse = createReplaceTextPositionMap({
          fromRevisionId: REVISION_TWO,
          toRevisionId: REVISION_THREE,
          textNodeId: MINIMAL_FIXTURE_IDS.text,
          startUtf16Offset: validUtf16Offset(replaceCase.start),
          endUtf16Offset: validUtf16Offset(replaceCase.start + replaceCase.replacement.length),
          replacementUtf16Length: replaceCase.end - replaceCase.start,
        });
        const composed = forward.compose(inverse);
        const updatedLength =
          replaceCase.text.length -
          (replaceCase.end - replaceCase.start) +
          replaceCase.replacement.length;

        expect(composed.fromRevisionId).toBe(MINIMAL_FIXTURE_IDS.revision);
        expect(composed.toRevisionId).toBe(REVISION_THREE);
        expect(() => forward.compose(forward)).toThrow(RangeError);

        for (const offset of utf16Boundaries(replaceCase.text)) {
          for (const affinity of ['before', 'after'] as const) {
            const position = {
              kind: 'text' as const,
              textNodeId: MINIMAL_FIXTURE_IDS.text,
              utf16Offset: validUtf16Offset(offset),
              affinity,
            };
            expectMappedPositionsWithin(forward.mapPosition(position), updatedLength, affinity);
            expectMappedPositionsWithin(
              composed.mapPosition(position),
              replaceCase.text.length,
              affinity,
            );
          }
        }
      }),
      {
        numRuns: 80,
        seed: 20_260_722,
      },
    );
  });

  it('classifies surrogate midpoints separately from malformed boundary strings', () => {
    fc.assert(
      fc.property(
        unicodeTextArbitrary,
        unicodeTextArbitrary,
        fc.integer({ min: 0x10_000, max: 0x10_ffff }).map((value) => String.fromCodePoint(value)),
        fc.integer({ min: 0xd800, max: 0xdfff }).map((value) => String.fromCharCode(value)),
        (prefix, suffix, supplementaryScalar, loneSurrogate) => {
          const text = `${prefix}${supplementaryScalar}${suffix}`;
          const snapshot = withText(createMinimalSnapshot(), text);
          const headRevision = createRevision(URI, snapshot);
          const midpoint = prefix.length + 1;

          const midpointResult = prepareKernelTransaction({
            transaction: createReplaceTextTransaction({
              snapshot,
              start: midpoint,
              end: midpoint,
              replacement: 'x',
            }),
            headRevision,
            headSnapshot: snapshot,
            nextRevisionId: REVISION_TWO,
          });
          const malformedReplacementResult = prepareKernelTransaction({
            transaction: createReplaceTextTransaction({
              snapshot,
              start: 0,
              end: 0,
              replacement: loneSurrogate,
            }),
            headRevision,
            headSnapshot: snapshot,
            nextRevisionId: REVISION_TWO,
          });

          expect(midpointResult).toMatchObject({
            type: 'error',
            error: {
              reason: 'position-invalid',
            },
          });
          expect(malformedReplacementResult).toMatchObject({
            type: 'error',
            error: {
              reason: 'transaction-invalid',
            },
          });
        },
      ),
      {
        numRuns: 80,
        seed: 20_260_723,
      },
    );
  });
});

interface ReplaceTextTransactionOptions {
  readonly snapshot: DocumentSnapshot;
  readonly baseRevisionId?: RevisionId;
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
  readonly preconditions?: readonly TransactionPrecondition[];
  readonly transactionId?: TransactionId;
  readonly operationId?: OperationId;
}

function createReplaceTextTransaction(options: ReplaceTextTransactionOptions): Transaction {
  return {
    id: options.transactionId ?? FORWARD_TRANSACTION_ID,
    target: {
      uri: URI,
      baseRevisionId: options.baseRevisionId ?? options.snapshot.revisionId,
    },
    actor: {
      type: 'human',
      id: 'property-test-human',
    },
    operations: [
      {
        id: options.operationId ?? FORWARD_OPERATION_ID,
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(options.start),
        endUtf16Offset: validUtf16Offset(options.end),
        replacement: options.replacement,
      },
    ],
    preconditions: options.preconditions ?? [
      {
        kind: 'node-exists',
        nodeId: MINIMAL_FIXTURE_IDS.text,
      },
      {
        kind: 'document-hash',
        expected: options.snapshot.documentHash,
      },
    ],
    metadata: {
      source: 'human-input',
      undoGroupId: 'property-test-typing',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

function expectMappedPositionsWithin(
  result: MappedPositionResult,
  maximumOffset: number,
  affinity: PositionAffinity,
): void {
  switch (result.status) {
    case 'mapped':
      expectPositionWithin(result.position, maximumOffset, affinity);
      return;
    case 'deleted':
      if (result.nearest !== undefined) {
        expectPositionWithin(result.nearest, maximumOffset, affinity);
      }
      return;
    case 'ambiguous':
      for (const candidate of result.candidates) {
        expectPositionWithin(candidate, maximumOffset, affinity);
      }
      return;
    case 'orphaned':
      return;
  }
}

function expectPositionWithin(
  position: Extract<MappedPositionResult, { readonly status: 'mapped' }>['position'],
  maximumOffset: number,
  affinity: PositionAffinity,
): void {
  expect(position.kind).toBe('text');
  if (position.kind === 'text') {
    expect(position.utf16Offset).toBeGreaterThanOrEqual(0);
    expect(position.utf16Offset).toBeLessThanOrEqual(maximumOffset);
    expect(position.affinity).toBe(affinity);
  }
}

function utf16Boundaries(value: string): readonly number[] {
  const boundaries = [0];
  let offset = 0;
  for (const scalar of value) {
    offset += scalar.length;
    boundaries.push(offset);
  }
  return boundaries;
}

function createRevision(uri: DocumentUri, snapshot: DocumentSnapshot, sequence = 0): Revision {
  return {
    id: snapshot.revisionId,
    uri,
    parentRevisionId: null,
    transactionId: FORWARD_TRANSACTION_ID,
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
  const [frontMatter, body, bibliography] = snapshot.root.children;
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
