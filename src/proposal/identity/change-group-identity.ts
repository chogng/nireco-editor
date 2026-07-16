import { HASH_DOMAINS, createCanonicalHashPreimage } from '../../base/hashing/hash-preimage.js';
import { sha256Utf8Bytes } from '../../base/hashing/portable-sha-256.js';
import type {
  OperationId,
  ProposalChangeGroupId,
  ProposalId,
  RevisionId,
} from '../../base/ids/identifiers.js';
import { createDerivedProposalChangeGroupId } from '../../base/ids/uuid-v8-derived.js';
import type { DocumentUri } from '../../base/uri/resource-uri.js';
import type { SemanticTargetRef } from '../../model/resource-ref.js';
import { SEMANTIC_DIFF_ALGORITHM_VERSION, type ProposalChangeGroup } from '../semantic-diff.js';

const GROUP_KIND_ORDER: Readonly<Record<ProposalChangeGroup['kind'], number>> = {
  'insert-content': 0,
  'rewrite-content': 1,
  'delete-content': 2,
  'move-structure': 3,
  'add-citation': 4,
  'replace-citation': 5,
  'change-evidence': 6,
  'change-claim-relation': 7,
  metadata: 8,
};

export interface ProposalChangeGroupIdentityInput {
  readonly documentUri: DocumentUri;
  readonly generatedAgainstRevisionId: RevisionId;
  readonly proposalId: ProposalId;
  readonly proposalRevision: number;
  readonly kind: ProposalChangeGroup['kind'];
  readonly targetRefs: readonly [SemanticTargetRef, ...SemanticTargetRef[]];
  /**
   * Persisted compiler order. Operation order can affect apply semantics and MUST
   * NOT be reconstructed from UI display order.
   */
  readonly operationIds: readonly [OperationId, ...OperationId[]];
}

export type ProposalChangeGroupIdentityResult =
  | {
      readonly type: 'ok';
      readonly id: ProposalChangeGroupId;
      readonly preimage: string;
    }
  | {
      readonly type: 'error';
      readonly reason: 'invalid-canonical-value';
      readonly path: string;
    };

export type CanonicalGroupOrderResult =
  | {
      readonly type: 'ok';
      readonly groups: readonly ProposalChangeGroup[];
    }
  | {
      readonly type: 'error';
      readonly reason:
        | 'duplicate-group-id'
        | 'dependency-not-found'
        | 'dependency-cycle'
        | 'invalid-canonical-value';
      readonly groupId?: ProposalChangeGroupId;
      readonly path?: string;
    };

export interface SupersededGroupMapping {
  readonly previousGroupId: ProposalChangeGroupId;
  readonly currentGroupIds: readonly ProposalChangeGroupId[];
}

export type SupersedesMappingResult =
  | {
      readonly type: 'ok';
      readonly mappings: readonly SupersededGroupMapping[];
    }
  | Exclude<CanonicalGroupOrderResult, { readonly type: 'ok' }>;

export function deriveProposalChangeGroupId(
  input: ProposalChangeGroupIdentityInput,
): ProposalChangeGroupIdentityResult {
  const targetRefs = canonicalTargetRefs(input.targetRefs);
  if (targetRefs.type === 'error') {
    return targetRefs;
  }

  const preimage = createCanonicalHashPreimage(HASH_DOMAINS.proposalChangeGroup, {
    algorithmVersion: SEMANTIC_DIFF_ALGORITHM_VERSION,
    documentUri: input.documentUri,
    generatedAgainstRevisionId: input.generatedAgainstRevisionId,
    kind: input.kind,
    operationIds: input.operationIds,
    proposalId: input.proposalId,
    proposalRevision: input.proposalRevision,
    targetRefs: targetRefs.values,
  });
  if (preimage.type === 'error') {
    return {
      type: 'error',
      reason: 'invalid-canonical-value',
      path: preimage.path,
    };
  }

  return {
    type: 'ok',
    id: createDerivedProposalChangeGroupId(sha256Utf8Bytes(preimage.preimage)),
    preimage: preimage.preimage,
  };
}

export function canonicalizeProposalChangeGroupOrder(
  groups: readonly ProposalChangeGroup[],
): CanonicalGroupOrderResult {
  const groupById = new Map<ProposalChangeGroupId, ProposalChangeGroup>();
  for (const group of groups) {
    if (groupById.has(group.id)) {
      return {
        type: 'error',
        reason: 'duplicate-group-id',
        groupId: group.id,
      };
    }
    groupById.set(group.id, group);
  }

  const graph = buildDependencyGraph(groups, groupById);
  if (graph.type === 'error') {
    return graph;
  }

  return topologicallyOrderGroups(groups, graph.dependents, graph.inDegree);
}

export function deriveSupersedesMappings(
  previousGroups: readonly ProposalChangeGroup[],
  currentGroups: readonly ProposalChangeGroup[],
): SupersedesMappingResult {
  const previousOrder = canonicalizeProposalChangeGroupOrder(previousGroups);
  if (previousOrder.type === 'error') {
    return previousOrder;
  }
  const currentOrder = canonicalizeProposalChangeGroupOrder(currentGroups);
  if (currentOrder.type === 'error') {
    return currentOrder;
  }

  const currentTargets = new Map(
    currentOrder.groups.map((group) => [group.id, targetIdentitySet(group.targetRefs)] as const),
  );
  const mappings: SupersededGroupMapping[] = [];

  for (const previous of previousOrder.groups) {
    const previousTargets = targetIdentitySet(previous.targetRefs);
    const matchingIds = currentOrder.groups
      .filter(
        (current) =>
          current.kind === previous.kind &&
          setsIntersect(previousTargets, currentTargets.get(current.id) ?? new Set<string>()),
      )
      .map((current) => current.id);
    if (matchingIds.length > 0) {
      mappings.push({
        previousGroupId: previous.id,
        currentGroupIds: matchingIds,
      });
    }
  }

  return {
    type: 'ok',
    mappings,
  };
}

function buildDependencyGraph(
  groups: readonly ProposalChangeGroup[],
  groupById: ReadonlyMap<ProposalChangeGroupId, ProposalChangeGroup>,
):
  | {
      readonly type: 'ok';
      readonly dependents: ReadonlyMap<ProposalChangeGroupId, ProposalChangeGroupId[]>;
      readonly inDegree: ReadonlyMap<ProposalChangeGroupId, number>;
    }
  | {
      readonly type: 'error';
      readonly reason: 'dependency-not-found';
      readonly groupId: ProposalChangeGroupId;
    } {
  const dependents = new Map<ProposalChangeGroupId, ProposalChangeGroupId[]>();
  const inDegree = new Map<ProposalChangeGroupId, number>();

  for (const group of groups) {
    inDegree.set(group.id, group.dependsOn.length);
    for (const dependencyId of group.dependsOn) {
      if (!groupById.has(dependencyId)) {
        return {
          type: 'error',
          reason: 'dependency-not-found',
          groupId: dependencyId,
        };
      }
      const entries = dependents.get(dependencyId) ?? [];
      entries.push(group.id);
      dependents.set(dependencyId, entries);
    }
  }

  return {
    type: 'ok',
    dependents,
    inDegree,
  };
}

function topologicallyOrderGroups(
  groups: readonly ProposalChangeGroup[],
  dependents: ReadonlyMap<ProposalChangeGroupId, readonly ProposalChangeGroupId[]>,
  initialInDegree: ReadonlyMap<ProposalChangeGroupId, number>,
): CanonicalGroupOrderResult {
  const groupById = new Map(groups.map((group) => [group.id, group] as const));
  const inDegree = new Map(initialInDegree);
  const ready = groups.filter((group) => (inDegree.get(group.id) ?? 0) === 0);
  const ordered: ProposalChangeGroup[] = [];

  while (ready.length > 0) {
    const sorted = sortGroups(ready);
    if (sorted.type === 'error') {
      return sorted;
    }
    const group = sorted.groups[0];
    if (group === undefined) {
      break;
    }
    ready.splice(ready.indexOf(group), 1);
    ordered.push(group);

    for (const dependentId of dependents.get(group.id) ?? []) {
      const nextDegree = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, nextDegree);
      if (nextDegree === 0) {
        const dependent = groupById.get(dependentId);
        if (dependent !== undefined) {
          ready.push(dependent);
        }
      }
    }
  }

  if (ordered.length !== groups.length) {
    return {
      type: 'error',
      reason: 'dependency-cycle',
    };
  }
  return {
    type: 'ok',
    groups: ordered,
  };
}

function sortGroups(groups: readonly ProposalChangeGroup[]): CanonicalGroupOrderResult {
  const keyed: { readonly group: ProposalChangeGroup; readonly key: string }[] = [];
  for (const group of groups) {
    const targets = canonicalTargetRefs(group.targetRefs);
    if (targets.type === 'error') {
      return targets;
    }
    keyed.push({
      group,
      key: `${targets.keys[0] ?? ''}\0${String(GROUP_KIND_ORDER[group.kind]).padStart(
        2,
        '0',
      )}\0${group.id}`,
    });
  }
  keyed.sort((left, right) => compareUnicodeCodePoints(left.key, right.key));
  return {
    type: 'ok',
    groups: keyed.map(({ group }) => group),
  };
}

function canonicalTargetRefs<TValue>(targetRefs: readonly TValue[]):
  | {
      readonly type: 'ok';
      readonly values: readonly TValue[];
      readonly keys: readonly string[];
    }
  | {
      readonly type: 'error';
      readonly reason: 'invalid-canonical-value';
      readonly path: string;
    } {
  const entries: { readonly value: TValue; readonly key: string }[] = [];
  for (const targetRef of targetRefs) {
    const canonical = createCanonicalHashPreimage(HASH_DOMAINS.proposalChangeGroup, targetRef);
    if (canonical.type === 'error') {
      return {
        type: 'error',
        reason: 'invalid-canonical-value',
        path: canonical.path,
      };
    }
    entries.push({
      value: targetRef,
      key: canonical.canonicalJson,
    });
  }
  entries.sort((left, right) => compareUnicodeCodePoints(left.key, right.key));
  return {
    type: 'ok',
    values: entries.map(({ value }) => value),
    keys: entries.map(({ key }) => key),
  };
}

function targetIdentitySet(targetRefs: readonly SemanticTargetRef[]): ReadonlySet<string> {
  const targets = canonicalTargetRefs(targetRefs.map(targetLineageValue));
  return targets.type === 'ok' ? new Set(targets.keys) : new Set();
}

function targetLineageValue(target: SemanticTargetRef): SemanticTargetRef | object {
  switch (target.kind) {
    case 'node':
      return {
        kind: target.kind,
        uri: target.document.uri,
        nodeId: target.nodeId,
      };
    case 'academic-entity':
      return {
        kind: target.kind,
        uri: target.document.uri,
        entityId: target.entityId,
      };
    case 'range':
      return {
        kind: target.kind,
        uri: target.document.uri,
        start: target.start,
        end: target.end,
      };
    case 'metadata':
      return {
        kind: target.kind,
        uri: target.document.uri,
        field: target.field,
      };
  }
}

function setsIntersect(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return leftPoints.length - rightPoints.length;
}
