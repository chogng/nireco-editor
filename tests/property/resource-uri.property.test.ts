import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  canonicalizeResourceUri,
  isCanonicalResourceUri,
} from '../../src/base/uri/resource-uri.js';

describe('resource URI canonicalization properties', () => {
  it('is idempotent for generated logical resource URIs', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z](?:[a-z0-9-]{0,14}[a-z0-9])?$/u),
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/u),
        fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._~-]{0,31}$/u),
        (workspace, resourceKind, resourceId) => {
          const first = canonicalizeResourceUri(
            `NIRECO://${workspace.toUpperCase()}/${resourceKind}/${resourceId}/`,
          );
          expect(first.type).toBe('valid');
          if (first.type === 'invalid') {
            return;
          }

          const second = canonicalizeResourceUri(first.value);
          expect(second).toEqual(first);
          expect(isCanonicalResourceUri(first.value)).toBe(true);
        },
      ),
      {
        numRuns: 250,
        seed: 20_260_720,
      },
    );
  });
});
