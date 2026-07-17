import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Ajv2020, type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { NIRECO_ERROR_CODES } from '../../src/base/errors/nireco-error.js';
import { HASH_DOMAINS, hashCanonicalJson } from '../../src/base/hashing/hash-preimage.js';
import { serializeCanonicalJson } from '../../src/base/serialization/canonical-json.js';
import { parseIsoTimestamp } from '../../src/base/time/clock.js';
import {
  canonicalizeResourceUri,
  isCanonicalResourceUri,
} from '../../src/base/uri/resource-uri.js';
import {
  COMET_CONTRACT_VERSION,
  CURRENT_COMET_CONTRACT_VERSION,
  GATE_1_READ_HARD_LIMITS,
  GATE_1_READ_SERVICES,
  INTEGRATION_CAPABILITIES,
  MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS,
} from '../../src/integration/comet/contract-types.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import { Sha256ContentHasher } from '../../src/platform/node/sha-256-content-hasher.js';
import {
  canonicalizeProposalChangeGroupOrder,
  deriveProposalChangeGroupId,
} from '../../src/proposal/identity/change-group-identity.js';
import type { SemanticDiff } from '../../src/proposal/semantic-diff.js';
import { SEMANTIC_EDIT_KINDS } from '../../src/proposal/semantic-edit.js';

const CONTRACT_ROOT = path.resolve('contracts/comet-integration');
const SCHEMA_ROOT = path.join(CONTRACT_ROOT, 'schemas');
const FIXTURE_ROOT = path.join(CONTRACT_ROOT, 'fixtures');
const TRACE_ROOT = path.join(CONTRACT_ROOT, 'sample-traces');
const GOLDEN_FIXTURE_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/golden-fixture.schema.json';
const TRACE_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/trace.schema.json';
const RESOURCE_REF_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/resource-ref.schema.json';
const MANUSCRIPT_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/manuscript.schema.json';
const INTEGRATION_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/integration.schema.json';

interface GoldenFixture {
  readonly name: string;
  readonly payloadSchemaId: string;
  readonly expectedCanonicalSha256: string;
  readonly payload: unknown;
}

describe('Gate 0 contract bundle conformance', () => {
  it('validates every golden fixture and its canonical payload hash', async () => {
    const ajv = await createContractValidator();
    const validateEnvelope = ajv.getSchema(GOLDEN_FIXTURE_SCHEMA_ID);
    if (validateEnvelope === undefined) {
      throw new Error('Golden fixture schema was not registered.');
    }

    const fixtureFiles = (await readdir(FIXTURE_ROOT))
      .filter((fileName) => fileName.endsWith('.json') && !fileName.startsWith('hash-'))
      .sort();
    expect(fixtureFiles.length).toBeGreaterThan(0);

    const hasher = new Sha256ContentHasher();
    for (const fixtureFile of fixtureFiles) {
      const fixture = await readJson(path.join(FIXTURE_ROOT, fixtureFile));
      expect(
        validateEnvelope(fixture),
        `${fixtureFile}: ${JSON.stringify(validateEnvelope.errors)}`,
      ).toBe(true);

      const goldenFixture = parseGoldenFixture(fixture, fixtureFile);
      const validatePayload = ajv.getSchema(goldenFixture.payloadSchemaId);
      if (validatePayload === undefined) {
        throw new Error(
          `${fixtureFile} references an unregistered payload schema: ${goldenFixture.payloadSchemaId}`,
        );
      }
      expect(
        validatePayload(goldenFixture.payload),
        `${fixtureFile} payload: ${JSON.stringify(validatePayload.errors)}`,
      ).toBe(true);

      const canonical = serializeCanonicalJson(goldenFixture.payload);
      if (canonical.type === 'error') {
        throw new Error(
          `${fixtureFile} payload is not canonical JSON data at ${canonical.error.path}.`,
        );
      }
      const hash = await hasher.hashUtf8(canonical.value);
      expect(hash).toBe(goldenFixture.expectedCanonicalSha256);
      await assertPayloadInvariants(goldenFixture, hasher);
    }
  });

  it('validates every sample integration trace', async () => {
    const ajv = await createContractValidator();
    const validateTrace = ajv.getSchema(TRACE_SCHEMA_ID);
    if (validateTrace === undefined) {
      throw new Error('Trace schema was not registered.');
    }

    const traceFiles = (await readdir(TRACE_ROOT))
      .filter((fileName) => fileName.endsWith('.json'))
      .sort();
    expect(traceFiles.length).toBeGreaterThan(0);

    for (const traceFile of traceFiles) {
      const trace = await readJson(path.join(TRACE_ROOT, traceFile));
      expect(validateTrace(trace), `${traceFile}: ${JSON.stringify(validateTrace.errors)}`).toBe(
        true,
      );
    }
  });

  it('keeps catalog values aligned with their schema enums', async () => {
    const errorSchema = asRecord(
      await readJson(path.join(SCHEMA_ROOT, 'error.schema.json')),
      'error schema',
    );
    const integrationSchema = asRecord(
      await readJson(path.join(SCHEMA_ROOT, 'integration.schema.json')),
      'integration schema',
    );
    const semanticEditSchema = asRecord(
      await readJson(path.join(SCHEMA_ROOT, 'semantic-edit.schema.json')),
      'semantic edit schema',
    );
    const errorCatalog = asRecord(
      await readJson(path.join(CONTRACT_ROOT, 'error-codes.json')),
      'error catalog',
    );
    const capabilityCatalog = asRecord(
      await readJson(path.join(CONTRACT_ROOT, 'capability-matrix.json')),
      'capability catalog',
    );
    const semanticEditCatalog = asRecord(
      await readJson(path.join(CONTRACT_ROOT, 'semantic-edits.json')),
      'semantic edit catalog',
    );

    const errorCodes = readDefinitionEnum(errorSchema, 'NirecoErrorCode');
    const capabilities = readDefinitionEnum(integrationSchema, 'IntegrationCapability');
    const semanticEditKinds = readDefinitionEnum(semanticEditSchema, 'SemanticEditKind');

    expect(errorCodes).toEqual(readObjectStringFieldList(errorCatalog, 'errors', 'code'));
    expect(errorCodes).toEqual(NIRECO_ERROR_CODES);
    expect(capabilities).toEqual(
      readObjectStringFieldList(capabilityCatalog, 'capabilities', 'name'),
    );
    expect(capabilities).toEqual(INTEGRATION_CAPABILITIES);
    expect(semanticEditKinds).toEqual(
      readObjectStringFieldList(semanticEditCatalog, 'edits', 'kind'),
    );
    expect(semanticEditKinds).toEqual(SEMANTIC_EDIT_KINDS);
    expect(
      readObjectStringFieldListWhereTrue(semanticEditCatalog, 'edits', 'kind', 'agentAvailable'),
    ).toEqual(MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS);
  });

  it('publishes preview.2 schemas without claiming preview.2 runtime support', async () => {
    const manifest = asRecord(
      await readJson(path.join(CONTRACT_ROOT, 'contract.manifest.json')),
      'contract manifest',
    );
    expect(manifest['contractVersion']).toBe(CURRENT_COMET_CONTRACT_VERSION);

    const compatibility = asRecord(manifest['compatibility'], 'manifest compatibility');
    expect(compatibility).toMatchObject({
      currentContractVersion: CURRENT_COMET_CONTRACT_VERSION,
      previousContractVersion: COMET_CONTRACT_VERSION,
      currentStatus: 'schema-only-no-runtime-conformance-claim',
      previousStatus: 'Gate-0-Mock-and-consumer-evidence-retained',
    });

    const gate1Read = asRecord(manifest['gate1RevisionBoundRead'], 'manifest Gate 1 read contract');
    expect(gate1Read).toMatchObject({
      maturity: 'schema-only',
      runtimeExitCriteriaSatisfied: false,
      readConformanceStatus: 'not-run',
    });
    const services = gate1Read['services'];
    if (!Array.isArray(services)) {
      throw new Error('manifest Gate 1 services is not an array.');
    }
    expect(services.map((value, index) => asRecord(value, `services[${index}]`)['name'])).toEqual(
      GATE_1_READ_SERVICES,
    );
    for (const [index, value] of services.entries()) {
      expect(asRecord(value, `services[${index}]`)).toMatchObject({
        contract: 'defined',
        mock: 'not-implemented',
        real: 'not-implemented',
      });
    }
    expect(asRecord(gate1Read['hardLimits'], 'manifest Gate 1 hard limits')).toMatchObject({
      maxReadNodeIds: GATE_1_READ_HARD_LIMITS.maxReadNodeIds,
      maxScopeIds: GATE_1_READ_HARD_LIMITS.maxScopeIds,
      maxContextDistance: GATE_1_READ_HARD_LIMITS.maxContextDistance,
    });
    expect(asRecord(gate1Read['scopeProfile'], 'manifest Gate 1 Scope profile')).toMatchObject({
      maximumCombinedAllowedIds: GATE_1_READ_HARD_LIMITS.maxScopeIds,
      maximumContextDistance: GATE_1_READ_HARD_LIMITS.maxContextDistance,
    });
    expect(asRecord(manifest['runtimeConformance'], 'manifest runtime conformance')).toMatchObject({
      maximumCometDocumentScopeIdsTotal: GATE_1_READ_HARD_LIMITS.maxScopeIds,
      maximumCometDocumentContextDistance: GATE_1_READ_HARD_LIMITS.maxContextDistance,
    });

    const mockService = asRecord(manifest['mockService'], 'manifest Mock service');
    expect(mockService).toMatchObject({
      implementedContractVersion: COMET_CONTRACT_VERSION,
      currentContractVersionSupported: false,
      compatibilityStatus: 'previous-contract-only',
      supportedOperationsContractVersion: COMET_CONTRACT_VERSION,
    });

    const consumerEvidence = asRecord(
      manifest['independentConsumerEvidence'],
      'manifest consumer evidence',
    );
    expect(consumerEvidence).toMatchObject({
      validatedContractVersion: COMET_CONTRACT_VERSION,
      currentContractVersionValidated: false,
      status: 'previous-contract-compatibility-evidence-only',
    });

    const schemas = manifest['schemas'];
    if (!Array.isArray(schemas)) {
      throw new Error('manifest schemas is not an array.');
    }
    for (const [index, value] of schemas.entries()) {
      const schema = asRecord(value, `schemas[${index}]`);
      expect(schema['id']).toContain(`/comet-integration/${CURRENT_COMET_CONTRACT_VERSION}/`);
    }
  });

  it('keeps every specialized PageResult satisfiable, closed, and success-only', async () => {
    const ajv = await createContractValidator();
    const revisionId = '018f0000-0000-7000-8000-000000000001';
    const nodeId = '018f0000-0000-7000-8000-000000000101';
    const document = {
      uri: 'nireco://workspace-01/document/DocCaseA',
      revisionId,
    };
    const basePage = {
      document,
      basedOnRevisionId: revisionId,
      consistency: 'exact',
      status: 'current',
      items: [],
      truncated: false,
      approximateBytes: 128,
    } as const;
    const cases = [
      ['GetDocumentOutlineResult', basePage],
      ['ReadDocumentNodesResult', basePage],
      ['SearchDocumentResult', basePage],
      ['GetDocumentDiagnosticsResult', basePage],
      ['ReadDocumentNodeNeighborhoodResult', { ...basePage, centerNodeId: nodeId }],
      ['GetDocumentChangesSinceResult', { ...basePage, fromRevisionId: revisionId }],
    ] as const;

    for (const [definitionName, validPage] of cases) {
      const validate = requireDefinition(ajv, INTEGRATION_SCHEMA_ID, definitionName);
      expect(validate(validPage), `${definitionName}: ${JSON.stringify(validate.errors)}`).toBe(
        true,
      );
      expect(validate({ ...validPage, status: 'stale' }), definitionName).toBe(true);
      expect(validate({ ...validPage, status: 'computing' }), definitionName).toBe(false);
      expect(validate({ ...validPage, status: 'failed' }), definitionName).toBe(false);
      expect(validate({ ...validPage, unknownField: true }), definitionName).toBe(false);
      expect(validate({ ...validPage, truncated: true }), definitionName).toBe(false);
      expect(validate({ ...validPage, nextCursor: 'AQ' }), definitionName).toBe(false);
      expect(
        validate({ ...validPage, truncated: true, nextCursor: 'AQ' }),
        `${definitionName}: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }

    const validateOutline = requireDefinition(
      ajv,
      INTEGRATION_SCHEMA_ID,
      'GetDocumentOutlineResult',
    );
    expect(
      validateOutline({
        ...basePage,
        items: [
          {
            nodeId,
            nodeType: 'section',
            depth: 1,
            title: 'Introduction',
            authorizedChildCount: 1_001,
            nodeHash: `sha256:${'0'.repeat(64)}`,
          },
        ],
      }),
      JSON.stringify(validateOutline.errors),
    ).toBe(true);

    const nodeHash = `sha256:${'0'.repeat(64)}`;
    const readableNode = {
      nodeId,
      nodeType: 'paragraph',
      attrs: { alignment: 'start' },
      childIds: [],
      nodeHash,
    } as const;
    const validateNodes = requireDefinition(ajv, INTEGRATION_SCHEMA_ID, 'ReadDocumentNodesResult');
    expect(
      validateNodes({ ...basePage, items: [readableNode] }),
      JSON.stringify(validateNodes.errors),
    ).toBe(true);
    expect(validateNodes({ ...basePage, items: [{ ...readableNode, children: [] }] })).toBe(false);
    expect(
      validateNodes({
        ...basePage,
        items: [
          {
            nodeId,
            nodeType: 'paragraph',
            attrs: { alignment: 'start' },
            childIds: [],
          },
        ],
      }),
      JSON.stringify(validateNodes.errors),
    ).toBe(true);
    const manyChildIds = Array.from(
      { length: 1_001 },
      (_, index) => `018f0000-0000-7000-8002-${index.toString(16).padStart(12, '0')}`,
    );
    expect(
      validateNodes({
        ...basePage,
        items: [
          {
            ...readableNode,
            parentNodeId: '018f0000-0000-7000-8000-000000000102',
            authorizedChildIndex: 1_000,
            childIds: manyChildIds,
          },
        ],
      }),
      JSON.stringify(validateNodes.errors),
    ).toBe(true);
    const readableTextNode = {
      nodeId,
      nodeType: 'text',
      text: 'Nireco',
      marks: [],
      childIds: [],
      nodeHash,
    } as const;
    expect(
      validateNodes({ ...basePage, items: [readableTextNode] }),
      JSON.stringify(validateNodes.errors),
    ).toBe(true);
    expect(validateNodes({ ...basePage, items: [{ ...readableTextNode, attrs: {} }] })).toBe(false);

    const validateSearch = requireDefinition(ajv, INTEGRATION_SCHEMA_ID, 'SearchDocumentResult');
    expect(
      validateSearch({
        ...basePage,
        items: [
          {
            kind: 'text',
            target: { kind: 'node', nodeId },
            match: 'substring',
            snippet: 'Nireco',
          },
        ],
      }),
      JSON.stringify(validateSearch.errors),
    ).toBe(true);
    expect(
      validateSearch({
        ...basePage,
        items: [
          {
            kind: 'text',
            target: { kind: 'range', utf16Offset: 1 },
            match: 'substring',
            snippet: 'Nireco',
          },
        ],
      }),
    ).toBe(false);
  });

  it('caps each Scope ID array at 1000 while the aggregate cap remains a runtime invariant', async () => {
    const ajv = await createContractValidator();
    const validate = requireDefinition(ajv, INTEGRATION_SCHEMA_ID, 'CometDocumentScope');
    const ids = Array.from(
      { length: GATE_1_READ_HARD_LIMITS.maxScopeIds + 1 },
      (_, index) => `018f0000-0000-7000-8003-${index.toString(16).padStart(12, '0')}`,
    );
    expect(validate({ allowedNodeIds: ids.slice(0, -1) }), JSON.stringify(validate.errors)).toBe(
      true,
    );
    expect(validate({ allowedNodeIds: ids })).toBe(false);
    expect(validate({ allowedSectionIds: ids })).toBe(false);
    expect(
      validate({ maxContextDistance: GATE_1_READ_HARD_LIMITS.maxContextDistance }),
      JSON.stringify(validate.errors),
    ).toBe(true);
    expect(validate({ maxContextDistance: GATE_1_READ_HARD_LIMITS.maxContextDistance + 1 })).toBe(
      false,
    );
  });

  it('allows fixed ResourceRef and Session Snapshot reads to report stale', async () => {
    const ajv = await createContractValidator();
    const fixture = asRecord(
      await readJson(path.join(FIXTURE_ROOT, 'minimal-manuscript.json')),
      'minimal manuscript fixture',
    );
    const snapshot = asRecord(fixture['payload'], 'minimal manuscript payload');
    const revisionId = snapshot['revisionId'];
    if (typeof revisionId !== 'string') {
      throw new Error('minimal manuscript revisionId is not a string.');
    }
    const document = {
      uri: 'nireco://workspace-01/document/DocCaseA',
      revisionId,
    };
    const resolveResult = {
      document,
      basedOnRevisionId: revisionId,
      consistency: 'exact',
      status: 'stale',
    };
    const validateResolve = requireDefinition(ajv, INTEGRATION_SCHEMA_ID, 'ResolveModelResult');
    expect(validateResolve(resolveResult), JSON.stringify(validateResolve.errors)).toBe(true);
    expect(validateResolve({ ...resolveResult, status: 'current' })).toBe(true);
    expect(validateResolve({ ...resolveResult, status: 'computing' })).toBe(false);
    expect(validateResolve({ ...resolveResult, status: 'failed' })).toBe(false);

    const result = {
      document,
      basedOnRevisionId: revisionId,
      consistency: 'exact',
      status: 'stale',
      snapshot,
    };
    const validate = requireDefinition(ajv, INTEGRATION_SCHEMA_ID, 'GetDocumentSnapshotResult');
    expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...result, status: 'current' })).toBe(true);
    expect(validate({ ...result, status: 'computing' })).toBe(false);
    expect(validate({ ...result, status: 'failed' })).toBe(false);
  });

  it('rejects non-canonical document URI spellings', async () => {
    const ajv = await createContractValidator();
    const validateDocumentRef = ajv.getSchema(`${RESOURCE_REF_SCHEMA_ID}#/$defs/DocumentRef`);
    if (validateDocumentRef === undefined) {
      throw new Error('DocumentRef schema was not registered.');
    }

    const revisionId = '018f0000-0000-7000-8000-000000000001';
    for (const uri of [
      'NIRECO://workspace-01/document/doc-1',
      'nireco://Workspace-01/document/doc-1',
      'nireco://workspace-01/document/%64oc-1',
      'nireco://workspace-01/document/./doc-1',
      'nireco://workspace-01/document/doc-1/',
    ]) {
      expect(validateDocumentRef({ uri, revisionId }), uri).toBe(false);
    }
  });

  it('enforces ordered manuscript child grammar and list attributes', async () => {
    const ajv = await createContractValidator();
    const validateSection = requireDefinition(ajv, MANUSCRIPT_SCHEMA_ID, 'SectionNode');
    const validateTableCell = requireDefinition(ajv, MANUSCRIPT_SCHEMA_ID, 'TableCellNode');
    const validateListItem = requireDefinition(ajv, MANUSCRIPT_SCHEMA_ID, 'ListItemNode');
    const validateList = requireDefinition(ajv, MANUSCRIPT_SCHEMA_ID, 'ListNode');
    const validateBibliography = requireDefinition(
      ajv,
      MANUSCRIPT_SCHEMA_ID,
      'BibliographyPlaceholderNode',
    );

    const paragraph = {
      id: '018f0000-0000-7000-8000-000000000201',
      type: 'paragraph',
      attrs: {
        alignment: 'start',
      },
      children: [],
    };
    const heading = {
      id: '018f0000-0000-7000-8000-000000000202',
      type: 'heading',
      attrs: {
        level: 1,
      },
      children: [],
    };
    const codeBlock = {
      id: '018f0000-0000-7000-8000-000000000203',
      type: 'codeBlock',
      attrs: {},
      children: [],
    };

    expect(
      validateSection({
        id: '018f0000-0000-7000-8000-000000000204',
        type: 'section',
        attrs: {
          level: 1,
        },
        children: [paragraph, heading],
      }),
    ).toBe(false);
    expect(
      validateTableCell({
        id: '018f0000-0000-7000-8000-000000000205',
        type: 'tableCell',
        attrs: {},
        children: [codeBlock],
      }),
    ).toBe(false);
    expect(
      validateListItem({
        id: '018f0000-0000-7000-8000-000000000206',
        type: 'listItem',
        attrs: {},
        children: [codeBlock],
      }),
    ).toBe(false);
    expect(
      validateList({
        id: '018f0000-0000-7000-8000-000000000207',
        type: 'list',
        attrs: {
          ordered: false,
          start: 1,
        },
        children: [
          {
            id: '018f0000-0000-7000-8000-000000000208',
            type: 'listItem',
            attrs: {},
            children: [paragraph],
          },
        ],
      }),
    ).toBe(false);
    expect(
      validateBibliography({
        id: '018f0000-0000-7000-8000-000000000209',
        type: 'bibliographyPlaceholder',
        attrs: {},
      }),
    ).toBe(false);
  });
});

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
  addCanonicalResourceUriFormats(ajv);

  const schemaFiles = (await readdir(SCHEMA_ROOT))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();
  for (const schemaFile of schemaFiles) {
    const schema = await readJson(path.join(SCHEMA_ROOT, schemaFile));
    ajv.addSchema(schema as AnySchema);
  }
  return ajv;
}

function addCanonicalResourceUriFormats(ajv: Ajv2020): void {
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
}

function requireDefinition(
  ajv: Ajv2020,
  schemaId: string,
  definitionName: string,
): ValidateFunction {
  const validate = ajv.getSchema(`${schemaId}#/$defs/${definitionName}`);
  if (validate === undefined) {
    throw new Error(`${definitionName} schema was not registered.`);
  }
  return validate;
}

async function readJson(filePath: string): Promise<unknown> {
  const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  return parsed;
}

function parseGoldenFixture(value: unknown, fileName: string): GoldenFixture {
  if (value === null || typeof value !== 'object') {
    throw new Error(`${fileName} is not an object.`);
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record['name'] !== 'string' ||
    typeof record['payloadSchemaId'] !== 'string' ||
    typeof record['expectedCanonicalSha256'] !== 'string' ||
    !Object.hasOwn(record, 'payload')
  ) {
    throw new Error(`${fileName} is missing golden fixture fields.`);
  }

  return {
    name: record['name'],
    payloadSchemaId: record['payloadSchemaId'],
    expectedCanonicalSha256: record['expectedCanonicalSha256'],
    payload: record['payload'],
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function readDefinitionEnum(
  schema: Record<string, unknown>,
  definitionName: string,
): readonly string[] {
  const definitions = asRecord(schema['$defs'], 'schema definitions');
  const definition = asRecord(definitions[definitionName], definitionName);
  return readStringArray(definition['enum'], `${definitionName} enum`);
}

function readObjectStringFieldList(
  catalog: Record<string, unknown>,
  listField: string,
  valueField: string,
): readonly string[] {
  const values = catalog[listField];
  if (!Array.isArray(values)) {
    throw new Error(`${listField} is not an array.`);
  }

  return values.map((value, index) => {
    const entry = asRecord(value, `${listField}[${index}]`);
    const fieldValue = entry[valueField];
    if (typeof fieldValue !== 'string') {
      throw new Error(`${listField}[${index}].${valueField} is not a string.`);
    }
    return fieldValue;
  });
}

function readStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} is not a string array.`);
  }
  return value;
}

async function assertPayloadInvariants(
  fixture: GoldenFixture,
  hasher: Sha256ContentHasher,
): Promise<void> {
  if (fixture.payloadSchemaId.endsWith('/manuscript.schema.json')) {
    const snapshot = fixture.payload as DocumentSnapshot;
    const documentHash = await hashCanonicalJson(
      hasher,
      HASH_DOMAINS.documentContent,
      createDocumentHashPayload(snapshot),
    );
    if (documentHash.type === 'error') {
      throw new Error(`${fixture.name} has a non-canonical document hash payload.`);
    }
    expect(documentHash.hash).toBe(snapshot.documentHash);
  }

  if (fixture.payloadSchemaId.endsWith('/semantic-diff.schema.json')) {
    const diff = fixture.payload as SemanticDiff;
    expect(diff.generatedAgainstRevisionId).toBe(diff.document.revisionId);

    for (const group of diff.groups) {
      const derived = deriveProposalChangeGroupId({
        documentUri: diff.document.uri,
        generatedAgainstRevisionId: diff.generatedAgainstRevisionId,
        proposalId: diff.proposalId,
        proposalRevision: diff.proposalRevision,
        kind: group.kind,
        targetRefs: group.targetRefs,
        operationIds: group.operationIds,
      });
      expect(derived.type, `${fixture.name}:${group.id}`).toBe('ok');
      if (derived.type === 'ok') {
        expect(derived.id, `${fixture.name}:${group.id}`).toBe(group.id);
      }
    }

    const canonicalOrder = canonicalizeProposalChangeGroupOrder(diff.groups);
    expect(canonicalOrder.type, `${fixture.name}: canonical group order`).toBe('ok');
    if (canonicalOrder.type === 'ok') {
      expect(canonicalOrder.groups.map(({ id }) => id)).toEqual(diff.groups.map(({ id }) => id));
    }
  }
}

function readObjectStringFieldListWhereTrue(
  catalog: Record<string, unknown>,
  listField: string,
  valueField: string,
  predicateField: string,
): readonly string[] {
  const values = catalog[listField];
  if (!Array.isArray(values)) {
    throw new Error(`${listField} is not an array.`);
  }

  return values.flatMap((value, index) => {
    const entry = asRecord(value, `${listField}[${index}]`);
    if (entry[predicateField] !== true) {
      return [];
    }
    const fieldValue = entry[valueField];
    if (typeof fieldValue !== 'string') {
      throw new Error(`${listField}[${index}].${valueField} is not a string.`);
    }
    return [fieldValue];
  });
}
