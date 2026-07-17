import {
  parseContentHash,
  parseEntityId,
  parseNodeId,
  parseRevisionId,
  parseUtf16Offset,
  type ContentHash,
  type EntityId,
  type IdentifierParseResult,
  type NodeId,
  type RevisionId,
  type Utf16Offset,
} from '../../../base/ids/identifiers.js';
import { createUuidV7 } from '../../../base/ids/uuid-v7-allocator.js';
import { HASH_DOMAINS } from '../../../base/hashing/hash-preimage.js';
import {
  hashCanonicalJsonPortable,
  sha256Utf8,
  sha256Utf8Bytes,
} from '../../../base/hashing/portable-sha-256.js';
import { parseIsoTimestamp, type IsoTimestamp } from '../../../base/time/clock.js';
import {
  canonicalizeResourceUri,
  isCometResourceUri,
  isDocumentUri,
  type CometResourceUri,
  type DocumentUri,
  type ResourceUri,
} from '../../../base/uri/resource-uri.js';
import type {
  AcademicGraphSnapshot,
  ClaimEntity,
  EvidenceLink,
  ReferenceSnapshot,
} from '../../../model/academic-graph.js';
import { createDocumentIndex } from '../../../model/node/document-index.js';
import type {
  CitationNode,
  DisplayEquationNode,
  DocumentNode,
  FigureNode,
  FootnoteNode,
  HeadingNode,
  HorizontalRuleNode,
  InlineNode,
  ListNode,
  ManuscriptNode,
  ParagraphNode,
  SectionBodyNode,
  SectionNode,
  TableNode,
  TextNode,
} from '../../../model/node/manuscript-node.js';
import { validateDocumentSnapshot } from '../../../model/schema/manuscript-validator.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../../model/snapshot.js';

export const REFERENCE_CORPUS_PROFILE_ID = 'nireco-g0-r1-2026-07-16';
export const REFERENCE_CORPUS_GENERATOR_VERSION = '1.1.0';

export interface ReferenceCorpusCounts {
  readonly words: number;
  readonly documentNodes: number;
  readonly citations: number;
  readonly tables: number;
  readonly figures: number;
  readonly equations: number;
}

export interface ReferenceCorpusShape {
  readonly sections: number;
  readonly paragraphs: number;
  readonly textNodes: number;
  readonly minimumParagraphsPerSection: number;
  readonly maxTextNodeWords: number;
  readonly medianTextNodeWords: number;
  readonly p95TextNodeWords: number;
}

export interface ReferenceCorpusShapeRequirement {
  readonly sections: number;
  readonly minimumParagraphs: number;
  readonly minimumParagraphsPerSection: number;
  readonly maximumSingleTextWordShare: number;
  readonly minimumMedianTextNodeWords: number;
  readonly minimumP95TextNodeWords: number;
  readonly maximumP95TextNodeWords: number;
}

export const REFERENCE_CORPUS_TARGETS = {
  S: {
    words: 15_000,
    documentNodes: 1_500,
    citations: 100,
    tables: 5,
    figures: 5,
    equations: 20,
  },
  M: {
    words: 75_000,
    documentNodes: 8_000,
    citations: 500,
    tables: 20,
    figures: 20,
    equations: 100,
  },
  L: {
    words: 200_000,
    documentNodes: 25_000,
    citations: 1_500,
    tables: 60,
    figures: 60,
    equations: 500,
  },
} as const satisfies Readonly<Record<string, ReferenceCorpusCounts>>;

export type ReferenceCorpusName = keyof typeof REFERENCE_CORPUS_TARGETS;

export const REFERENCE_CORPUS_SHAPE_REQUIREMENTS = {
  S: {
    sections: 8,
    minimumParagraphs: 600,
    minimumParagraphsPerSection: 40,
    maximumSingleTextWordShare: 0.01,
    minimumMedianTextNodeWords: 8,
    minimumP95TextNodeWords: 20,
    maximumP95TextNodeWords: 64,
  },
  M: {
    sections: 16,
    minimumParagraphs: 3_200,
    minimumParagraphsPerSection: 120,
    maximumSingleTextWordShare: 0.01,
    minimumMedianTextNodeWords: 8,
    minimumP95TextNodeWords: 20,
    maximumP95TextNodeWords: 64,
  },
  L: {
    sections: 32,
    minimumParagraphs: 10_000,
    minimumParagraphsPerSection: 200,
    maximumSingleTextWordShare: 0.01,
    minimumMedianTextNodeWords: 8,
    minimumP95TextNodeWords: 20,
    maximumP95TextNodeWords: 64,
  },
} as const satisfies Readonly<Record<ReferenceCorpusName, ReferenceCorpusShapeRequirement>>;

export const REFERENCE_CORPUS_SEEDS = {
  S: 'nireco-reference-corpus-s-2026-07-16',
  M: 'nireco-reference-corpus-m-2026-07-16',
  L: 'nireco-reference-corpus-l-2026-07-16',
} as const satisfies Readonly<Record<ReferenceCorpusName, string>>;

export interface ReferenceCorpusMetadata {
  readonly profileId: typeof REFERENCE_CORPUS_PROFILE_ID;
  readonly name: ReferenceCorpusName;
  readonly generatorVersion: typeof REFERENCE_CORPUS_GENERATOR_VERSION;
  readonly seed: string;
  readonly rawChecksum: ContentHash;
  readonly documentHash: ContentHash;
  readonly counts: ReferenceCorpusCounts;
}

export interface GeneratedReferenceCorpus {
  readonly metadata: ReferenceCorpusMetadata;
  readonly snapshot: DocumentSnapshot;
  readonly rawJson: string;
}

interface CitationBundle {
  readonly references: readonly ReferenceSnapshot[];
  readonly paragraphs: readonly ParagraphNode[];
}

interface CorpusTree {
  readonly root: ManuscriptNode;
  readonly bodyNodeId: NodeId;
  readonly firstSectionNodeId: NodeId;
  readonly unicodeParagraphNodeId: NodeId;
  readonly unicodeText: TextNode;
  readonly payloadTexts: readonly MutableTextNode[];
}

interface MutableTextNode {
  readonly id: NodeId;
  readonly type: 'text';
  value: string;
  readonly marks: readonly [];
}

const UUID_EPOCH_MILLISECONDS = 1_720_000_000_000;
const CAPTURED_AT = requireIsoTimestamp('2026-07-16T00:00:00Z');
const EMPTY_DOCUMENT_HASH = requireContentHash(
  'sha256:0000000000000000000000000000000000000000000000000000000000000000',
);
const UNICODE_COVERAGE_TEXT =
  'ASCII 中文 e\u0301 𝄞 👩‍🔬 deterministic corpus coverage across scripts and graphemes';
const WORD_VOCABULARY = [
  'analysis',
  'argument',
  'bibliography',
  'calibration',
  'citation',
  'context',
  'dataset',
  'deterministic',
  'discussion',
  'evidence',
  'finding',
  'framework',
  'hypothesis',
  'inference',
  'manuscript',
  'measurement',
  'method',
  'model',
  'observation',
  'paragraph',
  'reference',
  'relation',
  'reproducible',
  'research',
  'result',
  'revision',
  'schema',
  'section',
  'semantic',
  'source',
  'study',
  'transaction',
  '方法',
  '结果',
] as const;

export function generateReferenceCorpus(name: ReferenceCorpusName): GeneratedReferenceCorpus {
  const target = REFERENCE_CORPUS_TARGETS[name];
  const seed = REFERENCE_CORPUS_SEEDS[name];
  const ids = new DeterministicCorpusIdAllocator(seed);
  const revisionId = ids.allocateRevisionId();
  const documentUri = requireDocumentUri(
    `nireco://reference-r1/document/corpus-${name.toLowerCase()}`,
  );
  const citations = createCitationBundle(ids, name, target.citations);
  const tree = createCorpusTree(ids, name, target, citations.paragraphs);
  fillWordTarget(tree.root, tree.payloadTexts, target.words, seed);

  const academicGraph = createAcademicGraph(
    ids,
    name,
    revisionId,
    documentUri,
    tree,
    citations.references,
  );
  const snapshot = createHashedSnapshot(ids, name, revisionId, tree.root, academicGraph);
  assertCorpusIntegrity(snapshot, target, name);

  const rawJson = stringifySnapshot(snapshot);
  const rawChecksum = hashUtf8(rawJson);
  const counts = inspectReferenceCorpus(snapshot);

  return {
    metadata: {
      profileId: REFERENCE_CORPUS_PROFILE_ID,
      name,
      generatorVersion: REFERENCE_CORPUS_GENERATOR_VERSION,
      seed,
      rawChecksum,
      documentHash: snapshot.documentHash,
      counts,
    },
    snapshot,
    rawJson,
  };
}

export function inspectReferenceCorpus(snapshot: DocumentSnapshot): ReferenceCorpusCounts {
  let words = 0;
  let documentNodes = 0;
  let citations = 0;
  let tables = 0;
  let figures = 0;
  let equations = 0;
  const pending: DocumentNode[] = [snapshot.root];

  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      break;
    }
    documentNodes += 1;
    words += node.type === 'text' ? countWords(node.value) : 0;
    citations += node.type === 'citation' ? 1 : 0;
    tables += node.type === 'table' ? 1 : 0;
    figures += node.type === 'figure' ? 1 : 0;
    equations += node.type === 'inlineEquation' || node.type === 'displayEquation' ? 1 : 0;
    pushChildren(pending, node);
  }

  return {
    words,
    documentNodes,
    citations,
    tables,
    figures,
    equations,
  };
}

export function countReferenceCorpusWords(snapshot: DocumentSnapshot): number {
  return inspectReferenceCorpus(snapshot).words;
}

export function inspectReferenceCorpusShape(snapshot: DocumentSnapshot): ReferenceCorpusShape {
  let sections = 0;
  let paragraphs = 0;
  let minimumParagraphsPerSection = Number.POSITIVE_INFINITY;
  const textNodeWordCounts: number[] = [];
  const pending: DocumentNode[] = [snapshot.root];

  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      break;
    }
    sections += node.type === 'section' ? 1 : 0;
    paragraphs += node.type === 'paragraph' ? 1 : 0;
    if (node.type === 'section') {
      minimumParagraphsPerSection = Math.min(
        minimumParagraphsPerSection,
        countParagraphsInSection(node),
      );
    }
    if (node.type === 'text') {
      textNodeWordCounts.push(countWords(node.value));
    }
    pushChildren(pending, node);
  }

  textNodeWordCounts.sort((left, right) => left - right);
  return {
    sections,
    paragraphs,
    textNodes: textNodeWordCounts.length,
    minimumParagraphsPerSection:
      minimumParagraphsPerSection === Number.POSITIVE_INFINITY ? 0 : minimumParagraphsPerSection,
    maxTextNodeWords: textNodeWordCounts.at(-1) ?? 0,
    medianTextNodeWords: percentile(textNodeWordCounts, 0.5),
    p95TextNodeWords: percentile(textNodeWordCounts, 0.95),
  };
}

class DeterministicCorpusIdAllocator {
  readonly #seed: string;
  #sequence = 0;
  #randomState: number;

  constructor(seed: string) {
    this.#seed = seed;
    const digest = sha256Utf8Bytes(seed);
    this.#randomState =
      (((digest[0] ?? 0) << 24) |
        ((digest[1] ?? 0) << 16) |
        ((digest[2] ?? 0) << 8) |
        (digest[3] ?? 0)) >>>
        0 || 0x6d2b_79f5;
  }

  allocateRevisionId(): RevisionId {
    return this.#allocate(parseRevisionId, 'Revision');
  }

  allocateNodeId(): NodeId {
    return this.#allocate(parseNodeId, 'Node');
  }

  allocateEntityId(): EntityId {
    return this.#allocate(parseEntityId, 'Entity');
  }

  #allocate<TIdentifier>(
    parse: (value: string) => IdentifierParseResult<TIdentifier>,
    kind: string,
  ): TIdentifier {
    this.#sequence += 1;
    const value = createUuidV7({
      unixMilliseconds: UUID_EPOCH_MILLISECONDS + this.#sequence,
      randomBytes: this.#nextRandomBytes(),
    });
    const parsed = parse(value);
    if (parsed.type === 'invalid') {
      throw new Error(
        `${REFERENCE_CORPUS_GENERATOR_VERSION} generated an invalid ${kind} UUIDv7 for ${this.#seed}.`,
      );
    }
    return parsed.value;
  }

  #nextRandomBytes(): Uint8Array {
    const bytes = new Uint8Array(10);
    for (let index = 0; index < bytes.length; index += 1) {
      this.#randomState = nextXorShift32(this.#randomState);
      bytes[index] = this.#randomState & 0xff;
    }
    return bytes;
  }
}

class DeterministicCorpusRandom {
  #state: number;

  constructor(seed: string) {
    const digest = sha256Utf8Bytes(seed);
    this.#state =
      (((digest[0] ?? 0) << 24) |
        ((digest[1] ?? 0) << 16) |
        ((digest[2] ?? 0) << 8) |
        (digest[3] ?? 0)) >>>
        0 || 0x6d2b_79f5;
  }

  nextInteger(exclusiveMaximum: number): number {
    if (!Number.isSafeInteger(exclusiveMaximum) || exclusiveMaximum < 1) {
      throw new RangeError('Deterministic random bound must be a positive safe integer.');
    }
    this.#state = nextXorShift32(this.#state);
    return this.#state % exclusiveMaximum;
  }
}

function createCorpusTree(
  ids: DeterministicCorpusIdAllocator,
  name: ReferenceCorpusName,
  target: ReferenceCorpusCounts,
  citationParagraphs: readonly ParagraphNode[],
): CorpusTree {
  const unicodeText = createText(ids, UNICODE_COVERAGE_TEXT);
  const unicodeParagraph = createParagraphWithChildren(ids, [unicodeText]);
  const primaryPayloadText = createMutableText(ids);
  const payloadParagraph = createParagraphWithChildren(ids, [primaryPayloadText]);
  const footnote = createFootnote(ids);
  const firstSectionChildren: [HeadingNode, ...SectionBodyNode[]] = [
    createHeading(ids, 1, `Reference corpus ${name} methods`),
    unicodeParagraph,
    createList(ids),
    footnote,
    createFootnoteReferenceParagraph(ids, footnote.id),
    ...createTables(ids, name, target.tables),
    ...createFigures(ids, name, target.figures),
    ...createEquations(ids, target.equations),
  ];
  const secondSectionChildren: [HeadingNode, ...SectionBodyNode[]] = [
    createHeading(ids, 1, `Reference corpus ${name} results`),
    payloadParagraph,
    createParagraph(ids, 'short movable paragraph'),
    ...citationParagraphs,
  ];
  const firstSection = createSection(ids, firstSectionChildren);
  const secondSection = createSection(ids, secondSectionChildren);
  const additionalSections = createAdditionalSections(
    ids,
    name,
    REFERENCE_CORPUS_SHAPE_REQUIREMENTS[name].sections - 2,
  );
  const contentSectionChildren = [
    firstSectionChildren,
    secondSectionChildren,
    ...additionalSections.map(({ children }) => children),
  ];
  const payloadTexts = [
    primaryPayloadText,
    ...additionalSections.map(({ payloadText }) => payloadText),
  ];
  const bodyNodeId = ids.allocateNodeId();
  const root: ManuscriptNode = {
    id: ids.allocateNodeId(),
    type: 'manuscript',
    attrs: {},
    children: [
      {
        id: ids.allocateNodeId(),
        type: 'frontMatter',
        attrs: {},
        children: [],
      },
      {
        id: bodyNodeId,
        type: 'body',
        attrs: {},
        children: [
          firstSection,
          secondSection,
          ...additionalSections.map(({ section }) => section),
        ],
      },
      {
        id: ids.allocateNodeId(),
        type: 'bibliographyPlaceholder',
        attrs: {
          heading: 'References',
        },
      },
    ],
  };

  payloadTexts.push(
    ...fillNodeTarget(
      ids,
      root,
      contentSectionChildren,
      target.documentNodes,
      REFERENCE_CORPUS_SEEDS[name],
    ),
  );
  return {
    root,
    bodyNodeId,
    firstSectionNodeId: firstSection.id,
    unicodeParagraphNodeId: unicodeParagraph.id,
    unicodeText,
    payloadTexts,
  };
}

function createAdditionalSections(
  ids: DeterministicCorpusIdAllocator,
  name: ReferenceCorpusName,
  count: number,
): readonly {
  readonly section: SectionNode;
  readonly children: [HeadingNode, ...SectionBodyNode[]];
  readonly payloadText: MutableTextNode;
}[] {
  const sections: {
    readonly section: SectionNode;
    readonly children: [HeadingNode, ...SectionBodyNode[]];
    readonly payloadText: MutableTextNode;
  }[] = [];
  for (let index = 0; index < count; index += 1) {
    const payloadText = createMutableText(ids);
    const children: [HeadingNode, ...SectionBodyNode[]] = [
      createHeading(ids, 1, `Reference corpus ${name} analysis ${index + 1}`),
      createParagraphWithChildren(ids, [payloadText]),
    ];
    sections.push({
      section: createSection(ids, children),
      children,
      payloadText,
    });
  }
  return sections;
}

function createCitationBundle(
  ids: DeterministicCorpusIdAllocator,
  name: ReferenceCorpusName,
  count: number,
): CitationBundle {
  const references: ReferenceSnapshot[] = [];
  const citationNodes: CitationNode[] = [];

  for (let index = 0; index < count; index += 1) {
    const referenceId = ids.allocateEntityId();
    references.push({
      id: referenceId,
      cslJson: {
        id: `${name}-reference-${index + 1}`,
        title: `Deterministic reference ${index + 1}`,
        type: 'article-journal',
      },
      metadataHash: hashUtf8(`${name}:reference:${index + 1}`),
      capturedAt: CAPTURED_AT,
      sourceProvider: 'nireco-reference-corpus',
    });
    citationNodes.push({
      id: ids.allocateNodeId(),
      type: 'citation',
      attrs: {
        citationId: ids.allocateEntityId(),
        referenceId,
        locator: {
          label: 'page',
          value: String((index % 400) + 1),
        },
      },
    });
  }

  return {
    references,
    paragraphs: chunkCitationsIntoParagraphs(ids, citationNodes),
  };
}

function chunkCitationsIntoParagraphs(
  ids: DeterministicCorpusIdAllocator,
  citations: readonly CitationNode[],
): readonly ParagraphNode[] {
  const paragraphs: ParagraphNode[] = [];
  const citationsPerParagraph = 20;

  for (let start = 0; start < citations.length; start += citationsPerParagraph) {
    const children: InlineNode[] = [
      createText(ids, `citation cluster ${Math.floor(start / citationsPerParagraph) + 1}`),
    ];
    children.push(...citations.slice(start, start + citationsPerParagraph));
    paragraphs.push(createParagraphWithChildren(ids, children));
  }
  return paragraphs;
}

function createTables(
  ids: DeterministicCorpusIdAllocator,
  name: ReferenceCorpusName,
  count: number,
): readonly TableNode[] {
  const tables: TableNode[] = [];
  for (let index = 0; index < count; index += 1) {
    tables.push({
      id: ids.allocateNodeId(),
      type: 'table',
      attrs: {
        entityId: ids.allocateEntityId(),
        label: `Table ${index + 1}`,
      },
      children: [
        {
          id: ids.allocateNodeId(),
          type: 'tableCaption',
          attrs: {},
          children: [createText(ids, `${name} table ${index + 1}`)],
        },
        {
          id: ids.allocateNodeId(),
          type: 'tableRow',
          attrs: {},
          children: [
            createTableCell(ids, `row ${index + 1}`),
            createTableCell(ids, `value ${index + 1}`),
          ],
        },
      ],
    });
  }
  return tables;
}

function createTableCell(ids: DeterministicCorpusIdAllocator, value: string) {
  return {
    id: ids.allocateNodeId(),
    type: 'tableCell' as const,
    attrs: {},
    children: [createParagraph(ids, value)] as const,
  };
}

function createFigures(
  ids: DeterministicCorpusIdAllocator,
  name: ReferenceCorpusName,
  count: number,
): readonly FigureNode[] {
  const figures: FigureNode[] = [];
  for (let index = 0; index < count; index += 1) {
    figures.push({
      id: ids.allocateNodeId(),
      type: 'figure',
      attrs: {
        entityId: ids.allocateEntityId(),
        label: `Figure ${index + 1}`,
      },
      children: [
        {
          id: ids.allocateNodeId(),
          type: 'figureAsset',
          attrs: {
            uri: requireResourceUri(
              `https://example.org/nireco/${name.toLowerCase()}/figure-${index + 1}.png`,
            ),
            contentHash: hashUtf8(`${name}:figure:${index + 1}`),
            altText: `Deterministic figure ${index + 1}`,
          },
        },
        {
          id: ids.allocateNodeId(),
          type: 'figureCaption',
          attrs: {},
          children: [createText(ids, `${name} figure ${index + 1}`)],
        },
      ],
    });
  }
  return figures;
}

function createEquations(
  ids: DeterministicCorpusIdAllocator,
  count: number,
): readonly (ParagraphNode | DisplayEquationNode)[] {
  const equations: (ParagraphNode | DisplayEquationNode)[] = [
    createParagraphWithChildren(ids, [
      createText(ids, 'inline equation'),
      {
        id: ids.allocateNodeId(),
        type: 'inlineEquation',
        attrs: {
          source: 'E = mc^2',
        },
      },
    ]),
  ];
  for (let index = 1; index < count; index += 1) {
    equations.push({
      id: ids.allocateNodeId(),
      type: 'displayEquation',
      attrs: {
        source: `x_${index} = ${index}^2`,
        entityId: ids.allocateEntityId(),
        label: `Equation ${index + 1}`,
      },
    });
  }
  return equations;
}

function createAcademicGraph(
  ids: DeterministicCorpusIdAllocator,
  name: ReferenceCorpusName,
  revisionId: RevisionId,
  documentUri: DocumentUri,
  tree: CorpusTree,
  references: readonly ReferenceSnapshot[],
): AcademicGraphSnapshot {
  const evidence = createEvidence(ids, name);
  const claim = createClaim(ids, revisionId, documentUri, tree);
  return {
    referenceSnapshots: references,
    evidenceLinks: [evidence],
    claims: [claim],
    claimEvidenceRelations: [
      {
        claimId: claim.id,
        evidenceId: evidence.id,
        relation: 'supports',
        assessedBy: {
          type: 'system',
          id: 'reference-corpus-generator',
          role: 'validator',
        },
        confidence: 1,
      },
    ],
  };
}

function createEvidence(
  ids: DeterministicCorpusIdAllocator,
  name: ReferenceCorpusName,
): EvidenceLink {
  const excerpt = `${name} reference evidence`;
  return {
    id: ids.allocateEntityId(),
    uri: requireCometResourceUri(`comet://reference-r1/evidence/corpus-${name.toLowerCase()}`),
    sourceUri: requireResourceUri(`https://example.org/nireco/${name.toLowerCase()}/evidence`),
    sourceContentHash: hashUtf8(`${name}:evidence:source`),
    locator: {
      kind: 'text-quote',
      exact: excerpt,
    },
    excerpt,
    excerptHash: hashUtf8(excerpt),
    verificationStatus: 'verified',
    verifiedBy: {
      type: 'system',
      id: 'reference-corpus-generator',
      role: 'validator',
    },
    verifiedAt: CAPTURED_AT,
  };
}

function createClaim(
  ids: DeterministicCorpusIdAllocator,
  revisionId: RevisionId,
  documentUri: DocumentUri,
  tree: CorpusTree,
): ClaimEntity {
  const utf16Offset = requireUtf16Offset(0);
  return {
    id: ids.allocateEntityId(),
    anchor: {
      document: {
        uri: documentUri,
        revisionId,
      },
      primary: {
        kind: 'text',
        textNodeId: tree.unicodeText.id,
        utf16Offset,
        affinity: 'after',
      },
      targetNodeId: tree.unicodeText.id,
      textQuote: {
        exact: tree.unicodeText.value,
        normalizedHash: hashUtf8(tree.unicodeText.value.normalize('NFC')),
      },
      pathHint: [
        tree.root.id,
        tree.bodyNodeId,
        tree.firstSectionNodeId,
        tree.unicodeParagraphNodeId,
        tree.unicodeText.id,
      ],
    },
    textSnapshot: tree.unicodeText.value,
    textHash: hashUtf8(tree.unicodeText.value),
  };
}

function createHashedSnapshot(
  ids: DeterministicCorpusIdAllocator,
  name: ReferenceCorpusName,
  revisionId: RevisionId,
  root: ManuscriptNode,
  academicGraph: AcademicGraphSnapshot,
): DocumentSnapshot {
  const unhashed: DocumentSnapshot = {
    format: 'nireco-document',
    formatVersion: '1.0.0-preview.1',
    schemaId: 'nireco.manuscript',
    schemaVersion: '1.0.0-preview.1',
    revisionId,
    documentHash: EMPTY_DOCUMENT_HASH,
    metadata: {
      title: `Nireco reference corpus ${name}`,
      authors: [
        {
          id: ids.allocateEntityId(),
          name: 'Nireco Reference Generator',
          affiliations: ['Comet Research'],
        },
      ],
      abstract: 'Deterministic staged-calibration corpus.',
      keywords: ['benchmark', 'deterministic', 'manuscript', name],
    },
    root,
    academicGraph,
    settings: {
      language: 'mul',
      citationStyle: 'apa',
      headingNumbering: true,
      bibliographyEnabled: true,
    },
  };
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(unhashed),
  );
  if (hashed.type === 'error') {
    throw new Error(`Reference corpus document hash failed at ${hashed.path}.`);
  }
  return {
    ...unhashed,
    documentHash: hashed.hash,
  };
}

function createSection(
  ids: DeterministicCorpusIdAllocator,
  children: [HeadingNode, ...SectionBodyNode[]],
): SectionNode {
  return {
    id: ids.allocateNodeId(),
    type: 'section',
    attrs: {
      level: 1,
    },
    children,
  };
}

function createHeading(
  ids: DeterministicCorpusIdAllocator,
  level: number,
  value: string,
): HeadingNode {
  return {
    id: ids.allocateNodeId(),
    type: 'heading',
    attrs: {
      level,
    },
    children: [createText(ids, value)],
  };
}

function createParagraph(ids: DeterministicCorpusIdAllocator, value: string): ParagraphNode {
  return createParagraphWithChildren(ids, [createText(ids, value)]);
}

function createParagraphWithChildren(
  ids: DeterministicCorpusIdAllocator,
  children: readonly InlineNode[],
): ParagraphNode {
  return {
    id: ids.allocateNodeId(),
    type: 'paragraph',
    attrs: {
      alignment: 'start',
    },
    children,
  };
}

function createText(ids: DeterministicCorpusIdAllocator, value: string): TextNode {
  return {
    id: ids.allocateNodeId(),
    type: 'text',
    value,
    marks: [],
  };
}

function createMutableText(ids: DeterministicCorpusIdAllocator): MutableTextNode {
  return {
    id: ids.allocateNodeId(),
    type: 'text',
    value: '',
    marks: [],
  };
}

function createList(ids: DeterministicCorpusIdAllocator): ListNode {
  return {
    id: ids.allocateNodeId(),
    type: 'list',
    attrs: {
      ordered: false,
    },
    children: [
      {
        id: ids.allocateNodeId(),
        type: 'listItem',
        attrs: {},
        children: [createParagraph(ids, 'deterministic list item')],
      },
    ],
  };
}

function createFootnote(ids: DeterministicCorpusIdAllocator): FootnoteNode {
  return {
    id: ids.allocateNodeId(),
    type: 'footnote',
    attrs: {
      label: '1',
    },
    children: [createParagraph(ids, 'reference footnote content')],
  };
}

function createFootnoteReferenceParagraph(
  ids: DeterministicCorpusIdAllocator,
  footnoteNodeId: NodeId,
): ParagraphNode {
  return createParagraphWithChildren(ids, [
    createText(ids, 'footnote reference'),
    {
      id: ids.allocateNodeId(),
      type: 'footnoteReference',
      attrs: {
        footnoteNodeId,
      },
    },
  ]);
}

function fillNodeTarget(
  ids: DeterministicCorpusIdAllocator,
  root: ManuscriptNode,
  sectionChildren: readonly [HeadingNode, ...SectionBodyNode[]][],
  target: number,
  seed: string,
): readonly MutableTextNode[] {
  let remaining = target - countNodes(root);
  if (remaining < 0) {
    throw new Error(`Reference corpus base tree exceeds its ${target}-node target.`);
  }
  if (sectionChildren.length === 0) {
    throw new Error('Reference corpus requires at least one content section.');
  }
  const sectionOffset =
    (sha256Utf8Bytes(`${seed}:section-distribution`)[0] ?? 0) % sectionChildren.length;
  if (remaining % 2 === 1) {
    sectionChildren[sectionOffset]?.push(createHorizontalRule(ids));
    remaining -= 1;
  }
  const payloadTexts: MutableTextNode[] = [];
  const paragraphCount = remaining / 2;
  for (let index = 0; index < paragraphCount; index += 1) {
    const payloadText = createMutableText(ids);
    const destination = sectionChildren[(sectionOffset + index) % sectionChildren.length];
    destination?.push(createParagraphWithChildren(ids, [payloadText]));
    payloadTexts.push(payloadText);
  }
  return payloadTexts;
}

function createHorizontalRule(ids: DeterministicCorpusIdAllocator): HorizontalRuleNode {
  return {
    id: ids.allocateNodeId(),
    type: 'horizontalRule',
    attrs: {},
  };
}

function fillWordTarget(
  root: ManuscriptNode,
  payloadTexts: readonly MutableTextNode[],
  target: number,
  seed: string,
): void {
  const remaining = target - countWordsInNode(root);
  if (remaining < payloadTexts.length || payloadTexts.length === 0) {
    throw new Error(`Reference corpus fixed text exceeds its ${target}-word target.`);
  }
  const wordCounts = distributeWordCounts(remaining, payloadTexts.length, seed);
  const textRandom = new DeterministicCorpusRandom(`${seed}:text-content`);
  for (let index = 0; index < payloadTexts.length; index += 1) {
    const payloadText = payloadTexts[index];
    const wordCount = wordCounts[index];
    if (payloadText === undefined || wordCount === undefined) {
      throw new Error('Reference corpus word distribution lost a payload paragraph.');
    }
    payloadText.value = createWordPayload(wordCount, textRandom, index);
  }
}

function distributeWordCounts(total: number, count: number, seed: string): readonly number[] {
  const random = new DeterministicCorpusRandom(`${seed}:text-shape`);
  const weights = Array.from({ length: count }, () => 8 + random.nextInteger(25));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const counts = weights.map((weight) => Math.floor((total * weight) / totalWeight));
  let distributed = counts.reduce((sum, wordCount) => sum + wordCount, 0);
  let index = random.nextInteger(count);
  while (distributed < total) {
    counts[index] = (counts[index] ?? 0) + 1;
    distributed += 1;
    index = (index + 1) % count;
  }
  if (counts.some((wordCount) => wordCount < 1)) {
    throw new Error('Reference corpus word distribution produced an empty payload paragraph.');
  }
  return counts;
}

function createWordPayload(
  count: number,
  random: DeterministicCorpusRandom,
  paragraphIndex: number,
): string {
  const words = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const vocabularyIndex =
      (random.nextInteger(WORD_VOCABULARY.length) + paragraphIndex + index) %
      WORD_VOCABULARY.length;
    const word = WORD_VOCABULARY[vocabularyIndex] ?? 'semantic';
    words[index] = (index + 1) % 17 === 0 ? `${word}.` : word;
  }
  return words.join(' ');
}

function assertCorpusIntegrity(
  snapshot: DocumentSnapshot,
  target: ReferenceCorpusCounts,
  name: ReferenceCorpusName,
): void {
  const validation = validateDocumentSnapshot(snapshot);
  if (validation.type === 'error') {
    throw new Error(
      `Generated reference corpus is invalid at ${validation.error.path}: ${validation.error.safeMessage}`,
    );
  }
  const indexed = createDocumentIndex(snapshot);
  if (indexed.type === 'error') {
    throw new Error(
      `Generated reference corpus could not be indexed at ${indexed.error.path}: ${indexed.error.safeMessage}`,
    );
  }
  const actual = inspectReferenceCorpus(snapshot);
  if (indexed.value.nodeCount !== target.documentNodes || !countsEqual(actual, target)) {
    throw new Error(
      `Generated reference corpus count mismatch: expected ${JSON.stringify(target)}, received ${JSON.stringify(actual)}.`,
    );
  }
  assertAcademicGraph(snapshot.academicGraph);
  assertCorpusShape(snapshot, target, REFERENCE_CORPUS_SHAPE_REQUIREMENTS[name]);
}

function assertCorpusShape(
  snapshot: DocumentSnapshot,
  target: ReferenceCorpusCounts,
  requirement: ReferenceCorpusShapeRequirement,
): void {
  const shape = inspectReferenceCorpusShape(snapshot);
  const maximumTextWords = Math.floor(target.words * requirement.maximumSingleTextWordShare);
  if (
    shape.sections !== requirement.sections ||
    shape.paragraphs < requirement.minimumParagraphs ||
    shape.minimumParagraphsPerSection < requirement.minimumParagraphsPerSection ||
    shape.maxTextNodeWords > maximumTextWords ||
    shape.medianTextNodeWords < requirement.minimumMedianTextNodeWords ||
    shape.p95TextNodeWords < requirement.minimumP95TextNodeWords ||
    shape.p95TextNodeWords > requirement.maximumP95TextNodeWords
  ) {
    throw new Error(
      `Generated reference corpus shape mismatch: requirement ${JSON.stringify(requirement)}, ` +
        `maximum text words ${maximumTextWords}, received ${JSON.stringify(shape)}.`,
    );
  }
}

function assertAcademicGraph(graph: AcademicGraphSnapshot): void {
  const evidenceIds = new Set(graph.evidenceLinks.map((evidence) => evidence.id));
  const claimIds = new Set(graph.claims.map((claim) => claim.id));
  if (
    graph.evidenceLinks.length === 0 ||
    graph.claims.length === 0 ||
    graph.claimEvidenceRelations.length === 0 ||
    graph.claimEvidenceRelations.some(
      (relation) => !claimIds.has(relation.claimId) || !evidenceIds.has(relation.evidenceId),
    )
  ) {
    throw new Error('Generated reference corpus Academic Graph is incomplete.');
  }
}

function countsEqual(left: ReferenceCorpusCounts, right: ReferenceCorpusCounts): boolean {
  return (
    left.words === right.words &&
    left.documentNodes === right.documentNodes &&
    left.citations === right.citations &&
    left.tables === right.tables &&
    left.figures === right.figures &&
    left.equations === right.equations
  );
}

function countNodes(root: ManuscriptNode): number {
  let count = 0;
  const pending: DocumentNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      break;
    }
    count += 1;
    pushChildren(pending, node);
  }
  return count;
}

function countParagraphsInSection(section: SectionNode): number {
  let paragraphs = 0;
  const pending: DocumentNode[] = [...section.children];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      break;
    }
    paragraphs += node.type === 'paragraph' ? 1 : 0;
    pushChildren(pending, node);
  }
  return paragraphs;
}

function countWordsInNode(root: ManuscriptNode): number {
  let words = 0;
  const pending: DocumentNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      break;
    }
    words += node.type === 'text' ? countWords(node.value) : 0;
    pushChildren(pending, node);
  }
  return words;
}

function countWords(value: string): number {
  const normalized = value.trim();
  return normalized.length === 0 ? 0 : normalized.split(/\s+/u).length;
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.ceil(sortedValues.length * fraction) - 1;
  return sortedValues[Math.max(0, index)] ?? 0;
}

function pushChildren(pending: DocumentNode[], node: DocumentNode): void {
  if (!('children' in node)) {
    return;
  }
  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const child = node.children[index];
    if (child !== undefined) {
      pending.push(child);
    }
  }
}

function stringifySnapshot(snapshot: DocumentSnapshot): string {
  return JSON.stringify(snapshot);
}

function hashUtf8(value: string): ContentHash {
  return requireContentHash(`sha256:${sha256Utf8(value)}`);
}

function nextXorShift32(value: number): number {
  let next = value;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function requireContentHash(value: string): ContentHash {
  const parsed = parseContentHash(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected a valid SHA-256 content hash, received ${value}.`);
  }
  return parsed.value;
}

function requireIsoTimestamp(value: string): IsoTimestamp {
  const parsed = parseIsoTimestamp(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected an RFC 3339 UTC timestamp, received ${value}.`);
  }
  return parsed.value;
}

function requireUtf16Offset(value: number): Utf16Offset {
  const parsed = parseUtf16Offset(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected a valid UTF-16 offset, received ${value}.`);
  }
  return parsed.value;
}

function requireResourceUri(value: string): ResourceUri {
  const parsed = canonicalizeResourceUri(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected a canonical Resource URI, received ${value}.`);
  }
  return parsed.value;
}

function requireDocumentUri(value: string): DocumentUri {
  if (!isDocumentUri(value)) {
    throw new Error(`Expected a canonical Nireco document URI, received ${value}.`);
  }
  return value;
}

function requireCometResourceUri(value: string): CometResourceUri {
  if (!isCometResourceUri(value)) {
    throw new Error(`Expected a canonical Comet resource URI, received ${value}.`);
  }
  return value;
}
