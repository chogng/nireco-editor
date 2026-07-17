import { describe, expect, it } from 'vitest';

import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable, sha256Utf8 } from '../../src/base/hashing/portable-sha-256.js';
import { parseEntityId, parseNodeId, parseRevisionId } from '../../src/base/ids/identifiers.js';
import { createDocumentIndex } from '../../src/model/node/document-index.js';
import type { DocumentNode } from '../../src/model/node/manuscript-node.js';
import { validateDocumentSnapshot } from '../../src/model/schema/manuscript-validator.js';
import { createDocumentHashPayload } from '../../src/model/snapshot.js';
import {
  REFERENCE_CORPUS_GENERATOR_VERSION,
  REFERENCE_CORPUS_PROFILE_ID,
  REFERENCE_CORPUS_SEEDS,
  REFERENCE_CORPUS_SHAPE_REQUIREMENTS,
  REFERENCE_CORPUS_TARGETS,
  countReferenceCorpusWords,
  generateReferenceCorpus,
  inspectReferenceCorpus,
  inspectReferenceCorpusShape,
  type ReferenceCorpusName,
} from '../../src/platform/node/performance/reference-corpus.js';

const CORPUS_NAMES = ['S', 'M', 'L'] as const satisfies readonly ReferenceCorpusName[];

describe('reference corpus generator', () => {
  it('is byte-for-byte deterministic for a frozen generator version and seed', () => {
    const first = generateReferenceCorpus('S');
    const second = generateReferenceCorpus('S');

    expect(first.rawJson).toBe(second.rawJson);
    expect(first.metadata).toEqual(second.metadata);
    expect(first.metadata).toMatchObject({
      profileId: REFERENCE_CORPUS_PROFILE_ID,
      generatorVersion: REFERENCE_CORPUS_GENERATOR_VERSION,
      seed: REFERENCE_CORPUS_SEEDS.S,
    });
  });

  for (const name of CORPUS_NAMES) {
    it(`generates exact ${name} counts and a production-valid Snapshot`, () => {
      const generated = generateReferenceCorpus(name);
      const validation = validateDocumentSnapshot(generated.snapshot);
      const indexed = createDocumentIndex(generated.snapshot);

      expect(validation).toEqual({
        type: 'ok',
        value: undefined,
      });
      expect(indexed.type).toBe('ok');
      if (indexed.type === 'error') {
        throw new Error(indexed.error.safeMessage);
      }

      expect(generated.metadata.counts).toEqual(REFERENCE_CORPUS_TARGETS[name]);
      expect(inspectReferenceCorpus(generated.snapshot)).toEqual(REFERENCE_CORPUS_TARGETS[name]);
      expect(countReferenceCorpusWords(generated.snapshot)).toBe(
        REFERENCE_CORPUS_TARGETS[name].words,
      );
      expect(indexed.value.nodeCount).toBe(REFERENCE_CORPUS_TARGETS[name].documentNodes);

      const shape = inspectReferenceCorpusShape(generated.snapshot);
      const requirement = REFERENCE_CORPUS_SHAPE_REQUIREMENTS[name];
      expect(shape.sections).toBe(requirement.sections);
      expect(shape.paragraphs).toBeGreaterThanOrEqual(requirement.minimumParagraphs);
      expect(shape.minimumParagraphsPerSection).toBeGreaterThanOrEqual(
        requirement.minimumParagraphsPerSection,
      );
      expect(shape.textNodes).toBeGreaterThan(shape.paragraphs);
      expect(shape.maxTextNodeWords).toBeLessThanOrEqual(
        Math.floor(REFERENCE_CORPUS_TARGETS[name].words * requirement.maximumSingleTextWordShare),
      );
      expect(shape.medianTextNodeWords).toBeGreaterThanOrEqual(
        requirement.minimumMedianTextNodeWords,
      );
      expect(shape.p95TextNodeWords).toBeLessThanOrEqual(requirement.maximumP95TextNodeWords);
      expect(shape.p95TextNodeWords).toBeGreaterThanOrEqual(requirement.minimumP95TextNodeWords);
      expect(shape.p95TextNodeWords).toBeGreaterThan(shape.medianTextNodeWords);
    }, 30_000);
  }

  it('covers Unicode, academic relations, production IDs, and both hash identities', () => {
    const generated = generateReferenceCorpus('S');
    const allText = collectNodes(generated.snapshot.root)
      .filter((node) => node.type === 'text')
      .map((node) => node.value)
      .join(' ');
    const citationNodes = collectNodes(generated.snapshot.root).filter(
      (node) => node.type === 'citation',
    );
    const allNodes = collectNodes(generated.snapshot.root);
    const nodeIds = allNodes.map((node) => node.id);
    const allocatedEntityIds = collectAllocatedEntityIds(
      generated.snapshot.root,
      generated.snapshot,
    );
    const referenceIds = new Set(
      generated.snapshot.academicGraph.referenceSnapshots.map((reference) => reference.id),
    );
    const graph = generated.snapshot.academicGraph;
    const recomputedDocumentHash = hashCanonicalJsonPortable(
      HASH_DOMAINS.documentContent,
      createDocumentHashPayload(generated.snapshot),
    );

    expect(allText).toContain('ASCII');
    expect(allText).toContain('中文');
    expect(allText).toContain('e\u0301');
    expect(allText).toContain('𝄞');
    expect(allText).toContain('👩‍🔬');
    expect(graph.evidenceLinks).toHaveLength(1);
    expect(graph.claims).toHaveLength(1);
    expect(graph.claimEvidenceRelations).toEqual([
      expect.objectContaining({
        claimId: graph.claims[0]?.id,
        evidenceId: graph.evidenceLinks[0]?.id,
        relation: 'supports',
      }),
    ]);
    expect(citationNodes).toHaveLength(REFERENCE_CORPUS_TARGETS.S.citations);
    expect(citationNodes.every((node) => referenceIds.has(node.attrs.referenceId))).toBe(true);
    expect(parseRevisionId(generated.snapshot.revisionId).type).toBe('valid');
    expect(allNodes.every((node) => parseNodeId(node.id).type === 'valid')).toBe(true);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(allocatedEntityIds.every((entityId) => parseEntityId(entityId).type === 'valid')).toBe(
      true,
    );
    expect(new Set(allocatedEntityIds).size).toBe(allocatedEntityIds.length);
    expect(new Set([generated.snapshot.revisionId, ...nodeIds, ...allocatedEntityIds]).size).toBe(
      1 + nodeIds.length + allocatedEntityIds.length,
    );
    expect(recomputedDocumentHash).toMatchObject({
      type: 'ok',
      hash: generated.snapshot.documentHash,
    });
    expect(generated.metadata.rawChecksum).toBe(`sha256:${sha256Utf8(generated.rawJson)}`);
    expect(generated.metadata.documentHash).toBe(generated.snapshot.documentHash);
  });
});

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

function collectAllocatedEntityIds(
  root: DocumentNode,
  snapshot: ReturnType<typeof generateReferenceCorpus>['snapshot'],
): readonly string[] {
  const entityIds = [
    ...snapshot.metadata.authors.flatMap((author) => (author.id === undefined ? [] : [author.id])),
    ...snapshot.academicGraph.referenceSnapshots.map((entity) => entity.id),
    ...snapshot.academicGraph.evidenceLinks.map((entity) => entity.id),
    ...snapshot.academicGraph.claims.map((entity) => entity.id),
  ];
  for (const node of collectNodes(root)) {
    if (node.type === 'citation') {
      entityIds.push(node.attrs.citationId);
    }
    if (
      (node.type === 'table' || node.type === 'figure' || node.type === 'displayEquation') &&
      node.attrs.entityId !== undefined
    ) {
      entityIds.push(node.attrs.entityId);
    }
  }
  return entityIds;
}
