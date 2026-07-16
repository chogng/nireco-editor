import { describe, expect, it } from 'vitest';

import {
  computeProposalGroupDependencyClosure,
  type ProposalChangeGroup,
} from '../../src/proposal/semantic-diff.js';
import {
  validNodeId,
  validOperationId,
  validDocumentUri,
  validProposalChangeGroupId,
  validRevisionId,
} from '../test-support/fixtures.js';

function group(id: string, dependencies: readonly string[]): ProposalChangeGroup {
  return {
    id: validProposalChangeGroupId(id),
    kind: 'rewrite-content',
    targetRefs: [
      {
        kind: 'node',
        document: {
          uri: validDocumentUri('nireco://workspace-01/document/doc-1'),
          revisionId: validRevisionId('rev-1'),
        },
        nodeId: validNodeId('node-paragraph'),
      },
    ],
    operationIds: [validOperationId(`operation-${id}`)],
    dependsOn: dependencies.map(validProposalChangeGroupId),
    citationChanges: [],
    evidenceChanges: [],
    warnings: [],
  };
}

describe('computeProposalGroupDependencyClosure', () => {
  it('includes transitive dependencies in document order', () => {
    const groups = [
      group('group-citation', []),
      group('group-claim', ['group-citation']),
      group('group-paragraph', ['group-claim']),
    ];

    expect(
      computeProposalGroupDependencyClosure(groups, [
        validProposalChangeGroupId('group-paragraph'),
      ]),
    ).toEqual({
      type: 'ok',
      groupIds: [
        validProposalChangeGroupId('group-citation'),
        validProposalChangeGroupId('group-claim'),
        validProposalChangeGroupId('group-paragraph'),
      ],
    });
  });

  it('rejects cyclic dependencies', () => {
    const groups = [group('group-a', ['group-b']), group('group-b', ['group-a'])];

    expect(
      computeProposalGroupDependencyClosure(groups, [validProposalChangeGroupId('group-a')]),
    ).toEqual({
      type: 'error',
      reason: 'dependency-cycle',
      groupId: validProposalChangeGroupId('group-a'),
    });
  });
});
