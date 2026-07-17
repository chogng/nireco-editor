import {
  parseUtf16Offset,
  type NodeId,
  type RevisionId,
  type Utf16Offset,
} from '../../base/ids/identifiers.js';
import type { SemanticPosition, TextPosition } from '../position/semantic-position.js';
import type { MappedNodeResult, MappedPositionResult, PositionMap } from './position-map.js';

export interface ReplaceTextPositionMapOptions {
  readonly fromRevisionId: RevisionId;
  readonly toRevisionId: RevisionId;
  readonly textNodeId: NodeId;
  readonly startUtf16Offset: Utf16Offset;
  readonly endUtf16Offset: Utf16Offset;
  readonly replacementUtf16Length: number;
}

export type ReplaceTextPositionMapStep = Omit<
  ReplaceTextPositionMapOptions,
  'fromRevisionId' | 'toRevisionId'
>;

export interface ReplaceTextTransactionPositionMapOptions {
  readonly fromRevisionId: RevisionId;
  readonly toRevisionId: RevisionId;
  /** Each step uses the ordered draft coordinates produced by the preceding step. */
  readonly steps: readonly [ReplaceTextPositionMapStep, ...ReplaceTextPositionMapStep[]];
}

export function createReplaceTextPositionMap(options: ReplaceTextPositionMapOptions): PositionMap {
  validateReplaceTextOptions(options);
  return new ReplaceTextPositionMap(options);
}

/** Builds one Revision-to-Revision map from ordered, Transaction-local ReplaceText steps. */
export function createReplaceTextTransactionPositionMap(
  options: ReplaceTextTransactionPositionMapOptions,
): PositionMap {
  for (const step of options.steps) {
    validateReplaceTextOptions(step);
  }
  if (options.steps.length === 1) {
    const step = options.steps[0];
    return new ReplaceTextPositionMap({
      fromRevisionId: options.fromRevisionId,
      toRevisionId: options.toRevisionId,
      ...step,
    });
  }
  return new ReplaceTextTransactionPositionMap(options);
}

interface PositionMappingStep {
  mapPosition(position: SemanticPosition): MappedPositionResult;
  mapNodeId(nodeId: NodeId): MappedNodeResult;
}

class ReplaceTextPositionMap implements PositionMap {
  readonly fromRevisionId: RevisionId;
  readonly toRevisionId: RevisionId;
  readonly #step: ReplaceTextMappingStep;

  constructor(options: ReplaceTextPositionMapOptions) {
    this.fromRevisionId = options.fromRevisionId;
    this.toRevisionId = options.toRevisionId;
    this.#step = new ReplaceTextMappingStep(options);
  }

  mapPosition(position: SemanticPosition): MappedPositionResult {
    return this.#step.mapPosition(position);
  }

  mapNodeId(nodeId: NodeId): MappedNodeResult {
    return this.#step.mapNodeId(nodeId);
  }

  compose(next: PositionMap): PositionMap {
    return new IterativePositionMapSequence(this, next);
  }
}

class ReplaceTextMappingStep implements PositionMappingStep {
  readonly #textNodeId: NodeId;
  readonly #startUtf16Offset: Utf16Offset;
  readonly #endUtf16Offset: Utf16Offset;
  readonly #replacementEndUtf16Offset: Utf16Offset;
  readonly #offsetDelta: number;

  constructor(options: ReplaceTextPositionMapStep) {
    this.#textNodeId = options.textNodeId;
    this.#startUtf16Offset = options.startUtf16Offset;
    this.#endUtf16Offset = options.endUtf16Offset;
    this.#replacementEndUtf16Offset = validUtf16Offset(
      options.startUtf16Offset + options.replacementUtf16Length,
      'Replacement end',
    );
    this.#offsetDelta =
      options.replacementUtf16Length - (options.endUtf16Offset - options.startUtf16Offset);
  }

  mapPosition(position: SemanticPosition): MappedPositionResult {
    if (position.kind !== 'text' || position.textNodeId !== this.#textNodeId) {
      return mappedPosition(position);
    }

    if (this.#startUtf16Offset === this.#endUtf16Offset) {
      return this.#mapInsertion(position);
    }

    return this.#mapNonEmptyReplacement(position);
  }

  mapNodeId(nodeId: NodeId): MappedNodeResult {
    return {
      status: 'mapped',
      nodeId,
    };
  }

  #mapInsertion(position: TextPosition): MappedPositionResult {
    if (position.utf16Offset < this.#startUtf16Offset) {
      return mappedPosition(position);
    }

    if (position.utf16Offset > this.#startUtf16Offset) {
      return mapTextPositionToOffset(position, position.utf16Offset + this.#offsetDelta);
    }

    const insertionBoundary =
      position.affinity === 'before' ? this.#startUtf16Offset : this.#replacementEndUtf16Offset;
    return mapTextPositionToOffset(position, insertionBoundary);
  }

  #mapNonEmptyReplacement(position: TextPosition): MappedPositionResult {
    if (position.utf16Offset < this.#startUtf16Offset) {
      return mappedPosition(position);
    }

    if (position.utf16Offset > this.#endUtf16Offset) {
      return mapTextPositionToOffset(position, position.utf16Offset + this.#offsetDelta);
    }

    if (position.utf16Offset === this.#startUtf16Offset) {
      return mapTextPositionToOffset(position, this.#startUtf16Offset);
    }

    if (position.utf16Offset === this.#endUtf16Offset) {
      return mapTextPositionToOffset(position, this.#replacementEndUtf16Offset);
    }

    const nearestOffset =
      position.affinity === 'before' ? this.#startUtf16Offset : this.#replacementEndUtf16Offset;
    const nearest = textPositionAtOffset(position, nearestOffset);
    if (nearest === undefined) {
      return {
        status: 'deleted',
      };
    }

    return {
      status: 'deleted',
      nearest,
    };
  }
}

class ReplaceTextTransactionPositionMap implements PositionMap {
  readonly fromRevisionId: RevisionId;
  readonly toRevisionId: RevisionId;
  readonly #steps: readonly ReplaceTextMappingStep[];

  constructor(options: ReplaceTextTransactionPositionMapOptions) {
    this.fromRevisionId = options.fromRevisionId;
    this.toRevisionId = options.toRevisionId;
    this.#steps = Object.freeze(options.steps.map((step) => new ReplaceTextMappingStep(step)));
  }

  mapPosition(position: SemanticPosition): MappedPositionResult {
    let result: MappedPositionResult = mappedPosition(position);
    for (const step of this.#steps) {
      result = mapPositionResultThrough(result, step);
    }
    return result;
  }

  mapNodeId(nodeId: NodeId): MappedNodeResult {
    let result: MappedNodeResult = {
      status: 'mapped',
      nodeId,
    };
    for (const step of this.#steps) {
      result = mapNodeResultThrough(result, step);
    }
    return result;
  }

  compose(next: PositionMap): PositionMap {
    return new IterativePositionMapSequence(this, next);
  }
}

class IterativePositionMapSequence implements PositionMap {
  readonly fromRevisionId: RevisionId;
  readonly toRevisionId: RevisionId;
  readonly #first: PositionMap;
  readonly #next: PositionMap;

  constructor(first: PositionMap, next: PositionMap) {
    if (first.toRevisionId !== next.fromRevisionId) {
      throw new RangeError('Cannot compose position maps with non-adjacent revisions.');
    }

    this.fromRevisionId = first.fromRevisionId;
    this.toRevisionId = next.toRevisionId;
    this.#first = first;
    this.#next = next;
  }

  mapPosition(position: SemanticPosition): MappedPositionResult {
    let result: MappedPositionResult = mappedPosition(position);
    this.#forEachLeaf((map) => {
      result = mapPositionResultThrough(result, map);
    });
    return result;
  }

  mapNodeId(nodeId: NodeId): MappedNodeResult {
    let result: MappedNodeResult = {
      status: 'mapped',
      nodeId,
    };
    this.#forEachLeaf((map) => {
      result = mapNodeResultThrough(result, map);
    });
    return result;
  }

  compose(next: PositionMap): PositionMap {
    return new IterativePositionMapSequence(this, next);
  }

  #forEachLeaf(visitor: (map: PositionMap) => void): void {
    const pending: PositionMap[] = [this];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) {
        continue;
      }
      if (current instanceof IterativePositionMapSequence) {
        pending.push(current.#next, current.#first);
      } else {
        visitor(current);
      }
    }
  }
}

function validateReplaceTextOptions(options: ReplaceTextPositionMapStep): void {
  validUtf16Offset(options.startUtf16Offset, 'Start');
  validUtf16Offset(options.endUtf16Offset, 'End');
  validUtf16Offset(options.replacementUtf16Length, 'Replacement length');

  if (options.startUtf16Offset > options.endUtf16Offset) {
    throw new RangeError('Replace-text start offset must not exceed its end offset.');
  }

  validUtf16Offset(options.startUtf16Offset + options.replacementUtf16Length, 'Replacement end');
}

function validUtf16Offset(value: number, label: string): Utf16Offset {
  const parsed = parseUtf16Offset(value);
  if (parsed.type === 'invalid') {
    throw new RangeError(`${label} must be a non-negative safe UTF-16 offset.`);
  }
  return parsed.value;
}

function mappedPosition(position: SemanticPosition): MappedPositionResult {
  return {
    status: 'mapped',
    position,
  };
}

function mapTextPositionToOffset(
  position: TextPosition,
  utf16Offset: number,
): MappedPositionResult {
  const mapped = textPositionAtOffset(position, utf16Offset);
  if (mapped === undefined) {
    return {
      status: 'orphaned',
    };
  }

  return mappedPosition(mapped);
}

function textPositionAtOffset(
  position: TextPosition,
  utf16Offset: number,
): TextPosition | undefined {
  const parsed = parseUtf16Offset(utf16Offset);
  if (parsed.type === 'invalid') {
    return undefined;
  }

  if (parsed.value === position.utf16Offset) {
    return position;
  }

  return {
    ...position,
    utf16Offset: parsed.value,
  };
}

function mapPositionResultThrough(
  result: MappedPositionResult,
  next: PositionMappingStep,
): MappedPositionResult {
  switch (result.status) {
    case 'mapped':
      return next.mapPosition(result.position);
    case 'deleted':
      return mapDeletedPositionThrough(result.nearest, next);
    case 'ambiguous':
      return mapAmbiguousPositionsThrough(result.candidates, next);
    case 'orphaned':
      return result;
  }
}

function mapDeletedPositionThrough(
  nearest: SemanticPosition | undefined,
  next: PositionMappingStep,
): MappedPositionResult {
  if (nearest === undefined) {
    return {
      status: 'deleted',
    };
  }

  const mappedNearest = next.mapPosition(nearest);
  if (mappedNearest.status === 'mapped') {
    return {
      status: 'deleted',
      nearest: mappedNearest.position,
    };
  }

  if (mappedNearest.status === 'deleted' && mappedNearest.nearest !== undefined) {
    return {
      status: 'deleted',
      nearest: mappedNearest.nearest,
    };
  }

  return {
    status: 'deleted',
  };
}

function mapAmbiguousPositionsThrough(
  candidates: readonly SemanticPosition[],
  next: PositionMappingStep,
): MappedPositionResult {
  const mappedCandidates: SemanticPosition[] = [];
  const deletedResults: Extract<MappedPositionResult, { readonly status: 'deleted' }>[] = [];

  for (const candidate of candidates) {
    const mapped = next.mapPosition(candidate);
    if (mapped.status === 'mapped') {
      mappedCandidates.push(mapped.position);
    } else if (mapped.status === 'ambiguous') {
      mappedCandidates.push(...mapped.candidates);
    } else if (mapped.status === 'deleted') {
      deletedResults.push(mapped);
    } else {
      return {
        status: 'orphaned',
      };
    }
  }

  if (mappedCandidates.length > 0 && deletedResults.length > 0) {
    return {
      status: 'orphaned',
    };
  }

  if (mappedCandidates.length > 0) {
    return mappedCandidatesResult(mappedCandidates);
  }

  if (deletedResults.length > 0) {
    return combinedDeletedResult(deletedResults);
  }

  return {
    status: 'orphaned',
  };
}

function mappedCandidatesResult(candidates: readonly SemanticPosition[]): MappedPositionResult {
  const uniqueCandidates = new Map<string, SemanticPosition>();
  for (const candidate of candidates) {
    uniqueCandidates.set(semanticPositionKey(candidate), candidate);
  }

  const positions = [...uniqueCandidates.values()];
  const solePosition = positions[0];
  if (positions.length === 1 && solePosition !== undefined) {
    return mappedPosition(solePosition);
  }

  return {
    status: 'ambiguous',
    candidates: positions,
  };
}

function combinedDeletedResult(
  results: readonly Extract<MappedPositionResult, { readonly status: 'deleted' }>[],
): MappedPositionResult {
  const firstNearest = results[0]?.nearest;
  if (
    firstNearest !== undefined &&
    results.every(
      (result) =>
        result.nearest !== undefined &&
        semanticPositionKey(result.nearest) === semanticPositionKey(firstNearest),
    )
  ) {
    return {
      status: 'deleted',
      nearest: firstNearest,
    };
  }

  return {
    status: 'deleted',
  };
}

function mapNodeResultThrough(
  result: MappedNodeResult,
  next: PositionMappingStep,
): MappedNodeResult {
  if (result.status === 'mapped') {
    return next.mapNodeId(result.nodeId);
  }

  if (result.status === 'deleted') {
    return result;
  }

  const mappedCandidates = new Map<NodeId, NodeId>();
  let hasDeletedCandidate = false;
  for (const candidate of result.candidates) {
    const mapped = next.mapNodeId(candidate);
    if (mapped.status === 'mapped') {
      mappedCandidates.set(mapped.nodeId, mapped.nodeId);
    } else if (mapped.status === 'ambiguous') {
      for (const mappedCandidate of mapped.candidates) {
        mappedCandidates.set(mappedCandidate, mappedCandidate);
      }
    } else {
      hasDeletedCandidate = true;
    }
  }

  const candidates = [...mappedCandidates.values()];
  const soleCandidate = candidates[0];
  if (!hasDeletedCandidate && candidates.length === 1 && soleCandidate !== undefined) {
    return {
      status: 'mapped',
      nodeId: soleCandidate,
    };
  }

  if (candidates.length === 0) {
    if (!hasDeletedCandidate) {
      return result;
    }

    return {
      status: 'deleted',
    };
  }

  return {
    status: 'ambiguous',
    candidates,
  };
}

function semanticPositionKey(position: SemanticPosition): string {
  if (position.kind === 'text') {
    return `text:${position.textNodeId.length}:${position.textNodeId}:${position.utf16Offset}:${position.affinity}`;
  }

  return `node-boundary:${position.parentNodeId.length}:${position.parentNodeId}:${position.childIndex}:${position.affinity}`;
}
