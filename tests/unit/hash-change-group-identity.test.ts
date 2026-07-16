import { describe, expect, it } from 'vitest';

import {
  parseNodeId,
  parseOperationId,
  parseProposalChangeGroupId,
  parseProposalId,
  parseRevisionId,
  type OperationId,
  type ProposalChangeGroupId,
  type ProposalId,
  type RevisionId,
} from '../../src/base/ids/identifiers.js';
import { sha256Utf8 } from '../../src/base/hashing/portable-sha-256.js';
import {
  canonicalizeProposalChangeGroupOrder,
  deriveProposalChangeGroupId,
  deriveSupersedesMappings,
} from '../../src/proposal/identity/change-group-identity.js';
import type { ProposalChangeGroup } from '../../src/proposal/semantic-diff.js';
import { validDocumentUri, validNodeId } from '../test-support/fixtures.js';

const REVISION_1 = strictRevisionId('018f0000-0000-7000-8000-000000000001');
const REVISION_2 = strictRevisionId('018f0000-0000-7000-8000-000000000002');
const PROPOSAL_ID = strictProposalId('018f0000-0000-7000-8000-000000000003');
const OPERATION_ID = strictOperationId('018f0000-0000-7000-8000-000000000004');

describe('deterministic ProposalChangeGroup identity', () => {
  it('matches the Contract golden preimage, SHA-256, and UUIDv8 vector', () => {
    const result = deriveProposalChangeGroupId({
      documentUri: validDocumentUri('nireco://workspace-01/document/DocCaseA'),
      generatedAgainstRevisionId: REVISION_1,
      proposalId: strictProposalId('018f0000-0000-7000-8000-000000000002'),
      proposalRevision: 1,
      kind: 'insert-content',
      targetRefs: [
        {
          kind: 'node',
          document: {
            uri: validDocumentUri('nireco://workspace-01/document/DocCaseA'),
            revisionId: REVISION_1,
          },
          nodeId: strictNodeId('018f0000-0000-7000-8000-000000000103'),
        },
      ],
      operationIds: [strictOperationId('018f0000-0000-7000-8000-000000000006')],
    });

    expect(result.type).toBe('ok');
    if (result.type === 'ok') {
      expect(sha256Utf8(result.preimage)).toBe(
        '1a35d9ac7ac5dcca78889d038e9cae19a7f680fd63eac1e5a504910b4b9b54c5',
      );
      expect(result.id).toBe('1a35d9ac-7ac5-8cca-b888-9d038e9cae19');
    }
  });

  it('derives a stable UUIDv8 independent of target display order', () => {
    const first = deriveProposalChangeGroupId({
      documentUri: validDocumentUri('nireco://workspace-01/document/doc-1'),
      generatedAgainstRevisionId: REVISION_1,
      proposalId: PROPOSAL_ID,
      proposalRevision: 1,
      kind: 'rewrite-content',
      targetRefs: [target('node-z', REVISION_1), target('node-a', REVISION_1)],
      operationIds: [OPERATION_ID],
    });
    const second = deriveProposalChangeGroupId({
      documentUri: validDocumentUri('nireco://workspace-01/document/doc-1'),
      generatedAgainstRevisionId: REVISION_1,
      proposalId: PROPOSAL_ID,
      proposalRevision: 1,
      kind: 'rewrite-content',
      targetRefs: [target('node-a', REVISION_1), target('node-z', REVISION_1)],
      operationIds: [OPERATION_ID],
    });

    expect(first.type).toBe('ok');
    expect(second).toEqual(first);
    if (first.type === 'ok') {
      expect(parseProposalChangeGroupId(first.id).type).toBe('valid');
    }
  });

  it('changes the derived ID when proposal content receives a new revision', () => {
    const common = {
      documentUri: validDocumentUri('nireco://workspace-01/document/doc-1'),
      generatedAgainstRevisionId: REVISION_1,
      proposalId: PROPOSAL_ID,
      kind: 'rewrite-content' as const,
      targetRefs: [target('node-a', REVISION_1)] as const,
      operationIds: [OPERATION_ID] as const,
    };
    const first = deriveProposalChangeGroupId({
      ...common,
      proposalRevision: 1,
    });
    const next = deriveProposalChangeGroupId({
      ...common,
      proposalRevision: 2,
    });

    expect(first.type).toBe('ok');
    expect(next.type).toBe('ok');
    if (first.type === 'ok' && next.type === 'ok') {
      expect(next.id).not.toBe(first.id);
    }
  });

  it('orders dependency DAGs before semantic target tie-breakers', () => {
    const dependency = group('00000000-0000-8000-8000-000000000001', 'node-z', [], REVISION_1);
    const dependent = group(
      '00000000-0000-8000-8000-000000000002',
      'node-a',
      [dependency.id],
      REVISION_1,
    );

    expect(canonicalizeProposalChangeGroupOrder([dependent, dependency])).toEqual({
      type: 'ok',
      groups: [dependency, dependent],
    });
  });

  it('derives deterministic rebase supersedes mappings without revision identity', () => {
    const previous = group('00000000-0000-8000-8000-000000000001', 'node-a', [], REVISION_1);
    const current = group('00000000-0000-8000-8000-000000000002', 'node-a', [], REVISION_2);

    expect(deriveSupersedesMappings([previous], [current])).toEqual({
      type: 'ok',
      mappings: [
        {
          previousGroupId: previous.id,
          currentGroupIds: [current.id],
        },
      ],
    });
  });
});

function group(
  id: string,
  nodeId: string,
  dependsOn: readonly ProposalChangeGroupId[],
  revisionId: RevisionId,
): ProposalChangeGroup {
  return {
    id: strictGroupId(id),
    kind: 'rewrite-content',
    targetRefs: [target(nodeId, revisionId)],
    operationIds: [OPERATION_ID],
    dependsOn,
    citationChanges: [],
    evidenceChanges: [],
    warnings: [],
  };
}

function target(nodeId: string, revisionId: RevisionId) {
  return {
    kind: 'node' as const,
    document: {
      uri: validDocumentUri('nireco://workspace-01/document/doc-1'),
      revisionId,
    },
    nodeId: validNodeId(nodeId),
  };
}

function strictRevisionId(value: string): RevisionId {
  return unwrap(parseRevisionId(value));
}

function strictProposalId(value: string): ProposalId {
  return unwrap(parseProposalId(value));
}

function strictNodeId(value: string) {
  return unwrap(parseNodeId(value));
}

function strictOperationId(value: string): OperationId {
  return unwrap(parseOperationId(value));
}

function strictGroupId(value: string): ProposalChangeGroupId {
  return unwrap(parseProposalChangeGroupId(value));
}

function unwrap<TValue>(
  result:
    | {
        readonly type: 'valid';
        readonly value: TValue;
      }
    | {
        readonly type: 'invalid';
        readonly reason: string;
      },
): TValue {
  if (result.type === 'invalid') {
    throw new Error(`Expected a strict production ID, received ${result.reason}.`);
  }
  return result.value;
}
