import { describe, expect, it } from 'vitest';

import type {
  GetDocumentChangesSinceRequest as GeneratedGetDocumentChangesSinceRequest,
  GetDocumentDiagnosticsRequest as GeneratedGetDocumentDiagnosticsRequest,
  GetDocumentHeadRequest as GeneratedGetDocumentHeadRequest,
  GetDocumentOutlineRequest as GeneratedGetDocumentOutlineRequest,
  GetDocumentSnapshotRequest as GeneratedGetDocumentSnapshotRequest,
  ReadDocumentNodeNeighborhoodRequest as GeneratedReadDocumentNodeNeighborhoodRequest,
  ReadDocumentNodesRequest as GeneratedReadDocumentNodesRequest,
  ResolveModelRequest as GeneratedResolveModelRequest,
  SearchDocumentRequest as GeneratedSearchDocumentRequest,
} from '../../contracts/comet-integration/generated-types/integration.js';
import {
  Preview2ReadRequestDecoder,
  type Preview2ReadRequestDecodeResult,
} from '../../src/integration/comet/preview2-read-request-decoder.js';
import {
  DeterministicIdAllocator,
  MINIMAL_FIXTURE_IDS,
  validDocumentUri,
} from '../test-support/fixtures.js';

const IDS = new DeterministicIdAllocator();
const SESSION = IDS.allocateSessionId();
const REVISION = MINIMAL_FIXTURE_IDS.revision;
const OTHER_REVISION = IDS.allocateRevisionId();
const NODE = MINIMAL_FIXTURE_IDS.text;
const OTHER_NODE = IDS.allocateNodeId();
const URI = validDocumentUri('nireco://workspace-01/document/preview2-request-decoder');
const DOCUMENT = { uri: URI, revisionId: REVISION } as const;
const CONTEXT = { sessionId: SESSION, document: DOCUMENT } as const;
const CURSOR = 'AQ';

type DecodeValue<TResult> = TResult extends {
  readonly type: 'ok';
  readonly value: infer TValue;
}
  ? TValue
  : never;
type DeepReadonly<TValue> = TValue extends (...arguments_: never[]) => unknown
  ? TValue
  : TValue extends readonly (infer TItem)[]
    ? readonly DeepReadonly<TItem>[]
    : TValue extends object
      ? { readonly [TKey in keyof TValue]: DeepReadonly<TValue[TKey]> }
      : TValue;
type IsAssignable<TSource, TTarget> = [TSource] extends [TTarget] ? true : false;

const GENERATED_REQUEST_COMPATIBILITY: readonly [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
] = [
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['resolveModel']>>,
    DeepReadonly<GeneratedResolveModelRequest>
  >,
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['getHead']>>,
    DeepReadonly<GeneratedGetDocumentHeadRequest>
  >,
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['getSnapshot']>>,
    DeepReadonly<GeneratedGetDocumentSnapshotRequest>
  >,
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['getOutline']>>,
    DeepReadonly<GeneratedGetDocumentOutlineRequest>
  >,
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['readNodes']>>,
    DeepReadonly<GeneratedReadDocumentNodesRequest>
  >,
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['readNodeNeighborhood']>>,
    DeepReadonly<GeneratedReadDocumentNodeNeighborhoodRequest>
  >,
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['search']>>,
    DeepReadonly<GeneratedSearchDocumentRequest>
  >,
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['getChangesSince']>>,
    DeepReadonly<GeneratedGetDocumentChangesSinceRequest>
  >,
  true satisfies IsAssignable<
    DecodeValue<ReturnType<Preview2ReadRequestDecoder['getDiagnostics']>>,
    DeepReadonly<GeneratedGetDocumentDiagnosticsRequest>
  >,
];

type AnyDecodeResult = Preview2ReadRequestDecodeResult<unknown>;

interface RequestFixture {
  readonly name: string;
  readonly request: Readonly<Record<string, unknown>>;
  decode(value: unknown): AnyDecodeResult;
}

interface ProxyInspection {
  getCalls: number;
  ownKeysCalls: number;
  getPrototypeOfCalls: number;
  readonly descriptors: Map<PropertyKey, number>;
}

describe('Preview2ReadRequestDecoder', () => {
  it('keeps all nine decoded values structurally compatible with generated request types', () => {
    expect(GENERATED_REQUEST_COMPATIBILITY).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('fully decodes all nine unknown inputs into detached frozen values', () => {
    const decoder = new Preview2ReadRequestDecoder();
    for (const fixture of requestFixtures(decoder)) {
      const result = fixture.decode(fixture.request);
      expect(result, fixture.name).toMatchObject({ type: 'ok' });
      if (result.type === 'error') {
        throw new Error(`${fixture.name} failed to decode.`);
      }
      expect(result.value, fixture.name).toEqual(fixture.request);
      expect(Object.isFrozen(result.value), fixture.name).toBe(true);
      const value = result.value as Readonly<Record<string, unknown>>;
      if (Object.hasOwn(value, 'document')) {
        expect(Object.isFrozen(value['document']), `${fixture.name}.document`).toBe(true);
      }
      for (const key of ['nodeIds', 'sectionIds', 'kinds', 'severities', 'codes']) {
        if (Object.hasOwn(value, key)) {
          expect(Object.isFrozen(value[key]), `${fixture.name}.${key}`).toBe(true);
        }
      }
    }
  });

  it('rejects missing fields and every wire cancellation field before authorization exists', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const missingRequired: readonly RequestFixture[] = [
      {
        name: 'workspace.resolve_model',
        request: {},
        decode: (value) => decoder.resolveModel(value),
      },
      {
        name: 'document.get_head',
        request: { sessionId: SESSION },
        decode: (value) => decoder.getHead(value),
      },
      {
        name: 'document.get_snapshot',
        request: { document: DOCUMENT },
        decode: (value) => decoder.getSnapshot(value),
      },
      {
        name: 'document.get_outline',
        request: { sessionId: SESSION },
        decode: (value) => decoder.getOutline(value),
      },
      {
        name: 'document.read_nodes',
        request: CONTEXT,
        decode: (value) => decoder.readNodes(value),
      },
      {
        name: 'document.read_node_neighborhood',
        request: { ...CONTEXT, nodeId: NODE, beforeBlocks: 0 },
        decode: (value) => decoder.readNodeNeighborhood(value),
      },
      {
        name: 'document.search',
        request: CONTEXT,
        decode: (value) => decoder.search(value),
      },
      {
        name: 'document.get_changes_since',
        request: CONTEXT,
        decode: (value) => decoder.getChangesSince(value),
      },
      {
        name: 'document.get_diagnostics',
        request: { sessionId: SESSION },
        decode: (value) => decoder.getDiagnostics(value),
      },
    ];

    for (const fixture of missingRequired) {
      expect(fixture.decode(fixture.request), fixture.name).toEqual({
        type: 'error',
        reason: 'schema-invalid',
      });
    }
    for (const fixture of requestFixtures(decoder)) {
      expect(
        fixture.decode({ ...fixture.request, cancellation: { isCancellationRequested: false } }),
        fixture.name,
      ).toEqual({ type: 'error', reason: 'schema-invalid' });
    }
  });

  it('accepts only closed plain records and dense ordinary arrays', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const inherited = { ...CONTEXT, query: 'Nireco' };
    Reflect.setPrototypeOf(inherited, { inherited: true });
    expect(decoder.search(inherited)).toEqual({ type: 'error', reason: 'schema-invalid' });
    expect(decoder.getHead({ ...CONTEXT, document: { ...DOCUMENT, extra: true } })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });

    const symbol = Symbol('unknown');
    expect(decoder.getHead({ ...CONTEXT, [symbol]: true })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });

    const sparse = [NODE, , OTHER_NODE];
    expect(decoder.readNodes({ ...CONTEXT, nodeIds: sparse })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
    const extraKey = [NODE];
    Object.defineProperty(extraKey, 'extra', { enumerable: true, value: true });
    expect(decoder.readNodes({ ...CONTEXT, nodeIds: extraKey })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });

    let arrayGetterCalls = 0;
    const accessorArray = [NODE];
    Object.defineProperty(accessorArray, '0', {
      enumerable: true,
      get(): string {
        arrayGetterCalls += 1;
        return NODE;
      },
    });
    expect(decoder.readNodes({ ...CONTEXT, nodeIds: accessorArray })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
    expect(arrayGetterCalls).toBe(0);
  });

  it('captures every descriptor once, never invokes get traps, and fails closed on inspection errors', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const documentInspection = inspection();
    const arrayInspection = inspection();
    const requestInspection = inspection();
    const document = descriptorProxy({ ...DOCUMENT }, documentInspection);
    const sectionIds = descriptorProxy([NODE, OTHER_NODE], arrayInspection);
    const request = descriptorProxy(
      { sessionId: SESSION, document, query: 'Nireco', sectionIds },
      requestInspection,
    );

    expect(decoder.search(request)).toMatchObject({ type: 'ok' });
    for (const observed of [requestInspection, documentInspection, arrayInspection]) {
      expect(observed.getCalls).toBe(0);
      expect(observed.ownKeysCalls).toBe(1);
      expect(observed.getPrototypeOfCalls).toBe(1);
      expect([...observed.descriptors.values()]).not.toContain(2);
      expect([...observed.descriptors.values()].every((count) => count === 1)).toBe(true);
    }

    let getterCalls = 0;
    const accessorRequest = Object.defineProperty({ sessionId: SESSION, document }, 'query', {
      enumerable: true,
      get(): string {
        getterCalls += 1;
        return 'Nireco';
      },
    });
    expect(decoder.search(accessorRequest)).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
    expect(getterCalls).toBe(0);

    const throwingProxy = new Proxy(
      { ...CONTEXT },
      {
        ownKeys(): never {
          throw new Error('untrusted inspection failure');
        },
      },
    );
    expect(decoder.getHead(throwingProxy)).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });

    const revokedRequest = Proxy.revocable({ ...CONTEXT }, {});
    revokedRequest.revoke();
    expect(decoder.getHead(revokedRequest.proxy)).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
    const revokedArray = Proxy.revocable([NODE], {});
    revokedArray.revoke();
    expect(decoder.readNodes({ ...CONTEXT, nodeIds: revokedArray.proxy })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
  });

  it('enforces production UUIDv7 identity and canonical Document URI profiles', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const wrongVersion = '018f2a4e-7b1c-4abc-8def-0123456789ab';
    const invalidDocuments = [
      { ...DOCUMENT, revisionId: wrongVersion },
      { ...DOCUMENT, uri: 'nireco://Workspace-01/document/example' },
      { ...DOCUMENT, uri: 'nireco://workspace-01/document/文' },
      { ...DOCUMENT, uri: 'nireco://workspace-01/only-one-segment' },
      { ...DOCUMENT, uri: 'nireco://workspace-01/document/example?query=true' },
    ];
    for (const document of invalidDocuments) {
      expect(decoder.getHead({ sessionId: SESSION, document })).toEqual({
        type: 'error',
        reason: 'schema-invalid',
      });
    }
    expect(decoder.getHead({ ...CONTEXT, sessionId: wrongVersion })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
    expect(decoder.readNodes({ ...CONTEXT, nodeIds: [wrongVersion] })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
    expect(decoder.getChangesSince({ ...CONTEXT, sinceRevisionId: wrongVersion })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
  });

  it('requires well-formed Unicode and canonical unpadded base64url cursors', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const astral = '🧪';
    expect(decoder.search({ ...CONTEXT, query: 'Nireco 🧪' })).toMatchObject({ type: 'ok' });
    expect(decoder.search({ ...CONTEXT, query: astral.repeat(4_096) })).toMatchObject({
      type: 'ok',
    });
    expect(decoder.search({ ...CONTEXT, query: astral.repeat(4_097) })).toEqual({
      type: 'error',
      reason: 'request-too-large',
    });
    for (const query of ['\ud800', '\udc00', `valid${String.fromCharCode(0xd800)}invalid`]) {
      expect(decoder.search({ ...CONTEXT, query })).toEqual({
        type: 'error',
        reason: 'schema-invalid',
      });
    }

    for (const cursor of ['AQ', 'AAA', 'AAAA', 'A-A', 'A'.repeat(1_024)]) {
      expect(decoder.getOutline({ ...CONTEXT, cursor }), cursor).toMatchObject({ type: 'ok' });
    }
    for (const cursor of ['', 'A', 'AB', 'AAB', 'AQ==', 'not+base64url', 'not/base64url']) {
      expect(decoder.getOutline({ ...CONTEXT, cursor }), cursor).toEqual({
        type: 'error',
        reason: 'schema-invalid',
      });
    }
    expect(decoder.getOutline({ ...CONTEXT, cursor: 'A'.repeat(1_025) })).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
  });

  it('enforces every request collection, scalar, uniqueness, and enum bound', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const invalidRequests: readonly AnyDecodeResult[] = [
      decoder.getOutline({ ...CONTEXT, maxDepth: -1 }),
      decoder.getOutline({ ...CONTEXT, maxDepth: 257 }),
      decoder.getOutline({ ...CONTEXT, maxResults: 0 }),
      decoder.getOutline({ ...CONTEXT, maxResults: 1.5 }),
      decoder.readNodes({ ...CONTEXT, nodeIds: [] }),
      decoder.readNodes({ ...CONTEXT, nodeIds: [NODE, NODE] }),
      decoder.readNodeNeighborhood({
        ...CONTEXT,
        nodeId: NODE,
        beforeBlocks: -1,
        afterBlocks: 0,
      }),
      decoder.readNodeNeighborhood({
        ...CONTEXT,
        nodeId: NODE,
        beforeBlocks: 0,
        afterBlocks: 101,
      }),
      decoder.search({ ...CONTEXT, query: '' }),
      decoder.search({ ...CONTEXT, query: 'a', sectionIds: [NODE, NODE] }),
      decoder.search({ ...CONTEXT, query: 'a', kinds: ['text', 'text'] }),
      decoder.search({ ...CONTEXT, query: 'a', kinds: ['unknown'] }),
      decoder.getDiagnostics({ ...CONTEXT, severities: ['info', 'info'] }),
      decoder.getDiagnostics({ ...CONTEXT, severities: ['fatal'] }),
      decoder.getDiagnostics({ ...CONTEXT, codes: ['lowercase'] }),
      decoder.getDiagnostics({ ...CONTEXT, codes: ['VALID', 'VALID'] }),
      decoder.getDiagnostics({ ...CONTEXT, codes: [`A${'B'.repeat(128)}`] }),
    ];
    for (const result of invalidRequests) {
      expect(result).toEqual({ type: 'error', reason: 'schema-invalid' });
    }
  });

  it('classifies schema-shaped item and scalar hard-limit overflows as request-too-large', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const overflowIds = Array.from({ length: 1_001 }, () => IDS.allocateNodeId());
    const overflowCodes = Array.from({ length: 257 }, (_, index) => `CODE_${index}`);
    const overflows: readonly AnyDecodeResult[] = [
      decoder.getOutline({ ...CONTEXT, maxResults: 1_001 }),
      decoder.readNodes({ ...CONTEXT, nodeIds: overflowIds }),
      decoder.search({ ...CONTEXT, query: 'a'.repeat(4_097) }),
      decoder.search({ ...CONTEXT, query: 'a', sectionIds: overflowIds.slice(0, 257) }),
      decoder.getDiagnostics({ ...CONTEXT, codes: overflowCodes }),
    ];
    for (const result of overflows) {
      expect(result).toEqual({ type: 'error', reason: 'request-too-large' });
    }
  });

  it('uses malformed precedence inside the bounded capture window and size precedence above it', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const allocator = new DeterministicIdAllocator();
    const validNodeOverflow = Array.from({ length: 1_001 }, () => allocator.allocateNodeId());
    const malformedNodeOverflow: unknown[] = [...validNodeOverflow];
    malformedNodeOverflow[1_000] = 'not-a-production-node-id';
    const duplicateNodeOverflow = [
      NODE,
      ...Array.from({ length: 999 }, () => allocator.allocateNodeId()),
      NODE,
    ];
    const malformedCodeOverflow = Array.from({ length: 257 }, (_, index) => `CODE_${index}`);
    malformedCodeOverflow[256] = 'lowercase';

    for (const result of [
      decoder.readNodes({ ...CONTEXT, nodeIds: malformedNodeOverflow }),
      decoder.readNodes({ ...CONTEXT, nodeIds: duplicateNodeOverflow }),
      decoder.getDiagnostics({ ...CONTEXT, codes: malformedCodeOverflow }),
      decoder.search({
        ...CONTEXT,
        query: `${'a'.repeat(4_096)}${String.fromCharCode(0xd800)}`,
      }),
      decoder.getOutline({ ...CONTEXT, sessionId: 'invalid-session', maxResults: 1_001 }),
      decoder.readNodes({
        ...CONTEXT,
        sessionId: 'invalid-session',
        nodeIds: validNodeOverflow,
      }),
      decoder.search({
        ...CONTEXT,
        query: 'Nireco',
        sectionIds: validNodeOverflow.slice(0, 257),
        kinds: ['unknown'],
      }),
    ]) {
      expect(result).toEqual({ type: 'error', reason: 'schema-invalid' });
    }

    const observed = inspection();
    const absoluteOverflow = descriptorProxy(
      Array.from({ length: 4_097 }, () => NODE),
      observed,
    );
    expect(decoder.readNodes({ ...CONTEXT, nodeIds: absoluteOverflow })).toEqual({
      type: 'error',
      reason: 'request-too-large',
    });
    expect(
      decoder.readNodes({
        ...CONTEXT,
        sessionId: 'invalid-session',
        nodeIds: Array.from({ length: 4_097 }, () => NODE),
      }),
    ).toEqual({ type: 'error', reason: 'request-too-large' });
    expect(observed.getCalls).toBe(0);
    expect(observed.getPrototypeOfCalls).toBe(1);
    expect(observed.ownKeysCalls).toBe(0);
    expect(observed.descriptors).toEqual(new Map<PropertyKey, number>([['length', 1]]));
  });

  it('distinguishes a schema-valid hard-limit overflow from malformed input', () => {
    const strict = new Preview2ReadRequestDecoder({ hardMaxRequestBytes: 64 });
    expect(strict.getHead(CONTEXT)).toEqual({
      type: 'error',
      reason: 'request-too-large',
    });
    expect(strict.getHead({})).toEqual({
      type: 'error',
      reason: 'schema-invalid',
    });
    expect(
      strict.search({ ...CONTEXT, query: String.fromCharCode(0xd800).repeat(10_000) }),
    ).toEqual({ type: 'error', reason: 'schema-invalid' });
    expect(() => new Preview2ReadRequestDecoder({ hardMaxRequestBytes: 0 })).toThrow(RangeError);
  });

  it('does not retain caller-owned records or arrays after a successful decode', () => {
    const decoder = new Preview2ReadRequestDecoder();
    const source = {
      sessionId: SESSION,
      document: { uri: URI, revisionId: REVISION },
      nodeIds: [NODE],
    };
    const result = decoder.readNodes(source);
    expect(result).toMatchObject({ type: 'ok' });
    if (result.type === 'error') {
      throw new Error('Expected a valid read_nodes request.');
    }

    source.document.revisionId = OTHER_REVISION;
    source.nodeIds[0] = OTHER_NODE;
    expect(result.value.document).toEqual(DOCUMENT);
    expect(result.value.nodeIds).toEqual([NODE]);
    expect(result.value.document).not.toBe(source.document);
    expect(result.value.nodeIds).not.toBe(source.nodeIds);
  });
});

function requestFixtures(decoder: Preview2ReadRequestDecoder): readonly RequestFixture[] {
  return [
    {
      name: 'workspace.resolve_model',
      request: { document: DOCUMENT },
      decode: (value) => decoder.resolveModel(value),
    },
    {
      name: 'document.get_head',
      request: CONTEXT,
      decode: (value) => decoder.getHead(value),
    },
    {
      name: 'document.get_snapshot',
      request: CONTEXT,
      decode: (value) => decoder.getSnapshot(value),
    },
    {
      name: 'document.get_outline',
      request: { ...CONTEXT, maxDepth: 12, cursor: CURSOR, maxResults: 20 },
      decode: (value) => decoder.getOutline(value),
    },
    {
      name: 'document.read_nodes',
      request: { ...CONTEXT, nodeIds: [NODE, OTHER_NODE], cursor: CURSOR, maxResults: 20 },
      decode: (value) => decoder.readNodes(value),
    },
    {
      name: 'document.read_node_neighborhood',
      request: {
        ...CONTEXT,
        nodeId: NODE,
        beforeBlocks: 1,
        afterBlocks: 2,
        cursor: CURSOR,
        maxResults: 20,
      },
      decode: (value) => decoder.readNodeNeighborhood(value),
    },
    {
      name: 'document.search',
      request: {
        ...CONTEXT,
        query: 'Nireco 🧪',
        sectionIds: [NODE, OTHER_NODE],
        kinds: ['text', 'heading'],
        cursor: CURSOR,
        maxResults: 20,
      },
      decode: (value) => decoder.search(value),
    },
    {
      name: 'document.get_changes_since',
      request: { ...CONTEXT, sinceRevisionId: REVISION, cursor: CURSOR, maxResults: 20 },
      decode: (value) => decoder.getChangesSince(value),
    },
    {
      name: 'document.get_diagnostics',
      request: {
        ...CONTEXT,
        severities: ['warning', 'error'],
        codes: ['SCHEMA_INVALID', 'REFERENCE_STALE'],
        cursor: CURSOR,
        maxResults: 20,
      },
      decode: (value) => decoder.getDiagnostics(value),
    },
  ];
}

function inspection(): ProxyInspection {
  return {
    getCalls: 0,
    ownKeysCalls: 0,
    getPrototypeOfCalls: 0,
    descriptors: new Map(),
  };
}

function descriptorProxy<TTarget extends object>(
  target: TTarget,
  observed: ProxyInspection,
): TTarget {
  return new Proxy(target, {
    get(): never {
      observed.getCalls += 1;
      throw new Error('The decoder must not invoke a Proxy get trap.');
    },
    ownKeys(current): ArrayLike<string | symbol> {
      observed.ownKeysCalls += 1;
      return Reflect.ownKeys(current);
    },
    getPrototypeOf(current): object | null {
      observed.getPrototypeOfCalls += 1;
      return Reflect.getPrototypeOf(current);
    },
    getOwnPropertyDescriptor(current, property): PropertyDescriptor | undefined {
      observed.descriptors.set(property, (observed.descriptors.get(property) ?? 0) + 1);
      return Reflect.getOwnPropertyDescriptor(current, property);
    },
  });
}
