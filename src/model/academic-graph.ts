import type { ContentHash, EntityId } from '../base/ids/identifiers.js';
import type { JsonValue } from '../base/serialization/canonical-json.js';
import type { IsoTimestamp } from '../base/time/clock.js';
import type { CometResourceUri, ResourceUri } from '../base/uri/resource-uri.js';
import type { ActorRef } from './actor.js';
import type { PersistentAnchor } from './position/semantic-position.js';

export type AcademicEntityKind = 'claim' | 'evidence-link' | 'reference-snapshot';

export interface ReferenceSnapshot {
  readonly id: EntityId;
  readonly externalUri?: ResourceUri;
  readonly cslJson: Readonly<Record<string, JsonValue>>;
  readonly metadataHash: ContentHash;
  readonly capturedAt: IsoTimestamp;
  readonly sourceProvider?: string;
}

export type EvidenceLocator =
  | {
      readonly kind: 'page';
      readonly page: number;
      readonly pageLabel?: string;
    }
  | {
      readonly kind: 'section';
      readonly section: string;
    }
  | {
      readonly kind: 'text-quote';
      readonly exact: string;
      readonly prefix?: string;
      readonly suffix?: string;
    }
  | {
      readonly kind: 'time';
      readonly startSeconds: number;
      readonly endSeconds?: number;
    }
  | {
      readonly kind: 'record';
      readonly recordKey: string;
    };

export interface CitationLocator {
  readonly label:
    'page' | 'chapter' | 'section' | 'paragraph' | 'figure' | 'table' | 'timestamp' | 'record';
  readonly value: string;
}

export interface EvidenceLink {
  readonly id: EntityId;
  readonly uri: CometResourceUri;
  readonly sourceUri: ResourceUri;
  readonly sourceContentHash: ContentHash;
  readonly locator: EvidenceLocator;
  readonly excerpt?: string;
  readonly excerptHash?: ContentHash;
  readonly verificationStatus: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
  readonly verifiedBy?: ActorRef;
  readonly verifiedAt?: IsoTimestamp;
}

export interface ClaimEntity {
  readonly id: EntityId;
  readonly anchor: PersistentAnchor;
  readonly textSnapshot: string;
  readonly textHash: ContentHash;
}

export interface ClaimEvidenceRelation {
  readonly claimId: EntityId;
  readonly evidenceId: EntityId;
  readonly relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only' | 'unclear';
  readonly assessedBy: ActorRef;
  readonly confidence?: number;
}

export type AcademicEntity = ReferenceSnapshot | EvidenceLink | ClaimEntity;

export interface AcademicGraphSnapshot {
  readonly referenceSnapshots: readonly ReferenceSnapshot[];
  readonly evidenceLinks: readonly EvidenceLink[];
  readonly claims: readonly ClaimEntity[];
  readonly claimEvidenceRelations: readonly ClaimEvidenceRelation[];
}
