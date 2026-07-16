import type { Brand } from '../brand.js';

export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type RevisionId = Brand<string, 'RevisionId'>;
export type TransactionId = Brand<string, 'TransactionId'>;
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
      readonly reason: 'empty' | 'too-long' | 'invalid-character';
    };

const MAX_IDENTIFIER_LENGTH = 128;
const OPAQUE_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export function parseWorkspaceId(value: string): IdentifierParseResult<WorkspaceId> {
  return parseOpaqueIdentifier(value, (validated) => validated as WorkspaceId);
}

export function parseRevisionId(value: string): IdentifierParseResult<RevisionId> {
  return parseOpaqueIdentifier(value, (validated) => validated as RevisionId);
}

export function parseTransactionId(value: string): IdentifierParseResult<TransactionId> {
  return parseOpaqueIdentifier(value, (validated) => validated as TransactionId);
}

export function parseNodeId(value: string): IdentifierParseResult<NodeId> {
  return parseOpaqueIdentifier(value, (validated) => validated as NodeId);
}

export function parseEntityId(value: string): IdentifierParseResult<EntityId> {
  return parseOpaqueIdentifier(value, (validated) => validated as EntityId);
}

export function parseProposalId(value: string): IdentifierParseResult<ProposalId> {
  return parseOpaqueIdentifier(value, (validated) => validated as ProposalId);
}

export function parseProposalChangeGroupId(
  value: string,
): IdentifierParseResult<ProposalChangeGroupId> {
  return parseOpaqueIdentifier(value, (validated) => validated as ProposalChangeGroupId);
}

export function parseSessionId(value: string): IdentifierParseResult<SessionId> {
  return parseOpaqueIdentifier(value, (validated) => validated as SessionId);
}

export function parseDebugId(value: string): IdentifierParseResult<DebugId> {
  return parseOpaqueIdentifier(value, (validated) => validated as DebugId);
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

function parseOpaqueIdentifier<TIdentifier>(
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
