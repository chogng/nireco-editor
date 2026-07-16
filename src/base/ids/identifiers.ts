import type { Brand } from '../brand.js';

export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type RevisionId = Brand<string, 'RevisionId'>;
export type TransactionId = Brand<string, 'TransactionId'>;
export type OperationId = Brand<string, 'OperationId'>;
export type NodeId = Brand<string, 'NodeId'>;
export type EntityId = Brand<string, 'EntityId'>;
export type ProposalId = Brand<string, 'ProposalId'>;
export type ProposalChangeGroupId = Brand<string, 'ProposalChangeGroupId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ContentHash = Brand<string, 'ContentHash'>;
export type DebugId = Brand<string, 'DebugId'>;
export type Utf16Offset = Brand<number, 'Utf16Offset'>;

export type OpaqueIdentifierKind =
  | 'workspace'
  | 'revision'
  | 'transaction'
  | 'operation'
  | 'node'
  | 'entity'
  | 'proposal'
  | 'proposal-change-group'
  | 'session'
  | 'debug';

export type IdentifierParseResult<TIdentifier> =
  | {
      readonly type: 'valid';
      readonly value: TIdentifier;
    }
  | {
      readonly type: 'invalid';
      readonly reason:
        'empty' | 'too-long' | 'invalid-character' | 'not-canonical-uuid' | 'wrong-uuid-version';
    };

const MAX_IDENTIFIER_LENGTH = 128;
const OPAQUE_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_V8_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function parseWorkspaceId(value: string): IdentifierParseResult<WorkspaceId> {
  return parseAllocatedIdentifier(value, (validated) => validated as WorkspaceId);
}

export function parseRevisionId(value: string): IdentifierParseResult<RevisionId> {
  return parseAllocatedIdentifier(value, (validated) => validated as RevisionId);
}

export function parseTransactionId(value: string): IdentifierParseResult<TransactionId> {
  return parseAllocatedIdentifier(value, (validated) => validated as TransactionId);
}

export function parseOperationId(value: string): IdentifierParseResult<OperationId> {
  return parseAllocatedIdentifier(value, (validated) => validated as OperationId);
}

export function parseNodeId(value: string): IdentifierParseResult<NodeId> {
  return parseAllocatedIdentifier(value, (validated) => validated as NodeId);
}

export function parseEntityId(value: string): IdentifierParseResult<EntityId> {
  return parseAllocatedIdentifier(value, (validated) => validated as EntityId);
}

export function parseProposalId(value: string): IdentifierParseResult<ProposalId> {
  return parseAllocatedIdentifier(value, (validated) => validated as ProposalId);
}

export function parseProposalChangeGroupId(
  value: string,
): IdentifierParseResult<ProposalChangeGroupId> {
  return parseDerivedIdentifier(value, (validated) => validated as ProposalChangeGroupId);
}

export function parseSessionId(value: string): IdentifierParseResult<SessionId> {
  return parseAllocatedIdentifier(value, (validated) => validated as SessionId);
}

export function parseDebugId(value: string): IdentifierParseResult<DebugId> {
  return parseAllocatedIdentifier(value, (validated) => validated as DebugId);
}

export function parsePreviewFixtureWorkspaceId(value: string): IdentifierParseResult<WorkspaceId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as WorkspaceId);
}

export function parsePreviewFixtureRevisionId(value: string): IdentifierParseResult<RevisionId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as RevisionId);
}

export function parsePreviewFixtureTransactionId(
  value: string,
): IdentifierParseResult<TransactionId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as TransactionId);
}

export function parsePreviewFixtureOperationId(value: string): IdentifierParseResult<OperationId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as OperationId);
}

export function parsePreviewFixtureNodeId(value: string): IdentifierParseResult<NodeId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as NodeId);
}

export function parsePreviewFixtureEntityId(value: string): IdentifierParseResult<EntityId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as EntityId);
}

export function parsePreviewFixtureProposalId(value: string): IdentifierParseResult<ProposalId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as ProposalId);
}

export function parsePreviewFixtureProposalChangeGroupId(
  value: string,
): IdentifierParseResult<ProposalChangeGroupId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as ProposalChangeGroupId);
}

export function parsePreviewFixtureSessionId(value: string): IdentifierParseResult<SessionId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as SessionId);
}

export function parsePreviewFixtureDebugId(value: string): IdentifierParseResult<DebugId> {
  return parsePreviewFixtureIdentifier(value, (validated) => validated as DebugId);
}

export function parseContentHash(value: string): IdentifierParseResult<ContentHash> {
  if (!SHA_256_PATTERN.test(value)) {
    return {
      type: 'invalid',
      reason: value.length > MAX_IDENTIFIER_LENGTH ? 'too-long' : 'invalid-character',
    };
  }

  return {
    type: 'valid',
    value: value as ContentHash,
  };
}

export function parseUtf16Offset(value: number): IdentifierParseResult<Utf16Offset> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return {
      type: 'invalid',
      reason: 'invalid-character',
    };
  }

  return {
    type: 'valid',
    value: value as Utf16Offset,
  };
}

function parseAllocatedIdentifier<TIdentifier>(
  value: string,
  brand: (validated: string) => TIdentifier,
): IdentifierParseResult<TIdentifier> {
  return parseUuidIdentifier(value, 7, UUID_V7_PATTERN, brand);
}

function parseDerivedIdentifier<TIdentifier>(
  value: string,
  brand: (validated: string) => TIdentifier,
): IdentifierParseResult<TIdentifier> {
  return parseUuidIdentifier(value, 8, UUID_V8_PATTERN, brand);
}

function parseUuidIdentifier<TIdentifier>(
  value: string,
  expectedVersion: 7 | 8,
  expectedPattern: RegExp,
  brand: (validated: string) => TIdentifier,
): IdentifierParseResult<TIdentifier> {
  if (value.length === 0) {
    return {
      type: 'invalid',
      reason: 'empty',
    };
  }

  if (value.length > MAX_IDENTIFIER_LENGTH) {
    return {
      type: 'invalid',
      reason: 'too-long',
    };
  }

  if (!CANONICAL_UUID_PATTERN.test(value)) {
    return {
      type: 'invalid',
      reason: 'not-canonical-uuid',
    };
  }

  if (!expectedPattern.test(value)) {
    return {
      type: 'invalid',
      reason: 'wrong-uuid-version',
    };
  }

  const versionCharacter = value[14];
  if (versionCharacter !== String(expectedVersion)) {
    return {
      type: 'invalid',
      reason: 'wrong-uuid-version',
    };
  }

  return {
    type: 'valid',
    value: brand(value),
  };
}

function parsePreviewFixtureIdentifier<TIdentifier>(
  value: string,
  brand: (validated: string) => TIdentifier,
): IdentifierParseResult<TIdentifier> {
  if (value.length === 0) {
    return {
      type: 'invalid',
      reason: 'empty',
    };
  }

  if (value.length > MAX_IDENTIFIER_LENGTH) {
    return {
      type: 'invalid',
      reason: 'too-long',
    };
  }

  if (!OPAQUE_IDENTIFIER_PATTERN.test(value)) {
    return {
      type: 'invalid',
      reason: 'invalid-character',
    };
  }

  return {
    type: 'valid',
    value: brand(value),
  };
}
