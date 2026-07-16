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
  'https://contracts.nireco.dev/comet-integration/0.4-preview.1/schemas/golden-fixture.schema.json';
const TRACE_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.1/schemas/trace.schema.json';
const RESOURCE_REF_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.1/schemas/resource-ref.schema.json';
const MANUSCRIPT_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.1/schemas/manuscript.schema.json';

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
