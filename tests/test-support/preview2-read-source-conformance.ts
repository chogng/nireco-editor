import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Ajv2020, type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { NirecoError, Result } from '../../src/base/errors/nireco-error.js';
import type { NodeId } from '../../src/base/ids/identifiers.js';
import { parseIsoTimestamp } from '../../src/base/time/clock.js';
import {
  canonicalizeResourceUri,
  isCanonicalResourceUri,
} from '../../src/base/uri/resource-uri.js';
import type { Preview2ReadWireAdapter } from '../../src/integration/comet/preview2-read-wire-adapter.js';
import type { DocumentReadContext } from '../../src/services/document-service/document-read-types.js';

const SCHEMA_ROOT = path.resolve('contracts/comet-integration/schemas');
const INTEGRATION_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/integration.schema.json';
const ERROR_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/error.schema.json';

type Preview2ReadBoundary = Pick<
  Preview2ReadWireAdapter,
  | 'resolveModel'
  | 'getHead'
  | 'getSnapshot'
  | 'getOutline'
  | 'readNodes'
  | 'readNodeNeighborhood'
  | 'search'
  | 'getChangesSince'
  | 'getDiagnostics'
>;

export interface Preview2ReadSourceConformanceFixture {
  readonly boundary: Preview2ReadBoundary;
  readonly fullContext: DocumentReadContext;
  readonly otherSessionContext: DocumentReadContext;
  readonly scopedContext: DocumentReadContext;
  readonly unknownSessionContext: DocumentReadContext;
  readonly nodes: {
    readonly cursorFirst: NodeId;
    readonly cursorSecond: NodeId;
    readonly readable: NodeId;
    readonly outsideScope: NodeId;
    readonly absent: NodeId;
  };
  dispose(): Promise<void>;
}

export interface Preview2ReadSourceConformanceOptions {
  /** Names the concrete source/runtime boundary under test, not a transport mode. */
  readonly name: string;
  readonly createFixture: () => Promise<Preview2ReadSourceConformanceFixture>;
}

/**
 * Shared source-level Preview.2 read conformance.
 *
 * This suite deliberately exercises in-process service/model boundaries. It is
 * reusable by multiple source/runtime fixtures, but it is not Mock/Real
 * transport conformance and is not sufficient evidence for the Gate 1 exit.
 */
export function definePreview2ReadSourceConformance(
  options: Preview2ReadSourceConformanceOptions,
): void {
  describe(`Preview.2 shared read source conformance: ${options.name}`, () => {
    let fixture: Preview2ReadSourceConformanceFixture;

    beforeAll(async () => {
      fixture = await options.createFixture();
    });

    afterAll(async () => {
      await fixture.dispose();
    });

    it('returns flat schema-valid success values for all nine read methods', async () => {
      const results = successfulMethodResults(fixture);
      const ajv = await contractValidator();

      for (const { definition, result } of results) {
        const value = requireOk(result);
        expect(isRecord(value), `${definition} must return an object`).toBe(true);
        if (!isRecord(value)) {
          throw new Error(`${definition} did not return an object.`);
        }
        expect(Object.hasOwn(value, 'value'), `${definition} must be flat`).toBe(false);
        const validate = requireDefinition(ajv, definition, INTEGRATION_SCHEMA_ID);
        expect(validate(value), `${definition}: ${JSON.stringify(validate.errors)}`).toBe(true);
        expect(value).toMatchObject({
          document: fixture.fullContext.document,
          basedOnRevisionId: fixture.fullContext.document.revisionId,
          consistency: 'exact',
          status: 'current',
        });
      }

      expect(requireOk(fixture.boundary.getHead(fixture.fullContext))).toMatchObject({
        headRevisionId: fixture.fullContext.document.revisionId,
      });
      expect(requireOk(fixture.boundary.getSnapshot(fixture.fullContext))).toMatchObject({
        snapshot: { revisionId: fixture.fullContext.document.revisionId },
      });
    });

    it('returns schema-valid typed errors from every method', async () => {
      const results = typedErrorMethodResults(fixture);
      const ajv = await contractValidator();
      const validateError = requireDefinition(ajv, 'NirecoError', ERROR_SCHEMA_ID);

      for (const { method, result, expectedCode } of results) {
        const error = requireError(result);
        expect(error.code, method).toBe(expectedCode);
        expect(validateError(error), `${method}: ${JSON.stringify(validateError.errors)}`).toBe(
          true,
        );
      }
    });

    it('binds continuation cursors to query, Scope, and Session', () => {
      const request = {
        ...fixture.fullContext,
        nodeIds: [fixture.nodes.cursorFirst, fixture.nodes.cursorSecond],
        maxResults: 1,
      } as const;
      const first = requireOk(fixture.boundary.readNodes(request));
      expect(first).toMatchObject({ truncated: true, items: [{ nodeId: request.nodeIds[0] }] });
      if (first.nextCursor === undefined) {
        throw new Error('The first conformance page did not return a cursor.');
      }

      expect(
        requireOk(fixture.boundary.readNodes({ ...request, cursor: first.nextCursor })),
      ).toMatchObject({
        truncated: false,
        items: [{ nodeId: request.nodeIds[1] }],
      });

      const mismatches = [
        fixture.boundary.readNodes({
          ...request,
          nodeIds: [fixture.nodes.cursorFirst, fixture.nodes.readable],
          cursor: first.nextCursor,
        }),
        fixture.boundary.readNodes({
          ...request,
          ...fixture.scopedContext,
          cursor: first.nextCursor,
        }),
        fixture.boundary.readNodes({
          ...request,
          ...fixture.otherSessionContext,
          cursor: first.nextCursor,
        }),
      ] as const;

      for (const mismatch of mismatches) {
        expect(requireError(mismatch)).toMatchObject({
          code: 'SCHEMA_INVALID',
          category: 'validation',
        });
      }
    });

    it('makes out-of-Scope and absent nodes indistinguishable', () => {
      const outside = requireError(
        fixture.boundary.readNodes({
          ...fixture.scopedContext,
          nodeIds: [fixture.nodes.outsideScope],
        }),
      );
      const absent = requireError(
        fixture.boundary.readNodes({
          ...fixture.scopedContext,
          nodeIds: [fixture.nodes.absent],
        }),
      );

      expect(safeErrorSurface(outside)).toEqual(safeErrorSurface(absent));
      expect(safeErrorSurface(outside)).toEqual({
        code: 'NODE_NOT_FOUND',
        category: 'validation',
        retryable: false,
        safeMessage: 'The referenced node does not exist in the bound document revision.',
        suggestedAction: 'reread',
      });
    });
  });
}

function successfulMethodResults(
  fixture: Preview2ReadSourceConformanceFixture,
): readonly { readonly definition: string; readonly result: Result<unknown> }[] {
  const { boundary, fullContext, nodes } = fixture;
  return [
    {
      definition: 'ResolveModelResult',
      result: boundary.resolveModel({ document: fullContext.document }),
    },
    { definition: 'GetDocumentHeadResult', result: boundary.getHead(fullContext) },
    { definition: 'GetDocumentSnapshotResult', result: boundary.getSnapshot(fullContext) },
    { definition: 'GetDocumentOutlineResult', result: boundary.getOutline(fullContext) },
    {
      definition: 'ReadDocumentNodesResult',
      result: boundary.readNodes({ ...fullContext, nodeIds: [nodes.readable] }),
    },
    {
      definition: 'ReadDocumentNodeNeighborhoodResult',
      result: boundary.readNodeNeighborhood({
        ...fullContext,
        nodeId: nodes.readable,
        beforeBlocks: 0,
        afterBlocks: 0,
      }),
    },
    {
      definition: 'SearchDocumentResult',
      result: boundary.search({ ...fullContext, query: 'Nireco' }),
    },
    {
      definition: 'GetDocumentChangesSinceResult',
      result: boundary.getChangesSince({
        ...fullContext,
        sinceRevisionId: fullContext.document.revisionId,
      }),
    },
    {
      definition: 'GetDocumentDiagnosticsResult',
      result: boundary.getDiagnostics(fullContext),
    },
  ];
}

function typedErrorMethodResults(fixture: Preview2ReadSourceConformanceFixture): readonly {
  readonly method: string;
  readonly result: Result<unknown>;
  readonly expectedCode: NirecoError['code'];
}[] {
  const { boundary, nodes, unknownSessionContext: context } = fixture;
  return [
    {
      method: 'workspace.resolve_model',
      result: boundary.resolveModel({}),
      expectedCode: 'SCHEMA_INVALID',
    },
    {
      method: 'document.get_head',
      result: boundary.getHead(context),
      expectedCode: 'SESSION_REVOKED',
    },
    {
      method: 'document.get_snapshot',
      result: boundary.getSnapshot(context),
      expectedCode: 'SESSION_REVOKED',
    },
    {
      method: 'document.get_outline',
      result: boundary.getOutline(context),
      expectedCode: 'SESSION_REVOKED',
    },
    {
      method: 'document.read_nodes',
      result: boundary.readNodes({ ...context, nodeIds: [nodes.readable] }),
      expectedCode: 'SESSION_REVOKED',
    },
    {
      method: 'document.read_node_neighborhood',
      result: boundary.readNodeNeighborhood({
        ...context,
        nodeId: nodes.readable,
        beforeBlocks: 0,
        afterBlocks: 0,
      }),
      expectedCode: 'SESSION_REVOKED',
    },
    {
      method: 'document.search',
      result: boundary.search({ ...context, query: 'Nireco' }),
      expectedCode: 'SESSION_REVOKED',
    },
    {
      method: 'document.get_changes_since',
      result: boundary.getChangesSince({
        ...context,
        sinceRevisionId: context.document.revisionId,
      }),
      expectedCode: 'SESSION_REVOKED',
    },
    {
      method: 'document.get_diagnostics',
      result: boundary.getDiagnostics(context),
      expectedCode: 'SESSION_REVOKED',
    },
  ];
}

function requireOk<TValue>(result: Result<TValue>): TValue {
  if (result.type === 'error') {
    throw new Error(`${result.error.code}: ${result.error.safeMessage}`);
  }
  return result.value;
}

function requireError(result: Result<unknown>): NirecoError {
  if (result.type === 'ok') {
    throw new Error('Expected a typed Preview.2 read error.');
  }
  return result.error;
}

function safeErrorSurface(error: NirecoError): Omit<NirecoError, 'debugId' | 'currentRevisionId'> {
  const { code, category, retryable, safeMessage, suggestedAction } = error;
  return { code, category, retryable, safeMessage, suggestedAction };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

let contractValidatorPromise: Promise<Ajv2020> | undefined;

function contractValidator(): Promise<Ajv2020> {
  contractValidatorPromise ??= createContractValidator();
  return contractValidatorPromise;
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

function requireDefinition(ajv: Ajv2020, definition: string, schemaId: string): ValidateFunction {
  const validate = ajv.getSchema(`${schemaId}#/$defs/${definition}`);
  if (validate === undefined) {
    throw new Error(`${definition} schema was not registered.`);
  }
  return validate;
}
