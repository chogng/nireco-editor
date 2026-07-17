import { describe, expect, it } from 'vitest';

import {
  isWellFormedUnicodeString,
  MAX_CANONICAL_JSON_DEPTH,
  serializeCanonicalJson,
} from '../../src/base/serialization/canonical-json.js';

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

  it('rejects accessors without executing them', () => {
    let getterCalls = 0;
    const value = Object.defineProperty({}, 'unsafe', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'executed';
      },
    });

    expect(serializeCanonicalJson(value)).toEqual({
      type: 'error',
      error: {
        reason: 'invalid-property-descriptor',
        path: '$.unsafe',
      },
    });
    expect(getterCalls).toBe(0);
  });

  it.each([
    {
      label: 'symbol object property',
      create: () => Object.assign({}, { [Symbol('hidden')]: true }),
    },
    {
      label: 'non-enumerable object property',
      create: () => Object.defineProperty({}, 'hidden', { value: true }),
    },
    {
      label: 'extra array property',
      create: () => Object.assign([1], { extra: true }),
    },
  ])('rejects a $label instead of creating a colliding identity', ({ create }) => {
    expect(serializeCanonicalJson(create())).toMatchObject({
      type: 'error',
      error: {
        reason: 'invalid-property-descriptor',
      },
    });
  });

  it('rejects arrays with a tampered prototype', () => {
    const value = [1, 2, 3];
    Object.setPrototypeOf(value, {});

    expect(serializeCanonicalJson(value)).toEqual({
      type: 'error',
      error: {
        reason: 'invalid-object-prototype',
        path: '$',
      },
    });
  });

  it('contains Proxy inspection failures as a typed error', () => {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();

    expect(() => serializeCanonicalJson(revocable.proxy)).not.toThrow();
    expect(serializeCanonicalJson(revocable.proxy)).toEqual({
      type: 'error',
      error: {
        reason: 'inspection-failed',
        path: '$',
      },
    });
  });

  it.each([
    ['value', { value: '\ud800' }, '$.value'],
    ['key', { ['\udfff']: true }, '$'],
  ])('rejects an unpaired surrogate in an object %s', (_kind, value, path) => {
    expect(serializeCanonicalJson(value)).toEqual({
      type: 'error',
      error: {
        reason: 'invalid-unicode-string',
        path,
      },
    });
    expect(isWellFormedUnicodeString('CJK 中文 + emoji 🌍 + ZWJ 👩‍🔬')).toBe(true);
  });

  it('returns a typed error for input beyond the canonical depth limit', () => {
    let value: unknown = null;
    for (let depth = 0; depth <= MAX_CANONICAL_JSON_DEPTH + 1; depth += 1) {
      value = [value];
    }

    expect(serializeCanonicalJson(value)).toMatchObject({
      type: 'error',
      error: {
        reason: 'maximum-depth-exceeded',
      },
    });
  });
});
