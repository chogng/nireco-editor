import type { ContentHash, EntityId, NodeId } from '../base/ids/identifiers.js';
import type { JsonValue } from '../base/serialization/canonical-json.js';
import type { IsoTimestamp } from '../base/time/clock.js';
import type { CometResourceUri, ResourceUri } from '../base/uri/resource-uri.js';
import type { CitationLocator, EvidenceLocator } from '../model/academic-graph.js';
import type { ActorRef } from '../model/actor.js';
import type { ManuscriptAuthor } from '../model/snapshot.js';
import type { Mark } from '../model/node/manuscript-node.js';
import type { PersistentAnchor, SemanticPosition } from '../model/position/semantic-position.js';
import type { TransactionPrecondition } from '../model/transaction/transaction.js';

export type SemanticPrecondition = TransactionPrecondition;

interface InsertionTargetBase {
  readonly parentNodeId: NodeId;
}

export type InsertionTarget = InsertionTargetBase &
  (
    | {
        readonly afterNodeId?: never;
        readonly beforeNodeId?: never;
      }
    | {
        readonly afterNodeId: NodeId;
        readonly beforeNodeId?: never;
      }
    | {
        readonly afterNodeId?: never;
        readonly beforeNodeId: NodeId;
      }
  );

export type ProposedInlineContent =
  | {
      readonly clientRef: string;
      readonly type: 'text';
      readonly value: string;
      readonly marks: readonly Mark[];
    }
  | {
      readonly clientRef: string;
      readonly type: 'hardBreak';
    }
  | {
      readonly clientRef: string;
      readonly type: 'inlineEquation';
      readonly source: string;
    }
  | {
      readonly clientRef: string;
      readonly type: 'crossReference';
      readonly targetEntityId: EntityId;
      readonly label?: string;
    };

export type ProposedBlockContent =
  | {
      readonly clientRef: string;
      readonly type: 'paragraph' | 'heading';
      readonly attrs: Readonly<Record<string, JsonValue>>;
      readonly children: readonly ProposedInlineContent[];
    }
  | {
      readonly clientRef: string;
      readonly type:
        'section' | 'figure' | 'table' | 'list' | 'listItem' | 'blockQuote' | 'footnote';
      readonly attrs: Readonly<Record<string, JsonValue>>;
      readonly children: readonly (ProposedBlockContent | ProposedInlineContent)[];
    }
  | {
      readonly clientRef: string;
      readonly type: 'displayEquation' | 'horizontalRule';
      readonly attrs: Readonly<Record<string, JsonValue>>;
    }
  | {
      readonly clientRef: string;
      readonly type: 'codeBlock';
      readonly attrs: Readonly<Record<string, JsonValue>>;
      readonly text: string;
    };

export interface InsertBlockEdit {
  readonly kind: 'insert-block';
  readonly clientRef: string;
  readonly target: InsertionTarget;
  readonly block: ProposedBlockContent;
  readonly rationale?: string;
  readonly preconditions?: readonly SemanticPrecondition[];
}

interface ReplaceBlockContentEditBase {
  readonly kind: 'replace-block-content';
  readonly targetNodeId: NodeId;
  readonly expectedContentHash: ContentHash;
  readonly replacement: readonly ProposedInlineContent[];
  readonly rationale: string;
}

export type ReplaceBlockContentEdit = ReplaceBlockContentEditBase &
  (
    | {
        readonly preserveCitations: 'all' | 'none';
        readonly explicitCitationIds?: never;
      }
    | {
        readonly preserveCitations: 'explicit';
        readonly explicitCitationIds: readonly EntityId[];
      }
  );

export interface MoveBlockEdit {
  readonly kind: 'move-block';
  readonly targetNodeId: NodeId;
  readonly target: InsertionTarget;
  readonly rationale: string;
  readonly preconditions?: readonly SemanticPrecondition[];
}

export interface DeleteBlockEdit {
  readonly kind: 'delete-block';
  readonly targetNodeId: NodeId;
  readonly expectedContentHash: ContentHash;
  readonly rationale: string;
}

export interface InsertCitationEdit {
  readonly kind: 'insert-citation';
  readonly clientRef: string;
  readonly target: SemanticPosition;
  readonly claimId?: EntityId;
  readonly referenceId: EntityId;
  readonly evidenceIds: readonly EntityId[];
  readonly relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only';
  readonly locator?: CitationLocator;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly rationale: string;
}

export interface ReplaceCitationEdit {
  readonly kind: 'replace-citation';
  readonly targetCitationNodeId: NodeId;
  readonly expectedReferenceId: EntityId;
  readonly referenceId: EntityId;
  readonly evidenceIds: readonly EntityId[];
  readonly relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only';
  readonly locator?: CitationLocator;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly rationale: string;
}

export interface CreateClaimEdit {
  readonly kind: 'create-claim';
  readonly clientRef: string;
  readonly anchor: PersistentAnchor;
  readonly textSnapshot: string;
  readonly textHash: ContentHash;
  readonly rationale: string;
}

export interface LinkClaimEvidenceEdit {
  readonly kind: 'link-claim-evidence';
  readonly claimId: EntityId;
  readonly evidenceId: EntityId;
  readonly relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only' | 'unclear';
  readonly assessedBy: ActorRef;
  readonly confidence?: number;
  readonly rationale: string;
}

export type EvidenceVerification =
  | {
      readonly status: 'verified';
      readonly verifiedBy: ActorRef;
      readonly verifiedAt: IsoTimestamp;
    }
  | {
      readonly status: 'provisional' | 'metadata-only' | 'stale' | 'rejected';
      readonly verifiedBy?: ActorRef;
      readonly verifiedAt?: IsoTimestamp;
    };

export interface CreateEvidenceLinkEdit {
  readonly kind: 'create-evidence-link';
  readonly clientRef: string;
  readonly uri: CometResourceUri;
  readonly sourceUri: ResourceUri;
  readonly sourceContentHash: ContentHash;
  readonly locator: EvidenceLocator;
  readonly excerpt?: string;
  readonly excerptHash?: ContentHash;
  readonly verification: EvidenceVerification;
  readonly rationale: string;
}

export interface MetadataPatch {
  readonly title?: string;
  readonly authors?: readonly ManuscriptAuthor[];
  readonly abstract?: string;
  readonly keywords?: readonly string[];
}

export interface UpdateMetadataEdit {
  readonly kind: 'update-metadata';
  readonly patch: MetadataPatch;
  readonly rationale: string;
  readonly preconditions?: readonly SemanticPrecondition[];
}

export type SemanticEdit =
  | InsertBlockEdit
  | ReplaceBlockContentEdit
  | MoveBlockEdit
  | DeleteBlockEdit
  | InsertCitationEdit
  | ReplaceCitationEdit
  | CreateClaimEdit
  | LinkClaimEvidenceEdit
  | CreateEvidenceLinkEdit
  | UpdateMetadataEdit;

export type SemanticEditKind = SemanticEdit['kind'];

export const SEMANTIC_EDIT_KINDS = [
  'insert-block',
  'replace-block-content',
  'move-block',
  'delete-block',
  'insert-citation',
  'replace-citation',
  'create-claim',
  'link-claim-evidence',
  'create-evidence-link',
  'update-metadata',
] as const satisfies readonly SemanticEditKind[];
