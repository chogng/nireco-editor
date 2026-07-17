import {
  parseContentHash,
  parseDebugId,
  parseEntityId,
  parseNodeId,
  parseOperationId,
  parsePreviewFixtureDebugId,
  parsePreviewFixtureEntityId,
  parsePreviewFixtureNodeId,
  parsePreviewFixtureOperationId,
  parsePreviewFixtureProposalChangeGroupId,
  parsePreviewFixtureProposalId,
  parsePreviewFixtureRevisionId,
  parsePreviewFixtureSessionId,
  parsePreviewFixtureTransactionId,
  parseProposalId,
  parseRevisionId,
  parseSessionId,
  parseTransactionId,
  parseUtf16Offset,
  parseWorkspaceId,
  type ContentHash,
  type DebugId,
  type EntityId,
  type NodeId,
  type OperationId,
  type ProposalChangeGroupId,
  type ProposalId,
  type RevisionId,
  type SessionId,
  type TransactionId,
  type Utf16Offset,
  type WorkspaceId,
} from '../../src/base/ids/identifiers.js';
import { createUuidV7 } from '../../src/base/ids/uuid-v7-allocator.js';
import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../../src/base/hashing/portable-sha-256.js';
import { parseIsoTimestamp, type IClock, type IsoTimestamp } from '../../src/base/time/clock.js';
import {
  canonicalizeResourceUri,
  isCometResourceUri,
  isDocumentUri,
  type CometResourceUri,
  type DocumentUri,
  type ResourceUri,
} from '../../src/base/uri/resource-uri.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import type { IIdAllocator } from '../../src/workspace/id-allocator.js';

export class FixedClock implements IClock {
  readonly #value: IsoTimestamp;

  constructor(value = '2026-07-20T00:00:00Z') {
    this.#value = validIsoTimestamp(value);
  }

  now(): IsoTimestamp {
    return this.#value;
  }
}

export class DeterministicIdAllocator implements IIdAllocator {
  #allocatedSequence = 0;

  allocateWorkspaceId(): WorkspaceId {
    return unwrapIdentifier(parseWorkspaceId(this.#nextUuid()), 'production workspace');
  }

  allocateNodeId(): NodeId {
    return unwrapIdentifier(parseNodeId(this.#nextUuid()), 'production node');
  }

  allocateEntityId(): EntityId {
    return unwrapIdentifier(parseEntityId(this.#nextUuid()), 'production entity');
  }

  allocateTransactionId(): TransactionId {
    return unwrapIdentifier(parseTransactionId(this.#nextUuid()), 'production transaction');
  }

  allocateOperationId(): OperationId {
    return unwrapIdentifier(parseOperationId(this.#nextUuid()), 'production operation');
  }

  allocateRevisionId(): RevisionId {
    return unwrapIdentifier(parseRevisionId(this.#nextUuid()), 'production revision');
  }

  allocateProposalId(): ProposalId {
    return unwrapIdentifier(parseProposalId(this.#nextUuid()), 'production proposal');
  }

  allocateSessionId(): SessionId {
    return unwrapIdentifier(parseSessionId(this.#nextUuid()), 'production session');
  }

  allocateDebugId(): DebugId {
    return unwrapIdentifier(parseDebugId(this.#nextUuid()), 'production debug');
  }

  #nextUuid(): string {
    this.#allocatedSequence += 1;
    return allocatedTestUuid(this.#allocatedSequence);
  }
}

export const MINIMAL_FIXTURE_IDS = {
  revision: unwrapIdentifier(
    parseRevisionId('018f0000-0000-7000-8000-000000000001'),
    'minimal revision',
  ),
  author: unwrapIdentifier(parseEntityId('018f0000-0000-7000-8000-000000000010'), 'minimal author'),
  manuscript: unwrapIdentifier(
    parseNodeId('018f0000-0000-7000-8000-000000000101'),
    'minimal manuscript',
  ),
  frontMatter: unwrapIdentifier(
    parseNodeId('018f0000-0000-7000-8000-000000000102'),
    'minimal front matter',
  ),
  body: unwrapIdentifier(parseNodeId('018f0000-0000-7000-8000-000000000103'), 'minimal body'),
  paragraph: unwrapIdentifier(
    parseNodeId('018f0000-0000-7000-8000-000000000104'),
    'minimal paragraph',
  ),
  text: unwrapIdentifier(parseNodeId('018f0000-0000-7000-8000-000000000105'), 'minimal text'),
  bibliography: unwrapIdentifier(
    parseNodeId('018f0000-0000-7000-8000-000000000113'),
    'minimal bibliography',
  ),
  reference: unwrapIdentifier(
    parseEntityId('018f0000-0000-7000-8000-000000000120'),
    'minimal reference',
  ),
} as const;

export function createMinimalSnapshot(revisionId = MINIMAL_FIXTURE_IDS.revision): DocumentSnapshot {
  const snapshot: DocumentSnapshot = {
    format: 'nireco-document',
    formatVersion: '1.0.0-preview.1',
    schemaId: 'nireco.manuscript',
    schemaVersion: '1.0.0-preview.1',
    revisionId,
    documentHash: validContentHash(
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    ),
    metadata: {
      title: 'A minimal manuscript',
      authors: [
        {
          id: MINIMAL_FIXTURE_IDS.author,
          name: 'Ada Researcher',
        },
      ],
      abstract: 'A deterministic fixture.',
      keywords: ['nireco'],
    },
    root: {
      id: MINIMAL_FIXTURE_IDS.manuscript,
      type: 'manuscript',
      attrs: {},
      children: [
        {
          id: MINIMAL_FIXTURE_IDS.frontMatter,
          type: 'frontMatter',
          attrs: {},
          children: [],
        },
        {
          id: MINIMAL_FIXTURE_IDS.body,
          type: 'body',
          attrs: {},
          children: [
            {
              id: MINIMAL_FIXTURE_IDS.paragraph,
              type: 'paragraph',
              attrs: {
                alignment: 'start',
              },
              children: [
                {
                  id: MINIMAL_FIXTURE_IDS.text,
                  type: 'text',
                  value: 'Hello, Nireco.',
                  marks: [],
                },
              ],
            },
          ],
        },
        {
          id: MINIMAL_FIXTURE_IDS.bibliography,
          type: 'bibliographyPlaceholder',
          attrs: {
            heading: 'References',
          },
        },
      ],
    },
    academicGraph: {
      referenceSnapshots: [],
      evidenceLinks: [],
      claims: [],
      claimEvidenceRelations: [],
    },
    settings: {
      language: 'en',
      citationStyle: 'apa',
      headingNumbering: true,
      bibliographyEnabled: true,
    },
  };
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(snapshot),
  );
  if (hashed.type === 'error') {
    throw new Error('The minimal Snapshot fixture is not canonical JSON.');
  }
  return {
    ...snapshot,
    documentHash: hashed.hash,
  };
}

export function validResourceUri(value: string): ResourceUri {
  const parsed = canonicalizeResourceUri(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected a valid resource URI, received: ${value}`);
  }
  return parsed.value;
}

export function validDocumentUri(value: string): DocumentUri {
  if (!isDocumentUri(value)) {
    throw new Error(`Expected a canonical Nireco document URI, received: ${value}`);
  }
  return value;
}

export function validCometResourceUri(value: string): CometResourceUri {
  if (!isCometResourceUri(value)) {
    throw new Error(`Expected a canonical Comet resource URI, received: ${value}`);
  }
  return value;
}

export function validRevisionId(value: string): RevisionId {
  return unwrapIdentifier(parsePreviewFixtureRevisionId(value), 'preview fixture revision');
}

export function validNodeId(value: string): NodeId {
  return unwrapIdentifier(parsePreviewFixtureNodeId(value), 'preview fixture node');
}

export function validEntityId(value: string): EntityId {
  return unwrapIdentifier(parsePreviewFixtureEntityId(value), 'preview fixture entity');
}

export function validTransactionId(value: string): TransactionId {
  return unwrapIdentifier(parsePreviewFixtureTransactionId(value), 'preview fixture transaction');
}

export function validOperationId(value: string): OperationId {
  return unwrapIdentifier(parsePreviewFixtureOperationId(value), 'preview fixture operation');
}

export function validProposalId(value: string): ProposalId {
  return unwrapIdentifier(parsePreviewFixtureProposalId(value), 'preview fixture proposal');
}

export function validProposalChangeGroupId(value: string): ProposalChangeGroupId {
  return unwrapIdentifier(
    parsePreviewFixtureProposalChangeGroupId(value),
    'preview fixture proposal change group',
  );
}

export function validSessionId(value: string): SessionId {
  return unwrapIdentifier(parsePreviewFixtureSessionId(value), 'preview fixture session');
}

export function validDebugId(value: string): DebugId {
  return unwrapIdentifier(parsePreviewFixtureDebugId(value), 'preview fixture debug');
}

export function validContentHash(value: string): ContentHash {
  return unwrapIdentifier(parseContentHash(value), 'content hash');
}

export function validUtf16Offset(value: number): Utf16Offset {
  return unwrapIdentifier(parseUtf16Offset(value), 'UTF-16 offset');
}

export function validIsoTimestamp(value: string): IsoTimestamp {
  const parsed = parseIsoTimestamp(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected an RFC 3339 UTC timestamp, received: ${value}`);
  }
  return parsed.value;
}

function unwrapIdentifier<TValue>(
  result:
    | {
        readonly type: 'valid';
        readonly value: TValue;
      }
    | {
        readonly type: 'invalid';
        readonly reason: string;
      },
  label: string,
): TValue {
  if (result.type === 'invalid') {
    throw new Error(`Expected a valid ${label} identifier.`);
  }
  return result.value;
}

function allocatedTestUuid(sequence: number): string {
  const randomBytes = new Uint8Array(10);
  randomBytes[8] = Math.floor(sequence / 256);
  randomBytes[9] = sequence % 256;
  return createUuidV7({
    unixMilliseconds: 1_720_000_000_000,
    randomBytes,
  });
}
