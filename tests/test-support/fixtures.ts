import {
  parseContentHash,
  parseDebugId,
  parseEntityId,
  parseNodeId,
  parseProposalChangeGroupId,
  parseProposalId,
  parseRevisionId,
  parseSessionId,
  parseTransactionId,
  parseUtf16Offset,
  type ContentHash,
  type DebugId,
  type EntityId,
  type NodeId,
  type ProposalChangeGroupId,
  type ProposalId,
  type RevisionId,
  type SessionId,
  type TransactionId,
  type Utf16Offset,
} from '../../src/base/ids/identifiers.js';
import { parseIsoTimestamp, type IClock, type IsoTimestamp } from '../../src/base/time/clock.js';
import {
  canonicalizeResourceUri,
  isCometResourceUri,
  isDocumentUri,
  type CometResourceUri,
  type DocumentUri,
  type ResourceUri,
} from '../../src/base/uri/resource-uri.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
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
  #nodeSequence = 0;
  #entitySequence = 0;
  #transactionSequence = 0;
  #revisionSequence = 0;
  #proposalSequence = 0;
  #groupSequence = 0;
  #sessionSequence = 0;
  #debugSequence = 0;

  allocateNodeId(): NodeId {
    this.#nodeSequence += 1;
    return validNodeId(`node-${this.#nodeSequence}`);
  }

  allocateEntityId(): EntityId {
    this.#entitySequence += 1;
    return validEntityId(`entity-${this.#entitySequence}`);
  }

  allocateTransactionId(): TransactionId {
    this.#transactionSequence += 1;
    return validTransactionId(`tx-${this.#transactionSequence}`);
  }

  allocateRevisionId(): RevisionId {
    this.#revisionSequence += 1;
    return validRevisionId(`rev-${this.#revisionSequence}`);
  }

  allocateProposalId(): ProposalId {
    this.#proposalSequence += 1;
    return validProposalId(`proposal-${this.#proposalSequence}`);
  }

  allocateProposalChangeGroupId(): ProposalChangeGroupId {
    this.#groupSequence += 1;
    return validProposalChangeGroupId(`group-${this.#groupSequence}`);
  }

  allocateSessionId(): SessionId {
    this.#sessionSequence += 1;
    return validSessionId(`session-${this.#sessionSequence}`);
  }

  allocateDebugId(): DebugId {
    this.#debugSequence += 1;
    return validDebugId(`debug-${this.#debugSequence}`);
  }
}

export function createMinimalSnapshot(revisionId = validRevisionId('rev-0001')): DocumentSnapshot {
  return {
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
          id: validEntityId('author-1'),
          name: 'Ada Researcher',
        },
      ],
      abstract: 'A deterministic fixture.',
      keywords: ['nireco'],
    },
    root: {
      id: validNodeId('node-manuscript'),
      type: 'manuscript',
      attrs: {},
      children: [
        {
          id: validNodeId('node-front-matter'),
          type: 'frontMatter',
          attrs: {},
          children: [],
        },
        {
          id: validNodeId('node-body'),
          type: 'body',
          attrs: {},
          children: [
            {
              id: validNodeId('node-paragraph'),
              type: 'paragraph',
              attrs: {
                alignment: 'start',
              },
              children: [
                {
                  id: validNodeId('node-text'),
                  type: 'text',
                  value: 'Hello, Nireco.',
                  marks: [],
                },
              ],
            },
          ],
        },
        {
          id: validNodeId('node-bibliography'),
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
  return unwrapIdentifier(parseRevisionId(value), 'revision');
}

export function validNodeId(value: string): NodeId {
  return unwrapIdentifier(parseNodeId(value), 'node');
}

export function validEntityId(value: string): EntityId {
  return unwrapIdentifier(parseEntityId(value), 'entity');
}

export function validTransactionId(value: string): TransactionId {
  return unwrapIdentifier(parseTransactionId(value), 'transaction');
}

export function validProposalId(value: string): ProposalId {
  return unwrapIdentifier(parseProposalId(value), 'proposal');
}

export function validProposalChangeGroupId(value: string): ProposalChangeGroupId {
  return unwrapIdentifier(parseProposalChangeGroupId(value), 'proposal change group');
}

export function validSessionId(value: string): SessionId {
  return unwrapIdentifier(parseSessionId(value), 'session');
}

export function validDebugId(value: string): DebugId {
  return unwrapIdentifier(parseDebugId(value), 'debug');
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
