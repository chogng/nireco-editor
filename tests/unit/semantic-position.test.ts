import { describe, expect, it } from 'vitest';

import { parseUtf16Offset } from '../../src/base/ids/identifiers.js';
import { validateUtf16Boundary } from '../../src/model/position/semantic-position.js';

function offset(value: number) {
  const parsed = parseUtf16Offset(value);
  if (parsed.type === 'invalid') {
    throw new Error('Expected a valid UTF-16 offset.');
  }
  return parsed.value;
}

describe('validateUtf16Boundary', () => {
  it('accepts boundaries around a surrogate pair', () => {
    const value = 'A😀B';

    expect(validateUtf16Boundary(value, offset(1))).toEqual({ type: 'valid' });
    expect(validateUtf16Boundary(value, offset(3))).toEqual({ type: 'valid' });
  });

  it('rejects a boundary inside a surrogate pair', () => {
    expect(validateUtf16Boundary('A😀B', offset(2))).toEqual({
      type: 'invalid',
      reason: 'inside-surrogate-pair',
    });
  });

  it('rejects an offset outside the string', () => {
    expect(validateUtf16Boundary('text', offset(5))).toEqual({
      type: 'invalid',
      reason: 'out-of-range',
    });
  });
});
