import { describe, expect, it } from 'vitest';

import { serializeCanonicalJson } from '../../src/base/serialization/canonical-json.js';

describe('serializeCanonicalJson', () => {
  it('sorts object keys by Unicode code point and preserves array order', () => {
    const result = serializeCanonicalJson({
      z: 1,
      a: [3, 2, 1],
      nested: {
        beta: true,
        alpha: null,
      },
    });

    expect(result).toEqual({
      type: 'ok',
      value: '{"a":[3,2,1],"nested":{"alpha":null,"beta":true},"z":1}',
    });
  });

  it('rejects non-finite numbers', () => {
    expect(serializeCanonicalJson({ value: Number.POSITIVE_INFINITY })).toEqual({
      type: 'error',
      error: {
        reason: 'non-finite-number',
        path: '$.value',
      },
    });
  });

  it('rejects cyclic input', () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(serializeCanonicalJson(value)).toEqual({
      type: 'error',
      error: {
        reason: 'cyclic-value',
        path: '$.self',
      },
    });
  });

  it('rejects sparse arrays', () => {
    const value = new Array<unknown>(2);
    value[1] = 'present';

    expect(serializeCanonicalJson(value)).toEqual({
      type: 'error',
      error: {
        reason: 'sparse-array',
        path: '$[0]',
      },
    });
  });
});
