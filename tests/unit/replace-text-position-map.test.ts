import { describe, expect, it } from 'vitest';

import {
  parseNodeId,
  parseRevisionId,
  parseUtf16Offset,
  type NodeId,
  type RevisionId,
  type Utf16Offset,
} from '../../src/base/ids/identifiers.js';
import {
  createReplaceTextPositionMap,
  createReplaceTextTransactionPositionMap,
} from '../../src/model/mapping/replace-text-position-map.js';
import type { SemanticPosition, TextPosition } from '../../src/model/position/semantic-position.js';

const TEXT_NODE_ID = nodeId('018f0000-0000-7000-8000-000000000101');
const OTHER_NODE_ID = nodeId('018f0000-0000-7000-8000-000000000102');
const REVISION_ONE = revisionId('018f0000-0000-7000-8000-000000000201');
const REVISION_TWO = revisionId('018f0000-0000-7000-8000-000000000202');
const REVISION_THREE = revisionId('018f0000-0000-7000-8000-000000000203');

describe('createReplaceTextPositionMap', () => {
  it('maps an insertion point according to affinity and shifts later offsets', () => {
    const positionMap = createMap({
      start: 3,
      end: 3,
      replacementLength: 2,
    });

    expect(positionMap.mapPosition(textPosition(2, 'after'))).toEqual(
      mappedTextPosition(2, 'after'),
    );
    expect(positionMap.mapPosition(textPosition(3, 'before'))).toEqual(
      mappedTextPosition(3, 'before'),
    );
    expect(positionMap.mapPosition(textPosition(3, 'after'))).toEqual(
      mappedTextPosition(5, 'after'),
    );
    expect(positionMap.mapPosition(textPosition(7, 'before'))).toEqual(
      mappedTextPosition(9, 'before'),
    );
  });

  it('maps deletion boundaries and reports positions strictly inside as deleted', () => {
    const positionMap = createMap({
      start: 2,
      end: 5,
      replacementLength: 0,
    });

    expect(positionMap.mapPosition(textPosition(2, 'after'))).toEqual(
      mappedTextPosition(2, 'after'),
    );
    expect(positionMap.mapPosition(textPosition(5, 'before'))).toEqual(
      mappedTextPosition(2, 'before'),
    );
    expect(positionMap.mapPosition(textPosition(3, 'before'))).toEqual({
      status: 'deleted',
      nearest: textPosition(2, 'before'),
    });
    expect(positionMap.mapPosition(textPosition(4, 'after'))).toEqual({
      status: 'deleted',
      nearest: textPosition(2, 'after'),
    });
    expect(positionMap.mapPosition(textPosition(7, 'after'))).toEqual(
      mappedTextPosition(4, 'after'),
    );
  });

  it('maps a non-empty replacement with stable endpoints and affinity-based nearest positions', () => {
    const positionMap = createMap({
      start: 4,
      end: 8,
      replacementLength: 2,
    });

    expect(positionMap.mapPosition(textPosition(4, 'after'))).toEqual(
      mappedTextPosition(4, 'after'),
    );
    expect(positionMap.mapPosition(textPosition(8, 'before'))).toEqual(
      mappedTextPosition(6, 'before'),
    );
    expect(positionMap.mapPosition(textPosition(6, 'before'))).toEqual({
      status: 'deleted',
      nearest: textPosition(4, 'before'),
    });
    expect(positionMap.mapPosition(textPosition(6, 'after'))).toEqual({
      status: 'deleted',
      nearest: textPosition(6, 'after'),
    });
    expect(positionMap.mapPosition(textPosition(10, 'after'))).toEqual(
      mappedTextPosition(8, 'after'),
    );
  });

  it('leaves positions and node ids outside the edited text node unchanged', () => {
    const positionMap = createMap({
      start: 1,
      end: 2,
      replacementLength: 4,
    });
    const otherText = textPosition(9, 'after', OTHER_NODE_ID);
    const nodeBoundary: SemanticPosition = {
      kind: 'node-boundary',
      parentNodeId: TEXT_NODE_ID,
      childIndex: 3,
      affinity: 'before',
    };

    expect(positionMap.mapPosition(otherText)).toEqual({
      status: 'mapped',
      position: otherText,
    });
    expect(positionMap.mapPosition(nodeBoundary)).toEqual({
      status: 'mapped',
      position: nodeBoundary,
    });
    expect(positionMap.mapNodeId(TEXT_NODE_ID)).toEqual({
      status: 'mapped',
      nodeId: TEXT_NODE_ID,
    });
  });

  it('treats offsets as UTF-16 code-unit coordinates without validating source text', () => {
    const positionMap = createMap({
      start: 2,
      end: 2,
      replacementLength: 1,
    });

    expect(positionMap.mapPosition(textPosition(2, 'after'))).toEqual(
      mappedTextPosition(3, 'after'),
    );
  });

  it('composes adjacent maps in revision order and propagates deleted nearest positions', () => {
    const first = createReplaceTextPositionMap({
      fromRevisionId: REVISION_ONE,
      toRevisionId: REVISION_TWO,
      textNodeId: TEXT_NODE_ID,
      startUtf16Offset: offset(2),
      endUtf16Offset: offset(4),
      replacementUtf16Length: 0,
    });
    const second = createReplaceTextPositionMap({
      fromRevisionId: REVISION_TWO,
      toRevisionId: REVISION_THREE,
      textNodeId: TEXT_NODE_ID,
      startUtf16Offset: offset(2),
      endUtf16Offset: offset(2),
      replacementUtf16Length: 3,
    });

    const composed = first.compose(second);

    expect(composed.fromRevisionId).toBe(REVISION_ONE);
    expect(composed.toRevisionId).toBe(REVISION_THREE);
    expect(composed.mapPosition(textPosition(3, 'before'))).toEqual({
      status: 'deleted',
      nearest: textPosition(2, 'before'),
    });
    expect(composed.mapPosition(textPosition(3, 'after'))).toEqual({
      status: 'deleted',
      nearest: textPosition(5, 'after'),
    });
    expect(composed.mapPosition(textPosition(6, 'after'))).toEqual(mappedTextPosition(7, 'after'));
  });

  it('maps ordered Transaction-local steps in the draft coordinates produced by prior steps', () => {
    const positionMap = createReplaceTextTransactionPositionMap({
      fromRevisionId: REVISION_ONE,
      toRevisionId: REVISION_TWO,
      steps: [
        {
          textNodeId: TEXT_NODE_ID,
          startUtf16Offset: offset(3),
          endUtf16Offset: offset(3),
          replacementUtf16Length: 2,
        },
        {
          textNodeId: TEXT_NODE_ID,
          // Offset 5 is the insertion boundary produced by the preceding step.
          startUtf16Offset: offset(5),
          endUtf16Offset: offset(5),
          replacementUtf16Length: 1,
        },
      ],
    });

    expect(positionMap.fromRevisionId).toBe(REVISION_ONE);
    expect(positionMap.toRevisionId).toBe(REVISION_TWO);
    expect(positionMap.mapPosition(textPosition(3, 'before'))).toEqual(
      mappedTextPosition(3, 'before'),
    );
    expect(positionMap.mapPosition(textPosition(3, 'after'))).toEqual(
      mappedTextPosition(6, 'after'),
    );
    expect(positionMap.mapPosition(textPosition(7, 'after'))).toEqual(
      mappedTextPosition(10, 'after'),
    );
    expect(positionMap.mapNodeId(TEXT_NODE_ID)).toEqual({
      status: 'mapped',
      nodeId: TEXT_NODE_ID,
    });
  });

  it('rejects composition across a revision gap', () => {
    const first = createMap({
      start: 1,
      end: 1,
      replacementLength: 1,
    });
    const nonAdjacent = createReplaceTextPositionMap({
      fromRevisionId: REVISION_THREE,
      toRevisionId: REVISION_ONE,
      textNodeId: TEXT_NODE_ID,
      startUtf16Offset: offset(1),
      endUtf16Offset: offset(1),
      replacementUtf16Length: 1,
    });

    expect(() => first.compose(nonAdjacent)).toThrow(
      'Cannot compose position maps with non-adjacent revisions.',
    );
  });

  it('maps a long composed revision chain without recursive stack growth', () => {
    const mapCount = 20_000;
    let composed = createReplaceTextPositionMap({
      fromRevisionId: chainRevisionId(0),
      toRevisionId: chainRevisionId(1),
      textNodeId: TEXT_NODE_ID,
      startUtf16Offset: offset(0),
      endUtf16Offset: offset(0),
      replacementUtf16Length: 1,
    });
    for (let index = 1; index < mapCount; index += 1) {
      composed = composed.compose(
        createReplaceTextPositionMap({
          fromRevisionId: chainRevisionId(index),
          toRevisionId: chainRevisionId(index + 1),
          textNodeId: TEXT_NODE_ID,
          startUtf16Offset: offset(index),
          endUtf16Offset: offset(index),
          replacementUtf16Length: 1,
        }),
      );
    }

    expect(composed.fromRevisionId).toBe(chainRevisionId(0));
    expect(composed.toRevisionId).toBe(chainRevisionId(mapCount));
    expect(composed.mapPosition(textPosition(7, 'after', OTHER_NODE_ID))).toEqual({
      status: 'mapped',
      position: textPosition(7, 'after', OTHER_NODE_ID),
    });
    expect(composed.mapNodeId(TEXT_NODE_ID)).toEqual({
      status: 'mapped',
      nodeId: TEXT_NODE_ID,
    });
  });

  it('rejects invalid replace ranges before creating a map', () => {
    expect(() =>
      createReplaceTextPositionMap({
        fromRevisionId: REVISION_ONE,
        toRevisionId: REVISION_TWO,
        textNodeId: TEXT_NODE_ID,
        startUtf16Offset: offset(5),
        endUtf16Offset: offset(4),
        replacementUtf16Length: 0,
      }),
    ).toThrow('Replace-text start offset must not exceed its end offset.');
  });

  it('rejects replacement lengths that are negative, unsafe, or overflow the mapped offset', () => {
    const baseOptions = {
      fromRevisionId: REVISION_ONE,
      toRevisionId: REVISION_TWO,
      textNodeId: TEXT_NODE_ID,
      startUtf16Offset: offset(1),
      endUtf16Offset: offset(1),
    };

    expect(() =>
      createReplaceTextPositionMap({
        ...baseOptions,
        replacementUtf16Length: -1,
      }),
    ).toThrow('Replacement length must be a non-negative safe UTF-16 offset.');
    expect(() =>
      createReplaceTextPositionMap({
        ...baseOptions,
        replacementUtf16Length: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow('Replacement end must be a non-negative safe UTF-16 offset.');
  });
});

function createMap(options: {
  readonly start: number;
  readonly end: number;
  readonly replacementLength: number;
}) {
  return createReplaceTextPositionMap({
    fromRevisionId: REVISION_ONE,
    toRevisionId: REVISION_TWO,
    textNodeId: TEXT_NODE_ID,
    startUtf16Offset: offset(options.start),
    endUtf16Offset: offset(options.end),
    replacementUtf16Length: options.replacementLength,
  });
}

function textPosition(
  utf16Offset: number,
  affinity: TextPosition['affinity'],
  textNodeId = TEXT_NODE_ID,
): TextPosition {
  return {
    kind: 'text',
    textNodeId,
    utf16Offset: offset(utf16Offset),
    affinity,
  };
}

function mappedTextPosition(
  utf16Offset: number,
  affinity: TextPosition['affinity'],
): ReturnType<ReturnType<typeof createMap>['mapPosition']> {
  return {
    status: 'mapped',
    position: textPosition(utf16Offset, affinity),
  };
}

function offset(value: number): Utf16Offset {
  const parsed = parseUtf16Offset(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a valid UTF-16 offset.');
  }
  return parsed.value;
}

function nodeId(value: string): NodeId {
  const parsed = parseNodeId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a valid node ID.');
  }
  return parsed.value;
}

function revisionId(value: string): RevisionId {
  const parsed = parseRevisionId(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a valid revision ID.');
  }
  return parsed.value;
}

function chainRevisionId(sequence: number): RevisionId {
  return revisionId(`018f0000-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`);
}
