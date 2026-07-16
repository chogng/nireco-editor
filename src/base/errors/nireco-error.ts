import type { DebugId, RevisionId } from '../ids/identifiers.js';

export type NirecoErrorCategory =
  'validation' | 'conflict' | 'permission' | 'compatibility' | 'storage' | 'transport' | 'internal';

export type NirecoSuggestedAction =
  'retry' | 'reread' | 'rebase' | 'request-permission' | 'user-review' | 'abort';

export const NIRECO_ERROR_CODES = [
  'INVALID_RESOURCE_URI',
  'MODEL_URI_ALREADY_EXISTS',
  'MODEL_NOT_FOUND',
  'MODEL_DISPOSED',
  'CONTRACT_VERSION_UNSUPPORTED',
  'CAPABILITY_UNSUPPORTED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'SCOPE_VIOLATION',
  'BASE_REVISION_MISMATCH',
  'REVISION_NOT_FOUND',
  'PROPOSAL_REVISION_MISMATCH',
  'NODE_NOT_FOUND',
  'ENTITY_NOT_FOUND',
  'POSITION_INVALID',
  'ANCHOR_ORPHANED',
  'REQUEST_TOO_LARGE',
  'SCHEMA_INVALID',
  'SCHEMA_VERSION_UNSUPPORTED',
  'SEMANTIC_EDIT_UNSUPPORTED',
  'PROPOSAL_LOCKED',
  'PROPOSAL_CONFLICT',
  'EVIDENCE_REQUIRED',
  'EVIDENCE_STALE',
  'CITATION_SUPPORT_INVALID',
  'POLICY_VIOLATION',
  'IDEMPOTENCY_CONFLICT',
  'CANCELLED',
  'TEMPORARY_UNAVAILABLE',
  'STORAGE_CORRUPT',
  'INTERNAL_ERROR',
] as const;

export type NirecoErrorCode = (typeof NIRECO_ERROR_CODES)[number];

export interface NirecoError {
  readonly code: NirecoErrorCode;
  readonly category: NirecoErrorCategory;
  readonly retryable: boolean;
  readonly safeMessage: string;
  readonly debugId: DebugId;
  readonly currentRevisionId?: RevisionId;
  readonly requiredCapability?: string;
  readonly suggestedAction: NirecoSuggestedAction;
}

export type Result<TValue, TError = NirecoError> =
  | {
      readonly type: 'ok';
      readonly value: TValue;
    }
  | {
      readonly type: 'error';
      readonly error: TError;
    };
