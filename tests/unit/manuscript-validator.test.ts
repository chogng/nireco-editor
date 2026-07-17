import { describe, expect, it } from 'vitest';

import { deepFreeze } from '../../src/base/immutability/deep-freeze.js';
import { serializeCanonicalJson } from '../../src/base/serialization/canonical-json.js';
import type { BodyNode } from '../../src/model/node/manuscript-node.js';
import type { PersistentAnchor } from '../../src/model/position/semantic-position.js';
import { MAX_INERT_JSON_DEPTH } from '../../src/model/schema/manuscript-runtime-shapes.js';
import {
  MAX_MANUSCRIPT_TREE_DEPTH,
  validateDocumentSnapshot,
  validateInsertableNode,
} from '../../src/model/schema/manuscript-validator.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import {
  MINIMAL_FIXTURE_IDS,
  createMinimalSnapshot,
  validContentHash,
  validDocumentUri,
  validIsoTimestamp,
  validUtf16Offset,
} from '../test-support/fixtures.js';

const CITATION_ENTITY_ID = '018f0000-0000-7000-8000-000000000121';
const CLAIM_ENTITY_ID = '018f0000-0000-7000-8000-000000000122';
const MISSING_ENTITY_ID = '018f0000-0000-7000-8000-000000000199';
const MISSING_NODE_ID = '018f0000-0000-7000-8000-000000000198';
const OTHER_REVISION_ID = '018f0000-0000-7000-8000-000000000197';
const CLAIM_DOCUMENT_URI = validDocumentUri('nireco://workspace-01/document/claim-anchor');

describe('validateDocumentSnapshot', () => {
  it('accepts the valid minimal Manuscript fixture', () => {
    expect(validateDocumentSnapshot(createMinimalSnapshot())).toEqual({
      type: 'ok',
      value: undefined,
    });
  });

  it('validates a 25,000-child flat block array without quadratic key scans', () => {
    expect(validateDocumentSnapshot(createWideSnapshot(25_000))).toEqual({
      type: 'ok',
      value: undefined,
    });
  });

  it('accepts a tree exactly at the production depth limit', () => {
    const snapshot = createNestedSnapshot(MAX_MANUSCRIPT_TREE_DEPTH);
    expect(validateDocumentSnapshot(snapshot)).toEqual({
      type: 'ok',
      value: undefined,
    });
    expect(serializeCanonicalJson(snapshot).type).toBe('ok');
    expect(() => deepFreeze(snapshot)).not.toThrow();
  });

  it('rejects a tree one level beyond the production depth limit', () => {
    const snapshot = createNestedSnapshot(MAX_MANUSCRIPT_TREE_DEPTH + 1);

    expect(() => validateDocumentSnapshot(snapshot)).not.toThrow();
    expectValidationReason(snapshot, 'node-depth-exceeded');
  });

  it('returns a typed error instead of overflowing on 5,000 nested levels', () => {
    const snapshot = createNestedSnapshot(5_000);

    expect(() => validateDocumentSnapshot(snapshot)).not.toThrow();
    expectValidationReason(snapshot, 'node-depth-exceeded');
  });

  it('applies the same depth limit to InsertableNode payloads', () => {
    expect(
      validateInsertableNode(createNestedBlockQuoteTree(0, MAX_MANUSCRIPT_TREE_DEPTH)),
    ).toEqual({
      type: 'ok',
      value: undefined,
    });

    const overLimit = createNestedBlockQuoteTree(0, MAX_MANUSCRIPT_TREE_DEPTH + 1);
    expect(() => validateInsertableNode(overLimit)).not.toThrow();
    expectInsertableValidationReason(overLimit, 'node-depth-exceeded');
  });

  it('bounds open CSL JSON before it can reach recursive serialization', () => {
    expect(validateDocumentSnapshot(createSnapshotWithCslJson(MAX_INERT_JSON_DEPTH))).toEqual({
      type: 'ok',
      value: undefined,
    });

    const overLimit = createSnapshotWithCslJson(MAX_INERT_JSON_DEPTH + 1);
    expect(() => validateDocumentSnapshot(overLimit)).not.toThrow();
    expectValidationReason(overLimit, 'academic-graph-invalid');
  });

  it('does not overflow while rejecting 5,000-level CSL JSON', () => {
    const snapshot = createSnapshotWithCslJson(5_000);

    expect(() => validateDocumentSnapshot(snapshot)).not.toThrow();
    expectValidationReason(snapshot, 'academic-graph-invalid');
  });

  it('keeps accepted inert JSON within canonical serialization and freeze stack safety', () => {
    const snapshot = createSnapshotWithCslJson(MAX_INERT_JSON_DEPTH);

    expect(() => deepFreeze(snapshot)).not.toThrow();
    const serialized = serializeCanonicalJson(snapshot);
    if (serialized.type === 'error') {
      throw new Error(`${serialized.error.reason} at ${serialized.error.path}`);
    }
    expect(serialized.type).toBe('ok');
  });

  it('rejects duplicate Node IDs anywhere in the tree', () => {
    const snapshot = createMinimalSnapshot();
    const body = requireBody(snapshot);
    const invalid = {
      ...snapshot,
      root: {
        ...snapshot.root,
        children: snapshot.root.children.map((child) =>
          child.type === 'body'
            ? {
                ...child,
                children: child.children.map((block, index) =>
                  index === 0 ? { ...block, id: child.id } : block,
                ),
              }
            : child,
        ),
      },
    };

    expectValidationReason(invalid, 'duplicate-node-id');
    expect(body.children).toHaveLength(1);
  });

  it.each([
    {
      label: 'a non-Manuscript root',
      mutate: (snapshot: DocumentSnapshot): unknown => ({
        ...snapshot,
        root: {
          id: snapshot.root.id,
          type: 'paragraph',
          attrs: { alignment: 'start' },
          children: [],
        },
      }),
      reason: 'root-invalid',
    },
    {
      label: 'an empty Body child sequence',
      mutate: (snapshot: DocumentSnapshot): unknown => ({
        ...snapshot,
        root: {
          ...snapshot.root,
          children: snapshot.root.children.map((child) =>
            child.type === 'body' ? { ...child, children: [] } : child,
          ),
        },
      }),
      reason: 'node-children-invalid',
    },
  ])('rejects $label', ({ mutate, reason }) => {
    expectValidationReason(mutate(createMinimalSnapshot()), reason);
  });

  it('rejects a dangling Claim-to-Evidence relation', () => {
    const snapshot = createMinimalSnapshot();
    const invalid = {
      ...snapshot,
      academicGraph: {
        ...snapshot.academicGraph,
        claimEvidenceRelations: [
          {
            claimId: MINIMAL_FIXTURE_IDS.author,
            evidenceId: MINIMAL_FIXTURE_IDS.reference,
            relation: 'supports',
            assessedBy: {
              type: 'human',
              id: 'reviewer-1',
            },
          },
        ],
      },
    };

    expectValidationReason(invalid, 'dangling-academic-relation');
  });

  it('treats metadata Author IDs as globally unique document Entity IDs', () => {
    const snapshot = createMinimalSnapshot();
    const duplicateAuthor = {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        authors: [snapshot.metadata.authors[0], snapshot.metadata.authors[0]],
      },
    };
    const collidingReference = {
      ...snapshot,
      academicGraph: {
        ...snapshot.academicGraph,
        referenceSnapshots: [createReferenceSnapshot(MINIMAL_FIXTURE_IDS.author)],
      },
    };
    const collidingTreeEntity = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'citation',
      attrs: {
        citationId: MINIMAL_FIXTURE_IDS.author,
        referenceId: MINIMAL_FIXTURE_IDS.reference,
      },
    });

    expectValidationError(duplicateAuthor, 'duplicate-entity-id', '$.metadata.authors[1].id');
    expectValidationError(
      collidingReference,
      'duplicate-entity-id',
      '$.academicGraph.referenceSnapshots[0].id',
    );
    expectValidationError(
      collidingTreeEntity,
      'duplicate-entity-id',
      '$.root.children[1].children[0].children[0].attrs.citationId',
    );
  });

  it('resolves Citation, CrossReference, and FootnoteReference targets across the Snapshot', () => {
    const snapshot = createMinimalSnapshot();
    const danglingCitation = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'citation',
      attrs: {
        citationId: CITATION_ENTITY_ID,
        referenceId: MISSING_ENTITY_ID,
      },
    });
    const validAuthorCrossReference = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'crossReference',
      attrs: {
        targetEntityId: MINIMAL_FIXTURE_IDS.author,
      },
    });
    const danglingCrossReference = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'crossReference',
      attrs: {
        targetEntityId: MISSING_ENTITY_ID,
      },
    });
    const danglingFootnoteReference = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'footnoteReference',
      attrs: {
        footnoteNodeId: MISSING_NODE_ID,
      },
    });
    const wrongKindFootnoteReference = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'footnoteReference',
      attrs: {
        footnoteNodeId: MINIMAL_FIXTURE_IDS.paragraph,
      },
    });

    expectValidationError(
      danglingCitation,
      'dangling-citation-reference',
      '$.root.children[1].children[0].children[0].attrs.referenceId',
    );
    expect(validateDocumentSnapshot(validAuthorCrossReference)).toEqual({
      type: 'ok',
      value: undefined,
    });
    expectValidationError(
      danglingCrossReference,
      'dangling-cross-reference',
      '$.root.children[1].children[0].children[0].attrs.targetEntityId',
    );
    for (const candidate of [danglingFootnoteReference, wrongKindFootnoteReference]) {
      expectValidationError(
        candidate,
        'dangling-footnote-reference',
        '$.root.children[1].children[0].children[0].attrs.footnoteNodeId',
      );
    }
  });

  it('accepts revision-bound Claim anchors at valid text and node boundaries', () => {
    const snapshot = createMinimalSnapshot();
    const textAnchor = createValidClaimAnchor(snapshot);
    const boundaryAnchor = {
      ...textAnchor,
      primary: {
        kind: 'node-boundary',
        parentNodeId: MINIMAL_FIXTURE_IDS.paragraph,
        childIndex: 1,
        affinity: 'after',
      },
    };

    expect(validateDocumentSnapshot(withClaim(snapshot, textAnchor))).toEqual({
      type: 'ok',
      value: undefined,
    });
    expect(validateDocumentSnapshot(withClaim(snapshot, boundaryAnchor))).toEqual({
      type: 'ok',
      value: undefined,
    });
  });

  it('rejects a Claim text position inside a UTF-16 surrogate pair', () => {
    const snapshot = createMinimalSnapshot();
    const unicodeSnapshot = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'text',
      value: 'A🌍B',
      marks: [],
    }) as DocumentSnapshot;
    const anchor = {
      ...createValidClaimAnchor(unicodeSnapshot),
      primary: {
        kind: 'text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        utf16Offset: 2,
        affinity: 'after',
      },
    };

    expectValidationError(
      withClaim(unicodeSnapshot, anchor),
      'claim-anchor-invalid',
      '$.academicGraph.claims[0].anchor.primary.utf16Offset',
    );
  });

  it.each([
    {
      label: 'a stale Revision',
      mutate: (snapshot: DocumentSnapshot) => {
        const anchor = createValidClaimAnchor(snapshot);
        return {
          ...anchor,
          document: {
            ...anchor.document,
            revisionId: OTHER_REVISION_ID,
          },
        };
      },
      path: '$.academicGraph.claims[0].anchor.document.revisionId',
    },
    {
      label: 'a missing Text node',
      mutate: (snapshot: DocumentSnapshot) => ({
        ...createValidClaimAnchor(snapshot),
        primary: {
          kind: 'text',
          textNodeId: MISSING_NODE_ID,
          utf16Offset: 0,
          affinity: 'after',
        },
      }),
      path: '$.academicGraph.claims[0].anchor.primary.textNodeId',
    },
    {
      label: 'a non-Text node in a text position',
      mutate: (snapshot: DocumentSnapshot) => ({
        ...createValidClaimAnchor(snapshot),
        primary: {
          kind: 'text',
          textNodeId: MINIMAL_FIXTURE_IDS.paragraph,
          utf16Offset: 0,
          affinity: 'after',
        },
      }),
      path: '$.academicGraph.claims[0].anchor.primary.textNodeId',
    },
    {
      label: 'an out-of-range UTF-16 offset',
      mutate: (snapshot: DocumentSnapshot) => ({
        ...createValidClaimAnchor(snapshot),
        primary: {
          kind: 'text',
          textNodeId: MINIMAL_FIXTURE_IDS.text,
          utf16Offset: 10_000,
          affinity: 'after',
        },
      }),
      path: '$.academicGraph.claims[0].anchor.primary.utf16Offset',
    },
    {
      label: 'an out-of-range child boundary',
      mutate: (snapshot: DocumentSnapshot) => ({
        ...createValidClaimAnchor(snapshot),
        primary: {
          kind: 'node-boundary',
          parentNodeId: MINIMAL_FIXTURE_IDS.paragraph,
          childIndex: 2,
          affinity: 'after',
        },
      }),
      path: '$.academicGraph.claims[0].anchor.primary',
    },
    {
      label: 'a missing target Node',
      mutate: (snapshot: DocumentSnapshot) => ({
        ...createValidClaimAnchor(snapshot),
        targetNodeId: MISSING_NODE_ID,
      }),
      path: '$.academicGraph.claims[0].anchor.targetNodeId',
    },
    {
      label: 'a stale path hint',
      mutate: (snapshot: DocumentSnapshot) => ({
        ...createValidClaimAnchor(snapshot),
        pathHint: [
          MINIMAL_FIXTURE_IDS.manuscript,
          MINIMAL_FIXTURE_IDS.frontMatter,
          MINIMAL_FIXTURE_IDS.paragraph,
        ],
      }),
      path: '$.academicGraph.claims[0].anchor.pathHint',
    },
  ])('rejects a Claim anchor bound to $label', ({ mutate, path }) => {
    const snapshot = createMinimalSnapshot();
    expectValidationError(withClaim(snapshot, mutate(snapshot)), 'claim-anchor-invalid', path);
  });

  it.each([
    {
      label: 'a malformed Citation payload',
      mutate: (snapshot: DocumentSnapshot): unknown =>
        replaceTextNode(snapshot, {
          id: MINIMAL_FIXTURE_IDS.text,
          type: 'citation',
          attrs: {
            citationId: MINIMAL_FIXTURE_IDS.author,
            referenceId: 42,
          },
        }),
    },
    {
      label: 'a malformed Link mark',
      mutate: (snapshot: DocumentSnapshot): unknown =>
        replaceTextNode(snapshot, {
          id: MINIMAL_FIXTURE_IDS.text,
          type: 'text',
          value: 'unsafe link',
          marks: [
            {
              type: 'link',
              href: 'NIRECO://Workspace/document/reference',
            },
          ],
        }),
    },
  ])('rejects $label instead of retaining it in the tree', ({ mutate }) => {
    expectValidationReason(mutate(createMinimalSnapshot()), 'node-shape-invalid');
  });

  it('rejects unpaired surrogates in Text and open academic JSON strings', () => {
    const snapshot = createMinimalSnapshot();
    const invalidText = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'text',
      value: 'invalid \ud800 text',
      marks: [],
    });
    const invalidCsl = {
      ...snapshot,
      academicGraph: {
        ...snapshot.academicGraph,
        referenceSnapshots: [
          {
            id: MINIMAL_FIXTURE_IDS.reference,
            cslJson: {
              title: 'invalid \udfff CSL',
            },
            metadataHash: validContentHash(
              'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            ),
            capturedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
          },
        ],
      },
    };

    expectValidationReason(invalidText, 'node-shape-invalid');
    expectValidationReason(invalidCsl, 'academic-graph-invalid');
  });

  it('accepts Marks in the Schema-defined canonical type order', () => {
    const snapshot = createMinimalSnapshot();
    const canonical = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'text',
      value: 'canonical marks',
      marks: [{ type: 'bold' }, { type: 'italic' }],
    });

    expect(validateDocumentSnapshot(canonical)).toEqual({ type: 'ok', value: undefined });
  });

  it.each([
    {
      label: 'reverse-ordered Marks',
      marks: [{ type: 'italic' }, { type: 'bold' }],
    },
    {
      label: 'conflicting subscript and superscript Marks',
      marks: [{ type: 'subscript' }, { type: 'superscript' }],
    },
  ])('rejects $label', ({ marks }) => {
    const snapshot = createMinimalSnapshot();
    const invalid = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'text',
      value: 'invalid marks',
      marks,
    });

    expectValidationReason(invalid, 'node-shape-invalid');
  });

  it.each([
    {
      label: 'a Reference with missing canonical metadata',
      collection: 'referenceSnapshots',
      entity: {
        id: MINIMAL_FIXTURE_IDS.reference,
      },
    },
    {
      label: 'a Claim with a non-anchor object',
      collection: 'claims',
      entity: {
        id: MINIMAL_FIXTURE_IDS.reference,
        anchor: 'not-an-anchor',
        textSnapshot: 'claim',
        textHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      },
    },
  ] as const)('rejects $label', ({ collection, entity }) => {
    const snapshot = createMinimalSnapshot();
    const invalid = {
      ...snapshot,
      academicGraph: {
        ...snapshot.academicGraph,
        [collection]: [entity],
      },
    };

    expectValidationReason(invalid, 'academic-graph-invalid');
  });

  it('rejects fields outside the closed Snapshot contract', () => {
    const snapshot = createMinimalSnapshot();
    expectValidationReason({ ...snapshot, futureField: true }, 'document-shape-invalid');
  });

  it.each([
    {
      label: 'a custom object prototype',
      mutate: (snapshot: DocumentSnapshot): unknown =>
        Object.assign(Object.create({ inherited: true }) as object, snapshot),
      reason: 'document-shape-invalid',
    },
    {
      label: 'an enumerable accessor field',
      mutate: (snapshot: DocumentSnapshot): unknown => {
        const candidate = { ...snapshot };
        Object.defineProperty(candidate, 'metadata', {
          configurable: true,
          enumerable: true,
          get() {
            throw new Error('Snapshot validation must not invoke accessors.');
          },
        });
        return candidate;
      },
      reason: 'document-shape-invalid',
    },
    {
      label: 'a symbol field',
      mutate: (snapshot: DocumentSnapshot): unknown => ({
        ...snapshot,
        [Symbol('unsupported')]: true,
      }),
      reason: 'document-shape-invalid',
    },
    {
      label: 'a non-enumerable field',
      mutate: (snapshot: DocumentSnapshot): unknown => {
        const candidate = { ...snapshot };
        Object.defineProperty(candidate, 'hidden', {
          configurable: true,
          enumerable: false,
          value: true,
        });
        return candidate;
      },
      reason: 'document-shape-invalid',
    },
    {
      label: 'a sparse array',
      mutate: (snapshot: DocumentSnapshot): unknown => {
        const authors: unknown[] = [];
        authors.length = 1;
        return {
          ...snapshot,
          metadata: {
            ...snapshot.metadata,
            authors,
          },
        };
      },
      reason: 'metadata-invalid',
    },
    {
      label: 'an accessor array element',
      mutate: (snapshot: DocumentSnapshot): unknown => {
        const authors: unknown[] = [];
        Object.defineProperty(authors, '0', {
          configurable: true,
          enumerable: true,
          get() {
            throw new Error('Snapshot validation must not invoke array accessors.');
          },
        });
        return {
          ...snapshot,
          metadata: {
            ...snapshot.metadata,
            authors,
          },
        };
      },
      reason: 'metadata-invalid',
    },
  ])('rejects $label instead of accepting executable or hidden state', ({ mutate, reason }) => {
    const candidate = mutate(createMinimalSnapshot());
    expect(() => validateDocumentSnapshot(candidate)).not.toThrow();
    expectValidationReason(candidate, reason);
  });

  it('rejects an Entity ID declared by both a tree node and the Academic Graph', () => {
    const snapshot = createMinimalSnapshot();
    const invalid = replaceTextNode(snapshot, {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'citation',
      attrs: {
        citationId: MINIMAL_FIXTURE_IDS.reference,
        referenceId: MINIMAL_FIXTURE_IDS.reference,
      },
    });
    if (typeof invalid !== 'object' || invalid === null) {
      throw new Error('Expected an object-shaped Snapshot test fixture.');
    }
    const withReference = {
      ...invalid,
      academicGraph: {
        ...snapshot.academicGraph,
        referenceSnapshots: [
          {
            id: MINIMAL_FIXTURE_IDS.reference,
            cslJson: {
              title: 'A reference',
            },
            metadataHash: validContentHash(
              'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            ),
            capturedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
          },
        ],
      },
    };

    expectValidationReason(withReference, 'duplicate-entity-id');
  });

  it('rejects duplicate Entity ID declarations within the Manuscript tree', () => {
    const snapshot = createMinimalSnapshot();
    const body = requireBody(snapshot);
    const paragraph = body.children[0];
    if (paragraph.type !== 'paragraph') {
      throw new Error('Expected the minimal fixture Paragraph node.');
    }
    const citation = {
      type: 'citation',
      attrs: {
        citationId: CITATION_ENTITY_ID,
        referenceId: MINIMAL_FIXTURE_IDS.reference,
      },
    } as const;
    const invalid = {
      ...snapshot,
      root: {
        ...snapshot.root,
        children: snapshot.root.children.map((child) =>
          child.type === 'body'
            ? {
                ...child,
                children: [
                  {
                    ...paragraph,
                    children: [
                      {
                        id: MINIMAL_FIXTURE_IDS.text,
                        ...citation,
                      },
                      {
                        id: '018f0000-0000-7000-8000-000000000114',
                        ...citation,
                      },
                    ],
                  },
                ],
              }
            : child,
        ),
      },
    };

    expectValidationReason(invalid, 'duplicate-entity-id');
  });

  it('returns a typed validation error when hostile object traps throw', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('hostile ownKeys trap');
        },
      },
    );

    expect(() => validateDocumentSnapshot(hostile)).not.toThrow();
    expectValidationReason(hostile, 'document-shape-invalid');
  });
});

function requireBody(snapshot: DocumentSnapshot): BodyNode {
  for (const child of snapshot.root.children) {
    if (child.type === 'body') {
      return child;
    }
  }
  throw new Error('The minimal fixture must contain a Body node.');
}

function expectValidationReason(value: unknown, reason: string): void {
  const validation = validateDocumentSnapshot(value);
  expect(validation.type).toBe('error');
  if (validation.type === 'ok') {
    throw new Error('Expected Manuscript validation to fail.');
  }
  expect(validation.error.reason).toBe(reason);
}

function expectValidationError(value: unknown, reason: string, path: string): void {
  const validation = validateDocumentSnapshot(value);
  expect(validation.type).toBe('error');
  if (validation.type === 'ok') {
    throw new Error('Expected Manuscript validation to fail.');
  }
  expect(validation.error).toMatchObject({ reason, path });
}

function expectInsertableValidationReason(value: unknown, reason: string): void {
  const validation = validateInsertableNode(value);
  expect(validation.type).toBe('error');
  if (validation.type === 'ok') {
    throw new Error('Expected InsertableNode validation to fail.');
  }
  expect(validation.error.reason).toBe(reason);
}

function createNestedSnapshot(deepestDepth: number): unknown {
  const snapshot = createMinimalSnapshot();
  return {
    ...snapshot,
    root: {
      ...snapshot.root,
      children: snapshot.root.children.map((child) =>
        child.type === 'body'
          ? {
              ...child,
              children: [createNestedBlockQuoteTree(2, deepestDepth)],
            }
          : child,
      ),
    },
  };
}

function createWideSnapshot(childCount: number): unknown {
  const snapshot = createMinimalSnapshot();
  const paragraphs = Array.from({ length: childCount }, () => ({
    id: nextNestedNodeId(),
    type: 'paragraph',
    attrs: {
      alignment: 'start',
    },
    children: [],
  }));
  return {
    ...snapshot,
    root: {
      ...snapshot.root,
      children: snapshot.root.children.map((child) =>
        child.type === 'body'
          ? {
              ...child,
              children: paragraphs,
            }
          : child,
      ),
    },
  };
}

function createSnapshotWithCslJson(deepestDepth: number): unknown {
  const snapshot = createMinimalSnapshot();
  return {
    ...snapshot,
    academicGraph: {
      ...snapshot.academicGraph,
      referenceSnapshots: [
        {
          id: MINIMAL_FIXTURE_IDS.reference,
          cslJson: createNestedJsonObject(deepestDepth),
          metadataHash: validContentHash(
            'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          capturedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
        },
      ],
    },
  };
}

function createReferenceSnapshot(id: string): unknown {
  return {
    id,
    cslJson: {
      title: 'A reference',
    },
    metadataHash: validContentHash(
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ),
    capturedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

function createValidClaimAnchor(snapshot: DocumentSnapshot): PersistentAnchor {
  return {
    document: {
      uri: CLAIM_DOCUMENT_URI,
      revisionId: snapshot.revisionId,
    },
    primary: {
      kind: 'text',
      textNodeId: MINIMAL_FIXTURE_IDS.text,
      utf16Offset: validUtf16Offset(5),
      affinity: 'after',
    },
    targetNodeId: MINIMAL_FIXTURE_IDS.paragraph,
    pathHint: [
      MINIMAL_FIXTURE_IDS.manuscript,
      MINIMAL_FIXTURE_IDS.body,
      MINIMAL_FIXTURE_IDS.paragraph,
    ],
  };
}

function withClaim(snapshot: DocumentSnapshot, anchor: unknown): unknown {
  return {
    ...snapshot,
    academicGraph: {
      ...snapshot.academicGraph,
      claims: [
        {
          id: CLAIM_ENTITY_ID,
          anchor,
          textSnapshot: 'claim',
          textHash: validContentHash(
            'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ),
        },
      ],
    },
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

function createNestedBlockQuoteTree(rootDepth: number, deepestDepth: number): unknown {
  if (deepestDepth < rootDepth + 2) {
    throw new RangeError('A nested BlockQuote fixture requires room for Paragraph and Text nodes.');
  }

  let node: unknown = {
    id: nextNestedNodeId(),
    type: 'text',
    value: 'deep',
    marks: [],
  };
  node = {
    id: nextNestedNodeId(),
    type: 'paragraph',
    attrs: {
      alignment: 'start',
    },
    children: [node],
  };
  for (let depth = deepestDepth - 2; depth >= rootDepth; depth -= 1) {
    node = {
      id: nextNestedNodeId(),
      type: 'blockQuote',
      attrs: {},
      children: [node],
    };
  }
  return node;
}

let nestedNodeSequence = 0;

function nextNestedNodeId(): string {
  nestedNodeSequence += 1;
  const suffix = (0x10_0000 + nestedNodeSequence).toString(16).padStart(12, '0');
  return `018f0000-0000-7000-8001-${suffix}`;
}

function replaceTextNode(snapshot: DocumentSnapshot, replacement: unknown): unknown {
  return {
    ...snapshot,
    root: {
      ...snapshot.root,
      children: snapshot.root.children.map((child) =>
        child.type === 'body'
          ? {
              ...child,
              children: child.children.map((block) =>
                block.type === 'paragraph'
                  ? {
                      ...block,
                      children: block.children.map((inline) =>
                        inline.id === MINIMAL_FIXTURE_IDS.text ? replacement : inline,
                      ),
                    }
                  : block,
              ),
            }
          : child,
      ),
    },
  };
}
