import { describe, expect, it } from 'vitest';

import type { NirecoError, Result } from '../../src/base/errors/nireco-error.js';
import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import { encodeUtf8, hashCanonicalJsonPortable } from '../../src/base/hashing/portable-sha-256.js';
import {
  parseEntityId,
  parseNodeId,
  parseRevisionId,
  parseSessionId,
  parseTransactionId,
  type EntityId,
  type NodeId,
  type RevisionId,
  type SessionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import {
  isWellFormedUnicodeString,
  serializeCanonicalJson,
} from '../../src/base/serialization/canonical-json.js';
import type { Diagnostic } from '../../src/model/diagnostic.js';
import type { Revision } from '../../src/model/revision/revision.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import type { DurabilityLevel } from '../../src/model/revision/revision.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import { PortableDocumentReadCursorCodec } from '../../src/services/document-service/cursor-codec.js';
import type { DocumentRevisionHistorySource } from '../../src/services/document-service/document-revision-history-source.js';
import { GATE_1_READ_HARD_LIMITS } from '../../src/integration/comet/contract-types.js';
import {
  DEFAULT_DOCUMENT_READ_LIMITS,
  InProcessDocumentReadService,
  type DocumentReadLimits,
} from '../../src/services/document-service/document-read-service.js';
import {
  MAX_DOCUMENT_READ_CONTEXT_DISTANCE,
  MAX_DOCUMENT_READ_SCOPE_IDS,
  type DocumentReadContext,
  type DocumentDiagnosticsSource,
  type DocumentReadScope,
  type DocumentReadSessionGrant,
  type DocumentReadSessionFailure,
  type DocumentReadSessionSource,
  type ReadDocumentNodesRequest,
} from '../../src/services/document-service/document-read-types.js';
import type { CommitResult, DurabilityAcknowledgement } from '../../src/workspace/contracts.js';
import type { INirecoModel } from '../../src/workspace/model.js';
import {
  DeterministicIdAllocator,
  FixedClock,
  MINIMAL_FIXTURE_IDS,
  createMinimalSnapshot,
  validContentHash,
  validDocumentUri,
  validIsoTimestamp,
  validUtf16Offset,
} from '../test-support/fixtures.js';

const URI = validDocumentUri('nireco://workspace-01/document/read-service');
const REVISION_ONE = revisionId('018f0000-0000-7000-8000-000000000301');
const REVISION_TWO = revisionId('018f0000-0000-7000-8000-000000000302');
const SECTION_ID = nodeId('018f0000-0000-7000-8000-000000000310');
const HEADING_ID = nodeId('018f0000-0000-7000-8000-000000000311');
const HEADING_TEXT_ID = nodeId('018f0000-0000-7000-8000-000000000312');
const PARAGRAPH_ID = nodeId('018f0000-0000-7000-8000-000000000313');
const PARAGRAPH_TEXT_ID = nodeId('018f0000-0000-7000-8000-000000000314');
const CITATION_NODE_ID = nodeId('018f0000-0000-7000-8000-000000000315');
const SECTION_TWO_ID = nodeId('018f0000-0000-7000-8000-000000000320');
const HEADING_TWO_ID = nodeId('018f0000-0000-7000-8000-000000000321');
const HEADING_TEXT_TWO_ID = nodeId('018f0000-0000-7000-8000-000000000322');
const PARAGRAPH_TWO_ID = nodeId('018f0000-0000-7000-8000-000000000323');
const PARAGRAPH_TEXT_TWO_ID = nodeId('018f0000-0000-7000-8000-000000000324');
const CITATION_ENTITY_ID = entityId('018f0000-0000-7000-8000-000000000330');
const REFERENCE_ENTITY_ID = entityId('018f0000-0000-7000-8000-000000000331');
const CLAIM_ENTITY_ID = entityId('018f0000-0000-7000-8000-000000000332');
const CROSS_DOCUMENT_CLAIM_ID = entityId('018f0000-0000-7000-8000-000000000333');
const PATH_HINT_CLAIM_ID = entityId('018f0000-0000-7000-8000-000000000334');
const ABSENT_NODE_ID = nodeId('018f0000-0000-7000-8000-000000000399');
const OTHER_DOCUMENT_URI = validDocumentUri('nireco://workspace-01/document/other-read-service');
const REVISION_MIDDLE = revisionId('018f0000-0000-7000-8000-000000000305');
const REVISION_THREE = revisionId('018f0000-0000-7000-8000-000000000306');
const TRANSACTION_MIDDLE = transactionId('018f0000-0001-7000-8000-000000000305');
const TRANSACTION_TWO = transactionId('018f0000-0001-7000-8000-000000000302');

describe('InProcessDocumentReadService', () => {
  it('keeps the real node request limit aligned with the Gate 1 hard contract', () => {
    expect(DEFAULT_DOCUMENT_READ_LIMITS.maxRequestNodeIds).toBe(
      GATE_1_READ_HARD_LIMITS.maxReadNodeIds,
    );
    expect(DEFAULT_DOCUMENT_READ_LIMITS.maxRequestNodeIds).toBe(1_000);
    expect(MAX_DOCUMENT_READ_SCOPE_IDS).toBe(GATE_1_READ_HARD_LIMITS.maxScopeIds);
    expect(MAX_DOCUMENT_READ_SCOPE_IDS).toBe(1_000);
    expect(MAX_DOCUMENT_READ_CONTEXT_DISTANCE).toBe(GATE_1_READ_HARD_LIMITS.maxContextDistance);
  });

  it('rejects configured limits above the Preview.2 hard caps', () => {
    expect(() => createHarness({ maxPageItems: 1_001 })).toThrow(
      'maxPageItems cannot exceed its Preview.2 hard cap',
    );
    expect(() => createHarness({ maxRequestNodeIds: 1_001 })).toThrow(
      'maxRequestNodeIds cannot exceed its Preview.2 hard cap',
    );
    expect(() => createHarness({ maxQueryUtf16Units: 4_097 })).toThrow(
      'maxQueryUtf16Units cannot exceed its Preview.2 hard cap',
    );
  });

  it('binds every read to the requested Revision even after the Model head advances', () => {
    const harness = createHarness();
    harness.model.advanceHead(REVISION_TWO);

    const head = harness.service.getHead(harness.context);
    expect(head).toMatchObject({
      type: 'ok',
      value: {
        basedOnRevisionId: REVISION_TWO,
        document: { revisionId: REVISION_TWO },
        status: 'current',
        value: { headRevisionId: REVISION_TWO },
      },
    });

    const snapshot = harness.service.getSnapshot(harness.context);
    expect(snapshot).toMatchObject({
      type: 'ok',
      value: {
        basedOnRevisionId: REVISION_ONE,
        document: { revisionId: REVISION_ONE },
        status: 'stale',
        value: { revisionId: REVISION_ONE },
      },
    });

    const search = harness.service.search({
      ...harness.context,
      query: 'first revision',
    });
    expect(search).toMatchObject({
      type: 'ok',
      value: {
        basedOnRevisionId: REVISION_ONE,
        status: 'stale',
        value: {
          basedOnRevisionId: REVISION_ONE,
          truncated: false,
          items: [{ kind: 'text' }],
        },
      },
    });
  });

  it('derives deterministic outline and stable semantic search targets', () => {
    const harness = createHarness();
    const outline = harness.service.getOutline(harness.context);
    expect(outline).toMatchObject({
      type: 'ok',
      value: {
        basedOnRevisionId: REVISION_ONE,
        value: {
          basedOnRevisionId: REVISION_ONE,
          items: [
            {
              nodeId: SECTION_ID,
              nodeType: 'section',
              depth: 1,
              title: 'Scoped heading',
              authorizedChildCount: 2,
            },
          ],
        },
      },
    });
    if (outline.type === 'error') {
      throw new Error(outline.error.safeMessage);
    }
    expect(outline.value.value.items[0]?.parentNodeId).toBeDefined();
    expect(outline.value.value.items[0]?.nodeHash).toMatch(/^sha256:[a-f0-9]{64}$/u);

    const search = harness.service.search({
      ...harness.context,
      query: 'Nireco',
    });
    expect(search).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [
            {
              kind: 'text',
              target: {
                kind: 'node',
                nodeId: PARAGRAPH_TEXT_ID,
              },
              match: 'substring',
            },
          ],
        },
      },
    });
    if (search.type === 'error') {
      throw new Error(search.error.safeMessage);
    }
    expect(search.value.value.items[0]?.snippet).toContain('Nireco');
  });

  it('makes an out-of-scope node indistinguishable from a nonexistent node', () => {
    const harness = createHarness({ scope: { allowedNodeIds: [PARAGRAPH_ID] } });
    const outside = harness.service.readNodes({
      ...harness.context,
      nodeIds: [SECTION_ID],
    });
    const absent = harness.service.readNodes({
      ...harness.context,
      nodeIds: [ABSENT_NODE_ID],
    });

    expect(readSafeError(outside)).toEqual(readSafeError(absent));
    expect(readSafeError(outside)).toEqual({
      code: 'NODE_NOT_FOUND',
      category: 'validation',
      safeMessage: 'The referenced node does not exist in the bound document revision.',
      suggestedAction: 'reread',
    });
  });

  it('preserves heading search kind for an exact scoped heading TextNode', () => {
    const harness = createHarness({ scope: { allowedNodeIds: [HEADING_TEXT_ID] } });
    expect(
      harness.service.search({
        ...harness.context,
        query: 'Scoped',
        kinds: ['heading'],
      }),
    ).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [
            {
              kind: 'heading',
              target: { kind: 'node', nodeId: HEADING_TEXT_ID },
              match: 'substring',
            },
          ],
        },
      },
    });
    expect(
      harness.service.search({
        ...harness.context,
        query: 'Scoped',
        kinds: ['text'],
      }),
    ).toMatchObject({
      type: 'ok',
      value: { value: { items: [] } },
    });
  });

  it('searches every Preview.2 kind with stable semantic Citation and Claim targets', () => {
    const harness = createHarness({ withSearchFixture: true });
    expect(
      harness.service.search({
        ...harness.context,
        query: 'Visible citation prefix',
      }),
    ).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [
            {
              kind: 'citation',
              target: { kind: 'node', nodeId: CITATION_NODE_ID },
              match: 'substring',
            },
          ],
        },
      },
    });
    expect(
      harness.service.search({
        ...harness.context,
        query: 'Visible claim needle',
      }),
    ).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [
            {
              kind: 'claim',
              target: { kind: 'academic-entity', entityId: CLAIM_ENTITY_ID },
              match: 'substring',
            },
          ],
        },
      },
    });
    expect(
      harness.service.search({
        ...harness.context,
        query: REFERENCE_ENTITY_ID,
        kinds: ['citation'],
      }),
    ).toMatchObject({
      type: 'ok',
      value: { value: { items: [{ target: { kind: 'node', nodeId: CITATION_NODE_ID } }] } },
    });
    expect(
      harness.service.search({
        ...harness.context,
        query: 'CSL_ONLY_SECRET',
        kinds: ['citation'],
      }),
    ).toMatchObject({ type: 'ok', value: { value: { items: [] } } });
  });

  it('normalizes Section-filter order into the cursor and treats empty filters literally', () => {
    const harness = createHarness({
      maxPageItems: 1,
      paragraphText: 'First section needle.',
      withCursor: true,
      withSearchFixture: true,
    });
    const request = {
      ...harness.context,
      query: 'section needle',
      kinds: ['text'] as const,
      sectionIds: [SECTION_ID, SECTION_TWO_ID] as const,
      maxResults: 1,
    };
    const first = harness.service.search(request);
    expect(first).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [{ target: { kind: 'node', nodeId: PARAGRAPH_TEXT_ID } }],
          truncated: true,
        },
      },
    });
    if (first.type === 'error' || first.value.value.nextCursor === undefined) {
      throw new Error('Expected the filtered Search to return a continuation cursor.');
    }
    const cursor = first.value.value.nextCursor;
    expect(
      harness.service.search({
        ...request,
        sectionIds: [SECTION_TWO_ID, SECTION_ID],
        cursor,
      }),
    ).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [{ target: { kind: 'node', nodeId: PARAGRAPH_TEXT_TWO_ID } }],
          truncated: false,
        },
      },
    });
    expect(harness.service.search({ ...request, sectionIds: [SECTION_ID], cursor })).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(harness.service.search({ ...request, sectionIds: [] })).toMatchObject({
      type: 'ok',
      value: { value: { items: [] } },
    });
    expect(harness.service.search({ ...request, kinds: [] })).toMatchObject({
      type: 'ok',
      value: { value: { items: [] } },
    });
  });

  it('fails closed for missing, non-Section, and outside-scope Search filters', () => {
    const full = createHarness({ withSearchFixture: true });
    const missing = full.service.search({
      ...full.context,
      query: 'needle',
      sectionIds: [ABSENT_NODE_ID],
    });
    const nonSection = full.service.search({
      ...full.context,
      query: 'needle',
      sectionIds: [PARAGRAPH_ID],
    });
    const restricted = createHarness({
      scope: { allowedNodeIds: [PARAGRAPH_TEXT_ID] },
      withSearchFixture: true,
    });
    const outside = restricted.service.search({
      ...restricted.context,
      query: 'needle',
      sectionIds: [SECTION_ID],
    });
    expect(readSafeError(nonSection)).toEqual(readSafeError(missing));
    expect(readSafeError(outside)).toEqual(readSafeError(missing));
    expect(readSafeError(missing)).toMatchObject({ code: 'NODE_NOT_FOUND' });

    const excessiveSectionIds = Array.from({ length: 257 }, (_, index) =>
      nodeId(`018f0000-0000-7000-8007-${index.toString(16).padStart(12, '0')}`),
    );
    expect(
      full.service.search({
        ...full.context,
        query: 'needle',
        sectionIds: excessiveSectionIds,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'REQUEST_TOO_LARGE' } });
  });

  it('derives Claim authorization from real primary and target paths, never pathHint', () => {
    const hiddenTarget = createHarness({
      scope: { allowedNodeIds: [PARAGRAPH_TEXT_ID] },
      withSearchFixture: true,
    });
    expect(
      hiddenTarget.service.search({
        ...hiddenTarget.context,
        query: 'Visible claim needle',
        kinds: ['claim'],
      }),
    ).toMatchObject({ type: 'ok', value: { value: { items: [] } } });

    const exactPrimaryAndTarget = createHarness({
      scope: { allowedNodeIds: [PARAGRAPH_ID, PARAGRAPH_TEXT_ID] },
      withSearchFixture: true,
    });
    expect(
      exactPrimaryAndTarget.service.search({
        ...exactPrimaryAndTarget.context,
        query: 'Visible claim needle',
        kinds: ['claim'],
      }),
    ).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [{ target: { kind: 'academic-entity', entityId: CLAIM_ENTITY_ID } }],
        },
      },
    });

    const full = createHarness({ withSearchFixture: true });
    expect(
      full.service.search({
        ...full.context,
        query: 'Forged path needle',
        kinds: ['claim'],
        sectionIds: [SECTION_TWO_ID],
      }),
    ).toMatchObject({ type: 'ok', value: { value: { items: [] } } });
    expect(
      full.service.search({
        ...full.context,
        query: 'Forged path needle',
        kinds: ['claim'],
        sectionIds: [SECTION_ID, SECTION_TWO_ID],
      }),
    ).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [{ target: { kind: 'academic-entity', entityId: PATH_HINT_CLAIM_ID } }],
        },
      },
    });
    expect(
      full.service.search({
        ...full.context,
        query: 'Cross-document claim needle',
        kinds: ['claim'],
      }),
    ).toMatchObject({ type: 'ok', value: { value: { items: [] } } });
  });

  it('bounds Search snippets to 4096 UTF-16 units without splitting surrogate pairs', () => {
    const query = 'Q'.repeat(4_096);
    const harness = createHarness({ paragraphText: `😀${query}😀` });
    const result = harness.service.search({
      ...harness.context,
      query,
      kinds: ['text'],
    });
    if (result.type === 'error') {
      throw new Error(result.error.safeMessage);
    }
    const snippet = result.value.value.items[0]?.snippet;
    expect(snippet).toBe(query);
    expect(snippet).toHaveLength(4_096);
    expect(isWellFormedUnicodeString(snippet ?? '')).toBe(true);
  });

  it('captures Search request data once without invoking getters or Proxy get traps', () => {
    const harness = createHarness();
    let getterReads = 0;
    const accessorRequest = { ...harness.context } as Record<string, unknown>;
    Object.defineProperty(accessorRequest, 'query', {
      enumerable: true,
      get(): string {
        getterReads += 1;
        return 'Nireco';
      },
    });
    expect(harness.service.search(accessorRequest as never)).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(getterReads).toBe(0);

    let proxyReads = 0;
    const proxiedKinds = new Proxy(['text'] as const, {
      get(): never {
        proxyReads += 1;
        throw new Error('Search must not invoke an Array get trap.');
      },
    });
    const proxiedRequest = new Proxy(
      { ...harness.context, query: 'Nireco', kinds: proxiedKinds },
      {
        get(): never {
          proxyReads += 1;
          throw new Error('Search must not invoke a request get trap.');
        },
      },
    );
    expect(harness.service.search(proxiedRequest)).toMatchObject({
      type: 'ok',
      value: { value: { items: [{ kind: 'text' }] } },
    });
    expect(proxyReads).toBe(0);
  });

  it('observes live cancellation during Search traversal and contains hostile tokens', () => {
    const harness = createHarness();
    let cancellationChecks = 0;
    const cancellation = {
      get isCancellationRequested(): boolean {
        cancellationChecks += 1;
        return cancellationChecks >= 5;
      },
      throwIfCancellationRequested(): void {},
    };
    expect(
      harness.service.search({
        ...harness.context,
        cancellation,
        query: 'not-present',
      }),
    ).toMatchObject({ type: 'error', error: { code: 'CANCELLED' } });
    expect(cancellationChecks).toBeGreaterThanOrEqual(5);

    const hostileCancellation = new Proxy(cancellation, {
      get(): never {
        throw new Error('hostile cancellation token');
      },
    });
    expect(() =>
      harness.service.search({
        ...harness.context,
        cancellation: hostileCancellation,
        query: 'Nireco',
      }),
    ).not.toThrow();
    expect(
      harness.service.search({
        ...harness.context,
        cancellation: hostileCancellation,
        query: 'Nireco',
      }),
    ).toMatchObject({ type: 'error', error: { code: 'CANCELLED' } });
  });

  it('returns only scope-authorized child IDs and never expands context permission', () => {
    const exactHarness = createHarness({
      scope: {
        allowedNodeIds: [PARAGRAPH_ID],
        allowReadOutsideScopeForContext: true,
        maxContextDistance: 10,
      },
    });
    const exactNode = exactHarness.service.readNodes({
      ...exactHarness.context,
      nodeIds: [PARAGRAPH_ID],
    });
    expect(exactNode).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [
            {
              nodeId: PARAGRAPH_ID,
              nodeType: 'paragraph',
              attrs: { alignment: 'start' },
              childIds: [],
            },
          ],
        },
      },
    });
    if (exactNode.type === 'error') {
      throw new Error(exactNode.error.safeMessage);
    }
    expect(Object.hasOwn(exactNode.value.value.items[0] ?? {}, 'nodeHash')).toBe(false);

    const parentHarness = createHarness({
      scope: { allowedNodeIds: [PARAGRAPH_ID, PARAGRAPH_TEXT_ID] },
    });
    const exactParentAndChild = parentHarness.service.readNodes({
      ...parentHarness.context,
      nodeIds: [PARAGRAPH_ID],
    });
    expect(exactParentAndChild).toMatchObject({
      type: 'ok',
      value: { value: { items: [{ childIds: [PARAGRAPH_TEXT_ID] }] } },
    });

    const sectionHarness = createHarness({ scope: { allowedSectionIds: [SECTION_ID] } });
    const section = sectionHarness.service.readNodes({
      ...sectionHarness.context,
      nodeIds: [PARAGRAPH_ID],
    });
    expect(section).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [
            {
              nodeId: PARAGRAPH_ID,
              parentNodeId: SECTION_ID,
              authorizedChildIndex: 1,
              childIds: [PARAGRAPH_TEXT_ID],
            },
          ],
        },
      },
    });
    if (section.type === 'error') {
      throw new Error(section.error.safeMessage);
    }
    expect(section.value.value.items[0]?.nodeHash).toMatch(/^sha256:[a-f0-9]{64}$/u);

    const text = sectionHarness.service.readNodes({
      ...sectionHarness.context,
      nodeIds: [PARAGRAPH_TEXT_ID],
    });
    expect(text).toMatchObject({
      type: 'ok',
      value: {
        value: {
          items: [
            {
              nodeId: PARAGRAPH_TEXT_ID,
              nodeType: 'text',
              parentNodeId: PARAGRAPH_ID,
              authorizedChildIndex: 0,
              childIds: [],
              marks: [],
            },
          ],
        },
      },
    });
    if (text.type === 'error') {
      throw new Error(text.error.safeMessage);
    }
    const textItem = text.value.value.items[0];
    if (textItem?.nodeType !== 'text') {
      throw new Error('Expected the readable projection to preserve a text node.');
    }
    expect(typeof textItem.text).toBe('string');
    expect(textItem.nodeHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(Object.hasOwn(textItem, 'attrs')).toBe(false);
  });

  it('does not expose a hash oracle for hidden children of an exact non-Text node', () => {
    const firstHarness = createHarness({
      paragraphText: 'The first hidden child value.',
      scope: { allowedNodeIds: [PARAGRAPH_ID] },
    });
    const secondHarness = createHarness({
      paragraphText: 'A different hidden child value.',
      scope: { allowedNodeIds: [PARAGRAPH_ID] },
    });
    const first = firstHarness.service.readNodes({
      ...firstHarness.context,
      nodeIds: [PARAGRAPH_ID],
    });
    const second = secondHarness.service.readNodes({
      ...secondHarness.context,
      nodeIds: [PARAGRAPH_ID],
    });
    if (first.type === 'error' || second.type === 'error') {
      throw new Error('Expected both exact readable projections to succeed.');
    }
    const firstItem = first.value.value.items[0];
    const secondItem = second.value.value.items[0];
    expect(Object.hasOwn(firstItem ?? {}, 'nodeHash')).toBe(false);
    expect(Object.hasOwn(secondItem ?? {}, 'nodeHash')).toBe(false);
    expect(firstItem).toEqual(secondItem);
  });

  it('rejects a full Snapshot for every restricted scope before reading content', () => {
    const harness = createHarness({ scope: { allowedNodeIds: [PARAGRAPH_ID] } });
    expect(harness.service.getSnapshot(harness.context)).toMatchObject({
      type: 'error',
      error: { code: 'SCOPE_VIOLATION' },
    });
  });

  it('uses only the server-held Session grant and unifies unknown and revoked Sessions', () => {
    const harness = createHarness({ scope: { allowedNodeIds: [PARAGRAPH_ID] } });
    const forgedWideScope: ReadDocumentNodesRequest & { readonly scope: DocumentReadScope } = {
      ...harness.context,
      scope: {},
      nodeIds: [SECTION_ID],
    };
    expect(harness.service.readNodes(forgedWideScope)).toMatchObject({
      type: 'error',
      error: { code: 'NODE_NOT_FOUND' },
    });

    expect(
      harness.service.getHead({
        ...harness.context,
        document: { uri: URI, revisionId: REVISION_TWO },
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'SCOPE_VIOLATION', category: 'permission' },
    });

    harness.sessions.revoke(harness.context.sessionId);
    const revoked = harness.service.getHead(harness.context);
    const unknown = harness.service.getHead({
      ...harness.context,
      sessionId: sessionId('018f0000-0000-7000-8000-000000000398'),
    });
    expect(readSafeError(revoked)).toEqual(readSafeError(unknown));
    expect(readSafeError(revoked)).toMatchObject({
      code: 'SESSION_REVOKED',
      category: 'permission',
    });
  });

  it('preserves exact expired and clock-unavailable Session failure semantics', () => {
    const expired = createHarness();
    expired.sessions.failWith({ status: 'expired' });
    expect(expired.service.getHead(expired.context)).toMatchObject({
      type: 'error',
      error: {
        code: 'SESSION_EXPIRED',
        category: 'permission',
        retryable: true,
        suggestedAction: 'retry',
      },
    });

    const unavailable = createHarness();
    unavailable.sessions.failWith({ status: 'clock-unavailable' });
    expect(unavailable.service.getHead(unavailable.context)).toMatchObject({
      type: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        category: 'internal',
        retryable: true,
        suggestedAction: 'retry',
      },
    });
  });

  it('fails closed when an allowedSectionId does not identify a Section', () => {
    const harness = createHarness({ scope: { allowedSectionIds: [PARAGRAPH_ID] } });
    expect(
      harness.service.readNodes({
        ...harness.context,
        nodeIds: [PARAGRAPH_TEXT_ID],
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'SCOPE_VIOLATION', category: 'permission' },
    });
  });

  it('paginates ordered node reads with a signed cursor bound to query and scope', () => {
    const harness = createHarness({ maxPageItems: 1, withCursor: true });
    const request = {
      ...harness.context,
      nodeIds: [PARAGRAPH_ID, PARAGRAPH_TEXT_ID],
      maxResults: 1,
    } as const;
    const first = harness.service.readNodes(request);
    if (first.type === 'error') {
      throw new Error(first.error.safeMessage);
    }
    expect(first.value.value).toMatchObject({
      truncated: true,
      items: [{ nodeId: PARAGRAPH_ID }],
    });
    expect(first.value.value.nextCursor).toEqual(expect.any(String));
    const serializedFirst = serializeCanonicalJson(first);
    if (serializedFirst.type === 'error') {
      throw new Error('Expected the document page Result to serialize canonically.');
    }
    expect(first.value.value.approximateBytes).toBe(encodeUtf8(serializedFirst.value).length);
    const nextCursor = first.value.value.nextCursor;
    if (nextCursor === undefined) {
      throw new Error('Expected the truncated read to return a cursor.');
    }

    const second = harness.service.readNodes({
      ...request,
      cursor: nextCursor,
    });
    expect(second).toMatchObject({
      type: 'ok',
      value: {
        value: {
          truncated: false,
          items: [{ nodeId: PARAGRAPH_TEXT_ID }],
        },
      },
    });

    const differentlyScoped = createHarness({
      maxPageItems: 1,
      withCursor: true,
      sessionId: harness.context.sessionId,
      scope: { allowedNodeIds: [PARAGRAPH_ID, PARAGRAPH_TEXT_ID] },
    });
    expect(
      differentlyScoped.service.readNodes({
        ...differentlyScoped.context,
        nodeIds: request.nodeIds,
        maxResults: request.maxResults,
        cursor: nextCursor,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCHEMA_INVALID' } });
  });

  it('fails typed when pagination is required without a secure cursor adapter', () => {
    const harness = createHarness({ maxPageItems: 1 });
    expect(
      harness.service.readNodes({
        ...harness.context,
        nodeIds: [PARAGRAPH_ID, PARAGRAPH_TEXT_ID],
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'CAPABILITY_UNSUPPORTED', category: 'compatibility' },
    });
  });

  it('enforces request, response, and cancellation limits with typed errors', () => {
    const requestLimited = createHarness({ maxPageItems: 1, maxRequestNodeIds: 1 });
    expect(
      requestLimited.service.readNodes({
        ...requestLimited.context,
        nodeIds: [PARAGRAPH_ID, PARAGRAPH_TEXT_ID],
      }),
    ).toMatchObject({ type: 'error', error: { code: 'REQUEST_TOO_LARGE' } });

    const excessiveScopeIds = Array.from({ length: MAX_DOCUMENT_READ_SCOPE_IDS + 1 }, (_, index) =>
      nodeId(`018f0000-0000-7000-8008-${index.toString(16).padStart(12, '0')}`),
    );
    const scopeLimited = createHarness({
      scope: {
        allowedNodeIds: excessiveScopeIds.slice(0, 500),
        allowedSectionIds: excessiveScopeIds.slice(500),
      },
    });
    expect(scopeLimited.service.getHead(scopeLimited.context)).toMatchObject({
      type: 'error',
      error: { code: 'SCOPE_VIOLATION' },
    });

    const responseLimited = createHarness({ maxResponseBytes: 200 });
    expect(responseLimited.service.getSnapshot(responseLimited.context)).toMatchObject({
      type: 'error',
      error: { code: 'REQUEST_TOO_LARGE' },
    });

    const cancelled = createHarness();
    expect(
      cancelled.service.search({
        ...cancelled.context,
        cancellation: {
          isCancellationRequested: true,
          throwIfCancellationRequested(): void {
            throw new Error('cancelled');
          },
        },
        query: 'Nireco',
      }),
    ).toMatchObject({ type: 'error', error: { code: 'CANCELLED', category: 'transport' } });

    expect(
      cancelled.service.getOutline({
        ...cancelled.context,
        maxDepth: 257,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCHEMA_INVALID' } });
  });

  it('fails instead of returning a zero-progress cursor for one oversized item', () => {
    const harness = createHarness({
      maxPageItems: 1,
      maxResponseBytes: 1_500,
      paragraphText: 'x'.repeat(4_096),
      withCursor: true,
    });
    expect(
      harness.service.readNodes({
        ...harness.context,
        nodeIds: [PARAGRAPH_TEXT_ID, PARAGRAPH_ID],
        maxResults: 1,
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'REQUEST_TOO_LARGE' },
    });
  });

  it('reads a paged block neighborhood without counting hidden blocks', () => {
    const harness = createHarness({
      maxPageItems: 1,
      scope: { allowedNodeIds: [SECTION_ID, PARAGRAPH_ID] },
      withCursor: true,
    });
    const request = {
      ...harness.context,
      nodeId: PARAGRAPH_ID,
      beforeBlocks: 1,
      afterBlocks: 0,
      maxResults: 1,
    } as const;
    const first = harness.service.readNodeNeighborhood(request);
    expect(first).toMatchObject({
      type: 'ok',
      value: {
        basedOnRevisionId: REVISION_ONE,
        value: {
          centerNodeId: PARAGRAPH_ID,
          items: [{ nodeId: SECTION_ID }],
          truncated: true,
        },
      },
    });
    assertExactPageBytes(first);
    if (first.type === 'error' || first.value.value.nextCursor === undefined) {
      throw new Error('Expected a paged neighborhood cursor.');
    }
    expect(Object.hasOwn(first.value.value.items[0] ?? {}, 'nodeHash')).toBe(false);

    const second = harness.service.readNodeNeighborhood({
      ...request,
      cursor: first.value.value.nextCursor,
    });
    expect(second).toMatchObject({
      type: 'ok',
      value: {
        value: {
          centerNodeId: PARAGRAPH_ID,
          items: [{ nodeId: PARAGRAPH_ID }],
          truncated: false,
        },
      },
    });
    assertExactPageBytes(second);
  });

  it('supports an authorized Text center and hides outside or nonexistent centers identically', () => {
    const harness = createHarness({ scope: { allowedNodeIds: [PARAGRAPH_TEXT_ID] } });
    const centered = harness.service.readNodeNeighborhood({
      ...harness.context,
      nodeId: PARAGRAPH_TEXT_ID,
      beforeBlocks: 100,
      afterBlocks: 100,
    });
    expect(centered).toMatchObject({
      type: 'ok',
      value: {
        value: {
          centerNodeId: PARAGRAPH_TEXT_ID,
          items: [{ nodeId: PARAGRAPH_TEXT_ID, nodeType: 'text' }],
        },
      },
    });
    if (centered.type === 'error') {
      throw new Error(centered.error.safeMessage);
    }
    expect(centered.value.value.items[0]?.nodeHash).toMatch(/^sha256:[a-f0-9]{64}$/u);

    const outside = harness.service.readNodeNeighborhood({
      ...harness.context,
      nodeId: SECTION_ID,
      beforeBlocks: 0,
      afterBlocks: 0,
    });
    const missing = harness.service.readNodeNeighborhood({
      ...harness.context,
      nodeId: ABSENT_NODE_ID,
      beforeBlocks: 0,
      afterBlocks: 0,
    });
    expect(readSafeError(outside)).toEqual(readSafeError(missing));
    expect(readSafeError(outside)).toMatchObject({ code: 'NODE_NOT_FOUND' });
    expect(
      harness.service.readNodeNeighborhood({
        ...harness.context,
        nodeId: PARAGRAPH_TEXT_ID,
        beforeBlocks: 101,
        afterBlocks: 0,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCHEMA_INVALID' } });
  });

  it('binds changes-since pages to one captured head and invalidates them when head advances', () => {
    const revisions = [
      makeReadRevision(REVISION_MIDDLE, 1, REVISION_ONE, TRANSACTION_MIDDLE),
      makeReadRevision(REVISION_TWO, 2, REVISION_MIDDLE, TRANSACTION_TWO),
    ];
    const history = new RecordingHistorySource(revisions);
    const harness = createHarness({
      maxPageItems: 1,
      revisionHistorySource: history,
      withCursor: true,
    });
    harness.model.advanceHead(REVISION_TWO);
    const request = {
      ...harness.context,
      sinceRevisionId: REVISION_ONE,
      maxResults: 1,
    } as const;
    const first = harness.service.getChangesSince(request);
    expect(first).toMatchObject({
      type: 'ok',
      value: {
        document: { revisionId: REVISION_TWO },
        basedOnRevisionId: REVISION_TWO,
        status: 'current',
        value: {
          fromRevisionId: REVISION_ONE,
          basedOnRevisionId: REVISION_TWO,
          items: [{ revision: { id: REVISION_MIDDLE } }],
          truncated: true,
        },
      },
    });
    assertExactPageBytes(first);
    if (first.type === 'error' || first.value.value.nextCursor === undefined) {
      throw new Error('Expected a changes-since cursor.');
    }
    const cursor = first.value.value.nextCursor;
    expect(
      harness.service.getChangesSince({
        ...request,
        cursor,
      }),
    ).toMatchObject({
      type: 'ok',
      value: {
        document: { revisionId: REVISION_TWO },
        value: {
          fromRevisionId: REVISION_ONE,
          items: [{ revision: { id: REVISION_TWO } }],
          truncated: false,
        },
      },
    });

    harness.model.advanceHead(REVISION_THREE);
    const callsBeforeReplay = history.calls.length;
    expect(harness.service.getChangesSince({ ...request, cursor })).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(history.calls).toHaveLength(callsBeforeReplay);
  });

  it('fails closed when changes history is unavailable or Scope-restricted', () => {
    const withoutHistory = createHarness();
    expect(
      withoutHistory.service.getChangesSince({
        ...withoutHistory.context,
        sinceRevisionId: REVISION_ONE,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'CAPABILITY_UNSUPPORTED' } });

    const history = new RecordingHistorySource([]);
    const restricted = createHarness({
      revisionHistorySource: history,
      scope: { allowedNodeIds: [PARAGRAPH_ID] },
    });
    expect(
      restricted.service.getChangesSince({
        ...restricted.context,
        sinceRevisionId: REVISION_ONE,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCOPE_VIOLATION' } });
    expect(history.calls).toEqual([]);
  });

  it('filters exact-Revision diagnostics and binds pagination to the normalized query', () => {
    const diagnostics = new RecordingDiagnosticsSource([
      makeDiagnostic('diag-info', 'info', 'INFO_A'),
      {
        ...makeDiagnostic('diag-warning', 'warning', 'WARN_B'),
        related: [
          { message: 'wire-safe related' },
          { message: 'kept', target: diagnosticTarget() },
        ],
      },
      makeDiagnostic('diag-error', 'error', 'ERROR_C'),
    ]);
    const harness = createHarness({
      diagnosticsSource: diagnostics,
      maxPageItems: 1,
      withCursor: true,
    });
    harness.model.advanceHead(REVISION_TWO);
    const request = {
      ...harness.context,
      severities: ['error', 'warning'] as const,
      codes: ['ERROR_C', 'WARN_B'] as const,
      maxResults: 1,
    };
    const first = harness.service.getDiagnostics(request);
    expect(first).toMatchObject({
      type: 'ok',
      value: {
        basedOnRevisionId: REVISION_ONE,
        status: 'stale',
        value: {
          items: [{ id: 'diag-warning', related: [{ message: 'kept' }] }],
          truncated: true,
        },
      },
    });
    assertExactPageBytes(first);
    if (first.type === 'error' || first.value.value.nextCursor === undefined) {
      throw new Error('Expected a diagnostics cursor.');
    }
    expect(diagnostics.calls[0]).toMatchObject({
      document: { revisionId: REVISION_ONE },
      scope: {},
    });
    const cursor = first.value.value.nextCursor;
    expect(harness.service.getDiagnostics({ ...request, cursor })).toMatchObject({
      type: 'ok',
      value: { value: { items: [{ id: 'diag-error' }], truncated: false } },
    });
    expect(
      harness.service.getDiagnostics({
        ...request,
        codes: ['WARN_B'],
        cursor,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCHEMA_INVALID' } });
  });

  it('rejects unavailable, restricted, mismatched, and malformed diagnostic reads', () => {
    const withoutSource = createHarness();
    expect(withoutSource.service.getDiagnostics(withoutSource.context)).toMatchObject({
      type: 'error',
      error: { code: 'CAPABILITY_UNSUPPORTED' },
    });

    const source = new RecordingDiagnosticsSource([makeDiagnostic('diag', 'info', 'INFO_A')]);
    const restricted = createHarness({
      diagnosticsSource: source,
      scope: { allowedNodeIds: [PARAGRAPH_ID] },
    });
    expect(restricted.service.getDiagnostics(restricted.context)).toMatchObject({
      type: 'error',
      error: { code: 'SCOPE_VIOLATION' },
    });
    expect(source.calls).toEqual([]);

    const mismatched = createHarness({
      diagnosticsSource: new RecordingDiagnosticsSource([
        {
          ...makeDiagnostic('wrong-revision', 'error', 'ERROR_C'),
          basedOnRevisionId: REVISION_TWO,
        },
      ]),
    });
    expect(mismatched.service.getDiagnostics(mismatched.context)).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(
      mismatched.service.getDiagnostics({
        ...mismatched.context,
        codes: ['lowercase'],
      }),
    ).toMatchObject({ type: 'error', error: { code: 'SCHEMA_INVALID' } });
  });

  it('applies cancellation and zero-progress byte limits to every new read endpoint', () => {
    const history = new RecordingHistorySource([
      makeReadRevision(REVISION_TWO, 1, REVISION_ONE, TRANSACTION_TWO),
    ]);
    const diagnostics = new RecordingDiagnosticsSource([
      makeDiagnostic('oversized-diagnostic', 'error', 'ERROR_C'),
    ]);
    const cancelled = createHarness({
      diagnosticsSource: diagnostics,
      revisionHistorySource: history,
    });
    const cancellation = {
      isCancellationRequested: true,
      throwIfCancellationRequested(): void {
        throw new Error('cancelled');
      },
    } as const;
    expect(
      cancelled.service.readNodeNeighborhood({
        ...cancelled.context,
        cancellation,
        nodeId: PARAGRAPH_ID,
        beforeBlocks: 0,
        afterBlocks: 0,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'CANCELLED' } });
    expect(
      cancelled.service.getChangesSince({
        ...cancelled.context,
        cancellation,
        sinceRevisionId: REVISION_ONE,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'CANCELLED' } });
    expect(cancelled.service.getDiagnostics({ ...cancelled.context, cancellation })).toMatchObject({
      type: 'error',
      error: { code: 'CANCELLED' },
    });

    const bounded = createHarness({
      diagnosticsSource: diagnostics,
      maxResponseBytes: 100,
      revisionHistorySource: history,
    });
    bounded.model.advanceHead(REVISION_TWO);
    expect(
      bounded.service.readNodeNeighborhood({
        ...bounded.context,
        nodeId: PARAGRAPH_ID,
        beforeBlocks: 0,
        afterBlocks: 0,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'REQUEST_TOO_LARGE' } });
    expect(
      bounded.service.getChangesSince({
        ...bounded.context,
        sinceRevisionId: REVISION_ONE,
      }),
    ).toMatchObject({ type: 'error', error: { code: 'REQUEST_TOO_LARGE' } });
    expect(bounded.service.getDiagnostics(bounded.context)).toMatchObject({
      type: 'error',
      error: { code: 'REQUEST_TOO_LARGE' },
    });
  });
});

interface Harness {
  readonly service: InProcessDocumentReadService;
  readonly model: TestReadModel;
  readonly sessions: TestReadSessionSource;
  readonly context: DocumentReadContext;
}

function createHarness(
  options: {
    readonly maxPageItems?: number;
    readonly maxQueryUtf16Units?: number;
    readonly maxRequestNodeIds?: number;
    readonly maxResponseBytes?: number;
    readonly diagnosticsSource?: DocumentDiagnosticsSource;
    readonly paragraphText?: string;
    readonly revisionHistorySource?: DocumentRevisionHistorySource;
    readonly scope?: DocumentReadScope;
    readonly sessionId?: SessionId;
    readonly withCursor?: boolean;
    readonly withSearchFixture?: boolean;
  } = {},
): Harness {
  const ids = new DeterministicIdAllocator();
  const first = createReadSnapshot(
    REVISION_ONE,
    options.paragraphText ?? 'This is the first revision for Nireco.',
    { withSearchFixture: options.withSearchFixture ?? false },
  );
  const second = createReadSnapshot(REVISION_TWO, 'This is the newest revision.');
  const model = new TestReadModel(first, second, ids);
  const sessionId = options.sessionId ?? ids.allocateSessionId();
  const document = { uri: URI, revisionId: REVISION_ONE } as const;
  const sessions = new TestReadSessionSource(sessionId, {
    document,
    scope: options.scope ?? {},
  });
  const cursorAdapter = options.withCursor
    ? new PortableDocumentReadCursorCodec({
        clock: new FixedClock(),
        signingKey: new Uint8Array(32).fill(7),
      })
    : undefined;
  const service = new InProcessDocumentReadService({
    source: {
      get: (uri) => (uri === URI ? model : undefined),
    },
    sessions,
    ids,
    ...(options.diagnosticsSource === undefined
      ? {}
      : { diagnosticsSource: options.diagnosticsSource }),
    ...(options.revisionHistorySource === undefined
      ? {}
      : { revisionHistorySource: options.revisionHistorySource }),
    ...(cursorAdapter === undefined ? {} : { cursorAdapter }),
    limits: createHarnessLimits(options),
  });
  return {
    service,
    model,
    sessions,
    context: {
      sessionId,
      document,
    },
  };
}

function createHarnessLimits(options: {
  readonly maxPageItems?: number;
  readonly maxQueryUtf16Units?: number;
  readonly maxRequestNodeIds?: number;
  readonly maxResponseBytes?: number;
}): Partial<DocumentReadLimits> {
  return {
    ...(options.maxPageItems === undefined ? {} : { maxPageItems: options.maxPageItems }),
    ...(options.maxRequestNodeIds === undefined
      ? {}
      : { maxRequestNodeIds: options.maxRequestNodeIds }),
    ...(options.maxQueryUtf16Units === undefined
      ? {}
      : { maxQueryUtf16Units: options.maxQueryUtf16Units }),
    ...(options.maxResponseBytes === undefined
      ? {}
      : { maxResponseBytes: options.maxResponseBytes }),
  };
}

class TestReadSessionSource implements DocumentReadSessionSource {
  readonly #grants = new Map<SessionId, DocumentReadSessionGrant>();
  #failure: DocumentReadSessionFailure | undefined;

  constructor(sessionId: SessionId, grant: DocumentReadSessionGrant) {
    this.#grants.set(sessionId, grant);
  }

  resolve(sessionId: SessionId): DocumentReadSessionGrant | DocumentReadSessionFailure | undefined {
    return this.#failure ?? this.#grants.get(sessionId);
  }

  revoke(sessionId: SessionId): void {
    this.#grants.delete(sessionId);
  }

  failWith(failure: DocumentReadSessionFailure): void {
    this.#failure = failure;
  }
}

class TestReadModel implements INirecoModel {
  readonly #snapshots: ReadonlyMap<RevisionId, DocumentSnapshot>;
  readonly #ids: DeterministicIdAllocator;
  #headRevisionId: RevisionId;
  #disposed = false;

  readonly uri = URI;
  readonly schemaId = 'nireco.manuscript';

  constructor(first: DocumentSnapshot, second: DocumentSnapshot, ids: DeterministicIdAllocator) {
    this.#snapshots = new Map([
      [first.revisionId, first],
      [second.revisionId, second],
    ]);
    this.#headRevisionId = first.revisionId;
    this.#ids = ids;
  }

  get headRevisionId(): RevisionId {
    return this.#headRevisionId;
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  advanceHead(revisionId: RevisionId): void {
    this.#headRevisionId = revisionId;
  }

  getSnapshot(revisionId = this.#headRevisionId): Result<DocumentSnapshot> {
    const snapshot = this.#snapshots.get(revisionId);
    return snapshot === undefined
      ? this.#error('REVISION_NOT_FOUND', 'The requested Revision is unavailable.')
      : { type: 'ok', value: snapshot };
  }

  async applyTransaction(transaction: Transaction): Promise<Result<CommitResult>> {
    void transaction;
    return this.#error('CAPABILITY_UNSUPPORTED', 'The read test Model is immutable.');
  }

  getDurability(revisionId: RevisionId): Result<DurabilityLevel> {
    return this.#snapshots.has(revisionId)
      ? { type: 'ok', value: 'snapshot' }
      : this.#error('REVISION_NOT_FOUND', 'The requested Revision is unavailable.');
  }

  async whenDurable(
    revisionId: RevisionId,
    target: DurabilityLevel,
  ): Promise<Result<DurabilityAcknowledgement>> {
    void target;
    return this.#snapshots.has(revisionId)
      ? {
          type: 'ok',
          value: {
            revisionId,
            achievedDurability: 'snapshot',
            authorityMode: 'read-only',
          },
        }
      : this.#error('REVISION_NOT_FOUND', 'The requested Revision is unavailable.');
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
  }

  #error<TValue>(code: NirecoError['code'], safeMessage: string): Result<TValue> {
    return {
      type: 'error',
      error: {
        code,
        category: 'validation',
        retryable: false,
        safeMessage,
        debugId: this.#ids.allocateDebugId(),
        suggestedAction: 'abort',
      },
    };
  }
}

function createReadSnapshot(
  revisionId: RevisionId,
  paragraphText: string,
  options: { readonly withSearchFixture?: boolean } = {},
): DocumentSnapshot {
  const minimal = createMinimalSnapshot(revisionId);
  const frontMatter = minimal.root.children[0];
  const bibliography = minimal.root.children[2];
  if (frontMatter.type !== 'frontMatter' || bibliography?.type !== 'bibliographyPlaceholder') {
    throw new Error('The minimal read fixture has an unexpected root shape.');
  }
  const snapshot: DocumentSnapshot = {
    ...minimal,
    academicGraph:
      options.withSearchFixture === true
        ? createSearchAcademicGraph(minimal, revisionId)
        : minimal.academicGraph,
    root: {
      ...minimal.root,
      children: [
        frontMatter,
        {
          id: MINIMAL_FIXTURE_IDS.body,
          type: 'body',
          attrs: {},
          children: [
            {
              id: SECTION_ID,
              type: 'section',
              attrs: { level: 1 },
              children: [
                {
                  id: HEADING_ID,
                  type: 'heading',
                  attrs: { level: 1 },
                  children: [
                    {
                      id: HEADING_TEXT_ID,
                      type: 'text',
                      value: 'Scoped heading',
                      marks: [],
                    },
                  ],
                },
                {
                  id: PARAGRAPH_ID,
                  type: 'paragraph',
                  attrs: { alignment: 'start' },
                  children: [
                    {
                      id: PARAGRAPH_TEXT_ID,
                      type: 'text',
                      value: paragraphText,
                      marks: [],
                    },
                    ...(options.withSearchFixture === true
                      ? [
                          {
                            id: CITATION_NODE_ID,
                            type: 'citation' as const,
                            attrs: {
                              citationId: CITATION_ENTITY_ID,
                              referenceId: REFERENCE_ENTITY_ID,
                              prefix: 'Visible citation prefix',
                              locator: { label: 'page' as const, value: '42' },
                              suffix: 'Visible citation suffix',
                            },
                          },
                        ]
                      : []),
                  ],
                },
              ],
            },
            ...(options.withSearchFixture === true
              ? [
                  {
                    id: SECTION_TWO_ID,
                    type: 'section' as const,
                    attrs: { level: 1 as const },
                    children: [
                      {
                        id: HEADING_TWO_ID,
                        type: 'heading' as const,
                        attrs: { level: 1 as const },
                        children: [
                          {
                            id: HEADING_TEXT_TWO_ID,
                            type: 'text' as const,
                            value: 'Secondary heading',
                            marks: [],
                          },
                        ],
                      },
                      {
                        id: PARAGRAPH_TWO_ID,
                        type: 'paragraph' as const,
                        attrs: { alignment: 'start' as const },
                        children: [
                          {
                            id: PARAGRAPH_TEXT_TWO_ID,
                            type: 'text' as const,
                            value: 'Second section needle.',
                            marks: [],
                          },
                        ],
                      },
                    ] as const,
                  },
                ]
              : []),
          ],
        },
        bibliography,
      ],
    },
  };
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(snapshot),
  );
  if (hashed.type === 'error') {
    throw new Error('The read-service fixture could not be hashed.');
  }
  return { ...snapshot, documentHash: hashed.hash };
}

function createSearchAcademicGraph(
  snapshot: DocumentSnapshot,
  revisionId: RevisionId,
): DocumentSnapshot['academicGraph'] {
  const primaryPath = [
    snapshot.root.id,
    MINIMAL_FIXTURE_IDS.body,
    SECTION_ID,
    PARAGRAPH_ID,
    PARAGRAPH_TEXT_ID,
  ] as const;
  const secondSectionPath = [snapshot.root.id, MINIMAL_FIXTURE_IDS.body, SECTION_TWO_ID] as const;
  return {
    ...snapshot.academicGraph,
    referenceSnapshots: [
      {
        id: REFERENCE_ENTITY_ID,
        cslJson: { title: 'CSL_ONLY_SECRET' },
        metadataHash: validContentHash(
          'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        ),
        capturedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
      },
    ],
    claims: [
      {
        id: CLAIM_ENTITY_ID,
        anchor: {
          document: { uri: URI, revisionId },
          primary: {
            kind: 'text',
            textNodeId: PARAGRAPH_TEXT_ID,
            utf16Offset: validUtf16Offset(0),
            affinity: 'after',
          },
          targetNodeId: PARAGRAPH_ID,
          pathHint: primaryPath,
        },
        textSnapshot: 'Visible claim needle',
        textHash: validContentHash(
          'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ),
      },
      {
        id: CROSS_DOCUMENT_CLAIM_ID,
        anchor: {
          document: { uri: OTHER_DOCUMENT_URI, revisionId },
          primary: {
            kind: 'text',
            textNodeId: PARAGRAPH_TEXT_ID,
            utf16Offset: validUtf16Offset(0),
            affinity: 'after',
          },
          pathHint: primaryPath,
        },
        textSnapshot: 'Cross-document claim needle',
        textHash: validContentHash(
          'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ),
      },
      {
        id: PATH_HINT_CLAIM_ID,
        anchor: {
          document: { uri: URI, revisionId },
          primary: {
            kind: 'text',
            textNodeId: PARAGRAPH_TEXT_ID,
            utf16Offset: validUtf16Offset(0),
            affinity: 'after',
          },
          targetNodeId: SECTION_TWO_ID,
          pathHint: secondSectionPath,
        },
        textSnapshot: 'Forged path needle',
        textHash: validContentHash(
          'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        ),
      },
    ],
  };
}

class RecordingHistorySource implements DocumentRevisionHistorySource {
  readonly calls: Parameters<DocumentRevisionHistorySource['getRevisions']>[0][] = [];
  readonly #revisions: readonly Revision[];

  constructor(revisions: readonly Revision[]) {
    this.#revisions = revisions;
  }

  getRevisions(
    request: Parameters<DocumentRevisionHistorySource['getRevisions']>[0],
  ): ReturnType<DocumentRevisionHistorySource['getRevisions']> {
    this.calls.push(request);
    return { type: 'ok', value: this.#revisions };
  }
}

class RecordingDiagnosticsSource implements DocumentDiagnosticsSource {
  readonly calls: Parameters<DocumentDiagnosticsSource['getDiagnostics']>[0][] = [];
  readonly #diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    this.#diagnostics = diagnostics;
  }

  getDiagnostics(
    request: Parameters<DocumentDiagnosticsSource['getDiagnostics']>[0],
  ): ReturnType<DocumentDiagnosticsSource['getDiagnostics']> {
    this.calls.push(request);
    return { type: 'ok', value: this.#diagnostics };
  }
}

function makeReadRevision(
  id: RevisionId,
  sequence: number,
  parentRevisionId: RevisionId,
  transactionId: TransactionId,
): Revision {
  return {
    id,
    uri: URI,
    parentRevisionId,
    transactionId,
    sequence,
    documentHash: validContentHash(`sha256:${sequence.toString(16).padStart(64, '0')}`),
    actor: { type: 'system', id: 'document-read-history', role: 'recovery' },
    createdAt: validIsoTimestamp(`2026-07-20T00:00:0${sequence}Z`),
    durability: 'memory',
  };
}

function makeDiagnostic(id: string, severity: Diagnostic['severity'], code: string): Diagnostic {
  return {
    id,
    source: 'document-read-test',
    severity,
    code,
    message: `${code} diagnostic`,
    target: diagnosticTarget(),
    basedOnRevisionId: REVISION_ONE,
    stale: false,
  };
}

function diagnosticTarget(): NonNullable<Diagnostic['target']> {
  return {
    kind: 'node',
    document: { uri: URI, revisionId: REVISION_ONE },
    nodeId: PARAGRAPH_ID,
  };
}

function assertExactPageBytes(
  result: Result<{ readonly value: { readonly approximateBytes: number } }>,
): void {
  if (result.type === 'error') {
    throw new Error(result.error.safeMessage);
  }
  const serialized = serializeCanonicalJson(result);
  if (serialized.type === 'error') {
    throw new Error('Expected the document page Result to be canonical JSON.');
  }
  expect(result.value.value.approximateBytes).toBe(encodeUtf8(serialized.value).length);
}

function readSafeError<TValue>(result: Result<TValue>): {
  readonly code: NirecoError['code'];
  readonly category: NirecoError['category'];
  readonly safeMessage: string;
  readonly suggestedAction: NirecoError['suggestedAction'];
} {
  if (result.type === 'ok') {
    throw new Error('Expected a typed document read error.');
  }
  return {
    code: result.error.code,
    category: result.error.category,
    safeMessage: result.error.safeMessage,
    suggestedAction: result.error.suggestedAction,
  };
}

function revisionId(value: string): RevisionId {
  const parsed = parseRevisionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Revision ID: ${value}`);
  }
  return parsed.value;
}

function nodeId(value: string): NodeId {
  const parsed = parseNodeId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Node ID: ${value}`);
  }
  return parsed.value;
}

function entityId(value: string): EntityId {
  const parsed = parseEntityId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Entity ID: ${value}`);
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

function sessionId(value: string): SessionId {
  const parsed = parseSessionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Session ID: ${value}`);
  }
  return parsed.value;
}
