import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { serializeCanonicalJson } from '../../src/base/serialization/canonical-json.js';

describe('canonical JSON properties', () => {
  it('is stable after parse and reserialization', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const first = serializeCanonicalJson(value);
        expect(first.type).toBe('ok');
        if (first.type === 'error') {
          return;
        }

        const parsed: unknown = JSON.parse(first.value);
        const second = serializeCanonicalJson(parsed);
        expect(second).toEqual(first);
      }),
      {
        numRuns: 500,
        seed: 20_260_720,
      },
    );
  });
});
