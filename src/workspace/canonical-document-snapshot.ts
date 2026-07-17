import type { Result } from '../base/errors/nireco-error.js';
import { HASH_DOMAINS } from '../base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../base/hashing/portable-sha-256.js';
import { serializeCanonicalJson } from '../base/serialization/canonical-json.js';
import { validateDocumentSnapshot } from '../model/schema/manuscript-validator.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../model/snapshot.js';

export interface CanonicalDocumentSnapshotError {
  readonly safeMessage: string;
}

/**
 * Converts a runtime value to inert plain data before validation. This prevents
 * caller-owned getters, Proxies, and later mutation from crossing the Model boundary.
 */
export function normalizeCanonicalDocumentSnapshot(
  value: unknown,
): Result<DocumentSnapshot, CanonicalDocumentSnapshotError> {
  try {
    const serialized = serializeCanonicalJson(value);
    if (serialized.type === 'error') {
      return invalidSnapshot('The supplied Snapshot is not canonical JSON data.');
    }
    const parsed: unknown = JSON.parse(serialized.value);
    const validated = validateDocumentSnapshot(parsed);
    if (validated.type === 'error') {
      return invalidSnapshot(validated.error.safeMessage);
    }
    const snapshot = parsed as DocumentSnapshot;
    const hashed = hashCanonicalJsonPortable(
      HASH_DOMAINS.documentContent,
      createDocumentHashPayload(snapshot),
    );
    return hashed.type === 'ok' && hashed.hash === snapshot.documentHash
      ? {
          type: 'ok',
          value: snapshot,
        }
      : invalidSnapshot('The supplied Snapshot content does not match its declared document hash.');
  } catch {
    return invalidSnapshot('The supplied Snapshot could not be inspected as inert canonical data.');
  }
}

function invalidSnapshot(safeMessage: string): Result<never, CanonicalDocumentSnapshotError> {
  return {
    type: 'error',
    error: {
      safeMessage,
    },
  };
}
