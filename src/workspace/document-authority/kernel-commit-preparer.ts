import type {
  NirecoError,
  NirecoErrorCategory,
  NirecoErrorCode,
  NirecoSuggestedAction,
} from '../../base/errors/nireco-error.js';
import type { RevisionId } from '../../base/ids/identifiers.js';
import type { Revision } from '../../model/revision/revision.js';
import {
  prepareKernelTransaction,
  type TransactionKernelError,
} from '../../model/transaction/transaction-kernel.js';
import type { IIdAllocator } from '../id-allocator.js';
import type { CommitPreparer, PreparedCommit } from './single-document-authority.js';

export interface KernelCommitPreparerOptions {
  readonly ids: IIdAllocator;
}

export function createKernelCommitPreparer(options: KernelCommitPreparerOptions): CommitPreparer {
  return (transaction, headRevision, headSnapshot) => {
    const nextRevisionId = options.ids.allocateRevisionId();
    const prepared = prepareKernelTransaction({
      transaction,
      headRevision,
      headSnapshot,
      nextRevisionId,
    });
    if (prepared.type === 'error') {
      return {
        type: 'error',
        error: mapKernelError(options.ids, headRevision.id, prepared.error),
      };
    }

    const revision: Revision = {
      id: nextRevisionId,
      uri: transaction.target.uri,
      parentRevisionId: headRevision.id,
      transactionId: transaction.id,
      sequence: headRevision.sequence + 1,
      documentHash: prepared.value.snapshot.documentHash,
      actor: transaction.actor,
      createdAt: transaction.createdAt,
      durability: 'memory',
    };
    const commit: PreparedCommit = {
      revision,
      snapshot: prepared.value.snapshot,
      transactionHash: prepared.value.transactionHash,
      positionMap: prepared.value.positionMap,
      inverse: prepared.value.inverse,
      replayInput: prepared.value.replayInput,
    };
    return {
      type: 'ok',
      value: commit,
    };
  };
}

interface ErrorMapping {
  readonly code: NirecoErrorCode;
  readonly category: NirecoErrorCategory;
  readonly retryable: boolean;
  readonly suggestedAction: NirecoSuggestedAction;
}

const ERROR_MAPPINGS: Readonly<Record<TransactionKernelError['reason'], ErrorMapping>> = {
  'base-revision-mismatch': mapping('BASE_REVISION_MISMATCH', 'conflict', false, 'reread'),
  'canonical-json-invalid': mapping('SCHEMA_INVALID', 'validation', false, 'abort'),
  'claim-anchor-mapping-failed': mapping('POSITION_INVALID', 'validation', false, 'abort'),
  'document-hash-mismatch': mapping('BASE_REVISION_MISMATCH', 'conflict', false, 'reread'),
  'document-hash-precondition-failed': mapping(
    'BASE_REVISION_MISMATCH',
    'conflict',
    false,
    'reread',
  ),
  'entity-precondition-failed': mapping('ENTITY_NOT_FOUND', 'validation', false, 'reread'),
  'node-hash-precondition-failed': mapping('BASE_REVISION_MISMATCH', 'conflict', false, 'reread'),
  'node-precondition-failed': mapping('NODE_NOT_FOUND', 'validation', false, 'reread'),
  'next-revision-conflict': mapping('SCHEMA_INVALID', 'internal', false, 'abort'),
  'operation-count-unsupported': mapping('CAPABILITY_UNSUPPORTED', 'compatibility', false, 'abort'),
  'operation-unsupported': mapping('CAPABILITY_UNSUPPORTED', 'compatibility', false, 'abort'),
  'position-invalid': mapping('POSITION_INVALID', 'validation', false, 'abort'),
  'schema-version-precondition-failed': mapping(
    'SCHEMA_VERSION_UNSUPPORTED',
    'compatibility',
    false,
    'abort',
  ),
  'snapshot-invalid': mapping('SCHEMA_INVALID', 'validation', false, 'abort'),
  'target-node-not-found': mapping('NODE_NOT_FOUND', 'validation', false, 'reread'),
  'target-node-not-text': mapping('NODE_NOT_FOUND', 'validation', false, 'reread'),
  'transaction-invalid': mapping('SCHEMA_INVALID', 'validation', false, 'abort'),
  'transaction-too-large': mapping('REQUEST_TOO_LARGE', 'validation', false, 'abort'),
};

function mapKernelError(
  ids: IIdAllocator,
  currentRevisionId: RevisionId,
  error: TransactionKernelError,
): NirecoError {
  const mapping = errorMapping(error.reason);
  return {
    code: mapping.code,
    category: mapping.category,
    retryable: mapping.retryable,
    safeMessage: error.safeMessage,
    debugId: ids.allocateDebugId(),
    currentRevisionId,
    suggestedAction: mapping.suggestedAction,
  };
}

function errorMapping(reason: TransactionKernelError['reason']): ErrorMapping {
  return ERROR_MAPPINGS[reason];
}

function mapping(
  code: NirecoErrorCode,
  category: NirecoErrorCategory,
  retryable: boolean,
  suggestedAction: NirecoSuggestedAction,
): ErrorMapping {
  return {
    code,
    category,
    retryable,
    suggestedAction,
  };
}
