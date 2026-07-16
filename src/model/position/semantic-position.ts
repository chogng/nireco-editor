import type { ContentHash, NodeId, Utf16Offset } from '../../base/ids/identifiers.js';
import type { DocumentRef } from '../resource-ref.js';

export type PositionAffinity = 'before' | 'after';

export interface TextPosition {
  readonly kind: 'text';
  readonly textNodeId: NodeId;
  readonly utf16Offset: Utf16Offset;
  readonly affinity: PositionAffinity;
}

export interface NodeBoundaryPosition {
  readonly kind: 'node-boundary';
  readonly parentNodeId: NodeId;
  readonly childIndex: number;
  readonly affinity: PositionAffinity;
}

export type SemanticPosition = TextPosition | NodeBoundaryPosition;

export interface SemanticRange {
  readonly anchor: SemanticPosition;
  readonly focus: SemanticPosition;
}

export interface PersistentAnchor {
  readonly document: DocumentRef;
  readonly primary: SemanticPosition;
  readonly targetNodeId?: NodeId;
  readonly textQuote?: {
    readonly exact: string;
    readonly prefix?: string;
    readonly suffix?: string;
    readonly normalizedHash?: ContentHash;
  };
  readonly pathHint?: readonly NodeId[];
}

export type Utf16BoundaryValidationResult =
  | {
      readonly type: 'valid';
    }
  | {
      readonly type: 'invalid';
      readonly reason: 'out-of-range' | 'inside-surrogate-pair';
    };

export function validateUtf16Boundary(
  value: string,
  utf16Offset: Utf16Offset,
): Utf16BoundaryValidationResult {
  if (utf16Offset < 0 || utf16Offset > value.length) {
    return {
      type: 'invalid',
      reason: 'out-of-range',
    };
  }

  if (
    utf16Offset > 0 &&
    utf16Offset < value.length &&
    isHighSurrogate(value.charCodeAt(utf16Offset - 1)) &&
    isLowSurrogate(value.charCodeAt(utf16Offset))
  ) {
    return {
      type: 'invalid',
      reason: 'inside-surrogate-pair',
    };
  }

  return {
    type: 'valid',
  };
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}
