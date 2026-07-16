import { describe, expect, it } from 'vitest';

import {
  canonicalizeResourceUri,
  isCanonicalResourceUri,
} from '../../src/base/uri/resource-uri.js';

describe('canonicalizeResourceUri', () => {
  it('canonicalizes logical resource identity deterministically', () => {
    const result = canonicalizeResourceUri('NIRECO://Workspace-01/document/./doc%2d7QH9V8/');

    expect(result).toEqual({
      type: 'valid',
      value: 'nireco://workspace-01/document/doc-7QH9V8',
    });
  });

  it('removes default web ports without changing path slash semantics', () => {
    const result = canonicalizeResourceUri('HTTPS://Example.COM:443/a/');

    expect(result).toEqual({
      type: 'valid',
      value: 'https://example.com/a/',
    });
  });

  it('normalizes percent escapes while preserving reserved characters', () => {
    const result = canonicalizeResourceUri('https://example.com/%7euser/%2fsource');

    expect(result).toEqual({
      type: 'valid',
      value: 'https://example.com/~user/%2Fsource',
    });
  });

  it.each([
    ['nireco://workspace-01/document/doc-1?revision=2', 'logical-uri-query-forbidden'],
    ['nireco://workspace-01:443/document/doc-1', 'logical-uri-port-forbidden'],
    ['nireco://workspace-01/document', 'logical-uri-path-invalid'],
    ['nireco://workspace-01/document/文稿', 'contains-non-ascii'],
    ['nireco://workspace-01/document/%zz', 'invalid-percent-encoding'],
  ] as const)('rejects invalid logical URI %s', (input, reason) => {
    expect(canonicalizeResourceUri(input)).toEqual({
      type: 'invalid',
      reason,
    });
  });

  it('detects whether a URI is already canonical', () => {
    expect(isCanonicalResourceUri('nireco://workspace-01/document/doc-1')).toBe(true);
    expect(isCanonicalResourceUri('NIRECO://workspace-01/document/doc-1')).toBe(false);
  });
});
