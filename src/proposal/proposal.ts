import type { ProposalId, RevisionId, SessionId } from '../base/ids/identifiers.js';
import type { IsoTimestamp } from '../base/time/clock.js';
import type { DocumentUri } from '../base/uri/resource-uri.js';
import type { ActorRef } from '../model/actor.js';
import type { Diagnostic } from '../model/diagnostic.js';
import type { SemanticDiff } from './semantic-diff.js';
import type { SemanticEdit } from './semantic-edit.js';

export type ProposalStatus =
  | 'draft'
  | 'validating'
  | 'validated'
  | 'needs-review'
  | 'conflicted'
  | 'accepted'
  | 'partially-accepted'
  | 'rejected'
  | 'discarded'
  | 'expired';

interface ProposalValidationSnapshotBase {
  readonly basedOnRevisionId: RevisionId;
  readonly basedOnProposalRevision: number;
  readonly diagnostics: readonly Diagnostic[];
}

export type ProposalValidationSnapshot = ProposalValidationSnapshotBase &
  (
    | {
        readonly status: 'not-run' | 'validating';
        readonly validatedAt?: never;
      }
    | {
        readonly status: 'valid' | 'warning' | 'invalid' | 'conflicted';
        readonly validatedAt: IsoTimestamp;
      }
  );

export interface ProposalProvenance {
  readonly taskId: string;
  readonly traceId: string;
  readonly sessionId: SessionId;
  readonly capabilityGrantId: string;
  readonly workflowId: string;
  readonly modelRef?: string;
  readonly toolInvocationIds: readonly string[];
  readonly idempotencyKey?: string;
}

export interface Proposal {
  readonly id: ProposalId;
  readonly documentUri: DocumentUri;
  readonly baseRevisionId: RevisionId;
  readonly proposalRevision: number;
  readonly actor: ActorRef;
  readonly status: ProposalStatus;
  readonly semanticEdits: readonly SemanticEdit[];
  readonly validation: ProposalValidationSnapshot;
  readonly diff?: SemanticDiff;
  readonly provenance: ProposalProvenance;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export interface ProposalRef {
  readonly proposalId: ProposalId;
  readonly expectedProposalRevision: number;
}
