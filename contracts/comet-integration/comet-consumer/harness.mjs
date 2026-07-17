import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  InMemoryModelRegistry,
  canonicalizeResourceUri,
  isCanonicalResourceUri,
} from '@comet-internal/nireco-editor';
import {
  COMET_CONTRACT_VERSION,
  MockCometIntegrationService,
} from '@comet-internal/nireco-editor/comet-internal';

const consumerRoot = path.dirname(fileURLToPath(import.meta.url));
const contractRoot = path.resolve(consumerRoot, '..');
const currentBundleContractVersion = '0.4-preview.2';
const previousRuntimeContractVersion = '0.4-preview.1';
const integrationSchemaId =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/integration.schema.json';

export async function runConsumerHarness() {
  assert.match(
    import.meta.resolve('@comet-internal/nireco-editor'),
    /\/dist\/entrypoints\/main\.js$/u,
  );
  assert.match(
    import.meta.resolve('@comet-internal/nireco-editor/comet-internal'),
    /\/dist\/entrypoints\/comet-internal\.js$/u,
  );

  const manifest = await readJson(path.join(contractRoot, 'contract.manifest.json'));
  const fixture = await readJson(path.join(contractRoot, 'fixtures/minimal-manuscript.json'));
  const snapshot = requireRecord(fixture, 'minimal manuscript fixture')['payload'];
  assert.ok(snapshot !== undefined, 'Fixture payload must exist.');

  const ids = new ConsumerIdAllocator();
  const registry = new InMemoryModelRegistry({ ids });
  const uriResult = canonicalizeResourceUri('nireco://workspace-01/document/comet-consumer');
  assert.equal(uriResult.type, 'valid');
  if (uriResult.type !== 'valid') {
    throw new Error('Expected the consumer document URI to be canonical.');
  }
  const documentUri = uriResult.value;

  const createdModel = await registry.create({
    uri: documentUri,
    snapshot,
  });
  assert.equal(createdModel.type, 'ok');

  const service = new MockCometIntegrationService({
    models: registry,
    ids,
    clock: {
      now: () => '2026-07-20T00:00:00Z',
    },
    sessionExpiresAt: '2026-07-20T01:00:00Z',
    nirecoBuildId: 'nireco-consumer-evidence',
  });
  const validator = await createContractValidator(manifest);

  const handshakeRequest = {
    requestedContractVersion: COMET_CONTRACT_VERSION,
    cometBuildId: 'comet-independent-consumer',
    adapterVersion: 'consumer-harness-1',
    workflowId: 'workflow-consumer-1',
    requiredCapabilities: ['document.content.read', 'proposal.create', 'proposal.edit'],
    requiredSemanticEdits: ['insert-block'],
    requiredTransportFeatures: ['in-process', 'idempotency'],
  };
  assertDefinitionValid(validator, 'CometIntegrationHandshakeRequest', handshakeRequest);
  const handshake = requireOk(service.handshake(handshakeRequest), 'integration handshake');
  assertDefinitionValid(validator, 'CometIntegrationHandshakeResult', handshake);
  assert.equal(handshake.acceptedContractVersion, previousRuntimeContractVersion);

  const target = {
    uri: documentUri,
    revisionId: requireString(
      requireRecord(snapshot, 'fixture payload')['revisionId'],
      'fixture revisionId',
    ),
  };
  const manuscriptRoot = requireRecord(
    requireRecord(snapshot, 'fixture payload')['root'],
    'fixture manuscript root',
  );
  const bodyNode = findNodeByType(manuscriptRoot, 'body');
  const paragraphNode = findNodeByType(bodyNode, 'paragraph');
  const sessionRequest = {
    contractVersion: COMET_CONTRACT_VERSION,
    target,
    taskId: 'task-consumer-1',
    traceId: 'trace-consumer-1',
    actor: {
      type: 'comet-agent',
      id: 'agent-consumer-1',
      workflowId: 'workflow-consumer-1',
      modelRef: 'consumer-model',
    },
    requestedCapabilities: ['document.content.read', 'proposal.create', 'proposal.edit'],
    scope: {},
    constraints: {
      requireEvidenceForCitation: true,
      requireVerifiedEvidence: true,
      allowMetadataOnlyCitation: false,
      allowDelete: false,
      allowStructureMove: false,
    },
    policySnapshotId: 'policy-consumer-1',
  };
  assertDefinitionValid(validator, 'OpenCometSessionRequest', sessionRequest);
  const session = requireOk(service.openSession(sessionRequest), 'task-bound session');
  assertDefinitionValid(validator, 'OpenCometSessionResult', session);

  const snapshotRequest = {
    sessionId: session.sessionId,
    document: session.target,
  };
  assertDefinitionValid(validator, 'GetSnapshotRequest', snapshotRequest);
  const snapshotResult = requireOk(
    service.readSnapshot(snapshotRequest),
    'fixed-Revision snapshot read',
  );
  assertDefinitionValid(validator, 'GetSnapshotResult', snapshotResult);
  assert.equal(snapshotResult.document.revisionId, target.revisionId);
  assert.equal(snapshotResult.snapshot.revisionId, target.revisionId);

  const createRequest = {
    sessionId: session.sessionId,
    target: session.target,
    idempotencyKey: 'consumer-create-1',
  };
  assertDefinitionValid(validator, 'CreateProposalRequest', createRequest);
  const createResult = requireOk(service.createProposal(createRequest), 'draft Proposal creation');
  assertDefinitionValid(validator, 'CreateProposalResult', createResult);
  assert.equal(createResult.proposal.proposalRevision, 1);
  assert.equal(createResult.proposal.status, 'draft');

  const stageRequest = {
    sessionId: session.sessionId,
    proposal: {
      proposalId: createResult.proposal.id,
      expectedProposalRevision: createResult.proposal.proposalRevision,
    },
    semanticEdits: [
      {
        kind: 'insert-block',
        clientRef: 'consumer-edit-1',
        target: {
          parentNodeId: requireString(bodyNode['id'], 'fixture body node id'),
          afterNodeId: requireString(paragraphNode['id'], 'fixture paragraph node id'),
        },
        block: {
          clientRef: 'consumer-paragraph-1',
          type: 'paragraph',
          attrs: {
            alignment: 'start',
          },
          children: [
            {
              clientRef: 'consumer-text-1',
              type: 'text',
              value: 'Independent Comet consumer evidence.',
              marks: [],
            },
          ],
        },
        rationale: 'Prove the Proposal-only public integration path.',
      },
    ],
    idempotencyKey: 'consumer-stage-1',
  };
  assertDefinitionValid(validator, 'StageSemanticEditsRequest', stageRequest);
  const stageResult = requireOk(service.stageSemanticEdits(stageRequest), 'Semantic Edit staging');
  assertDefinitionValid(validator, 'StageSemanticEditsResult', stageResult);
  assert.equal(stageResult.proposal.proposalRevision, 2);
  assert.equal(stageResult.proposal.semanticEdits.length, 1);

  const publicMethods = Object.getOwnPropertyNames(MockCometIntegrationService.prototype)
    .filter((method) => method !== 'constructor')
    .sort();
  assert.deepEqual(publicMethods, [
    'createProposal',
    'handshake',
    'openSession',
    'readSnapshot',
    'stageSemanticEdits',
  ]);
  assert.equal(handshake.featureFlags.rawTransaction, false);
  assert.equal(handshake.featureFlags.reviewCommit, false);

  const manifestRecord = requireRecord(manifest, 'contract manifest');
  assert.equal(COMET_CONTRACT_VERSION, previousRuntimeContractVersion);
  assert.equal(manifestRecord['contractVersion'], currentBundleContractVersion);
  const compatibility = requireRecord(
    manifestRecord['compatibility'],
    'contract manifest compatibility',
  );
  assert.equal(compatibility['currentContractVersion'], currentBundleContractVersion);
  assert.equal(compatibility['previousContractVersion'], previousRuntimeContractVersion);
  assert.equal(compatibility['currentStatus'], 'schema-only-no-runtime-conformance-claim');
  const gate1Read = requireRecord(
    manifestRecord['gate1RevisionBoundRead'],
    'contract manifest Gate 1 read contract',
  );
  assert.equal(gate1Read['maturity'], 'schema-only');
  assert.equal(gate1Read['runtimeExitCriteriaSatisfied'], false);
  assert.equal(gate1Read['readConformanceStatus'], 'not-run');
  const gate1Services = requireArray(gate1Read['services'], 'contract manifest Gate 1 services');
  assert.equal(gate1Services.length, 9);
  for (const [index, serviceEntry] of gate1Services.entries()) {
    const serviceRecord = requireRecord(serviceEntry, `Gate 1 service ${index}`);
    assert.equal(serviceRecord['contract'], 'defined');
    assert.equal(serviceRecord['mock'], 'not-implemented');
    assert.equal(serviceRecord['real'], 'not-implemented');
  }
  const mockService = requireRecord(
    manifestRecord['mockService'],
    'contract manifest Mock service',
  );
  assert.equal(mockService['implementedContractVersion'], previousRuntimeContractVersion);
  assert.equal(mockService['currentContractVersionSupported'], false);
  assert.equal(mockService['compatibilityStatus'], 'previous-contract-only');
  const consumerEvidence = requireRecord(
    manifestRecord['independentConsumerEvidence'],
    'contract manifest independentConsumerEvidence',
  );
  assert.equal(consumerEvidence['verificationCommand'], 'pnpm contract:consumer');
  assert.equal(consumerEvidence['privateSourceImportsAllowed'], false);
  assert.equal(consumerEvidence['validatedContractVersion'], previousRuntimeContractVersion);
  assert.equal(consumerEvidence['currentContractVersionValidated'], false);
  assert.equal(consumerEvidence['status'], 'previous-contract-compatibility-evidence-only');
  assert.deepEqual(consumerEvidence['packageExports'], [
    '@comet-internal/nireco-editor',
    '@comet-internal/nireco-editor/protocol',
    '@comet-internal/nireco-editor/comet-internal',
  ]);
  const agentSafety = requireRecord(manifestRecord['agentSafety'], 'contract manifest agentSafety');
  assert.equal(agentSafety['rawTransactionAllowed'], false);
  assert.equal(agentSafety['reviewAcceptanceAllowed'], false);
  assert.equal(agentSafety['mainlineCommitAllowed'], false);

  return {
    evidenceVersion: 1,
    contractVersion: COMET_CONTRACT_VERSION,
    bundleContractVersion: manifestRecord['contractVersion'],
    compatibility: {
      currentContractVersion: compatibility['currentContractVersion'],
      previousContractVersion: compatibility['previousContractVersion'],
      currentStatus: compatibility['currentStatus'],
      currentRuntimeExitCriteriaSatisfied: gate1Read['runtimeExitCriteriaSatisfied'],
      currentMockSupported: mockService['currentContractVersionSupported'],
      currentConsumerValidated: consumerEvidence['currentContractVersionValidated'],
      gate1ReadServiceCount: gate1Services.length,
    },
    consumerBoundary: {
      runtimePackageExport: '@comet-internal/nireco-editor',
      mockPackageExport: '@comet-internal/nireco-editor/comet-internal',
      contractInputs: [
        'contract.manifest.json',
        'schemas/*.schema.json',
        'generated-types/*.d.ts',
        'fixtures/minimal-manuscript.json',
      ],
      privateSourceImports: false,
      manifestEvidenceIndexed: true,
    },
    fixedRevision: {
      requestedRevisionId: target.revisionId,
      returnedDocumentRevisionId: snapshotResult.document.revisionId,
      returnedSnapshotRevisionId: snapshotResult.snapshot.revisionId,
      matched: true,
    },
    proposalFlow: {
      proposalId: createResult.proposal.id,
      createdProposalRevision: createResult.proposal.proposalRevision,
      stagedProposalRevision: stageResult.proposal.proposalRevision,
      stagedSemanticEditCount: stageResult.proposal.semanticEdits.length,
      status: stageResult.proposal.status,
    },
    noBypass: {
      publicMethods,
      rawTransactionFeature: handshake.featureFlags.rawTransaction,
      reviewCommitFeature: handshake.featureFlags.reviewCommit,
      manifestRawTransactionAllowed: agentSafety['rawTransactionAllowed'],
      manifestReviewAcceptanceAllowed: agentSafety['reviewAcceptanceAllowed'],
      manifestMainlineCommitAllowed: agentSafety['mainlineCommitAllowed'],
    },
    checks: [
      'public-package-export-resolution',
      'manifest-evidence-index',
      'current-schema-previous-runtime-matrix',
      'handshake-schema-and-runtime',
      'task-bound-session-schema-and-runtime',
      'fixed-revision-snapshot-read',
      'draft-proposal-create',
      'semantic-edit-stage',
      'no-raw-transaction-or-commit-surface',
    ].map((id) => ({
      id,
      status: 'pass',
    })),
    status: 'pass',
  };
}

async function createContractValidator(manifest) {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: false,
    strict: true,
    strictTuples: false,
    validateFormats: true,
  });
  ajv.addFormat('uri', {
    type: 'string',
    validate: isCanonicalResourceUri,
  });
  ajv.addFormat('date-time', {
    type: 'string',
    validate(value) {
      return value.endsWith('Z') && Number.isFinite(Date.parse(value));
    },
  });
  ajv.addFormat('nireco-canonical-resource-uri', {
    type: 'string',
    validate: isCanonicalResourceUri,
  });
  ajv.addFormat('nireco-logical-resource-uri', {
    type: 'string',
    validate(value) {
      return (
        isCanonicalResourceUri(value) && (value.startsWith('nireco:') || value.startsWith('comet:'))
      );
    },
  });
  ajv.addFormat('nireco-document-uri', {
    type: 'string',
    validate(value) {
      return isCanonicalResourceUri(value) && value.startsWith('nireco:');
    },
  });
  ajv.addFormat('comet-resource-uri', {
    type: 'string',
    validate(value) {
      return isCanonicalResourceUri(value) && value.startsWith('comet:');
    },
  });

  const schemaEntries = requireArray(
    requireRecord(manifest, 'contract manifest')['schemas'],
    'contract manifest schemas',
  );
  for (const entry of schemaEntries) {
    const schemaEntry = requireRecord(entry, 'contract manifest schema entry');
    const schemaPath = requireString(schemaEntry['path'], 'schema path');
    ajv.addSchema(await readJson(path.join(contractRoot, schemaPath)));
  }
  return ajv;
}

function assertDefinitionValid(ajv, definitionName, value) {
  const validate = ajv.getSchema(`${integrationSchemaId}#/$defs/${definitionName}`);
  assert.ok(validate, `Missing integration definition ${definitionName}.`);
  assert.equal(validate(value), true, `${definitionName}: ${JSON.stringify(validate.errors)}`);
}

function requireOk(result, label) {
  assert.equal(
    result.type,
    'ok',
    `${label} failed: ${result.type === 'error' ? result.error.code : 'unknown'}`,
  );
  if (result.type !== 'ok') {
    throw new Error(`${label} did not return an ok result.`);
  }
  return result.value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function requireRecord(value, label) {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object.`,
  );
  return value;
}

function requireArray(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array.`);
  return value;
}

function requireString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string.`);
  return value;
}

function findNodeByType(node, type) {
  const children = requireArray(node['children'], `${String(node['type'])} children`);
  const match = children
    .map((child) => requireRecord(child, `${type} candidate`))
    .find((child) => child['type'] === type);
  assert.ok(match, `Fixture must contain a ${type} node.`);
  return match;
}

class ConsumerIdAllocator {
  #workspace = 0;
  #node = 0;
  #entity = 0;
  #transaction = 0;
  #operation = 0;
  #revision = 0;
  #proposal = 0;
  #group = 0;
  #session = 0;
  #debug = 0;

  allocateWorkspaceId() {
    this.#workspace += 1;
    return allocatedId(50_000 + this.#workspace);
  }

  allocateNodeId() {
    this.#node += 1;
    return allocatedId(100_000 + this.#node);
  }

  allocateEntityId() {
    this.#entity += 1;
    return allocatedId(200_000 + this.#entity);
  }

  allocateTransactionId() {
    this.#transaction += 1;
    return allocatedId(300_000 + this.#transaction);
  }

  allocateOperationId() {
    this.#operation += 1;
    return allocatedId(350_000 + this.#operation);
  }

  allocateRevisionId() {
    this.#revision += 1;
    return allocatedId(400_000 + this.#revision);
  }

  allocateProposalId() {
    this.#proposal += 1;
    return allocatedId(500_000 + this.#proposal);
  }

  allocateProposalChangeGroupId() {
    this.#group += 1;
    return derivedId(600_000 + this.#group);
  }

  allocateSessionId() {
    this.#session += 1;
    return allocatedId(700_000 + this.#session);
  }

  allocateDebugId() {
    this.#debug += 1;
    return allocatedId(800_000 + this.#debug);
  }
}

function allocatedId(sequence) {
  return `018f0000-0000-7000-8000-${String(sequence).padStart(12, '0')}`;
}

function derivedId(sequence) {
  return `018f0000-0000-8000-8000-${String(sequence).padStart(12, '0')}`;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runConsumerHarness(), null, 2));
}
