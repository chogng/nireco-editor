import type { Result } from '../../base/errors/nireco-error.js';
import type { ContentHash, RevisionId, TransactionId } from '../../base/ids/identifiers.js';
import type { JsonValue } from '../../base/serialization/canonical-json.js';
import type { ResourceUri } from '../../base/uri/resource-uri.js';
import type { Revision } from '../../model/revision/revision.js';
import type { DocumentSnapshot } from '../../model/snapshot.js';

export interface AuthorityFence {
  readonly uri: ResourceUri;
  readonly ownerId: string;
  readonly epoch: number;
}

export interface WalCommitRecord {
  readonly recordVersion: 1;
  readonly recordType: 'commit';
  readonly uri: ResourceUri;
  readonly revisionId: RevisionId;
  readonly parentRevisionId: RevisionId | null;
  readonly transactionId: TransactionId;
  readonly sequence: number;
  readonly transactionHash: ContentHash;
  readonly documentHash: ContentHash;
  readonly replayInput: JsonValue;
}

export type WalDecodeCorruptionReason =
  | 'invalid-length'
  | 'checksum-mismatch'
  | 'invalid-utf8'
  | 'invalid-json'
  | 'invalid-record'
  | 'non-canonical-payload';

export type WalDecodeResult =
  | {
      readonly type: 'ok';
      readonly records: readonly WalCommitRecord[];
      readonly validByteLength: number;
      readonly truncatedTail: boolean;
    }
  | {
      readonly type: 'corrupt';
      readonly records: readonly WalCommitRecord[];
      readonly validByteLength: number;
      readonly corruptionOffset: number;
      readonly reason: WalDecodeCorruptionReason;
    };

export type WalEncodeResult = Result<
  Uint8Array,
  {
    readonly reason: 'canonicalization-failed' | 'record-too-large';
  }
>;

export interface IWalRecordCodec {
  encode(record: WalCommitRecord): WalEncodeResult;
  decode(bytes: Uint8Array): WalDecodeResult;
}

export type DurabilityPortStage =
  | 'wal-append'
  | 'wal-fsync'
  | 'wal-read'
  | 'wal-truncate'
  | 'snapshot-write-temporary'
  | 'snapshot-fsync-temporary'
  | 'snapshot-validate-temporary'
  | 'snapshot-atomic-rename'
  | 'snapshot-manifest-read'
  | 'snapshot-manifest-switch';

export interface DurabilityPortError {
  readonly stage: DurabilityPortStage;
  readonly reason: 'io' | 'stale-fence' | 'generation-conflict' | 'length-conflict' | 'corrupt';
  readonly safeMessage: string;
}

export interface IWriteAheadLog {
  append(
    fence: AuthorityFence,
    framedRecord: Uint8Array,
  ): Promise<Result<void, DurabilityPortError>>;
  fsync(fence: AuthorityFence): Promise<Result<void, DurabilityPortError>>;
  readDurable(uri: ResourceUri): Promise<Result<Uint8Array, DurabilityPortError>>;
  truncateDurable(
    fence: AuthorityFence,
    expectedByteLength: number,
    byteLength: number,
  ): Promise<Result<void, DurabilityPortError>>;
}

export interface SnapshotManifest {
  readonly manifestVersion: 1;
  readonly uri: ResourceUri;
  readonly revisionId: RevisionId;
  readonly sequence: number;
  readonly documentHash: ContentHash;
  readonly snapshotKey: string;
  readonly generation: number;
}

export interface SnapshotCommitInput {
  readonly fence: AuthorityFence;
  readonly revision: Revision;
  readonly snapshot: DocumentSnapshot;
}

export interface SnapshotReadResult {
  readonly manifest: SnapshotManifest;
  readonly snapshot: DocumentSnapshot;
}

export interface IAtomicSnapshotStore {
  commit(input: SnapshotCommitInput): Promise<Result<SnapshotManifest, DurabilityPortError>>;
  readLatest(
    uri: ResourceUri,
  ): Promise<Result<SnapshotReadResult | undefined, DurabilityPortError>>;
}

export function durabilityRank(level: Revision['durability']): number {
  switch (level) {
    case 'memory':
      return 0;
    case 'wal':
      return 1;
    case 'snapshot':
      return 2;
  }
}

export function isDurabilityAtLeast(
  achieved: Revision['durability'],
  target: Revision['durability'],
): boolean {
  return durabilityRank(achieved) >= durabilityRank(target);
}
