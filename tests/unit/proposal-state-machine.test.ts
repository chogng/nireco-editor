import { describe, expect, it } from 'vitest';

import type { Proposal } from '../../src/proposal/proposal.js';
import {
  canTransitionProposalStatus,
  transitionProposalStatus,
} from '../../src/proposal/state-machine.js';
import {
  validIsoTimestamp,
  validDocumentUri,
  validProposalId,
  validRevisionId,
  validSessionId,
} from '../test-support/fixtures.js';

function createDraftProposal(): Proposal {
  return {
    id: validProposalId('proposal-1'),
    documentUri: validDocumentUri('nireco://workspace-01/document/doc-1'),
    baseRevisionId: validRevisionId('rev-1'),
    proposalRevision: 1,
    actor: {
      type: 'comet-agent',
      id: 'agent-1',
      workflowId: 'workflow-1',
    },
    status: 'draft',
    semanticEdits: [],
    validation: {
      status: 'not-run',
      basedOnRevisionId: validRevisionId('rev-1'),
      basedOnProposalRevision: 1,
      diagnostics: [],
    },
    provenance: {
      taskId: 'task-1',
      traceId: 'trace-1',
      sessionId: validSessionId('session-1'),
      capabilityGrantId: 'grant-1',
      workflowId: 'workflow-1',
      toolInvocationIds: [],
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
    updatedAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

function withValidationArtifacts(proposal: Proposal): Proposal {
  const validatedAt = validIsoTimestamp('2026-07-20T00:01:30Z');
  return {
    ...proposal,
    validation: {
      status: 'valid',
      basedOnRevisionId: proposal.baseRevisionId,
      basedOnProposalRevision: proposal.proposalRevision,
      diagnostics: [],
      validatedAt,
    },
    diff: {
      id: 'diff-1',
      document: {
        uri: proposal.documentUri,
        revisionId: proposal.baseRevisionId,
      },
      proposalId: proposal.id,
      proposalRevision: proposal.proposalRevision,
      generatedAgainstRevisionId: proposal.baseRevisionId,
      groups: [],
      summary: {
        groupCount: 0,
        insertedContentGroups: 0,
        rewrittenContentGroups: 0,
        deletedContentGroups: 0,
        movedStructureGroups: 0,
        citationChangeCount: 0,
        evidenceChangeCount: 0,
        metadataChangeCount: 0,
        changedUtf16Units: 0,
      },
      diagnostics: [],
    },
  };
}

describe('proposal state machine', () => {
  it('includes the validating to validated transition required by the lifecycle', () => {
    expect(canTransitionProposalStatus('validating', 'validated')).toBe(true);
  });

  it('increments proposalRevision for every accepted transition', () => {
    const validating = transitionProposalStatus(
      createDraftProposal(),
      'validating',
      validIsoTimestamp('2026-07-20T00:01:00Z'),
    );
    if (validating.type === 'rejected') {
      throw new Error('Expected the draft proposal to enter validation.');
    }

    const validated = transitionProposalStatus(
      withValidationArtifacts(validating.proposal),
      'validated',
      validIsoTimestamp('2026-07-20T00:02:00Z'),
    );

    expect(validated).toMatchObject({
      type: 'transitioned',
      proposal: {
        status: 'validated',
        proposalRevision: 3,
      },
    });
  });

  it('does not modify terminal proposals', () => {
    const terminal: Proposal = {
      ...withValidationArtifacts(createDraftProposal()),
      status: 'accepted',
    };

    expect(
      transitionProposalStatus(terminal, 'draft', validIsoTimestamp('2026-07-20T00:03:00Z')),
    ).toEqual({
      type: 'rejected',
      reason: 'terminal-state',
      currentStatus: 'accepted',
      requestedStatus: 'draft',
    });
  });

  it('rejects validated status until validation artifacts and diff are present', () => {
    const validating: Proposal = {
      ...createDraftProposal(),
      status: 'validating',
    };

    expect(
      transitionProposalStatus(validating, 'validated', validIsoTimestamp('2026-07-20T00:02:00Z')),
    ).toEqual({
      type: 'rejected',
      reason: 'state-invariants-not-satisfied',
      currentStatus: 'validating',
      requestedStatus: 'validated',
    });
  });
});
