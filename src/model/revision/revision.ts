import type { ContentHash, RevisionId, TransactionId } from '../../base/ids/identifiers.js';
import type { IsoTimestamp } from '../../base/time/clock.js';
import type { DocumentUri } from '../../base/uri/resource-uri.js';
import type { ActorRef } from '../actor.js';

export interface Revision {
  readonly id: RevisionId;
  readonly uri: DocumentUri;
  readonly parentRevisionId: RevisionId | null;
  readonly transactionId: TransactionId;
  readonly sequence: number;
  readonly documentHash: ContentHash;
  readonly actor: ActorRef;
  readonly createdAt: IsoTimestamp;
  readonly durability: DurabilityLevel;
}

export type DurabilityLevel = 'memory' | 'wal' | 'snapshot';
