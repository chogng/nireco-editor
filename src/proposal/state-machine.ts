import type { IsoTimestamp } from '../base/time/clock.js';
import type { Proposal, ProposalStatus } from './proposal.js';

const TERMINAL_STATUSES = new Set<ProposalStatus>([
  'accepted',
  'partially-accepted',
  'rejected',
  'discarded',
  'expired',
]);

const ALLOWED_TRANSITIONS = {
  draft: ['validating', 'discarded', 'expired'],
  validating: ['draft', 'validated', 'conflicted', 'discarded', 'expired'],
  validated: ['draft', 'needs-review', 'conflicted', 'discarded', 'expired'],
  'needs-review': [
    'accepted',
    'partially-accepted',
    'rejected',
    'conflicted',
    'discarded',
    'expired',
  ],
  conflicted: ['draft', 'discarded', 'expired'],
  accepted: [],
  'partially-accepted': [],
  rejected: [],
  discarded: [],
  expired: [],
} as const satisfies Readonly<Record<ProposalStatus, readonly ProposalStatus[]>>;

export type ProposalTransitionResult =
  | {
      readonly type: 'transitioned';
      readonly proposal: Proposal;
    }
  | {
      readonly type: 'rejected';
      readonly reason:
        'terminal-state' | 'transition-not-allowed' | 'state-invariants-not-satisfied';
      readonly currentStatus: ProposalStatus;
      readonly requestedStatus: ProposalStatus;
    };

export function isTerminalProposalStatus(status: ProposalStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canTransitionProposalStatus(
  currentStatus: ProposalStatus,
  requestedStatus: ProposalStatus,
): boolean {
  return ALLOWED_TRANSITIONS[currentStatus].some((candidate) => candidate === requestedStatus);
}

export function transitionProposalStatus(
  proposal: Proposal,
  requestedStatus: ProposalStatus,
  updatedAt: IsoTimestamp,
): ProposalTransitionResult {
  if (isTerminalProposalStatus(proposal.status)) {
    return {
      type: 'rejected',
      reason: 'terminal-state',
      currentStatus: proposal.status,
      requestedStatus,
    };
  }

  if (!canTransitionProposalStatus(proposal.status, requestedStatus)) {
    return {
      type: 'rejected',
      reason: 'transition-not-allowed',
      currentStatus: proposal.status,
      requestedStatus,
    };
  }

  if (!canEnterProposalStatus(proposal, requestedStatus)) {
    return {
      type: 'rejected',
      reason: 'state-invariants-not-satisfied',
      currentStatus: proposal.status,
      requestedStatus,
    };
  }

  return {
    type: 'transitioned',
    proposal: {
      ...proposal,
      proposalRevision: proposal.proposalRevision + 1,
      status: requestedStatus,
      updatedAt,
    },
  };
}

function canEnterProposalStatus(proposal: Proposal, requestedStatus: ProposalStatus): boolean {
  if (requestedStatus === 'validated') {
    return (
      proposal.diff !== undefined &&
      (proposal.validation.status === 'valid' || proposal.validation.status === 'warning')
    );
  }

  if (
    requestedStatus === 'needs-review' ||
    requestedStatus === 'accepted' ||
    requestedStatus === 'partially-accepted' ||
    requestedStatus === 'rejected'
  ) {
    return proposal.diff !== undefined;
  }

  return true;
}
