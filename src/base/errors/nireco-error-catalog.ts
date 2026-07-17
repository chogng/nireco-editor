import type { DebugId, RevisionId } from '../ids/identifiers.js';
import { deepFreeze } from '../immutability/deep-freeze.js';
import type {
  NirecoError,
  NirecoErrorCategory,
  NirecoErrorCode,
  NirecoSuggestedAction,
} from './nireco-error.js';

export interface NirecoErrorCatalogEntry {
  readonly category: NirecoErrorCategory;
  readonly retryable: boolean;
  readonly suggestedAction: NirecoSuggestedAction;
  readonly safeMessage: string;
}

export const NIRECO_ERROR_CATALOG = deepFreeze({
  INVALID_RESOURCE_URI: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The resource URI is not valid under the negotiated canonical URI profile.',
  },
  MODEL_URI_ALREADY_EXISTS: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'reread',
    safeMessage: 'An active model already owns this canonical resource URI.',
  },
  MODEL_NOT_FOUND: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'No active model or resource provider is available for this resource URI.',
  },
  MODEL_DISPOSED: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'reread',
    safeMessage: 'The requested model has been disposed and is no longer active.',
  },
  CONTRACT_VERSION_UNSUPPORTED: {
    category: 'compatibility',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The requested integration contract version is not supported.',
  },
  CAPABILITY_UNSUPPORTED: {
    category: 'compatibility',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'A required integration capability is not supported.',
  },
  SESSION_EXPIRED: {
    category: 'permission',
    retryable: true,
    suggestedAction: 'retry',
    safeMessage: 'The task-bound integration session has expired.',
  },
  SESSION_REVOKED: {
    category: 'permission',
    retryable: false,
    suggestedAction: 'request-permission',
    safeMessage: 'The task-bound integration session has been revoked.',
  },
  SCOPE_VIOLATION: {
    category: 'permission',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The requested target is outside the granted document scope.',
  },
  BASE_REVISION_MISMATCH: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'rebase',
    safeMessage: 'The document head no longer matches the request base revision.',
  },
  REVISION_NOT_FOUND: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'reread',
    safeMessage: 'The requested immutable revision could not be found.',
  },
  PROPOSAL_REVISION_MISMATCH: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'reread',
    safeMessage: 'The proposal was modified after the supplied proposal revision.',
  },
  NODE_NOT_FOUND: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'reread',
    safeMessage: 'The referenced node does not exist in the bound document revision.',
  },
  ENTITY_NOT_FOUND: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'reread',
    safeMessage: 'The referenced academic entity does not exist in the bound document revision.',
  },
  POSITION_INVALID: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'reread',
    safeMessage: 'The semantic position is not valid for the bound document revision.',
  },
  ANCHOR_ORPHANED: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'user-review',
    safeMessage: 'The persistent anchor could not be recovered without ambiguity.',
  },
  REQUEST_TOO_LARGE: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The request exceeds a negotiated contract limit.',
  },
  SCHEMA_INVALID: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The request or resulting document does not satisfy the negotiated schema.',
  },
  SCHEMA_VERSION_UNSUPPORTED: {
    category: 'compatibility',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The document schema version is not supported.',
  },
  SEMANTIC_EDIT_UNSUPPORTED: {
    category: 'compatibility',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The requested semantic edit kind is not supported.',
  },
  PROPOSAL_LOCKED: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'user-review',
    safeMessage: 'The proposal is frozen or terminal and cannot be modified.',
  },
  PROPOSAL_CONFLICT: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'rebase',
    safeMessage: 'The proposal cannot be applied cleanly to the target revision.',
  },
  EVIDENCE_REQUIRED: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'user-review',
    safeMessage: 'The active policy requires evidence for this citation.',
  },
  EVIDENCE_STALE: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'reread',
    safeMessage: 'The evidence source content no longer matches the verified content hash.',
  },
  CITATION_SUPPORT_INVALID: {
    category: 'validation',
    retryable: false,
    suggestedAction: 'user-review',
    safeMessage:
      'The proposed citation is not supported by a valid reference and evidence relationship.',
  },
  POLICY_VIOLATION: {
    category: 'permission',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The requested action is blocked by the trusted policy snapshot.',
  },
  IDEMPOTENCY_CONFLICT: {
    category: 'conflict',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The idempotency key was previously used with a different input.',
  },
  CANCELLED: {
    category: 'transport',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'The request was cancelled.',
  },
  TEMPORARY_UNAVAILABLE: {
    category: 'transport',
    retryable: true,
    suggestedAction: 'retry',
    safeMessage: 'The service is temporarily unavailable.',
  },
  DURABILITY_UNREACHABLE: {
    category: 'storage',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage:
      'The committed Revision cannot reach the requested durability under the current Authority.',
  },
  WAL_APPEND_FAILED: {
    category: 'storage',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage:
      'The Revision committed in memory, but its WAL record could not be appended; the Authority is now read-only.',
  },
  WAL_FSYNC_FAILED: {
    category: 'storage',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage:
      'The Revision committed in memory, but its WAL record could not be fsynced; the Authority is now read-only.',
  },
  SNAPSHOT_COMMIT_FAILED: {
    category: 'storage',
    retryable: true,
    suggestedAction: 'retry',
    safeMessage:
      'The Snapshot was not atomically committed; the previous manifest and WAL-safe Revision remain authoritative.',
  },
  RECOVERY_REQUIRED: {
    category: 'storage',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'Stored history is discontinuous or corrupt and requires explicit recovery.',
  },
  STORAGE_CORRUPT: {
    category: 'storage',
    retryable: false,
    suggestedAction: 'abort',
    safeMessage: 'Stored document state failed an integrity check.',
  },
  INTERNAL_ERROR: {
    category: 'internal',
    retryable: true,
    suggestedAction: 'retry',
    safeMessage: 'The service could not complete the request.',
  },
} as const satisfies Record<NirecoErrorCode, NirecoErrorCatalogEntry>);

export interface NirecoErrorDynamicFields {
  readonly currentRevisionId?: RevisionId;
  readonly requiredCapability?: string;
}

export function isNirecoErrorCode(value: unknown): value is NirecoErrorCode {
  return typeof value === 'string' && Object.hasOwn(NIRECO_ERROR_CATALOG, value);
}

export function createNirecoCatalogError(
  code: NirecoErrorCode,
  debugId: DebugId,
  dynamic: NirecoErrorDynamicFields = {},
): NirecoError {
  return deepFreeze({
    code,
    ...NIRECO_ERROR_CATALOG[code],
    debugId,
    ...dynamic,
  });
}
