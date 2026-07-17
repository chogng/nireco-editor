import { describe, expect, it } from 'vitest';

import { parseNodeId, type NodeId } from '../../src/base/ids/identifiers.js';
import {
  DOCUMENT_READ_QUERY_HASH_PREIMAGE_PREFIX,
  DOCUMENT_READ_QUERY_SERVICES,
  MAX_DOCUMENT_DIAGNOSTIC_CODES,
  MAX_DOCUMENT_READ_NEIGHBORHOOD_BLOCKS,
  MAX_DOCUMENT_READ_OUTLINE_DEPTH,
  MAX_DOCUMENT_READ_QUERY_ITEMS,
  MAX_DOCUMENT_READ_QUERY_STRING_UTF16_UNITS,
  MAX_DOCUMENT_SEARCH_SECTION_IDS,
  createDocumentReadQueryHash,
} from '../../src/services/document-service/read-query-hash.js';

const NODE_ID = nodeId('018f0000-0000-7000-8000-000000000001');
const OTHER_NODE_ID = nodeId('018f0000-0000-7000-8000-000000000002');

describe('createDocumentReadQueryHash', () => {
  it('freezes the dedicated preimage, canonical payload, and SHA-256 golden vector', () => {
    const result = createDocumentReadQueryHash({
      service: 'document.get_outline',
      maxResults: 25,
      maxDepth: 3,
    });

    expect(result).toEqual({
      type: 'ok',
      hash: 'sha256:523fe0b9dbf37cf5a5661249ff79c5be97536584efe358331bdff08c20b04041',
      canonicalJson: '{"maxDepth":3,"maxResults":25,"service":"document.get_outline"}',
      preimage:
        DOCUMENT_READ_QUERY_HASH_PREIMAGE_PREFIX +
        '{"maxDepth":3,"maxResults":25,"service":"document.get_outline"}',
    });
  });

  it('supports all nine Gate 1 read endpoints and separates their hash domains by service', () => {
    const hashes = DOCUMENT_READ_QUERY_SERVICES.map((service) => queryHash({ service }));

    expect(hashes).toHaveLength(9);
    expect(new Set(hashes)).toHaveLength(9);
  });

  it('stabilizes outline property order without depending on caller insertion order', () => {
    expect(queryHash({ service: 'document.get_outline', maxDepth: 4, maxResults: 100 })).toBe(
      queryHash({ maxResults: 100, maxDepth: 4, service: 'document.get_outline' }),
    );
  });

  it('preserves read_nodes order because it determines result order', () => {
    const forward = queryHash({
      service: 'document.read_nodes',
      nodeIds: [NODE_ID, OTHER_NODE_ID],
      maxResults: 2,
    });
    const reverse = queryHash({
      service: 'document.read_nodes',
      nodeIds: [OTHER_NODE_ID, NODE_ID],
      maxResults: 2,
    });

    expect(forward).not.toBe(reverse);
  });

  it('normalizes set-like search kinds and section IDs', () => {
    const first = queryHash({
      service: 'document.search',
      query: 'evidence',
      sectionIds: [OTHER_NODE_ID, NODE_ID],
      kinds: ['heading', 'text'],
      maxResults: 50,
    });
    const second = queryHash({
      service: 'document.search',
      query: 'evidence',
      sectionIds: [NODE_ID, OTHER_NODE_ID],
      kinds: ['text', 'heading'],
      maxResults: 50,
    });

    expect(first).toBe(second);
  });

  it('does not perform implicit Unicode normalization', () => {
    const composed = queryHash({
      service: 'document.search',
      query: 'é',
      kinds: ['text'],
      maxResults: 10,
    });
    const decomposed = queryHash({
      service: 'document.search',
      query: 'e\u0301',
      kinds: ['text'],
      maxResults: 10,
    });

    expect(composed).not.toBe(decomposed);
  });

  it('rejects cursor, position, common binding data, and endpoint-unknown fields', () => {
    for (const input of [
      { service: 'document.get_outline', cursor: 'opaque' },
      { service: 'document.get_outline', position: 3 },
      { service: 'document.get_outline', sessionId: 'not-query-data' },
      { service: 'document.search', nodeIds: [NODE_ID] },
      { service: 'document.get_head', maxResults: 10 },
    ]) {
      expect(createDocumentReadQueryHash(input)).toEqual({
        type: 'error',
        reason: 'invalid-query',
      });
    }
  });

  it('captures descriptors once, never invokes ordinary getters, and rejects accessors', () => {
    let proxyGetCalls = 0;
    const target = {
      service: 'document.get_outline',
      maxDepth: 2,
      maxResults: 20,
    };
    const proxy = new Proxy(target, {
      get: () => {
        proxyGetCalls += 1;
        return 'attacker-value';
      },
    });
    expect(queryHash(proxy)).toBe(queryHash(target));
    expect(proxyGetCalls).toBe(0);

    let accessorCalls = 0;
    const accessorInput = {
      get service(): string {
        accessorCalls += 1;
        return 'document.get_outline';
      },
      maxDepth: 2,
      maxResults: 20,
    };
    expect(createDocumentReadQueryHash(accessorInput)).toEqual({
      type: 'error',
      reason: 'invalid-query',
    });
    expect(accessorCalls).toBe(0);
  });

  it('rejects malformed plain data, invalid Unicode, invalid IDs, and duplicate sets', () => {
    const sparseNodeIds = new Array<NodeId>(2);
    sparseNodeIds[1] = NODE_ID;
    const symbolQuery = { service: 'document.get_head' };
    Object.defineProperty(symbolQuery, Symbol('hidden'), {
      enumerable: true,
      value: true,
    });

    for (const input of [
      null,
      [],
      { service: 'unknown.read' },
      { service: 'document.search', query: '\ud800' },
      { service: 'document.read_nodes', nodeIds: sparseNodeIds },
      { service: 'document.read_nodes', nodeIds: [NODE_ID, NODE_ID] },
      {
        service: 'document.read_node_neighborhood',
        nodeId: '018F0000-0000-7000-8000-000000000001',
      },
      { service: 'document.search', kinds: ['text', 'text'] },
      symbolQuery,
    ]) {
      expect(createDocumentReadQueryHash(input)).toEqual({
        type: 'error',
        reason: 'invalid-query',
      });
    }
  });

  it('enforces item, string, diagnostic-code, and page-size limits before hashing', () => {
    expect(
      createDocumentReadQueryHash({
        service: 'document.read_nodes',
        nodeIds: new Array(MAX_DOCUMENT_READ_QUERY_ITEMS + 1).fill(NODE_ID),
      }),
    ).toEqual({ type: 'error', reason: 'query-too-large' });
    expect(
      createDocumentReadQueryHash({
        service: 'document.search',
        query: 'a'.repeat(MAX_DOCUMENT_READ_QUERY_STRING_UTF16_UNITS + 1),
      }),
    ).toEqual({ type: 'error', reason: 'query-too-large' });

    expect(
      createDocumentReadQueryHash({
        service: 'document.get_diagnostics',
        codes: ['lowercase'],
      }),
    ).toEqual({ type: 'error', reason: 'invalid-query' });
    expect(
      createDocumentReadQueryHash({
        service: 'document.get_diagnostics',
        codes: [`A${'B'.repeat(128)}`],
      }),
    ).toEqual({ type: 'error', reason: 'invalid-query' });

    expect(
      createDocumentReadQueryHash({
        service: 'document.get_outline',
        maxResults: 1_001,
      }),
    ).toEqual({ type: 'error', reason: 'invalid-query' });
  });

  it('matches the Contract hard caps for outline, neighborhood, search, and diagnostics', () => {
    expect(
      createDocumentReadQueryHash({
        service: 'document.get_outline',
        maxDepth: MAX_DOCUMENT_READ_OUTLINE_DEPTH,
      }).type,
    ).toBe('ok');
    expect(
      createDocumentReadQueryHash({
        service: 'document.get_outline',
        maxDepth: MAX_DOCUMENT_READ_OUTLINE_DEPTH + 1,
      }),
    ).toEqual({ type: 'error', reason: 'invalid-query' });

    expect(
      createDocumentReadQueryHash({
        service: 'document.read_node_neighborhood',
        nodeId: NODE_ID,
        beforeBlocks: MAX_DOCUMENT_READ_NEIGHBORHOOD_BLOCKS,
        afterBlocks: MAX_DOCUMENT_READ_NEIGHBORHOOD_BLOCKS,
      }).type,
    ).toBe('ok');
    expect(
      createDocumentReadQueryHash({
        service: 'document.read_node_neighborhood',
        beforeBlocks: MAX_DOCUMENT_READ_NEIGHBORHOOD_BLOCKS + 1,
      }),
    ).toEqual({ type: 'error', reason: 'invalid-query' });

    expect(
      createDocumentReadQueryHash({
        service: 'document.search',
        query: 'q'.repeat(MAX_DOCUMENT_READ_QUERY_STRING_UTF16_UNITS),
        sectionIds: uniqueNodeIds(MAX_DOCUMENT_SEARCH_SECTION_IDS),
      }).type,
    ).toBe('ok');
    expect(
      createDocumentReadQueryHash({
        service: 'document.search',
        sectionIds: uniqueNodeIds(MAX_DOCUMENT_SEARCH_SECTION_IDS + 1),
      }),
    ).toEqual({ type: 'error', reason: 'query-too-large' });

    expect(
      createDocumentReadQueryHash({
        service: 'document.get_diagnostics',
        codes: Array.from({ length: MAX_DOCUMENT_DIAGNOSTIC_CODES }, (_, index) => `CODE_${index}`),
      }).type,
    ).toBe('ok');
    expect(
      createDocumentReadQueryHash({
        service: 'document.get_diagnostics',
        codes: Array.from(
          { length: MAX_DOCUMENT_DIAGNOSTIC_CODES + 1 },
          (_, index) => `CODE_${index}`,
        ),
      }),
    ).toEqual({ type: 'error', reason: 'query-too-large' });
  });

  it('normalizes diagnostics filters and validates changes-since Revision IDs', () => {
    expect(
      queryHash({
        service: 'document.get_diagnostics',
        severities: ['error', 'info'],
        codes: ['ZETA', 'ALPHA'],
        maxResults: 20,
      }),
    ).toBe(
      queryHash({
        service: 'document.get_diagnostics',
        severities: ['info', 'error'],
        codes: ['ALPHA', 'ZETA'],
        maxResults: 20,
      }),
    );
    expect(
      createDocumentReadQueryHash({
        service: 'document.get_changes_since',
        sinceRevisionId: 'fixture-revision',
      }),
    ).toEqual({ type: 'error', reason: 'invalid-query' });
  });
});

function queryHash(input: unknown): string {
  const result = createDocumentReadQueryHash(input);
  if (result.type === 'error') {
    throw new Error(`Expected a valid read query, received: ${result.reason}`);
  }
  return result.hash;
}

function nodeId(value: string): NodeId {
  const parsed = parseNodeId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Node ID: ${value}`);
  }
  return parsed.value;
}

function uniqueNodeIds(count: number): readonly NodeId[] {
  return Array.from({ length: count }, (_, index) =>
    nodeId(`018f0000-0000-7000-8000-${(index + 16).toString(16).padStart(12, '0')}`),
  );
}
