import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Ajv2020, type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { parseIsoTimestamp } from '../../src/base/time/clock.js';
import {
  canonicalizeResourceUri,
  isCanonicalResourceUri,
} from '../../src/base/uri/resource-uri.js';
import {
  COMET_CONTRACT_VERSION,
  CURRENT_COMET_CONTRACT_VERSION,
  type CreateProposalRequest,
  type OpenCometSessionRequest,
  type StageSemanticEditsRequest,
} from '../../src/integration/comet/contract-types.js';
import { MockCometIntegrationService } from '../../src/integration/comet/mock-service.js';
import type { SemanticEdit } from '../../src/proposal/semantic-edit.js';
import { InMemoryModelRegistry } from '../../src/workspace/in-memory-model-registry.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  FixedClock,
  MINIMAL_FIXTURE_IDS,
  validContentHash,
  validDocumentUri,
  validIsoTimestamp,
  validUtf16Offset,
} from '../test-support/fixtures.js';

const SCHEMA_ROOT = path.resolve('contracts/comet-integration/schemas');
const INTEGRATION_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/integration.schema.json';
const ERROR_SCHEMA_ID =
  'https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/error.schema.json';

describe('Gate 0 mock Comet integration conformance', () => {
  let ids: DeterministicIdAllocator;
  let service: MockCometIntegrationService;
  let registry: InMemoryModelRegistry;
  const uri = validDocumentUri('nireco://workspace-01/document/doc-1');
  const snapshot = createMinimalSnapshot();

  beforeEach(async () => {
    ids = new DeterministicIdAllocator();
    registry = new InMemoryModelRegistry({ ids });
    const created = await registry.create({
      uri,
      snapshot: createMinimalSnapshot(),
    });
    if (created.type === 'error') {
      throw new Error('Expected the conformance model to be created.');
    }
    service = createService(new FixedClock());
  });

  it('supports the contract-shaped handshake, fixed-revision read, and draft proposal flow', () => {
    const handshake = service.handshake({
      requestedContractVersion: COMET_CONTRACT_VERSION,
      cometBuildId: 'comet-test',
      adapterVersion: 'adapter-test',
      workflowId: 'workflow-test',
      requiredCapabilities: ['document.content.read', 'proposal.create', 'proposal.edit'],
      requiredSemanticEdits: ['insert-block'],
      requiredTransportFeatures: ['in-process', 'idempotency'],
    });
    expect(handshake).toMatchObject({
      type: 'ok',
      value: {
        acceptedContractVersion: COMET_CONTRACT_VERSION,
      },
    });
    if (handshake.type === 'error') {
      throw new Error('Expected the handshake to succeed.');
    }
    expect(handshake.value.supportedCapabilities).not.toContain('document.search');
    expect(handshake.value.supportedCapabilities).not.toContain('proposal.validate');
    expect(handshake.value.supportedSemanticEdits).not.toContain('update-metadata');

    const session = service.openSession(createSessionRequest());
    if (session.type === 'error') {
      throw new Error('Expected the mock session to open.');
    }

    const read = service.readSnapshot({
      sessionId: session.value.sessionId,
      document: session.value.target,
    });
    expect(read).toMatchObject({
      type: 'ok',
      value: {
        document: {
          revisionId: snapshot.revisionId,
        },
        snapshot: {
          revisionId: snapshot.revisionId,
        },
      },
    });

    const createRequest: CreateProposalRequest = {
      sessionId: session.value.sessionId,
      target: session.value.target,
      idempotencyKey: 'create-draft-1',
    };
    const created = service.createProposal(createRequest);
    const createReplay = service.createProposal(createRequest);
    expect(created.type).toBe('ok');
    expect(createReplay).toEqual(created);
    if (created.type === 'error') {
      throw new Error('Expected the draft proposal to be created.');
    }
    expect(created.value.proposal).toMatchObject({
      status: 'draft',
      proposalRevision: 1,
      documentUri: uri,
      baseRevisionId: snapshot.revisionId,
      semanticEdits: [],
    });

    const stageRequest: StageSemanticEditsRequest = {
      sessionId: session.value.sessionId,
      proposal: {
        proposalId: created.value.proposal.id,
        expectedProposalRevision: 1,
      },
      semanticEdits: [createInsertBlockEdit('paragraph-client-1')],
      idempotencyKey: 'stage-draft-1',
    };
    const staged = service.stageSemanticEdits(stageRequest);
    const stageReplay = service.stageSemanticEdits(stageRequest);
    expect(staged.type).toBe('ok');
    expect(stageReplay).toEqual(staged);
    if (staged.type === 'error') {
      throw new Error('Expected semantic edits to be staged.');
    }
    expect(staged.value.proposal).toMatchObject({
      proposalRevision: 2,
      status: 'draft',
    });
    expect(staged.value.proposal.semanticEdits).toHaveLength(1);

    expect(service.createProposal(createRequest)).toEqual(created);
    expect(
      service.stageSemanticEdits({
        ...stageRequest,
        semanticEdits: [createInsertBlockEdit('different-input')],
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
      },
    });
  });

  it('validates mock requests and successful results against the integration schemas', async () => {
    const ajv = await createContractValidator();
    const handshakeRequest = {
      requestedContractVersion: COMET_CONTRACT_VERSION,
      cometBuildId: 'comet-test',
      adapterVersion: 'adapter-test',
      workflowId: 'workflow-test',
      requiredCapabilities: ['document.content.read', 'proposal.create', 'proposal.edit'],
      requiredSemanticEdits: ['insert-block'],
      requiredTransportFeatures: ['in-process', 'idempotency'],
    } as const;
    expectDefinitionValid(ajv, 'CometIntegrationHandshakeRequest', handshakeRequest);
    const handshake = service.handshake(handshakeRequest);
    if (handshake.type === 'error') {
      throw new Error('Expected the schema conformance handshake to succeed.');
    }
    expectDefinitionValid(ajv, 'CometIntegrationHandshakeResult', handshake.value);

    const sessionRequest = createSessionRequest();
    expectDefinitionValid(ajv, 'OpenCometSessionRequest', sessionRequest);
    const session = service.openSession(sessionRequest);
    if (session.type === 'error') {
      throw new Error('Expected the schema conformance session to open.');
    }
    expectDefinitionValid(ajv, 'OpenCometSessionResult', session.value);

    const snapshotRequest = {
      sessionId: session.value.sessionId,
      document: session.value.target,
    } as const;
    expectDefinitionValid(ajv, 'GetSnapshotRequest', snapshotRequest);
    const read = service.readSnapshot(snapshotRequest);
    if (read.type === 'error') {
      throw new Error('Expected the schema conformance snapshot read to succeed.');
    }
    expectDefinitionValid(ajv, 'GetSnapshotResult', read.value);

    const createRequest = {
      sessionId: session.value.sessionId,
      target: session.value.target,
      idempotencyKey: 'schema-create-1',
    } as const;
    expectDefinitionValid(ajv, 'CreateProposalRequest', createRequest);
    const created = service.createProposal(createRequest);
    if (created.type === 'error') {
      throw new Error('Expected the schema conformance proposal creation to succeed.');
    }
    expectDefinitionValid(ajv, 'CreateProposalResult', created.value);

    const stageRequest = {
      sessionId: session.value.sessionId,
      proposal: {
        proposalId: created.value.proposal.id,
        expectedProposalRevision: created.value.proposal.proposalRevision,
      },
      semanticEdits: [createInsertBlockEdit('schema-paragraph-client')],
      idempotencyKey: 'schema-stage-1',
    } as const;
    expectDefinitionValid(ajv, 'StageSemanticEditsRequest', stageRequest);
    const staged = service.stageSemanticEdits(stageRequest);
    if (staged.type === 'error') {
      throw new Error('Expected the schema conformance edit staging to succeed.');
    }
    expectDefinitionValid(ajv, 'StageSemanticEditsResult', staged.value);

    const unsupportedTransport = service.handshake({
      ...handshakeRequest,
      requiredTransportFeatures: ['worker'],
    });
    if (unsupportedTransport.type === 'ok') {
      throw new Error('Expected the unsupported transport handshake to fail.');
    }
    expectDefinitionValid(ajv, 'NirecoError', unsupportedTransport.error, ERROR_SCHEMA_ID);
  });

  it('fails closed for unsupported capabilities, edit capabilities, and policy constraints', () => {
    expect(CURRENT_COMET_CONTRACT_VERSION).not.toBe(COMET_CONTRACT_VERSION);
    expect(
      service.handshake({
        requestedContractVersion: CURRENT_COMET_CONTRACT_VERSION,
        cometBuildId: 'comet-test',
        adapterVersion: 'adapter-test',
        workflowId: 'workflow-test',
        requiredCapabilities: [],
        requiredSemanticEdits: [],
        requiredTransportFeatures: [],
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'CONTRACT_VERSION_UNSUPPORTED',
      },
    });

    expect(
      service.handshake({
        requestedContractVersion: '9.0.0',
        cometBuildId: 'comet-test',
        adapterVersion: 'adapter-test',
        workflowId: 'workflow-test',
        requiredCapabilities: [],
        requiredSemanticEdits: [],
        requiredTransportFeatures: [],
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'CONTRACT_VERSION_UNSUPPORTED',
      },
    });

    expect(
      service.handshake({
        requestedContractVersion: COMET_CONTRACT_VERSION,
        cometBuildId: 'comet-test',
        adapterVersion: 'adapter-test',
        workflowId: 'workflow-test',
        requiredCapabilities: ['document.search'],
        requiredSemanticEdits: [],
        requiredTransportFeatures: ['in-process'],
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'CAPABILITY_UNSUPPORTED',
        requiredCapability: 'document.search',
      },
    });

    const session = service.openSession(createSessionRequest(['proposal.create', 'proposal.edit']));
    if (session.type === 'error') {
      throw new Error('Expected the restricted mock session to open.');
    }
    const created = service.createProposal({
      sessionId: session.value.sessionId,
      target: session.value.target,
      idempotencyKey: 'restricted-create',
    });
    if (created.type === 'error') {
      throw new Error('Expected the restricted draft proposal to be created.');
    }

    expect(
      service.stageSemanticEdits({
        sessionId: session.value.sessionId,
        proposal: {
          proposalId: created.value.proposal.id,
          expectedProposalRevision: 1,
        },
        semanticEdits: [createInsertCitationEdit()],
        idempotencyKey: 'restricted-citation',
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'SCOPE_VIOLATION',
        requiredCapability: 'citation.propose',
      },
    });

    expect(
      service.stageSemanticEdits({
        sessionId: session.value.sessionId,
        proposal: {
          proposalId: created.value.proposal.id,
          expectedProposalRevision: 1,
        },
        semanticEdits: [
          {
            kind: 'update-metadata',
            patch: {
              title: 'Unsupported metadata lowering',
            },
            rationale: 'Exercise the fail-closed preview behavior.',
          },
        ],
        idempotencyKey: 'restricted-metadata',
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'SEMANTIC_EDIT_UNSUPPORTED',
      },
    });

    expect(
      service.stageSemanticEdits({
        sessionId: session.value.sessionId,
        proposal: {
          proposalId: created.value.proposal.id,
          expectedProposalRevision: 1,
        },
        semanticEdits: [
          {
            kind: 'delete-block',
            targetNodeId: MINIMAL_FIXTURE_IDS.paragraph,
            expectedContentHash: validContentHash(
              'sha256:1111111111111111111111111111111111111111111111111111111111111111',
            ),
            rationale: 'Exercise delete policy enforcement.',
          },
        ],
        idempotencyKey: 'restricted-delete',
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'POLICY_VIOLATION',
      },
    });

    const citationSession = service.openSession(
      createSessionRequest(['proposal.create', 'citation.propose']),
    );
    if (citationSession.type === 'error') {
      throw new Error('Expected the citation-policy session to open.');
    }
    const citationProposal = service.createProposal({
      sessionId: citationSession.value.sessionId,
      target: citationSession.value.target,
      idempotencyKey: 'citation-create',
    });
    if (citationProposal.type === 'error') {
      throw new Error('Expected the citation-policy proposal to be created.');
    }
    expect(
      service.stageSemanticEdits({
        sessionId: citationSession.value.sessionId,
        proposal: {
          proposalId: citationProposal.value.proposal.id,
          expectedProposalRevision: 1,
        },
        semanticEdits: [createInsertCitationEdit()],
        idempotencyKey: 'citation-without-evidence',
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'EVIDENCE_REQUIRED',
      },
    });
  });

  it('rejects full snapshot reads for scoped sessions and expires sessions at expiresAt', () => {
    const scopedSession = service.openSession({
      ...createSessionRequest(['document.content.read']),
      scope: {
        allowedNodeIds: [snapshot.root.id],
      },
    });
    if (scopedSession.type === 'error') {
      throw new Error('Expected the scoped session to open.');
    }

    expect(
      service.readSnapshot({
        sessionId: scopedSession.value.sessionId,
        document: scopedSession.value.target,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'SCOPE_VIOLATION',
      },
    });

    const expiringService = createService(new FixedClock('2026-07-20T01:00:00Z'));
    const expiredSession = expiringService.openSession(
      createSessionRequest(['document.content.read']),
    );
    if (expiredSession.type === 'error') {
      throw new Error('Expected the expiring session to open.');
    }
    expect(
      expiringService.readSnapshot({
        sessionId: expiredSession.value.sessionId,
        document: expiredSession.value.target,
      }),
    ).toMatchObject({
      type: 'error',
      error: {
        code: 'SESSION_EXPIRED',
        retryable: true,
        suggestedAction: 'retry',
      },
    });
  });

  function createService(clock: FixedClock): MockCometIntegrationService {
    return new MockCometIntegrationService({
      models: registry,
      ids,
      clock,
      sessionExpiresAt: validIsoTimestamp('2026-07-20T01:00:00Z'),
    });
  }

  function createSessionRequest(
    requestedCapabilities: OpenCometSessionRequest['requestedCapabilities'] = [
      'document.content.read',
      'proposal.create',
      'proposal.edit',
    ],
  ): OpenCometSessionRequest {
    return {
      contractVersion: COMET_CONTRACT_VERSION,
      target: {
        uri,
        revisionId: snapshot.revisionId,
      },
      taskId: 'task-1',
      traceId: 'trace-1',
      actor: {
        type: 'comet-agent',
        id: 'agent-1',
        workflowId: 'workflow-1',
        modelRef: 'fake-model',
      },
      requestedCapabilities,
      scope: {},
      constraints: {
        requireEvidenceForCitation: true,
        requireVerifiedEvidence: true,
        allowMetadataOnlyCitation: false,
        allowDelete: false,
        allowStructureMove: false,
      },
      policySnapshotId: 'policy-1',
    };
  }
});

function createInsertBlockEdit(clientRef: string): SemanticEdit {
  return {
    kind: 'insert-block',
    clientRef: `edit-${clientRef}`,
    target: {
      parentNodeId: MINIMAL_FIXTURE_IDS.body,
      afterNodeId: MINIMAL_FIXTURE_IDS.paragraph,
    },
    block: {
      clientRef,
      type: 'paragraph',
      attrs: {
        alignment: 'start',
      },
      children: [
        {
          clientRef: `${clientRef}-text`,
          type: 'text',
          value: 'A staged paragraph.',
          marks: [],
        },
      ],
    },
    rationale: 'Exercise the proposal-only edit path.',
  };
}

function createInsertCitationEdit(): SemanticEdit {
  return {
    kind: 'insert-citation',
    clientRef: 'citation-client-1',
    target: {
      kind: 'text',
      textNodeId: MINIMAL_FIXTURE_IDS.text,
      utf16Offset: validUtf16Offset(0),
      affinity: 'after',
    },
    referenceId: MINIMAL_FIXTURE_IDS.reference,
    evidenceIds: [],
    relation: 'context-only',
    rationale: 'Exercise capability enforcement.',
  };
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

function expectDefinitionValid(
  ajv: Ajv2020,
  definitionName: string,
  value: unknown,
  schemaId = INTEGRATION_SCHEMA_ID,
): void {
  const validate = ajv.getSchema(`${schemaId}#/$defs/${definitionName}`) as
    ValidateFunction | undefined;
  if (validate === undefined) {
    throw new Error(`Integration schema definition ${definitionName} was not registered.`);
  }
  expect(validate(value), `${definitionName}: ${JSON.stringify(validate.errors)}`).toBe(true);
}
