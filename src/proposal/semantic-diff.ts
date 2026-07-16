import type {
  EntityId,
  NodeId,
  OperationId,
  ProposalChangeGroupId,
  ProposalId,
  RevisionId,
} from '../base/ids/identifiers.js';
import type { Diagnostic } from '../model/diagnostic.js';
import type { BlockNode, InlineNode } from '../model/node/manuscript-node.js';
import type { DocumentRef, SemanticTargetRef } from '../model/resource-ref.js';

export type DocumentFragment =
  | {
      readonly kind: 'block';
      readonly nodes: readonly BlockNode[];
    }
  | {
      readonly kind: 'inline';
      readonly nodes: readonly InlineNode[];
    };

export interface CitationChange {
  readonly kind: 'added' | 'removed' | 'replaced';
  readonly citationNodeId?: NodeId;
  readonly beforeReferenceId?: EntityId;
  readonly afterReferenceId?: EntityId;
  readonly evidenceIds?: readonly EntityId[];
}

export interface EvidenceChange {
  readonly kind: 'added' | 'removed' | 'verification-changed' | 'relation-changed' | 'stale';
  readonly evidenceId: EntityId;
  readonly claimId?: EntityId;
  readonly beforeStatus?: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
  readonly afterStatus?: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
}

export interface SemanticDiffSummary {
  readonly groupCount: number;
  readonly insertedContentGroups: number;
  readonly rewrittenContentGroups: number;
  readonly deletedContentGroups: number;
  readonly movedStructureGroups: number;
  readonly citationChangeCount: number;
  readonly evidenceChangeCount: number;
  readonly metadataChangeCount: number;
  readonly changedUtf16Units: number;
}

export interface ProposalChangeGroup {
  readonly id: ProposalChangeGroupId;
  readonly kind:
    | 'insert-content'
    | 'rewrite-content'
    | 'delete-content'
    | 'move-structure'
    | 'add-citation'
    | 'replace-citation'
    | 'change-evidence'
    | 'change-claim-relation'
    | 'metadata';
  readonly targetRefs: readonly [SemanticTargetRef, ...SemanticTargetRef[]];
  readonly operationIds: readonly [OperationId, ...OperationId[]];
  readonly dependsOn: readonly ProposalChangeGroupId[];
  readonly before?: DocumentFragment;
  readonly after?: DocumentFragment;
  readonly citationChanges: readonly CitationChange[];
  readonly evidenceChanges: readonly EvidenceChange[];
  readonly rationale?: string;
  readonly warnings: readonly Diagnostic[];
}

export interface SemanticDiff {
  readonly id: string;
  readonly algorithmVersion: typeof SEMANTIC_DIFF_ALGORITHM_VERSION;
  readonly document: DocumentRef;
  readonly proposalId: ProposalId;
  readonly proposalRevision: number;
  readonly generatedAgainstRevisionId: RevisionId;
  readonly groups: readonly ProposalChangeGroup[];
  readonly summary: SemanticDiffSummary;
  readonly diagnostics: readonly Diagnostic[];
  readonly supersedes?: readonly {
    readonly previousGroupId: ProposalChangeGroupId;
    readonly currentGroupIds: readonly ProposalChangeGroupId[];
  }[];
}

export const SEMANTIC_DIFF_ALGORITHM_VERSION = 'nireco-semantic-diff-1';

export type DependencyClosureResult =
  | {
      readonly type: 'ok';
      readonly groupIds: readonly ProposalChangeGroupId[];
    }
  | {
      readonly type: 'error';
      readonly reason: 'group-not-found' | 'dependency-not-found' | 'dependency-cycle';
      readonly groupId: ProposalChangeGroupId;
    };

export function computeProposalGroupDependencyClosure(
  groups: readonly ProposalChangeGroup[],
  requestedGroupIds: readonly ProposalChangeGroupId[],
): DependencyClosureResult {
  const groupById = new Map(groups.map((group) => [group.id, group] as const));
  const requested = new Set(requestedGroupIds);

  for (const groupId of requested) {
    if (!groupById.has(groupId)) {
      return {
        type: 'error',
        reason: 'group-not-found',
        groupId,
      };
    }
  }

  const visiting = new Set<ProposalChangeGroupId>();
  const included = new Set<ProposalChangeGroupId>();

  for (const groupId of requested) {
    const result = includeDependencies(groupId, groupById, visiting, included);
    if (result.type === 'error') {
      return result;
    }
  }

  return {
    type: 'ok',
    groupIds: groups.filter((group) => included.has(group.id)).map((group) => group.id),
  };
}

function includeDependencies(
  groupId: ProposalChangeGroupId,
  groupById: ReadonlyMap<ProposalChangeGroupId, ProposalChangeGroup>,
  visiting: Set<ProposalChangeGroupId>,
  included: Set<ProposalChangeGroupId>,
): DependencyClosureResult {
  if (included.has(groupId)) {
    return {
      type: 'ok',
      groupIds: [],
    };
  }

  if (visiting.has(groupId)) {
    return {
      type: 'error',
      reason: 'dependency-cycle',
      groupId,
    };
  }

  const group = groupById.get(groupId);
  if (group === undefined) {
    return {
      type: 'error',
      reason: 'dependency-not-found',
      groupId,
    };
  }

  visiting.add(groupId);
  for (const dependencyId of group.dependsOn) {
    const result = includeDependencies(dependencyId, groupById, visiting, included);
    if (result.type === 'error') {
      return result;
    }
  }
  visiting.delete(groupId);
  included.add(groupId);

  return {
    type: 'ok',
    groupIds: [],
  };
}
