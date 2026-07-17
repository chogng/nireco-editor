import { describe, expect, it } from 'vitest';

import type { CancellationToken } from '../../src/base/cancellation/cancellation-token.js';
import { nonCancellingToken } from '../../src/base/cancellation/cancellation-token.js';
import type { Result } from '../../src/base/errors/nireco-error.js';
import {
  parseRevisionId,
  parseTransactionId,
  type RevisionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import type { Revision } from '../../src/model/revision/revision.js';
import {
  SingleDocumentAuthorityRevisionHistorySource,
  type DocumentRevisionHistoryRequest,
  type SingleDocumentAuthorityRevisionReader,
} from '../../src/services/document-service/document-revision-history-source.js';
import {
  DeterministicIdAllocator,
  validContentHash,
  validDocumentUri,
  validIsoTimestamp,
  validResourceUri,
} from '../test-support/fixtures.js';

const URI = validDocumentUri('nireco://workspace-01/document/history-source');
const OTHER_URI = validDocumentUri('nireco://workspace-01/document/other-history');
const NON_DOCUMENT_URI = validResourceUri('https://example.com/history');
const REVISION_IDS = [
  revisionId('018f0000-0000-7000-8000-000000000401'),
  revisionId('018f0000-0000-7000-8000-000000000402'),
  revisionId('018f0000-0000-7000-8000-000000000403'),
  revisionId('018f0000-0000-7000-8000-000000000404'),
] as const;
const MISSING_REVISION_ID = revisionId('018f0000-0000-7000-8000-000000000499');
const TRANSACTION_IDS = [
  transactionId('018f0000-0001-7000-8000-000000000401'),
  transactionId('018f0000-0001-7000-8000-000000000402'),
  transactionId('018f0000-0001-7000-8000-000000000403'),
  transactionId('018f0000-0001-7000-8000-000000000404'),
] as const;

describe('SingleDocumentAuthorityRevisionHistorySource', () => {
  it('returns an immutable, strictly ordered after-since through-through history', () => {
    const revisions = createLinearHistory();
    const reader = new StubRevisionAuthority(revisions);
    const source = createSource(reader);
    const result = source.getRevisions(historyRequest());
    if (result.type === 'error') {
      throw new Error(result.error.safeMessage);
    }

    expect(result.value.map(({ id }) => id)).toEqual(REVISION_IDS.slice(1));
    expect(result.value.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    expect(result.value.map(({ parentRevisionId }) => parentRevisionId)).toEqual([
      REVISION_IDS[0],
      REVISION_IDS[1],
      REVISION_IDS[2],
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value.every(Object.isFrozen)).toBe(true);
    expect(result.value.every(({ actor }) => Object.isFrozen(actor))).toBe(true);
    expect(Object.isFrozen(revisions[1])).toBe(false);
    expect(Reflect.set(result.value[0] ?? {}, 'sequence', 99)).toBe(false);
  });

  it('returns one frozen empty list when since and through identify the same Revision', () => {
    const revisions = createLinearHistory();
    const reader = new StubRevisionAuthority(revisions);
    const source = createSource(reader);
    const result = source.getRevisions(
      historyRequest({
        sinceRevisionId: REVISION_IDS[2],
        throughRevisionId: REVISION_IDS[2],
      }),
    );

    expect(result).toMatchObject({ type: 'ok', value: [] });
    expect(result.type === 'ok' && Object.isFrozen(result.value)).toBe(true);
    expect(reader.calls).toEqual([REVISION_IDS[2]]);
  });

  it('validates the requested URI and does not expose a different document', () => {
    const revisions = createLinearHistory();
    const invalidReader = new StubRevisionAuthority(revisions);
    const invalidSource = createSource(invalidReader);
    expect(invalidSource.getRevisions(historyRequest({ uri: NON_DOCUMENT_URI }))).toMatchObject({
      type: 'error',
      error: { code: 'INVALID_RESOURCE_URI', category: 'validation' },
    });
    expect(invalidReader.calls).toEqual([]);

    const wrongDocumentReader = new StubRevisionAuthority(revisions);
    const wrongDocumentSource = createSource(wrongDocumentReader);
    expect(wrongDocumentSource.getRevisions(historyRequest({ uri: OTHER_URI }))).toMatchObject({
      type: 'error',
      error: { code: 'MODEL_NOT_FOUND', category: 'validation' },
    });
    expect(wrongDocumentReader.calls).toEqual([]);
  });

  it('rejects through-before-since and a same-sequence non-ancestor', () => {
    const revisions = createLinearHistory();
    const source = createSource(new StubRevisionAuthority(revisions));
    expect(
      source.getRevisions(
        historyRequest({
          sinceRevisionId: REVISION_IDS[2],
          throughRevisionId: REVISION_IDS[1],
        }),
      ),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'BASE_REVISION_MISMATCH',
        category: 'conflict',
        retryable: false,
        suggestedAction: 'rebase',
      },
    });

    const branch = makeRevision(
      revisionId('018f0000-0000-7000-8000-000000000405'),
      2,
      REVISION_IDS[1],
      TRANSACTION_IDS[2],
    );
    const branchSource = createSource(new StubRevisionAuthority([...revisions, branch]));
    expect(
      branchSource.getRevisions(
        historyRequest({
          sinceRevisionId: REVISION_IDS[2],
          throughRevisionId: branch.id,
        }),
      ),
    ).toMatchObject({ type: 'error', error: { code: 'BASE_REVISION_MISMATCH' } });
  });

  it('fails closed for a missing parent and a discontinuous sequence', () => {
    const genesis = createLinearHistory()[0];
    const broken = makeRevision(REVISION_IDS[1], 1, MISSING_REVISION_ID, TRANSACTION_IDS[1]);
    expect(
      createSource(new StubRevisionAuthority([genesis, broken])).getRevisions(
        historyRequest({ throughRevisionId: broken.id }),
      ),
    ).toMatchObject({
      type: 'error',
      error: { code: 'CAPABILITY_UNSUPPORTED', category: 'compatibility' },
    });

    const revisions = createLinearHistory();
    const discontinuous = makeRevision(REVISION_IDS[2], 3, REVISION_IDS[1], TRANSACTION_IDS[2]);
    expect(
      createSource(
        new StubRevisionAuthority([revisions[0], revisions[1], discontinuous]),
      ).getRevisions(historyRequest({ throughRevisionId: discontinuous.id })),
    ).toMatchObject({ type: 'error', error: { code: 'STORAGE_CORRUPT' } });
  });

  it('detects a parent cycle before rereading an already visited Revision', () => {
    const genesis = createLinearHistory()[0];
    const first = makeRevision(REVISION_IDS[1], 1, REVISION_IDS[2], TRANSACTION_IDS[1]);
    const second = makeRevision(REVISION_IDS[2], 2, REVISION_IDS[1], TRANSACTION_IDS[2]);
    const reader = new StubRevisionAuthority([genesis, first, second]);
    const result = createSource(reader).getRevisions(
      historyRequest({ throughRevisionId: second.id }),
    );

    expect(result).toMatchObject({ type: 'error', error: { code: 'STORAGE_CORRUPT' } });
    expect(reader.calls).toEqual([REVISION_IDS[0], REVISION_IDS[2], REVISION_IDS[1]]);
  });

  it('rejects a parent that crosses document ownership', () => {
    const revisions = createLinearHistory();
    const foreignParent = { ...revisions[1], uri: OTHER_URI };
    expect(
      createSource(
        new StubRevisionAuthority([revisions[0], foreignParent, revisions[2]]),
      ).getRevisions(historyRequest({ throughRevisionId: REVISION_IDS[2] })),
    ).toMatchObject({ type: 'error', error: { code: 'STORAGE_CORRUPT' } });
  });

  it('fails closed for non-closed or accessor-backed Revision values', () => {
    const revisions = createLinearHistory();
    const extraFieldRevision = { ...revisions[1], unexpected: true };
    expect(
      createSource(new StubRevisionAuthority([revisions[0], extraFieldRevision])).getRevisions(
        historyRequest({ throughRevisionId: REVISION_IDS[1] }),
      ),
    ).toMatchObject({ type: 'error', error: { code: 'STORAGE_CORRUPT' } });

    let getterCalled = false;
    const accessorRevision = Object.defineProperty({ ...revisions[1] }, 'sequence', {
      enumerable: true,
      get(): number {
        getterCalled = true;
        return 1;
      },
    });
    expect(
      createSource(new StubRevisionAuthority([revisions[0], accessorRevision])).getRevisions(
        historyRequest({ throughRevisionId: REVISION_IDS[1] }),
      ),
    ).toMatchObject({ type: 'error', error: { code: 'STORAGE_CORRUPT' } });
    expect(getterCalled).toBe(false);

    let proxyGetCount = 0;
    const proxyRevision = new Proxy(
      { ...revisions[1] },
      {
        get(target, property, receiver): unknown {
          proxyGetCount += 1;
          return property === 'sequence' ? 99 : Reflect.get(target, property, receiver);
        },
      },
    );
    const proxyReader = new StubRevisionAuthority([revisions[0], proxyRevision]);
    proxyGetCount = 0;
    expect(
      createSource(proxyReader).getRevisions(
        historyRequest({ throughRevisionId: REVISION_IDS[1] }),
      ),
    ).toMatchObject({
      type: 'ok',
      value: [{ id: REVISION_IDS[1], sequence: 1 }],
    });
    expect(proxyGetCount).toBe(0);

    const oversizedTimestamp = Object.defineProperty({ ...revisions[1] }, 'createdAt', {
      enumerable: true,
      value: `2026-07-20T00:00:01.${'0'.repeat(65)}Z`,
    });
    expect(
      createSource(new StubRevisionAuthority([revisions[0], oversizedTimestamp])).getRevisions(
        historyRequest({ throughRevisionId: REVISION_IDS[1] }),
      ),
    ).toMatchObject({ type: 'error', error: { code: 'STORAGE_CORRUPT' } });
  });

  it('supports cancellation before and during the bounded walk', () => {
    const revisions = createLinearHistory();
    const alreadyCancelled = new MutableCancellationToken(true);
    const initialReader = new StubRevisionAuthority(revisions);
    expect(
      createSource(initialReader).getRevisions(historyRequest({ cancellation: alreadyCancelled })),
    ).toMatchObject({
      type: 'error',
      error: { code: 'CANCELLED', category: 'transport' },
    });
    expect(initialReader.calls).toEqual([]);

    const cancelledDuringWalk = new MutableCancellationToken();
    const walkingReader = new StubRevisionAuthority(revisions, (readCount) => {
      if (readCount === 3) {
        cancelledDuringWalk.cancel();
      }
    });
    expect(
      createSource(walkingReader).getRevisions(
        historyRequest({ cancellation: cancelledDuringWalk }),
      ),
    ).toMatchObject({ type: 'error', error: { code: 'CANCELLED', category: 'transport' } });
    expect(walkingReader.calls).toHaveLength(3);
  });

  it('rejects an over-limit distance before starting the parent walk', () => {
    const revisions = createLinearHistory();
    const reader = new StubRevisionAuthority(revisions);
    const source = createSource(reader, 2);
    expect(source.getRevisions(historyRequest())).toMatchObject({
      type: 'error',
      error: { code: 'REQUEST_TOO_LARGE', category: 'validation' },
    });
    expect(reader.calls).toEqual([REVISION_IDS[0], REVISION_IDS[3]]);
  });
});

class StubRevisionAuthority implements SingleDocumentAuthorityRevisionReader {
  readonly calls: RevisionId[] = [];
  readonly #revisions: ReadonlyMap<RevisionId, Revision>;
  readonly #afterRead: ((readCount: number) => void) | undefined;
  readonly #ids = new DeterministicIdAllocator();

  constructor(revisions: readonly Revision[], afterRead?: (readCount: number) => void) {
    this.#revisions = new Map(revisions.map((revision) => [revision.id, revision]));
    this.#afterRead = afterRead;
  }

  getRevision(revisionId: RevisionId): Result<Revision> {
    this.calls.push(revisionId);
    this.#afterRead?.(this.calls.length);
    const revision = this.#revisions.get(revisionId);
    return revision === undefined
      ? {
          type: 'error',
          error: {
            code: 'REVISION_NOT_FOUND',
            category: 'validation',
            retryable: false,
            safeMessage: 'The requested Revision is unavailable.',
            debugId: this.#ids.allocateDebugId(),
            suggestedAction: 'reread',
          },
        }
      : { type: 'ok', value: revision };
  }
}

class MutableCancellationToken implements CancellationToken {
  #cancelled: boolean;

  constructor(cancelled = false) {
    this.#cancelled = cancelled;
  }

  get isCancellationRequested(): boolean {
    return this.#cancelled;
  }

  cancel(): void {
    this.#cancelled = true;
  }

  throwIfCancellationRequested(): void {
    if (this.#cancelled) {
      throw new Error('cancelled');
    }
  }
}

function createSource(
  authority: SingleDocumentAuthorityRevisionReader,
  maxWalkRevisions?: number,
): SingleDocumentAuthorityRevisionHistorySource {
  return new SingleDocumentAuthorityRevisionHistorySource({
    uri: URI,
    authority,
    ids: new DeterministicIdAllocator(),
    ...(maxWalkRevisions === undefined ? {} : { maxWalkRevisions }),
  });
}

function historyRequest(
  overrides: Partial<DocumentRevisionHistoryRequest> = {},
): DocumentRevisionHistoryRequest {
  return {
    uri: URI,
    sinceRevisionId: REVISION_IDS[0],
    throughRevisionId: REVISION_IDS[3],
    cancellation: nonCancellingToken,
    ...overrides,
  };
}

function createLinearHistory(): readonly [Revision, Revision, Revision, Revision] {
  return [
    makeRevision(REVISION_IDS[0], 0, null, TRANSACTION_IDS[0]),
    makeRevision(REVISION_IDS[1], 1, REVISION_IDS[0], TRANSACTION_IDS[1]),
    makeRevision(REVISION_IDS[2], 2, REVISION_IDS[1], TRANSACTION_IDS[2]),
    makeRevision(REVISION_IDS[3], 3, REVISION_IDS[2], TRANSACTION_IDS[3]),
  ];
}

function makeRevision(
  id: RevisionId,
  sequence: number,
  parentRevisionId: RevisionId | null,
  transaction: TransactionId,
): Revision {
  return {
    id,
    uri: URI,
    parentRevisionId,
    transactionId: transaction,
    sequence,
    documentHash: validContentHash(`sha256:${sequence.toString(16).padStart(64, '0')}`),
    actor: { type: 'system', id: 'history-test', role: 'recovery' },
    createdAt: validIsoTimestamp(`2026-07-20T00:00:0${sequence}Z`),
    durability: 'snapshot',
  };
}

function revisionId(value: string): RevisionId {
  const parsed = parseRevisionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Revision ID: ${value}`);
  }
  return parsed.value;
}

function transactionId(value: string): TransactionId {
  const parsed = parseTransactionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Transaction ID: ${value}`);
  }
  return parsed.value;
}
