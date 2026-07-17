import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { serializeCanonicalJson } from '../../src/base/serialization/canonical-json.js';
import { MAX_INERT_JSON_DEPTH } from '../../src/model/schema/manuscript-runtime-shapes.js';
import {
  MAX_MANUSCRIPT_TREE_DEPTH,
  validateDocumentSnapshot,
} from '../../src/model/schema/manuscript-validator.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import {
  MAX_DOCUMENT_READ_CONTEXT_DISTANCE,
  MAX_DOCUMENT_READ_SCOPE_IDS,
} from '../../src/services/document-service/document-read-types.js';
import {
  MAX_TRANSACTION_CANONICAL_UTF8_BYTES,
  MAX_TRANSACTION_JSON_VALUES,
  MAX_TRANSACTION_OPERATIONS,
  MAX_TRANSACTION_PRECONDITIONS,
  MAX_TRANSACTION_TOOL_INVOCATION_IDS,
} from '../../src/model/transaction/transaction-runtime.js';
import { createMinimalSnapshot, MINIMAL_FIXTURE_IDS } from '../test-support/fixtures.js';

const CANONICAL_MARK_ORDER = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'subscript',
  'superscript',
] as const;

describe('Contract supplemental runtime boundaries', () => {
  it('keeps packed runtime limits aligned with the production validators', async () => {
    const manifest = asRecord(
      JSON.parse(
        await readFile('contracts/comet-integration/contract.manifest.json', 'utf8'),
      ) as unknown,
    );
    const runtime = asRecord(manifest['runtimeConformance']);

    expect(runtime).toEqual({
      supplementsJsonSchema: true,
      wellFormedUnicodeStrings: true,
      maximumManuscriptTreeDepth: MAX_MANUSCRIPT_TREE_DEPTH,
      maximumInertJsonDepth: MAX_INERT_JSON_DEPTH,
      canonicalMarkOrder: CANONICAL_MARK_ORDER,
      maximumMarksPerType: 1,
      mutuallyExclusiveMarkSets: [['subscript', 'superscript']],
      maximumCometDocumentScopeIdsTotal: MAX_DOCUMENT_READ_SCOPE_IDS,
      maximumCometDocumentContextDistance: MAX_DOCUMENT_READ_CONTEXT_DISTANCE,
      gate1ScopeVerificationCommand:
        'pnpm vitest run tests/unit/document-read-session-store.test.ts tests/unit/document-read-service.test.ts tests/unit/document-read-cursor.test.ts',
      maximumTransactionCanonicalUtf8Bytes: MAX_TRANSACTION_CANONICAL_UTF8_BYTES,
      maximumTransactionJsonValues: MAX_TRANSACTION_JSON_VALUES,
      maximumTransactionOperations: MAX_TRANSACTION_OPERATIONS,
      maximumTransactionPreconditions: MAX_TRANSACTION_PRECONDITIONS,
      maximumTransactionToolInvocationIds: MAX_TRANSACTION_TOOL_INVOCATION_IDS,
      verificationCommand: 'pnpm vitest run tests/conformance/runtime-boundaries.conformance.ts',
    });
  });

  it('rejects non-canonical Marks and non-Unicode strings at the runtime boundary', () => {
    const reversedMarks = replaceTextNode(createMinimalSnapshot(), {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'text',
      value: 'marked',
      marks: [{ type: 'italic' }, { type: 'bold' }],
    });
    const invalidUnicode = replaceTextNode(createMinimalSnapshot(), {
      id: MINIMAL_FIXTURE_IDS.text,
      type: 'text',
      value: 'unpaired \ud800',
      marks: [],
    });

    expect(validateDocumentSnapshot(reversedMarks).type).toBe('error');
    expect(validateDocumentSnapshot(invalidUnicode).type).toBe('error');
    expect(serializeCanonicalJson({ value: '\udfff' })).toMatchObject({
      type: 'error',
      error: {
        reason: 'invalid-unicode-string',
      },
    });
  });
});

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a Contract manifest object.');
  }
  return value as Readonly<Record<string, unknown>>;
}

function replaceTextNode(snapshot: DocumentSnapshot, replacement: unknown): unknown {
  return {
    ...snapshot,
    root: {
      ...snapshot.root,
      children: snapshot.root.children.map((child) =>
        child.type === 'body'
          ? {
              ...child,
              children: child.children.map((block) =>
                block.type === 'paragraph'
                  ? {
                      ...block,
                      children: block.children.map((inline) =>
                        inline.id === MINIMAL_FIXTURE_IDS.text ? replacement : inline,
                      ),
                    }
                  : block,
              ),
            }
          : child,
      ),
    },
  };
}
