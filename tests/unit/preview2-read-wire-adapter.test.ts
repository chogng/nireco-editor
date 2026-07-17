import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Ajv2020, type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';
import { describe, expect, it, vi } from 'vitest';

import type {
  GetDocumentHeadResult as GeneratedGetDocumentHeadResult,
  GetDocumentOutlineResult as GeneratedGetDocumentOutlineResult,
  GetDocumentSnapshotResult as GeneratedGetDocumentSnapshotResult,
  ReadDocumentNodesResult as GeneratedReadDocumentNodesResult,
  ResolveModelResult as GeneratedResolveModelResult,
  SearchDocumentResult as GeneratedSearchDocumentResult,
} from '../../contracts/comet-integration/generated-types/integration.js';
import type { NirecoError as GeneratedNirecoError } from '../../contracts/comet-integration/generated-types/error.js';
import type { NirecoError, Result } from '../../src/base/errors/nireco-error.js';
import {
  NIRECO_ERROR_CATALOG,
  createNirecoCatalogError,
} from '../../src/base/errors/nireco-error-catalog.js';
import { encodeUtf8 } from '../../src/base/hashing/portable-sha-256.js';
import type { RevisionId } from '../../src/base/ids/identifiers.js';
import { serializeCanonicalJson } from '../../src/base/serialization/canonical-json.js';
import { parseIsoTimestamp } from '../../src/base/time/clock.js';
import {
  canonicalizeResourceUri,
  isCanonicalResourceUri,
} from '../../src/base/uri/resource-uri.js';
import {
  Preview2ReadWireAdapter,
  type Preview2GetDocumentHeadWireResult,
  type Preview2GetDocumentOutlineWireResult,
  type Preview2GetDocumentSnapshotWireResult,
  type Preview2ReadDocumentNodesWireResult,
  type Preview2ResolveModelWireResult,
  type Preview2SearchDocumentWireResult,
  type Preview2WireError,
} from '../../src/integration/comet/preview2-read-wire-adapter.js';
import type { DocumentReadService } from '../../src/services/document-service/document-read-types.js';
import type { ResolveModelService } from '../../src/services/workspace-service/resolve-model-types.js';
import {
  DeterministicIdAllocator,
  MINIMAL_FIXTURE_IDS,
  createMinimalSnapshot,
  validDocumentUri,
} from '../test-support/fixtures.js';

const SCHEMA_ROOT = path.resolve('contracts/comet-integration/schemas');
const INTEGRATION_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/integration.schema.json';
const ERROR_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/error.schema.json';
const ERROR_CATALOG_PATH = path.resolve('contracts/comet-integration/error-codes.json');
const URI = validDocumentUri('nireco://workspace-01/document/preview2-wire');
const REVISION = MINIMAL_FIXTURE_IDS.revision;
const FIXTURE_IDS = new DeterministicIdAllocator();
const OTHER_REVISION = FIXTURE_IDS.allocateRevisionId();
const SESSION = FIXTURE_IDS.allocateSessionId();
const ERROR_DEBUG_ID = FIXTURE_IDS.allocateDebugId();
const DOCUMENT = { uri: URI, revisionId: REVISION } as const;
const CONTEXT = { sessionId: SESSION, document: DOCUMENT } as const;

type WireValue<TResult> = TResult extends {
  readonly type: 'ok';
  readonly value: infer TValue;
}
  ? TValue
  : never;
type IsAssignable<TSource, TTarget> = [TSource] extends [TTarget] ? true : false;
type DeepReadonly<TValue> = TValue extends (...args: never[]) => unknown
  ? TValue
  : TValue extends readonly (infer TItem)[]
    ? readonly DeepReadonly<TItem>[]
    : TValue extends object
      ? { readonly [TKey in keyof TValue]: DeepReadonly<TValue[TKey]> }
      : TValue;
type GeneratedPageKey =
  | 'document'
  | 'basedOnRevisionId'
  | 'consistency'
  | 'status'
  | 'items'
  | 'nextCursor'
  | 'truncated'
  | 'approximateBytes';
type GeneratedPageShape<TValue> = DeepReadonly<
  Pick<TValue, Extract<GeneratedPageKey, keyof TValue>>
>;

const GENERATED_TYPE_COMPATIBILITY: readonly [true, true, true, true, true, true] = [
  true satisfies IsAssignable<
    WireValue<Preview2ResolveModelWireResult>,
    DeepReadonly<GeneratedResolveModelResult>
  >,
  true satisfies IsAssignable<
    WireValue<Preview2GetDocumentHeadWireResult>,
    DeepReadonly<GeneratedGetDocumentHeadResult>
  >,
  true satisfies IsAssignable<
    WireValue<Preview2GetDocumentSnapshotWireResult>,
    DeepReadonly<GeneratedGetDocumentSnapshotResult>
  >,
  true satisfies IsAssignable<
    WireValue<Preview2GetDocumentOutlineWireResult>,
    GeneratedPageShape<GeneratedGetDocumentOutlineResult>
  >,
  true satisfies IsAssignable<
    WireValue<Preview2ReadDocumentNodesWireResult>,
    GeneratedPageShape<GeneratedReadDocumentNodesResult>
  >,
  true satisfies IsAssignable<
    WireValue<Preview2SearchDocumentWireResult>,
    GeneratedPageShape<GeneratedSearchDocumentResult>
  >,
];
const GENERATED_ERROR_TYPE_COMPATIBILITY = true satisfies IsAssignable<
  Preview2WireError,
  DeepReadonly<GeneratedNirecoError>
>;

describe('Preview2ReadWireAdapter', () => {
  it('keeps the trusted error catalog and every catalog entry frozen at runtime', () => {
    expect(Object.isFrozen(NIRECO_ERROR_CATALOG)).toBe(true);
    for (const entry of Object.values(NIRECO_ERROR_CATALOG)) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
    expect(
      Reflect.set(NIRECO_ERROR_CATALOG.INTERNAL_ERROR, 'safeMessage', 'mutated catalog message'),
    ).toBe(false);
    expect(NIRECO_ERROR_CATALOG.INTERNAL_ERROR.safeMessage).toBe(
      'The service could not complete the request.',
    );

    const built = createNirecoCatalogError('INTERNAL_ERROR', ERROR_DEBUG_ID);
    expect(Object.isFrozen(built)).toBe(true);
    expect(Reflect.set(built, 'retryable', false)).toBe(false);
    expect(built.retryable).toBe(true);
  });

  it('keeps its successful values structurally compatible with generated contract types', () => {
    expect(GENERATED_TYPE_COMPATIBILITY).toEqual([true, true, true, true, true, true]);
    expect(GENERATED_ERROR_TYPE_COMPATIBILITY).toBe(true);
  });

  it('flattens all nine successful service values and validates them against Preview.2', async () => {
    const adapter = createAdapter();
    const results = {
      ResolveModelResult: adapter.resolveModel({ document: DOCUMENT }),
      GetDocumentHeadResult: adapter.getHead(CONTEXT),
      GetDocumentSnapshotResult: adapter.getSnapshot(CONTEXT),
      GetDocumentOutlineResult: adapter.getOutline(CONTEXT),
      ReadDocumentNodesResult: adapter.readNodes({
        ...CONTEXT,
        nodeIds: [MINIMAL_FIXTURE_IDS.text],
      }),
      ReadDocumentNodeNeighborhoodResult: adapter.readNodeNeighborhood({
        ...CONTEXT,
        nodeId: MINIMAL_FIXTURE_IDS.text,
        beforeBlocks: 0,
        afterBlocks: 0,
      }),
      SearchDocumentResult: adapter.search({ ...CONTEXT, query: 'Nireco' }),
      GetDocumentChangesSinceResult: adapter.getChangesSince({
        ...CONTEXT,
        sinceRevisionId: REVISION,
      }),
      GetDocumentDiagnosticsResult: adapter.getDiagnostics(CONTEXT),
    } as const;

    const ajv = await createContractValidator();
    for (const [definition, result] of Object.entries(results)) {
      if (result.type === 'error') {
        throw new Error(result.error.safeMessage);
      }
      const value: unknown = result.value;
      if (value === null || typeof value !== 'object') {
        throw new Error(`${definition} did not produce an object response.`);
      }
      expect(Object.hasOwn(value, 'value'), `${definition} must be flat`).toBe(false);
      const validate = requireDefinition(ajv, definition);
      expect(validate(value), `${definition}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expectDeepFrozen(result);
    }

    expect(readOk(results.GetDocumentSnapshotResult)).toMatchObject({
      document: DOCUMENT,
      basedOnRevisionId: REVISION,
      snapshot: { revisionId: REVISION },
    });
    expect(readOk(results.ReadDocumentNodeNeighborhoodResult)).toMatchObject({
      centerNodeId: MINIMAL_FIXTURE_IDS.text,
      items: [{ nodeType: 'text', text: 'Hello, Nireco.', childIds: [] }],
    });
    expect(readOk(results.GetDocumentChangesSinceResult)).toMatchObject({
      fromRevisionId: REVISION,
      items: [],
    });
  });

  it('recomputes every page byte count over the final flat Result fixed point', () => {
    const adapter = createAdapter();
    const pages = [
      adapter.getOutline(CONTEXT),
      adapter.readNodes({ ...CONTEXT, nodeIds: [MINIMAL_FIXTURE_IDS.text] }),
      adapter.readNodeNeighborhood({
        ...CONTEXT,
        nodeId: MINIMAL_FIXTURE_IDS.text,
        beforeBlocks: 0,
        afterBlocks: 0,
      }),
      adapter.search({ ...CONTEXT, query: 'Nireco' }),
      adapter.getChangesSince({ ...CONTEXT, sinceRevisionId: REVISION }),
      adapter.getDiagnostics(CONTEXT),
    ] as const;

    for (const result of pages) {
      if (result.type === 'error') {
        throw new Error(result.error.safeMessage);
      }
      const serialized = serializeCanonicalJson(result);
      if (serialized.type === 'error') {
        throw new Error('Expected a mapped Preview.2 Result to be canonical JSON.');
      }
      expect(result.value.approximateBytes).toBe(encodeUtf8(serialized.value).length);
      expect(result.value.approximateBytes).not.toBe(999_999);
    }
  });

  it('copies a schema-valid service error faithfully into a closed deeply frozen result', async () => {
    const error = {
      ...testError('MODEL_DISPOSED'),
      currentRevisionId: REVISION,
      requiredCapability: 'document.content.read',
      conflictingTargets: [
        {
          kind: 'node',
          document: { ...DOCUMENT },
          nodeId: MINIMAL_FIXTURE_IDS.text,
        },
      ],
    };
    const adapter = createAdapter({
      documentRead: {
        getHead: () => ({ type: 'error', error }) as never,
      },
    });
    const result = adapter.getHead(CONTEXT);

    expect(result).toEqual({ type: 'error', error });
    if (result.type === 'ok') {
      throw new Error('Expected the service error to be preserved.');
    }
    expect(result.error).not.toBe(error);
    expect(result.error.conflictingTargets).not.toBe(error.conflictingTargets);
    expect(result.error.conflictingTargets?.[0]).not.toBe(error.conflictingTargets[0]);
    expectDeepFrozen(result);

    const ajv = await createContractValidator();
    const validate = requireSchemaDefinition(ajv, ERROR_SCHEMA_ID, 'NirecoError');
    expect(validate(result.error), JSON.stringify(validate.errors)).toBe(true);

    (error as { safeMessage: string }).safeMessage = 'mutated after return';
    (error.conflictingTargets[0]?.document as { uri: string }).uri =
      'nireco://workspace-01/document/mutated';
    expect(result.error.safeMessage).toBe(
      'The requested model has been disposed and is no longer active.',
    );
    expect(result.error.conflictingTargets?.[0]).toMatchObject({ document: DOCUMENT });
  });

  it('keeps its normative error tuples exactly aligned with the contract catalog', async () => {
    for (const error of await readErrorCatalog()) {
      const adapter = createAdapter({
        documentRead: {
          getHead: () => ({ type: 'error', error }),
        },
      });
      const result = adapter.getHead(CONTEXT);
      expect(result).toEqual({ type: 'error', error });
      expectDeepFrozen(result);
    }
  });

  it('detaches nested successful data before deeply freezing the wire result', () => {
    const snapshot = createMinimalSnapshot(REVISION);
    const adapter = createAdapter({
      documentRead: {
        getSnapshot: () => bound(snapshot),
      },
    });
    const result = adapter.getSnapshot(CONTEXT);
    if (result.type === 'error') {
      throw new Error(result.error.safeMessage);
    }

    expect(result.value.snapshot).not.toBe(snapshot);
    expect(result.value.snapshot.metadata).not.toBe(snapshot.metadata);
    expectDeepFrozen(result);

    (snapshot.metadata as { title: string }).title = 'mutated service title';
    expect(result.value.snapshot.metadata.title).toBe('A minimal manuscript');
  });

  it('never invokes service-owned accessors and contains throwing Proxy traps', () => {
    const okGetter = vi.fn(() => REVISION);
    const valueWithAccessor = Object.defineProperty({}, 'headRevisionId', {
      enumerable: true,
      get: okGetter,
    });
    const accessorAdapter = createAdapter({
      documentRead: {
        getHead: () => bound(valueWithAccessor as never),
      },
    });
    expect(accessorAdapter.getHead(CONTEXT)).toMatchObject({
      type: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        safeMessage: 'The service could not complete the request.',
        suggestedAction: 'retry',
      },
    });
    expect(okGetter).not.toHaveBeenCalled();

    const errorGetter = vi.fn(() => 'MODEL_DISPOSED');
    const errorWithAccessor = Object.defineProperty({}, 'code', {
      enumerable: true,
      get: errorGetter,
    });
    const errorAccessorAdapter = createAdapter({
      documentRead: {
        getHead: () => ({ type: 'error', error: errorWithAccessor }) as never,
      },
    });
    expect(errorAccessorAdapter.getHead(CONTEXT)).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(errorGetter).not.toHaveBeenCalled();

    const throwingProxy = new Proxy(
      {},
      {
        ownKeys(): never {
          throw new Error('private proxy failure');
        },
      },
    );
    const proxyAdapter = createAdapter({
      documentRead: {
        getHead: () => throwingProxy as never,
      },
    });
    const proxyResult = proxyAdapter.getHead(CONTEXT);
    expect(proxyResult).toMatchObject({
      type: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        safeMessage: 'The service could not complete the request.',
      },
    });
    expectDeepFrozen(proxyResult);
  });

  it('captures nested Proxy arrays without invoking their get traps', () => {
    const pageArrayGet = vi.fn();
    const proxiedItems = new Proxy<unknown[]>([], {
      get(target, property, receiver): unknown {
        pageArrayGet();
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const pageAdapter = createAdapter({
      documentRead: {
        getOutline: () => bound({ ...page([]), items: proxiedItems }) as never,
      },
    });
    const pageResult = pageAdapter.getOutline(CONTEXT);
    expect(pageResult).toMatchObject({ type: 'ok', value: { items: [] } });
    expect(pageArrayGet).not.toHaveBeenCalled();
    expectDeepFrozen(pageResult);

    const targetArrayGet = vi.fn();
    const proxiedTargets = new Proxy(
      [
        {
          kind: 'node' as const,
          document: { ...DOCUMENT },
          nodeId: MINIMAL_FIXTURE_IDS.text,
        },
      ],
      {
        get(target, property, receiver): unknown {
          targetArrayGet();
          return Reflect.get(target, property, receiver) as unknown;
        },
      },
    );
    const errorAdapter = createAdapter({
      documentRead: {
        getHead: () =>
          ({
            type: 'error',
            error: { ...testError('MODEL_DISPOSED'), conflictingTargets: proxiedTargets },
          }) as never,
      },
    });
    const errorResult = errorAdapter.getHead(CONTEXT);
    expect(errorResult).toMatchObject({
      type: 'error',
      error: { code: 'MODEL_DISPOSED', conflictingTargets: [{ kind: 'node' }] },
    });
    expect(targetArrayGet).not.toHaveBeenCalled();
    expectDeepFrozen(errorResult);
  });

  it('fails closed for malformed, cyclic, or open service error objects', async () => {
    const cyclic = { ...testError('MODEL_DISPOSED') } as Record<string, unknown>;
    cyclic['cycle'] = cyclic;
    const malformedErrors: readonly unknown[] = [
      { ...testError('MODEL_DISPOSED'), details: { private: true } },
      { ...testError('MODEL_DISPOSED'), debugId: 'not-a-debug-id' },
      { ...testError('MODEL_DISPOSED'), safeMessage: '' },
      { ...testError('MODEL_DISPOSED'), category: 'internal' },
      { ...testError('MODEL_DISPOSED'), retryable: true },
      { ...testError('MODEL_DISPOSED'), safeMessage: 'A different safe message.' },
      { ...testError('MODEL_DISPOSED'), suggestedAction: 'retry' },
      { ...testError('MODEL_DISPOSED'), code: 'NODE_NOT_FOUND' },
      cyclic,
    ];
    const ajv = await createContractValidator();
    const validate = requireSchemaDefinition(ajv, ERROR_SCHEMA_ID, 'NirecoError');

    for (const error of malformedErrors) {
      const adapter = createAdapter({
        documentRead: {
          getHead: () => ({ type: 'error', error }) as never,
        },
      });
      const result = adapter.getHead(CONTEXT);
      expect(result).toMatchObject({
        type: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          category: 'internal',
          retryable: true,
          safeMessage: 'The service could not complete the request.',
          suggestedAction: 'retry',
        },
      });
      if (result.type === 'ok') {
        throw new Error('Expected malformed service errors to fail closed.');
      }
      expect(validate(result.error), JSON.stringify(validate.errors)).toBe(true);
      expectDeepFrozen(result);
    }
  });

  it('turns service and mapping invariant failures into typed INTERNAL_ERROR results', () => {
    const throwing = createAdapter({
      documentRead: {
        getHead(): never {
          throw new Error('untrusted implementation detail');
        },
      },
    });
    expect(throwing.getHead(CONTEXT)).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR', category: 'internal', retryable: true },
    });

    const mismatchedPage = createAdapter({
      documentRead: {
        getOutline: () =>
          bound({
            ...page([]),
            basedOnRevisionId: OTHER_REVISION,
          }),
      },
    });
    expect(mismatchedPage.getOutline(CONTEXT)).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR', category: 'internal' },
    });

    const staleHead = createAdapter({
      documentRead: {
        getHead: () => bound({ headRevisionId: REVISION }, 'stale'),
      },
    });
    expect(staleHead.getHead(CONTEXT)).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR', category: 'internal' },
    });

    const mismatchedHead = createAdapter({
      documentRead: {
        getHead: () => bound({ headRevisionId: OTHER_REVISION }),
      },
    });
    expect(mismatchedHead.getHead(CONTEXT)).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR', category: 'internal' },
    });

    const brokenCursorInvariant = createAdapter({
      documentRead: {
        getOutline: () => bound({ ...page([]), truncated: true }),
      },
    });
    expect(brokenCursorInvariant.getOutline(CONTEXT)).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR', category: 'internal' },
    });

    const excessiveMarks = createAdapter({
      documentRead: {
        readNodes: () =>
          bound(
            page([
              {
                nodeId: MINIMAL_FIXTURE_IDS.text,
                nodeType: 'text',
                text: 'invalid marks',
                marks: Array.from({ length: 9 }, () => ({ type: 'bold' as const })),
                childIds: [],
              },
            ]),
          ),
      },
    });
    expect(
      excessiveMarks.readNodes({ ...CONTEXT, nodeIds: [MINIMAL_FIXTURE_IDS.text] }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'INTERNAL_ERROR', category: 'internal' },
    });
  });
});

function createAdapter(
  overrides: {
    readonly resolveModel?: Partial<ResolveModelService>;
    readonly documentRead?: Partial<DocumentReadService>;
  } = {},
): Preview2ReadWireAdapter {
  const snapshot = createMinimalSnapshot(REVISION);
  const textNode = {
    nodeId: MINIMAL_FIXTURE_IDS.text,
    nodeType: 'text',
    text: 'Hello, Nireco.',
    marks: [{ type: 'bold' }],
    childIds: [],
  } as const;
  const resolveModel: ResolveModelService = {
    resolve: () => ({
      type: 'ok',
      value: {
        document: DOCUMENT,
        basedOnRevisionId: REVISION,
        consistency: 'exact',
        status: 'current',
      },
    }),
    ...overrides.resolveModel,
  };
  const documentRead: DocumentReadService = {
    getHead: () => bound({ headRevisionId: REVISION }),
    getSnapshot: () => bound(snapshot),
    getOutline: () => bound(page([])),
    readNodes: () => bound(page([textNode])),
    readNodeNeighborhood: () =>
      bound({
        ...page([textNode]),
        centerNodeId: MINIMAL_FIXTURE_IDS.text,
      }),
    search: () =>
      bound(
        page([
          {
            kind: 'text',
            target: { kind: 'node', nodeId: MINIMAL_FIXTURE_IDS.text },
            match: 'substring',
            snippet: 'Hello, Nireco.',
          },
        ]),
      ),
    getChangesSince: () => bound({ ...page([]), fromRevisionId: REVISION }),
    getDiagnostics: () => bound(page([])),
    ...overrides.documentRead,
  };
  return new Preview2ReadWireAdapter({
    resolveModel,
    documentRead,
    ids: new DeterministicIdAllocator(),
  });
}

function bound<TValue>(
  value: TValue,
  status: 'current' | 'stale' = 'current',
): Result<{
  readonly document: typeof DOCUMENT;
  readonly basedOnRevisionId: RevisionId;
  readonly consistency: 'exact';
  readonly status: 'current' | 'stale';
  readonly value: TValue;
}> {
  return {
    type: 'ok',
    value: {
      document: DOCUMENT,
      basedOnRevisionId: REVISION,
      consistency: 'exact',
      status,
      value,
    },
  };
}

function page<TItem>(items: readonly TItem[]): {
  readonly items: readonly TItem[];
  readonly truncated: false;
  readonly basedOnRevisionId: RevisionId;
  readonly approximateBytes: number;
} {
  return {
    items,
    truncated: false,
    basedOnRevisionId: REVISION,
    approximateBytes: 999_999,
  };
}

function testError(code: NirecoError['code']): NirecoError {
  return {
    code,
    category: 'conflict',
    retryable: false,
    safeMessage: 'The requested model has been disposed and is no longer active.',
    debugId: ERROR_DEBUG_ID,
    suggestedAction: 'reread',
  };
}

function readOk<TValue>(result: Result<TValue>): TValue {
  if (result.type === 'error') {
    throw new Error(result.error.safeMessage);
  }
  return result.value;
}

async function createContractValidator(): Promise<Ajv2020> {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: false,
    strict: true,
    strictTuples: false,
    validateFormats: true,
  });
  ajv.addFormat('uri', {
    type: 'string',
    validate(value: string): boolean {
      return canonicalizeResourceUri(value).type === 'valid';
    },
  });
  ajv.addFormat('date-time', {
    type: 'string',
    validate(value: string): boolean {
      return parseIsoTimestamp(value).type === 'valid';
    },
  });
  ajv.addFormat('nireco-canonical-resource-uri', {
    type: 'string',
    validate: isCanonicalResourceUri,
  });
  ajv.addFormat('nireco-logical-resource-uri', {
    type: 'string',
    validate(value: string): boolean {
      return (
        isCanonicalResourceUri(value) && (value.startsWith('nireco:') || value.startsWith('comet:'))
      );
    },
  });
  ajv.addFormat('nireco-document-uri', {
    type: 'string',
    validate(value: string): boolean {
      return isCanonicalResourceUri(value) && value.startsWith('nireco:');
    },
  });
  ajv.addFormat('comet-resource-uri', {
    type: 'string',
    validate(value: string): boolean {
      return isCanonicalResourceUri(value) && value.startsWith('comet:');
    },
  });

  const schemaFiles = (await readdir(SCHEMA_ROOT))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();
  for (const schemaFile of schemaFiles) {
    const parsed: unknown = JSON.parse(await readFile(path.join(SCHEMA_ROOT, schemaFile), 'utf8'));
    ajv.addSchema(parsed as AnySchema);
  }
  return ajv;
}

async function readErrorCatalog(): Promise<readonly NirecoError[]> {
  const parsed: unknown = JSON.parse(await readFile(ERROR_CATALOG_PATH, 'utf8'));
  if (!isUnknownRecord(parsed) || !Array.isArray(parsed['errors'])) {
    throw new Error('The Preview.2 error catalog did not contain an errors array.');
  }
  return parsed['errors'].map(readCatalogError);
}

function readCatalogError(value: unknown): NirecoError {
  if (!isUnknownRecord(value)) {
    throw new Error('A Preview.2 error catalog entry was not an object.');
  }
  const code = value['code'];
  const category = value['category'];
  const retryable = value['retryable'];
  const safeMessage = value['safeMessage'];
  const suggestedAction = value['suggestedAction'];
  if (
    typeof code !== 'string' ||
    typeof category !== 'string' ||
    typeof retryable !== 'boolean' ||
    typeof safeMessage !== 'string' ||
    typeof suggestedAction !== 'string'
  ) {
    throw new Error('A Preview.2 error catalog entry was incomplete.');
  }
  return {
    code: code as NirecoError['code'],
    category: category as NirecoError['category'],
    retryable,
    safeMessage,
    debugId: ERROR_DEBUG_ID,
    suggestedAction: suggestedAction as NirecoError['suggestedAction'],
  };
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireDefinition(ajv: Ajv2020, definition: string): ValidateFunction {
  return requireSchemaDefinition(ajv, INTEGRATION_SCHEMA_ID, definition);
}

function requireSchemaDefinition(
  ajv: Ajv2020,
  schemaId: string,
  definition: string,
): ValidateFunction {
  const validate = ajv.getSchema(`${schemaId}#/$defs/${definition}`);
  if (validate === undefined) {
    throw new Error(`${definition} schema was not registered.`);
  }
  return validate;
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return;
  }
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) {
      expectDeepFrozen(descriptor.value, seen);
    }
  }
}
