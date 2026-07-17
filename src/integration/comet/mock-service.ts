import type { NirecoError, NirecoErrorCode, Result } from '../../base/errors/nireco-error.js';
import type { EntityId, NodeId, ProposalId, SessionId } from '../../base/ids/identifiers.js';
import { serializeCanonicalJson } from '../../base/serialization/canonical-json.js';
import type { IClock, IsoTimestamp } from '../../base/time/clock.js';
import { DOCUMENT_FORMAT_VERSION, MANUSCRIPT_SCHEMA_VERSION } from '../../model/snapshot.js';
import type { Proposal } from '../../proposal/proposal.js';
import type { SemanticEdit, SemanticEditKind } from '../../proposal/semantic-edit.js';
import type { IIdAllocator } from '../../workspace/id-allocator.js';
import type { IModelRegistry } from '../../workspace/model-registry.js';
import {
  COMET_CONTRACT_VERSION,
  type CometIntegrationHandshakeRequest,
  type CometIntegrationHandshakeResult,
  type CreateProposalRequest,
  type CreateProposalResult,
  type GetSnapshotRequest,
  type GetSnapshotResult,
  type IntegrationCapability,
  MOCK_SUPPORTED_CAPABILITIES,
  MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS,
  type OpenCometSessionRequest,
  type OpenCometSessionResult,
  type StageSemanticEditsRequest,
  type StageSemanticEditsResult,
  type TransportFeature,
} from './contract-types.js';

export interface MockCometIntegrationServiceOptions {
  readonly models: IModelRegistry;
  readonly ids: IIdAllocator;
  readonly clock: IClock;
  readonly sessionExpiresAt: IsoTimestamp;
  readonly nirecoBuildId?: string;
}

interface SessionState {
  readonly request: OpenCometSessionRequest;
  readonly grant: OpenCometSessionResult;
}

interface IdempotencyRecord {
  readonly input: string;
  readonly proposal: Proposal;
}

const SUPPORTED_TRANSPORT_FEATURES: readonly TransportFeature[] = ['in-process', 'idempotency'];

const REQUIRED_CAPABILITY_BY_SEMANTIC_EDIT = {
  'insert-block': 'proposal.edit',
  'replace-block-content': 'proposal.edit',
  'move-block': 'proposal.edit',
  'delete-block': 'proposal.edit',
  'insert-citation': 'citation.propose',
  'replace-citation': 'citation.propose',
  'create-claim': 'proposal.edit',
  'link-claim-evidence': 'evidence.propose',
  'create-evidence-link': 'evidence.propose',
  'update-metadata': 'proposal.edit',
} as const satisfies Readonly<Record<SemanticEditKind, IntegrationCapability>>;

const CONTRACT_LIMITS = {
  maxRequestBytes: 1_048_576,
  maxResponseBytes: 4_194_304,
  maxPageItems: 1_000,
  maxChangedUtf16Units: 100_000,
  maxOperations: 1_000,
  maxNewReferences: 100,
  maxDeletedNodes: 1_000,
  maxMovedNodes: 1_000,
  sessionTtlSeconds: 3_600,
  cursorTtlSeconds: 900,
} as const;

export class MockCometIntegrationService {
  readonly #models: IModelRegistry;
  readonly #ids: IIdAllocator;
  readonly #clock: IClock;
  readonly #sessionExpiresAt: IsoTimestamp;
  readonly #nirecoBuildId: string;
  readonly #sessions = new Map<SessionId, SessionState>();
  readonly #proposals = new Map<ProposalId, Proposal>();
  readonly #idempotency = new Map<string, IdempotencyRecord>();

  constructor(options: MockCometIntegrationServiceOptions) {
    this.#models = options.models;
    this.#ids = options.ids;
    this.#clock = options.clock;
    this.#sessionExpiresAt = options.sessionExpiresAt;
    this.#nirecoBuildId = options.nirecoBuildId ?? 'nireco-mock';
  }

  handshake(request: CometIntegrationHandshakeRequest): Result<CometIntegrationHandshakeResult> {
    if (request.requestedContractVersion !== COMET_CONTRACT_VERSION) {
      return this.#error(
        'CONTRACT_VERSION_UNSUPPORTED',
        'The requested contract version is not supported by this preview service.',
        'compatibility',
        false,
        'abort',
      );
    }

    const unsupportedCapability = request.requiredCapabilities.find(
      (capability) => !MOCK_SUPPORTED_CAPABILITIES.includes(capability),
    );
    if (unsupportedCapability !== undefined) {
      return this.#error(
        'CAPABILITY_UNSUPPORTED',
        'A required integration capability is not supported.',
        'compatibility',
        false,
        'abort',
        unsupportedCapability,
      );
    }

    const unsupportedSemanticEdit = request.requiredSemanticEdits.find(
      (kind) => !MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS.includes(kind),
    );
    if (unsupportedSemanticEdit !== undefined) {
      return this.#error(
        'SEMANTIC_EDIT_UNSUPPORTED',
        'A required semantic edit is not supported.',
        'compatibility',
        false,
        'abort',
      );
    }

    const unsupportedTransportFeature = request.requiredTransportFeatures.find(
      (feature) => !SUPPORTED_TRANSPORT_FEATURES.includes(feature),
    );
    if (unsupportedTransportFeature !== undefined) {
      return this.#error(
        'CAPABILITY_UNSUPPORTED',
        'A required transport feature is not supported.',
        'compatibility',
        false,
        'abort',
      );
    }

    return {
      type: 'ok',
      value: {
        acceptedContractVersion: COMET_CONTRACT_VERSION,
        nirecoBuildId: this.#nirecoBuildId,
        documentFormatVersion: DOCUMENT_FORMAT_VERSION,
        schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
        transactionProtocolVersion: COMET_CONTRACT_VERSION,
        proposalProtocolVersion: COMET_CONTRACT_VERSION,
        semanticEditProtocolVersion: COMET_CONTRACT_VERSION,
        supportedCapabilities: MOCK_SUPPORTED_CAPABILITIES,
        supportedSemanticEdits: MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS,
        limits: CONTRACT_LIMITS,
        featureFlags: {
          draftProposal: true,
          rawTransaction: false,
          reviewCommit: false,
        },
        transportFeatures: SUPPORTED_TRANSPORT_FEATURES,
      },
    };
  }

  openSession(request: OpenCometSessionRequest): Result<OpenCometSessionResult> {
    if (request.contractVersion !== COMET_CONTRACT_VERSION) {
      return this.#error(
        'CONTRACT_VERSION_UNSUPPORTED',
        'The requested contract version is not supported.',
        'compatibility',
        false,
        'abort',
      );
    }

    const unsupportedCapability = request.requestedCapabilities.find(
      (capability) => !MOCK_SUPPORTED_CAPABILITIES.includes(capability),
    );
    if (unsupportedCapability !== undefined) {
      return this.#error(
        'CAPABILITY_UNSUPPORTED',
        'A requested integration capability is not supported.',
        'compatibility',
        false,
        'abort',
        unsupportedCapability,
      );
    }

    const model = this.#models.get(request.target.uri);
    if (model === undefined) {
      return this.#error(
        'MODEL_NOT_FOUND',
        'The requested document model is not open.',
        'validation',
        false,
        'abort',
      );
    }

    const snapshot = model.getSnapshot(request.target.revisionId);
    if (snapshot.type === 'error') {
      return snapshot;
    }

    const sessionId = this.#ids.allocateSessionId();
    const grant: OpenCometSessionResult = {
      contractVersion: COMET_CONTRACT_VERSION,
      sessionId,
      target: request.target,
      grantedCapabilities: request.requestedCapabilities,
      scope: request.scope,
      constraints: request.constraints,
      limits: CONTRACT_LIMITS,
      capabilityGrantId: `grant:${sessionId}`,
      expiresAt: this.#sessionExpiresAt,
    };
    this.#sessions.set(sessionId, {
      request,
      grant,
    });

    return {
      type: 'ok',
      value: grant,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Preview.1 Mock compatibility.
  readSnapshot(request: GetSnapshotRequest): Result<GetSnapshotResult> {
    const session = this.#getActiveSession(request.sessionId, 'document.content.read');
    if (session.type === 'error') {
      return session;
    }

    if (!sameDocumentRef(request.document, session.value.grant.target)) {
      return this.#error(
        'SCOPE_VIOLATION',
        'The requested document is not the immutable document bound to this session.',
        'permission',
        false,
        'abort',
      );
    }

    if (
      session.value.grant.scope.allowedNodeIds !== undefined ||
      session.value.grant.scope.allowedSectionIds !== undefined
    ) {
      return this.#error(
        'SCOPE_VIOLATION',
        'A full snapshot cannot be returned for a scoped session.',
        'permission',
        false,
        'abort',
      );
    }

    const model = this.#models.get(session.value.grant.target.uri);
    if (model === undefined) {
      return this.#error(
        'MODEL_NOT_FOUND',
        'The session document model is no longer open.',
        'validation',
        false,
        'abort',
      );
    }

    const snapshot = model.getSnapshot(session.value.grant.target.revisionId);
    if (snapshot.type === 'error') {
      return snapshot;
    }

    return {
      type: 'ok',
      value: {
        document: session.value.grant.target,
        snapshot: snapshot.value,
      },
    };
  }

  createProposal(request: CreateProposalRequest): Result<CreateProposalResult> {
    const session = this.#getActiveSession(request.sessionId, 'proposal.create');
    if (session.type === 'error') {
      return session;
    }

    if (!sameDocumentRef(request.target, session.value.grant.target)) {
      return this.#error(
        'SCOPE_VIOLATION',
        'The proposal target is not the immutable document bound to this session.',
        'permission',
        false,
        'abort',
      );
    }

    const keyValidation = this.#validateIdempotencyKey(request.idempotencyKey);
    if (keyValidation.type === 'error') {
      return keyValidation;
    }

    const canonicalInput = serializeCanonicalJson({ target: request.target });
    if (canonicalInput.type === 'error') {
      return this.#error(
        'SCHEMA_INVALID',
        'The proposal input is not canonical JSON data.',
        'validation',
        false,
        'abort',
      );
    }

    const idempotencyScope = `create:${request.sessionId}:${request.idempotencyKey}`;
    const existing = this.#idempotency.get(idempotencyScope);
    if (existing !== undefined) {
      if (existing.input !== canonicalInput.value) {
        return this.#error(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was already used with different input.',
          'conflict',
          false,
          'abort',
        );
      }

      return {
        type: 'ok',
        value: {
          proposal: existing.proposal,
        },
      };
    }

    const now = this.#clock.now();
    const proposal: Proposal = {
      id: this.#ids.allocateProposalId(),
      documentUri: session.value.grant.target.uri,
      baseRevisionId: session.value.grant.target.revisionId,
      proposalRevision: 1,
      actor: session.value.request.actor,
      status: 'draft',
      semanticEdits: [],
      validation: {
        status: 'not-run',
        basedOnRevisionId: session.value.grant.target.revisionId,
        basedOnProposalRevision: 1,
        diagnostics: [],
      },
      provenance: {
        taskId: session.value.request.taskId,
        traceId: session.value.request.traceId,
        sessionId: session.value.grant.sessionId,
        capabilityGrantId: session.value.grant.capabilityGrantId,
        workflowId: session.value.request.actor.workflowId,
        ...(session.value.request.actor.modelRef === undefined
          ? {}
          : { modelRef: session.value.request.actor.modelRef }),
        toolInvocationIds: [],
        idempotencyKey: request.idempotencyKey,
      },
      createdAt: now,
      updatedAt: now,
    };
    this.#proposals.set(proposal.id, proposal);
    this.#idempotency.set(idempotencyScope, {
      input: canonicalInput.value,
      proposal,
    });

    return {
      type: 'ok',
      value: {
        proposal,
      },
    };
  }

  stageSemanticEdits(request: StageSemanticEditsRequest): Result<StageSemanticEditsResult> {
    const session = this.#getActiveSession(request.sessionId);
    if (session.type === 'error') {
      return session;
    }

    const keyValidation = this.#validateIdempotencyKey(request.idempotencyKey);
    if (keyValidation.type === 'error') {
      return keyValidation;
    }

    if (request.semanticEdits.length === 0) {
      return this.#error(
        'SCHEMA_INVALID',
        'At least one semantic edit is required.',
        'validation',
        false,
        'abort',
      );
    }

    const canonicalInput = serializeCanonicalJson({
      proposal: request.proposal,
      semanticEdits: request.semanticEdits,
    });
    if (canonicalInput.type === 'error') {
      return this.#error(
        'SCHEMA_INVALID',
        'The semantic edit input is not canonical JSON data.',
        'validation',
        false,
        'abort',
      );
    }

    const idempotencyScope = `stage:${request.sessionId}:${request.idempotencyKey}`;
    const replay = this.#replayStageRequest(idempotencyScope, canonicalInput.value);
    if (replay !== undefined) {
      return replay;
    }

    const proposalResult = this.#getProposalForStaging(request, session.value);
    if (proposalResult.type === 'error') {
      return proposalResult;
    }
    const proposal = proposalResult.value;

    const editValidation = this.#validateSemanticEdits(session.value, request.semanticEdits);
    if (editValidation.type === 'error') {
      return editValidation;
    }

    const proposalRevision = proposal.proposalRevision + 1;
    const updatedProposal: Proposal = {
      ...proposal,
      proposalRevision,
      semanticEdits: [...proposal.semanticEdits, ...request.semanticEdits],
      validation: {
        status: 'not-run',
        basedOnRevisionId: proposal.baseRevisionId,
        basedOnProposalRevision: proposalRevision,
        diagnostics: [],
      },
      updatedAt: this.#clock.now(),
    };
    this.#proposals.set(updatedProposal.id, updatedProposal);
    this.#idempotency.set(idempotencyScope, {
      input: canonicalInput.value,
      proposal: updatedProposal,
    });

    return {
      type: 'ok',
      value: {
        proposal: updatedProposal,
      },
    };
  }

  #replayStageRequest(
    idempotencyScope: string,
    canonicalInput: string,
  ): Result<StageSemanticEditsResult> | undefined {
    const existing = this.#idempotency.get(idempotencyScope);
    if (existing === undefined) {
      return undefined;
    }

    if (existing.input !== canonicalInput) {
      return this.#error(
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was already used with different input.',
        'conflict',
        false,
        'abort',
      );
    }

    return {
      type: 'ok',
      value: {
        proposal: existing.proposal,
      },
    };
  }

  #getProposalForStaging(
    request: StageSemanticEditsRequest,
    session: SessionState,
  ): Result<Proposal> {
    const proposal = this.#proposals.get(request.proposal.proposalId);
    if (proposal === undefined) {
      return this.#error(
        'PROPOSAL_CONFLICT',
        'The requested proposal does not exist in this mock service.',
        'conflict',
        false,
        'rebase',
      );
    }

    if (!proposalBelongsToSession(proposal, session)) {
      return this.#error(
        'SCOPE_VIOLATION',
        'The proposal is not bound to this integration session.',
        'permission',
        false,
        'abort',
      );
    }

    if (proposal.proposalRevision !== request.proposal.expectedProposalRevision) {
      return this.#error(
        'PROPOSAL_REVISION_MISMATCH',
        'The proposal was modified after the supplied proposal revision.',
        'conflict',
        false,
        'reread',
      );
    }

    if (proposal.status !== 'draft') {
      return this.#error(
        'PROPOSAL_LOCKED',
        'Only a draft proposal can stage semantic edits in this preview service.',
        'conflict',
        false,
        'user-review',
      );
    }

    return {
      type: 'ok',
      value: proposal,
    };
  }

  #validateIdempotencyKey(idempotencyKey: string): Result<void> {
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      return this.#error(
        'SCHEMA_INVALID',
        'The idempotency key must contain between 1 and 256 characters.',
        'validation',
        false,
        'abort',
      );
    }

    return {
      type: 'ok',
      value: undefined,
    };
  }

  #validateSemanticEdits(
    session: SessionState,
    semanticEdits: readonly SemanticEdit[],
  ): Result<void> {
    const batchValidation = this.#validateSemanticEditBatch(session, semanticEdits);
    if (batchValidation.type === 'error') {
      return batchValidation;
    }

    for (const edit of semanticEdits) {
      const validation = this.#validateSemanticEdit(session, edit);
      if (validation.type === 'error') {
        return validation;
      }
    }

    return {
      type: 'ok',
      value: undefined,
    };
  }

  #validateSemanticEditBatch(
    session: SessionState,
    semanticEdits: readonly SemanticEdit[],
  ): Result<void> {
    const maxOperations = Math.min(
      session.grant.limits.maxOperations,
      session.grant.constraints.maxOperations ?? Number.POSITIVE_INFINITY,
    );
    if (semanticEdits.length > maxOperations) {
      return this.#error(
        'REQUEST_TOO_LARGE',
        'The semantic edit batch exceeds the negotiated operation limit.',
        'validation',
        false,
        'abort',
      );
    }

    const deleteCount = semanticEdits.filter((edit) => edit.kind === 'delete-block').length;
    const maxDeletedNodes = Math.min(
      session.grant.limits.maxDeletedNodes,
      session.grant.constraints.maxDeletedNodes ?? Number.POSITIVE_INFINITY,
    );
    if (deleteCount > maxDeletedNodes) {
      return this.#error(
        'REQUEST_TOO_LARGE',
        'The semantic edit batch exceeds the negotiated deletion limit.',
        'validation',
        false,
        'abort',
      );
    }

    const moveCount = semanticEdits.filter((edit) => edit.kind === 'move-block').length;
    const maxMovedNodes = Math.min(
      session.grant.limits.maxMovedNodes,
      session.grant.constraints.maxMovedNodes ?? Number.POSITIVE_INFINITY,
    );
    if (moveCount > maxMovedNodes) {
      return this.#error(
        'REQUEST_TOO_LARGE',
        'The semantic edit batch exceeds the negotiated move limit.',
        'validation',
        false,
        'abort',
      );
    }

    return {
      type: 'ok',
      value: undefined,
    };
  }

  #validateSemanticEdit(session: SessionState, edit: SemanticEdit): Result<void> {
    if (!MOCK_SUPPORTED_SEMANTIC_EDIT_KINDS.includes(edit.kind)) {
      return this.#error(
        'SEMANTIC_EDIT_UNSUPPORTED',
        'The semantic edit is not supported by this preview service.',
        'compatibility',
        false,
        'abort',
      );
    }

    const requiredCapability = REQUIRED_CAPABILITY_BY_SEMANTIC_EDIT[edit.kind];
    if (!session.grant.grantedCapabilities.includes(requiredCapability)) {
      return this.#error(
        'SCOPE_VIOLATION',
        'The integration session was not granted the capability required by this edit.',
        'permission',
        false,
        'abort',
        requiredCapability,
      );
    }

    const policyValidation = this.#validateSemanticEditPolicy(session, edit);
    if (policyValidation.type === 'error') {
      return policyValidation;
    }

    if (!editTargetsSessionDocument(edit, session.grant.target)) {
      return this.#error(
        'SCOPE_VIOLATION',
        'The semantic edit targets a document outside the session.',
        'permission',
        false,
        'abort',
      );
    }

    const allowedNodeIds = [
      ...(session.grant.scope.allowedNodeIds ?? []),
      ...(session.grant.scope.allowedSectionIds ?? []),
    ];
    if (
      allowedNodeIds.length > 0 &&
      semanticEditNodeIds(edit).some((nodeId) => !allowedNodeIds.includes(nodeId))
    ) {
      return this.#error(
        'SCOPE_VIOLATION',
        'The semantic edit targets a node outside the granted scope.',
        'permission',
        false,
        'abort',
      );
    }

    return {
      type: 'ok',
      value: undefined,
    };
  }

  #validateSemanticEditPolicy(session: SessionState, edit: SemanticEdit): Result<void> {
    if (edit.kind === 'delete-block' && !session.grant.constraints.allowDelete) {
      return this.#error(
        'POLICY_VIOLATION',
        'The session policy does not allow document deletion edits.',
        'permission',
        false,
        'abort',
      );
    }

    if (edit.kind === 'move-block' && !session.grant.constraints.allowStructureMove) {
      return this.#error(
        'POLICY_VIOLATION',
        'The session policy does not allow structural move edits.',
        'permission',
        false,
        'abort',
      );
    }

    const citationValidation = this.#validateCitationPolicy(session, edit);
    if (citationValidation.type === 'error') {
      return citationValidation;
    }

    if (edit.kind === 'create-evidence-link' && edit.verification.status === 'verified') {
      return this.#error(
        'POLICY_VIOLATION',
        'Verified evidence status must be injected by a trusted evidence service.',
        'permission',
        false,
        'abort',
      );
    }

    if (
      edit.kind === 'link-claim-evidence' &&
      edit.confidence !== undefined &&
      (edit.confidence < 0 || edit.confidence > 1)
    ) {
      return this.#error(
        'SCHEMA_INVALID',
        'Claim-evidence confidence must be between 0 and 1.',
        'validation',
        false,
        'abort',
      );
    }

    return {
      type: 'ok',
      value: undefined,
    };
  }

  #validateCitationPolicy(session: SessionState, edit: SemanticEdit): Result<void> {
    if (edit.kind !== 'insert-citation' && edit.kind !== 'replace-citation') {
      return {
        type: 'ok',
        value: undefined,
      };
    }

    if (
      edit.evidenceIds.length === 0 &&
      session.grant.constraints.requireEvidenceForCitation &&
      !session.grant.constraints.allowMetadataOnlyCitation
    ) {
      return this.#error(
        'EVIDENCE_REQUIRED',
        'The session policy requires evidence for citation edits.',
        'validation',
        false,
        'user-review',
      );
    }

    if (
      edit.evidenceIds.length > 0 &&
      session.grant.constraints.requireVerifiedEvidence &&
      !this.#allEvidenceVerified(session, edit.evidenceIds)
    ) {
      return this.#error(
        'EVIDENCE_REQUIRED',
        'The session policy requires every cited evidence link to be verified.',
        'validation',
        false,
        'user-review',
      );
    }

    return {
      type: 'ok',
      value: undefined,
    };
  }

  #allEvidenceVerified(session: SessionState, evidenceIds: readonly EntityId[]): boolean {
    const model = this.#models.get(session.grant.target.uri);
    const snapshot = model?.getSnapshot(session.grant.target.revisionId);
    if (snapshot === undefined || snapshot.type === 'error') {
      return false;
    }

    return evidenceIds.every((evidenceId) =>
      snapshot.value.academicGraph.evidenceLinks.some(
        (evidence) => evidence.id === evidenceId && evidence.verificationStatus === 'verified',
      ),
    );
  }

  #getActiveSession(
    sessionId: SessionId,
    requiredCapability?: IntegrationCapability,
  ): Result<SessionState> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      return this.#error(
        'SESSION_REVOKED',
        'The integration session does not exist or was revoked.',
        'permission',
        false,
        'request-permission',
      );
    }

    if (Date.parse(this.#clock.now()) >= Date.parse(session.grant.expiresAt)) {
      return this.#error(
        'SESSION_EXPIRED',
        'The integration session has expired.',
        'permission',
        true,
        'retry',
      );
    }

    if (
      requiredCapability !== undefined &&
      !session.grant.grantedCapabilities.includes(requiredCapability)
    ) {
      return this.#error(
        'SCOPE_VIOLATION',
        'The integration session was not granted the required capability.',
        'permission',
        false,
        'abort',
        requiredCapability,
      );
    }

    return {
      type: 'ok',
      value: session,
    };
  }

  #error<TValue>(
    code: NirecoErrorCode,
    safeMessage: string,
    category: NirecoError['category'],
    retryable: boolean,
    suggestedAction: NonNullable<NirecoError['suggestedAction']>,
    requiredCapability?: string,
  ): Result<TValue> {
    return {
      type: 'error',
      error: {
        code,
        category,
        retryable,
        safeMessage,
        debugId: this.#ids.allocateDebugId(),
        suggestedAction,
        ...(requiredCapability === undefined ? {} : { requiredCapability }),
      },
    };
  }
}

function sameDocumentRef(
  left: OpenCometSessionRequest['target'],
  right: OpenCometSessionRequest['target'],
): boolean {
  return left.uri === right.uri && left.revisionId === right.revisionId;
}

function editTargetsSessionDocument(
  edit: SemanticEdit,
  document: OpenCometSessionRequest['target'],
): boolean {
  if (edit.kind !== 'create-claim') {
    return true;
  }
  return sameDocumentRef(edit.anchor.document, document);
}

function proposalBelongsToSession(proposal: Proposal, session: SessionState): boolean {
  return (
    proposal.documentUri === session.grant.target.uri &&
    proposal.baseRevisionId === session.grant.target.revisionId &&
    proposal.provenance.sessionId === session.grant.sessionId
  );
}

function semanticEditNodeIds(edit: SemanticEdit): readonly NodeId[] {
  if (edit.kind === 'insert-block') {
    return insertionTargetNodeIds(edit.target);
  }

  if (edit.kind === 'move-block') {
    return [...insertionTargetNodeIds(edit.target), edit.targetNodeId];
  }

  return nonInsertionSemanticEditNodeIds(edit);
}

function insertionTargetNodeIds(
  target: Extract<SemanticEdit, { readonly kind: 'insert-block' }>['target'],
): readonly NodeId[] {
  return [
    target.parentNodeId,
    ...(target.afterNodeId === undefined ? [] : [target.afterNodeId]),
    ...(target.beforeNodeId === undefined ? [] : [target.beforeNodeId]),
  ];
}

function nonInsertionSemanticEditNodeIds(edit: SemanticEdit): readonly NodeId[] {
  if (edit.kind === 'replace-block-content' || edit.kind === 'delete-block') {
    return [edit.targetNodeId];
  }

  if (edit.kind === 'insert-citation') {
    return [semanticPositionNodeId(edit.target)];
  }

  if (edit.kind === 'replace-citation') {
    return [edit.targetCitationNodeId];
  }

  if (edit.kind === 'create-claim') {
    return [
      semanticPositionNodeId(edit.anchor.primary),
      ...(edit.anchor.targetNodeId === undefined ? [] : [edit.anchor.targetNodeId]),
      ...(edit.anchor.pathHint ?? []),
    ];
  }

  return [];
}

function semanticPositionNodeId(
  position: Extract<SemanticEdit, { readonly kind: 'insert-citation' }>['target'],
): NodeId {
  return position.kind === 'text' ? position.textNodeId : position.parentNodeId;
}
