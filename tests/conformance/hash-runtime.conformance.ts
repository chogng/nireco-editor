import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Ajv2020, type AnySchema } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  HASH_DOMAINS,
  HASH_PREIMAGE_PROFILE,
  createCanonicalHashPreimage,
  type HashDomain,
} from '../../src/base/hashing/hash-preimage.js';
import {
  PortableSha256ContentHasher,
  encodeUtf8,
} from '../../src/base/hashing/portable-sha-256.js';
import { Sha256ContentHasher } from '../../src/platform/node/sha-256-content-hasher.js';
import { parseIsoTimestamp } from '../../src/base/time/clock.js';
import {
  canonicalizeResourceUri,
  isCanonicalResourceUri,
} from '../../src/base/uri/resource-uri.js';

const VECTOR_PATH = 'contracts/comet-integration/fixtures/hash-preimages.json';
const SCHEMA_ROOT = 'contracts/comet-integration/schemas';
const COMMON_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/common.schema.json';
const CONTRACT_SCHEMA_BASE =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/';
const PAYLOAD_SCHEMA_BY_DOMAIN: Readonly<Record<HashDomain, string>> = {
  [HASH_DOMAINS.academicEntity]: `${CONTRACT_SCHEMA_BASE}operation.schema.json#/$defs/AcademicEntity`,
  [HASH_DOMAINS.documentContent]: `${CONTRACT_SCHEMA_BASE}manuscript.schema.json#/$defs/DocumentHashPayload`,
  [HASH_DOMAINS.governanceManifest]: `${CONTRACT_SCHEMA_BASE}common.schema.json#/$defs/GovernanceManifestHashPayload`,
  [HASH_DOMAINS.node]: `${CONTRACT_SCHEMA_BASE}manuscript.schema.json#/$defs/ParagraphNode`,
  [HASH_DOMAINS.proposalChangeGroup]: `${CONTRACT_SCHEMA_BASE}semantic-diff.schema.json#/$defs/ProposalChangeGroupIdentityPayload`,
  [HASH_DOMAINS.semanticDiff]: `${CONTRACT_SCHEMA_BASE}semantic-diff.schema.json`,
  [HASH_DOMAINS.transaction]: `${CONTRACT_SCHEMA_BASE}transaction.schema.json`,
};

interface HashVector {
  readonly name: string;
  readonly domain: HashDomain;
  readonly payloadSchemaId: string;
  readonly payload: unknown;
  readonly canonicalJson: string;
  readonly preimageUtf8Hex: string;
  readonly expectedHash: string;
}

interface HashVectorSet {
  readonly profile: string;
  readonly preimageFormula: string;
  readonly vectors: readonly HashVector[];
}

describe('Node/browser-portable hash conformance', () => {
  it('validates and matches every exact byte-level hash vector', async () => {
    const ajv = await createContractValidator();
    const vectorSet = parseVectorSet(JSON.parse(await readFile(VECTOR_PATH, 'utf8')));
    const validate = ajv.getSchema(`${COMMON_SCHEMA_ID}#/$defs/HashConformanceVectorSet`);
    if (validate === undefined) {
      throw new Error('HashConformanceVectorSet schema was not registered.');
    }
    expect(validate(vectorSet), JSON.stringify(validate.errors)).toBe(true);
    expect(vectorSet.profile).toBe(HASH_PREIMAGE_PROFILE);
    expect(vectorSet.vectors).toHaveLength(Object.values(HASH_DOMAINS).length);
    expect(new Set(vectorSet.vectors.map(({ domain }) => domain))).toEqual(
      new Set(Object.values(HASH_DOMAINS)),
    );

    const portableHasher = new PortableSha256ContentHasher();
    const nodeHasher = new Sha256ContentHasher();
    for (const vector of vectorSet.vectors) {
      expect(vector.payloadSchemaId, vector.name).toBe(PAYLOAD_SCHEMA_BY_DOMAIN[vector.domain]);
      const validatePayload = ajv.getSchema(vector.payloadSchemaId);
      if (validatePayload === undefined) {
        throw new Error(`${vector.name} references an unregistered payload schema.`);
      }
      expect(
        validatePayload(vector.payload),
        `${vector.name}: ${JSON.stringify(validatePayload.errors)}`,
      ).toBe(true);

      const created = createCanonicalHashPreimage(vector.domain, vector.payload);
      expect(created.type, vector.name).toBe('ok');
      if (created.type === 'error') {
        continue;
      }

      expect(created.canonicalJson, vector.name).toBe(vector.canonicalJson);
      expect(bytesToHex(encodeUtf8(created.preimage)), vector.name).toBe(vector.preimageUtf8Hex);
      expect(await portableHasher.hashUtf8(created.preimage), vector.name).toBe(
        vector.expectedHash,
      );
      expect(await nodeHasher.hashUtf8(created.preimage), vector.name).toBe(vector.expectedHash);
      assertDomainSpecificInvariants(vector);
    }
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
    const schema: unknown = JSON.parse(await readFile(path.join(SCHEMA_ROOT, schemaFile), 'utf8'));
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

function parseVectorSet(value: unknown): HashVectorSet {
  if (value === null || typeof value !== 'object') {
    throw new Error('Hash vector fixture must be an object.');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record['profile'] !== 'string' ||
    typeof record['preimageFormula'] !== 'string' ||
    !Array.isArray(record['vectors'])
  ) {
    throw new Error('Hash vector fixture header is invalid.');
  }
  return {
    profile: record['profile'],
    preimageFormula: record['preimageFormula'],
    vectors: record['vectors'].map(parseVector),
  };
}

function parseVector(value: unknown): HashVector {
  if (value === null || typeof value !== 'object') {
    throw new Error('Hash vector must be an object.');
  }
  const record = value as Record<string, unknown>;
  const domain = record['domain'];
  if (
    typeof record['name'] !== 'string' ||
    !isHashDomain(domain) ||
    typeof record['payloadSchemaId'] !== 'string' ||
    typeof record['canonicalJson'] !== 'string' ||
    typeof record['preimageUtf8Hex'] !== 'string' ||
    typeof record['expectedHash'] !== 'string' ||
    !Object.hasOwn(record, 'payload')
  ) {
    throw new Error('Hash vector fields are invalid.');
  }
  return {
    name: record['name'],
    domain,
    payloadSchemaId: record['payloadSchemaId'],
    payload: record['payload'],
    canonicalJson: record['canonicalJson'],
    preimageUtf8Hex: record['preimageUtf8Hex'],
    expectedHash: record['expectedHash'],
  };
}

function isHashDomain(value: unknown): value is HashDomain {
  return (
    typeof value === 'string' && (Object.values(HASH_DOMAINS) as readonly string[]).includes(value)
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function assertDomainSpecificInvariants(vector: HashVector): void {
  if (vector.domain !== HASH_DOMAINS.governanceManifest) {
    return;
  }
  if (vector.payload === null || typeof vector.payload !== 'object') {
    throw new Error('Governance manifest hash payload must be an object.');
  }
  const files = (vector.payload as Record<string, unknown>)['files'];
  if (!Array.isArray(files)) {
    throw new Error('Governance manifest hash payload files must be an array.');
  }
  const paths = files.map(readGovernanceManifestPath);
  expect(paths).toEqual([...paths].sort(compareUnicodeCodePoints));
}

function readGovernanceManifestPath(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    throw new Error('Governance manifest file entry must be an object.');
  }
  const filePath = (value as Record<string, unknown>)['path'];
  if (typeof filePath !== 'string') {
    throw new Error('Governance manifest file path must be a string.');
  }
  return filePath;
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return leftPoints.length - rightPoints.length;
}
