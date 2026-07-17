import { describe, expect, it } from 'vitest';

import {
  createDocumentIndex,
  deriveDocumentIndexWithNodeReplacements,
  type DocumentIndex,
} from '../../src/model/node/document-index.js';
import type {
  BibliographyPlaceholderNode,
  BodyNode,
  DocumentNode,
  FrontMatterNode,
  ParagraphNode,
  TextNode,
} from '../../src/model/node/manuscript-node.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import { generateReferenceCorpus } from '../../src/platform/node/performance/reference-corpus.js';
import {
  MINIMAL_FIXTURE_IDS,
  createMinimalSnapshot,
  validContentHash,
  validIsoTimestamp,
} from '../test-support/fixtures.js';

const REFERENCE_ID = MINIMAL_FIXTURE_IDS.reference;

describe('createDocumentIndex', () => {
  it('indexes every document Node and Academic Graph entity deterministically', () => {
    const snapshot = createMinimalSnapshot();
    const indexed = createDocumentIndex({
      ...snapshot,
      academicGraph: {
        ...snapshot.academicGraph,
        referenceSnapshots: [
          {
            id: REFERENCE_ID,
            cslJson: {
              title: 'A deterministic reference',
            },
            metadataHash: validContentHash(
              'sha256:1111111111111111111111111111111111111111111111111111111111111111',
            ),
            capturedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
          },
        ],
      },
    });

    expect(indexed.type).toBe('ok');
    if (indexed.type === 'error') {
      throw new Error(indexed.error.safeMessage);
    }

    expect(indexed.value.nodeCount).toBe(6);
    expect(indexed.value.entityCount).toBe(2);
    expect(indexed.value.getNode(MINIMAL_FIXTURE_IDS.text)).toMatchObject({
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'text',
    });
    expect(indexed.value.getNode(MINIMAL_FIXTURE_IDS.bibliography)).toMatchObject({
      id: MINIMAL_FIXTURE_IDS.bibliography,
      type: 'bibliographyPlaceholder',
    });
    expect(indexed.value.hasEntity(REFERENCE_ID)).toBe(true);
    expect(indexed.value.hasEntity(MINIMAL_FIXTURE_IDS.author)).toBe(true);
  });

  it('fails closed instead of indexing an invalid Snapshot', () => {
    const snapshot = createMinimalSnapshot();
    const indexed = createDocumentIndex({
      ...snapshot,
      root: {
        ...snapshot.root,
        children: snapshot.root.children.map((child) =>
          child.type === 'body' ? { ...child, children: [] } : child,
        ),
      },
    });

    expect(indexed).toMatchObject({
      type: 'error',
      error: {
        reason: 'node-children-invalid',
      },
    });
  });

  it('retains verified parent paths while replacing immutable node identities', () => {
    expectImmutablePathReplacement();
  });

  it('fails closed when a replacement changes node type, parent links, or declared entities', () => {
    const snapshot = createMinimalSnapshot();
    const indexed = createDocumentIndex(snapshot);
    if (indexed.type === 'error') {
      throw new Error(indexed.error.safeMessage);
    }
    const { text } = readMinimalPathNodes(snapshot);
    expect(
      deriveDocumentIndexWithNodeReplacements(indexed.value, [
        {
          id: text.id,
          type: 'hardBreak',
          attrs: {},
        },
      ]),
    ).toBeUndefined();

    const corpus = generateReferenceCorpus('S').snapshot;
    const corpusIndex = createDocumentIndex(corpus);
    if (corpusIndex.type === 'error') {
      throw new Error(corpusIndex.error.safeMessage);
    }
    const reorderableParagraph = collectNodes(corpus.root).find(
      (node): node is ParagraphNode => node.type === 'paragraph' && node.children.length >= 2,
    );
    const firstChild = reorderableParagraph?.children[0];
    const secondChild = reorderableParagraph?.children[1];
    if (
      reorderableParagraph === undefined ||
      firstChild === undefined ||
      secondChild === undefined
    ) {
      throw new Error('Expected the S corpus to contain a reorderable Paragraph.');
    }
    const reorderedParagraph: ParagraphNode = {
      ...reorderableParagraph,
      children: [secondChild, firstChild, ...reorderableParagraph.children.slice(2)],
    };
    expect(
      deriveDocumentIndexWithNodeReplacements(corpusIndex.value, [reorderedParagraph]),
    ).toBeUndefined();
    const declaredEntityNode = collectNodes(corpus.root).find(
      (node) =>
        node.type === 'citation' ||
        node.type === 'displayEquation' ||
        node.type === 'figure' ||
        node.type === 'table',
    );
    if (declaredEntityNode === undefined) {
      throw new Error('Expected the S corpus to declare a tree Entity ID.');
    }
    const changedEntityNode = replaceDeclaredEntityId(
      declaredEntityNode,
      declaredEntityNode.type === 'citation' &&
        declaredEntityNode.attrs.citationId === MINIMAL_FIXTURE_IDS.author
        ? REFERENCE_ID
        : MINIMAL_FIXTURE_IDS.author,
    );
    expect(
      deriveDocumentIndexWithNodeReplacements(corpusIndex.value, [changedEntityNode]),
    ).toBeUndefined();
  });

  it('matches a rebuilt index across the 31/32/33-layer flatten boundary and beyond', () => {
    const snapshot = createMinimalSnapshot();
    const indexed = createDocumentIndex(snapshot);
    if (indexed.type === 'error') {
      throw new Error(indexed.error.safeMessage);
    }
    let current = indexed.value;
    let root = snapshot.root;
    const checkpoints = new Set([31, 32, 33, 64, 70]);

    for (let sequence = 1; sequence <= 70; sequence += 1) {
      const path = readIndexedMinimalPathNodes(current);
      const nextText: TextNode = {
        ...path.text,
        value: `replacement-${sequence}`,
      };
      const nextParagraph: ParagraphNode = {
        ...path.paragraph,
        children: [nextText],
      };
      const nextBody: BodyNode = {
        ...path.body,
        children: [nextParagraph],
      };
      const nextRoot: typeof snapshot.root = {
        ...path.root,
        children: [path.frontMatter, nextBody, path.bibliography],
      };
      const derived = deriveDocumentIndexWithNodeReplacements(current, [
        nextText,
        nextParagraph,
        nextBody,
        nextRoot,
      ]);
      if (derived === undefined) {
        throw new Error(`Expected replacement layer ${sequence} to preserve the index shape.`);
      }
      current = derived;
      root = nextRoot;

      if (checkpoints.has(sequence)) {
        const rebuilt = createDocumentIndex({
          ...snapshot,
          root,
        });
        if (rebuilt.type === 'error') {
          throw new Error(rebuilt.error.safeMessage);
        }
        expect(current.nodeCount).toBe(rebuilt.value.nodeCount);
        expect(current.entityCount).toBe(rebuilt.value.entityCount);
        for (const node of collectNodes(root)) {
          expect(current.getNode(node.id)).toBe(node);
          expect(current.getNodePath(node.id)?.childIndices).toEqual(
            rebuilt.value.getNodePath(node.id)?.childIndices,
          );
        }
      }
    }
  });

  it('indexes Entity IDs declared by Citation, Figure, Table, and Equation nodes', () => {
    const snapshot = generateReferenceCorpus('S').snapshot;
    const indexed = createDocumentIndex(snapshot);
    if (indexed.type === 'error') {
      throw new Error(indexed.error.safeMessage);
    }
    const declaredEntityIds = collectNodes(snapshot.root).flatMap((node) => {
      if (node.type === 'citation') {
        return [node.attrs.citationId];
      }
      if (node.type === 'displayEquation' || node.type === 'figure' || node.type === 'table') {
        return node.attrs.entityId === undefined ? [] : [node.attrs.entityId];
      }
      return [];
    });

    expect(declaredEntityIds.length).toBeGreaterThan(0);
    for (const entityId of declaredEntityIds) {
      expect(indexed.value.hasEntity(entityId)).toBe(true);
    }
    expect(indexed.value.entityCount).toBe(
      new Set([
        ...snapshot.metadata.authors.flatMap((author) =>
          author.id === undefined ? [] : [author.id],
        ),
        ...declaredEntityIds,
        ...snapshot.academicGraph.referenceSnapshots.map((entity) => entity.id),
        ...snapshot.academicGraph.evidenceLinks.map((entity) => entity.id),
        ...snapshot.academicGraph.claims.map((entity) => entity.id),
      ]).size,
    );
  });
});

function expectImmutablePathReplacement(): void {
  const snapshot = createMinimalSnapshot();
  const indexed = createDocumentIndex(snapshot);
  if (indexed.type === 'error') {
    throw new Error(indexed.error.safeMessage);
  }

  const originalPath = indexed.value.getNodePath(MINIMAL_FIXTURE_IDS.text);
  if (originalPath === undefined) {
    throw new Error('Expected the minimal fixture TextNode path.');
  }
  expect(originalPath.nodes.map((node) => node.id)).toEqual([
    MINIMAL_FIXTURE_IDS.manuscript,
    MINIMAL_FIXTURE_IDS.body,
    MINIMAL_FIXTURE_IDS.paragraph,
    MINIMAL_FIXTURE_IDS.text,
  ]);
  expect(originalPath.childIndices).toEqual([1, 0, 0]);

  const { frontMatter, body, bibliography, paragraph, text } = readMinimalPathNodes(snapshot);
  const nextText: typeof text = {
    ...text,
    value: 'updated',
  };
  const nextParagraph: typeof paragraph = {
    ...paragraph,
    children: [nextText],
  };
  const nextBody: typeof body = {
    ...body,
    children: [nextParagraph],
  };
  const nextRoot: typeof snapshot.root = {
    ...snapshot.root,
    children: [frontMatter, nextBody, bibliography],
  };
  const derived = deriveDocumentIndexWithNodeReplacements(indexed.value, [
    nextText,
    nextParagraph,
    nextBody,
    nextRoot,
  ]);
  if (derived === undefined) {
    throw new Error('Expected an immutable derived DocumentIndex.');
  }

  expect(derived.getNode(MINIMAL_FIXTURE_IDS.text)).toBe(nextText);
  expect(derived.getNode(MINIMAL_FIXTURE_IDS.paragraph)).toBe(nextParagraph);
  expect(derived.getNode(MINIMAL_FIXTURE_IDS.body)).toBe(nextBody);
  expect(derived.getNode(MINIMAL_FIXTURE_IDS.manuscript)).toBe(nextRoot);
  expect(derived.getNode(MINIMAL_FIXTURE_IDS.bibliography)).toBe(bibliography);
  expect(derived.getNodePath(MINIMAL_FIXTURE_IDS.text)?.nodes).toEqual([
    nextRoot,
    nextBody,
    nextParagraph,
    nextText,
  ]);
}

interface MinimalPathNodes {
  readonly frontMatter: FrontMatterNode;
  readonly body: BodyNode;
  readonly bibliography: BibliographyPlaceholderNode;
  readonly paragraph: ParagraphNode;
  readonly text: TextNode;
}

function readMinimalPathNodes(snapshot: DocumentSnapshot): MinimalPathNodes {
  const frontMatter = snapshot.root.children[0];
  const body = snapshot.root.children[1];
  const bibliography = snapshot.root.children[2];
  if (
    frontMatter.type !== 'frontMatter' ||
    body?.type !== 'body' ||
    bibliography?.type !== 'bibliographyPlaceholder'
  ) {
    throw new Error('Expected the minimal fixture root children.');
  }
  const paragraph = body.children[0];
  if (paragraph.type !== 'paragraph') {
    throw new Error('Expected the minimal fixture paragraph.');
  }
  const text = paragraph.children[0];
  if (text?.type !== 'text') {
    throw new Error('Expected the minimal fixture TextNode.');
  }
  return {
    frontMatter,
    body,
    bibliography,
    paragraph,
    text,
  };
}

interface IndexedMinimalPathNodes extends MinimalPathNodes {
  readonly root: DocumentSnapshot['root'];
}

function readIndexedMinimalPathNodes(index: DocumentIndex): IndexedMinimalPathNodes {
  return {
    root: requireIndexedNode(index, MINIMAL_FIXTURE_IDS.manuscript, 'manuscript'),
    frontMatter: requireIndexedNode(index, MINIMAL_FIXTURE_IDS.frontMatter, 'frontMatter'),
    body: requireIndexedNode(index, MINIMAL_FIXTURE_IDS.body, 'body'),
    bibliography: requireIndexedNode(
      index,
      MINIMAL_FIXTURE_IDS.bibliography,
      'bibliographyPlaceholder',
    ),
    paragraph: requireIndexedNode(index, MINIMAL_FIXTURE_IDS.paragraph, 'paragraph'),
    text: requireIndexedNode(index, MINIMAL_FIXTURE_IDS.text, 'text'),
  };
}

function requireIndexedNode<TType extends DocumentNode['type']>(
  index: DocumentIndex,
  nodeId: DocumentNode['id'],
  type: TType,
): Extract<DocumentNode, { readonly type: TType }> {
  const node = index.getNode(nodeId);
  if (node?.type !== type) {
    throw new Error(`Expected indexed ${type} node ${nodeId}.`);
  }
  return node as Extract<DocumentNode, { readonly type: TType }>;
}

function replaceDeclaredEntityId(
  node: DocumentNode,
  entityId: typeof MINIMAL_FIXTURE_IDS.author,
): DocumentNode {
  if (node.type === 'citation') {
    return {
      ...node,
      attrs: {
        ...node.attrs,
        citationId: entityId,
      },
    };
  }
  if (node.type === 'displayEquation') {
    return {
      ...node,
      attrs: {
        ...node.attrs,
        entityId,
      },
    };
  }
  if (node.type === 'figure') {
    return {
      ...node,
      attrs: {
        ...node.attrs,
        entityId,
      },
    };
  }
  if (node.type === 'table') {
    return {
      ...node,
      attrs: {
        ...node.attrs,
        entityId,
      },
    };
  }
  throw new Error('Expected a node that directly declares an Entity ID.');
}

function collectNodes(root: DocumentNode): readonly DocumentNode[] {
  const nodes: DocumentNode[] = [];
  const pending: DocumentNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      break;
    }
    nodes.push(node);
    if ('children' in node) {
      pending.push(...node.children);
    }
  }
  return nodes;
}
