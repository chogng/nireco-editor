import type { Result } from '../base/errors/nireco-error.js';
import { HASH_DOMAINS } from '../base/hashing/hash-preimage.js';
import {
  createTrustedCanonicalUtf8Text,
  hashCanonicalJsonPortable,
  type TrustedCanonicalUtf8Text,
} from '../base/hashing/portable-sha-256.js';
import {
  createDocumentIndexFromValidatedSnapshot,
  type DocumentIndex,
} from './node/document-index.js';
import type { DocumentNode } from './node/manuscript-node.js';
import { validateDocumentSnapshot } from './schema/manuscript-validator.js';
import { createDocumentHashPayload, type DocumentSnapshot } from './snapshot.js';

export interface VerifiedDocumentSnapshotCacheError {
  readonly reason: 'snapshot-invalid' | 'snapshot-mutable' | 'document-hash-mismatch';
  readonly safeMessage: string;
}

export interface VerifiedDocumentSnapshotCache {
  readonly snapshot: DocumentSnapshot;
  readonly index: DocumentIndex;
  readonly canonicalDocumentPayload: string;
  readonly canonicalDocumentPayloadUtf8: TrustedCanonicalUtf8Text;
}

export interface DocumentSnapshotCacheDiagnostics {
  /** Entries that have not been explicitly retired from the process-local cache. */
  readonly activeEntryCount: number;
  /** UTF-16 code units retained by those entries' canonical document payloads. */
  readonly retainedCanonicalPayloadCodeUnits: number;
}

interface CacheDerivedDocumentSnapshotOptions {
  readonly sourceSnapshot: DocumentSnapshot;
  readonly snapshot: DocumentSnapshot;
  readonly index: DocumentIndex;
  readonly canonicalDocumentPayload: string;
  readonly canonicalDocumentPayloadUtf8?: TrustedCanonicalUtf8Text;
  readonly updatedNodes: readonly DocumentNode[];
  readonly updatedAcademicGraphObjects: readonly object[];
}

interface ProvisionalDocumentSnapshotCache {
  readonly sourceSnapshot: DocumentSnapshot;
  readonly cache: VerifiedDocumentSnapshotCache;
}

const VERIFIED_SNAPSHOT_CACHES = new WeakMap<object, VerifiedDocumentSnapshotCache>();
const PROVISIONAL_SNAPSHOT_CACHES = new WeakMap<object, ProvisionalDocumentSnapshotCache>();
const PROVISIONAL_SNAPSHOT_BY_SOURCE = new WeakMap<object, object>();
const VERIFIED_CACHE_IDENTITIES = new WeakSet<object>();
let activeEntryCount = 0;
let retainedCanonicalPayloadCodeUnits = 0;

/**
 * Installs a non-forgeable, process-local trust marker after independently
 * checking schema, full canonical hash, inert data descriptors and deep freeze.
 * The same Snapshot object identity must later be supplied to the Kernel.
 */
export function cacheVerifiedFrozenDocumentSnapshot(
  value: unknown,
): Result<DocumentSnapshot, VerifiedDocumentSnapshotCacheError> {
  if (value === null || typeof value !== 'object') {
    return cacheError('snapshot-invalid', 'A cached Snapshot must be a document object.');
  }
  const existing = VERIFIED_SNAPSHOT_CACHES.get(value);
  if (existing !== undefined) {
    return {
      type: 'ok',
      value: existing.snapshot,
    };
  }
  if (!isDeepFrozenInertData(value)) {
    return cacheError('snapshot-mutable', 'A cached Snapshot must be deeply frozen inert data.');
  }
  const validated = validateDocumentSnapshot(value);
  if (validated.type === 'error') {
    return cacheError('snapshot-invalid', validated.error.safeMessage);
  }
  const snapshot = value as DocumentSnapshot;
  const hashed = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(snapshot),
  );
  if (hashed.type === 'error') {
    return cacheError('snapshot-invalid', 'The cached Snapshot is not canonical JSON data.');
  }
  if (hashed.hash !== snapshot.documentHash) {
    return cacheError(
      'document-hash-mismatch',
      'The cached Snapshot content does not match its declared document hash.',
    );
  }
  installCache({
    snapshot,
    index: createDocumentIndexFromValidatedSnapshot(snapshot),
    canonicalDocumentPayload: hashed.canonicalJson,
    canonicalDocumentPayloadUtf8: createTrustedCanonicalUtf8Text(hashed.canonicalJson),
  });
  return {
    type: 'ok',
    value: snapshot,
  };
}

/** @internal Returns a cache only for the exact independently verified object identity. */
export function getVerifiedDocumentSnapshotCache(
  snapshot: DocumentSnapshot,
): VerifiedDocumentSnapshotCache | undefined {
  const cache = VERIFIED_SNAPSHOT_CACHES.get(snapshot);
  return cache !== undefined && VERIFIED_CACHE_IDENTITIES.has(cache) ? cache : undefined;
}

/**
 * Explicitly releases the large canonical payload associated with a superseded
 * head Snapshot. WeakMap collection remains a safety net, but lifecycle owners
 * should retire old heads deterministically.
 */
export function retireVerifiedDocumentSnapshotCache(snapshot: DocumentSnapshot): boolean {
  const cache = getVerifiedDocumentSnapshotCache(snapshot);
  let retired = false;
  if (cache !== undefined) {
    VERIFIED_SNAPSHOT_CACHES.delete(snapshot);
    VERIFIED_CACHE_IDENTITIES.delete(cache);
    activeEntryCount -= 1;
    retainedCanonicalPayloadCodeUnits -= cache.canonicalDocumentPayload.length;
    retired = true;
  }
  if (retireProvisionalDocumentSnapshotCache(snapshot)) {
    retired = true;
  }
  const derivedSnapshot = PROVISIONAL_SNAPSHOT_BY_SOURCE.get(snapshot);
  if (derivedSnapshot !== undefined && retireProvisionalDocumentSnapshotCache(derivedSnapshot)) {
    retired = true;
  }
  return retired;
}

/** @internal Measurement hook for bounded-retention regression tests. */
export function getDocumentSnapshotCacheDiagnostics(): DocumentSnapshotCacheDiagnostics {
  return {
    activeEntryCount,
    retainedCanonicalPayloadCodeUnits,
  };
}

/**
 * @internal Stages a Kernel-derived cache after the Kernel has produced and
 * checked the exact canonical hash from a previously verified source cache.
 * It remains ineligible for the fast path until the Authority commits it.
 */
export function cacheKernelDerivedDocumentSnapshot(
  options: CacheDerivedDocumentSnapshotOptions,
): boolean {
  const source = getVerifiedDocumentSnapshotCache(options.sourceSnapshot);
  if (
    source === undefined ||
    getVerifiedDocumentSnapshotCache(options.snapshot) !== undefined ||
    options.sourceSnapshot === options.snapshot ||
    !isFrozenKernelDerivation(
      source.snapshot,
      options.snapshot,
      options.updatedNodes,
      options.updatedAcademicGraphObjects,
    ) ||
    options.index.getNode(options.snapshot.root.id) !== options.snapshot.root
  ) {
    return false;
  }
  const previousDerivedSnapshot = PROVISIONAL_SNAPSHOT_BY_SOURCE.get(options.sourceSnapshot);
  if (previousDerivedSnapshot !== undefined && previousDerivedSnapshot !== options.snapshot) {
    retireProvisionalDocumentSnapshotCache(previousDerivedSnapshot);
  }
  retireProvisionalDocumentSnapshotCache(options.snapshot);
  const cache = Object.freeze({
    snapshot: options.snapshot,
    index: options.index,
    canonicalDocumentPayload: options.canonicalDocumentPayload,
    canonicalDocumentPayloadUtf8:
      options.canonicalDocumentPayloadUtf8 ??
      createTrustedCanonicalUtf8Text(options.canonicalDocumentPayload),
  });
  VERIFIED_CACHE_IDENTITIES.add(cache);
  PROVISIONAL_SNAPSHOT_CACHES.set(
    options.snapshot,
    Object.freeze({
      sourceSnapshot: options.sourceSnapshot,
      cache,
    }),
  );
  PROVISIONAL_SNAPSHOT_BY_SOURCE.set(options.sourceSnapshot, options.snapshot);
  return true;
}

/**
 * Promotes one exact Kernel result only after the Authority has committed it,
 * then deterministically releases the superseded head cache.
 */
export function activateKernelDerivedDocumentSnapshotCache(
  sourceSnapshot: DocumentSnapshot,
  snapshot: DocumentSnapshot,
): boolean {
  const source = getVerifiedDocumentSnapshotCache(sourceSnapshot);
  const derived = PROVISIONAL_SNAPSHOT_CACHES.get(snapshot);
  if (
    source === undefined ||
    derived?.sourceSnapshot !== sourceSnapshot ||
    !VERIFIED_CACHE_IDENTITIES.has(derived.cache) ||
    sourceSnapshot === snapshot
  ) {
    return false;
  }
  retireProvisionalDocumentSnapshotCache(snapshot);
  installCache(derived.cache);
  retireVerifiedDocumentSnapshotCache(sourceSnapshot);
  return true;
}

function retireProvisionalDocumentSnapshotCache(snapshot: object): boolean {
  const provisional = PROVISIONAL_SNAPSHOT_CACHES.get(snapshot);
  if (provisional === undefined) {
    return false;
  }
  PROVISIONAL_SNAPSHOT_CACHES.delete(snapshot);
  if (PROVISIONAL_SNAPSHOT_BY_SOURCE.get(provisional.sourceSnapshot) === snapshot) {
    PROVISIONAL_SNAPSHOT_BY_SOURCE.delete(provisional.sourceSnapshot);
  }
  VERIFIED_CACHE_IDENTITIES.delete(provisional.cache);
  return true;
}

function isFrozenKernelDerivation(
  source: DocumentSnapshot,
  snapshot: DocumentSnapshot,
  updatedNodes: readonly DocumentNode[],
  updatedAcademicGraphObjects: readonly object[],
): boolean {
  return (
    Object.isFrozen(snapshot) &&
    snapshot.metadata === source.metadata &&
    isFrozenAcademicGraphDerivation(source, snapshot, updatedAcademicGraphObjects) &&
    snapshot.settings === source.settings &&
    updatedNodes.length > 0 &&
    updatedNodes[updatedNodes.length - 1] === snapshot.root &&
    updatedNodes.every(
      (node) => Object.isFrozen(node) && (!('children' in node) || Object.isFrozen(node.children)),
    )
  );
}

function isFrozenAcademicGraphDerivation(
  source: DocumentSnapshot,
  snapshot: DocumentSnapshot,
  updatedObjects: readonly object[],
): boolean {
  if (snapshot.academicGraph === source.academicGraph) {
    return updatedObjects.length === 0;
  }
  return (
    updatedObjects.length > 0 &&
    updatedObjects[updatedObjects.length - 1] === snapshot.academicGraph &&
    updatedObjects.every((value) => Object.isFrozen(value)) &&
    Object.isFrozen(snapshot.academicGraph.claims) &&
    snapshot.academicGraph.referenceSnapshots === source.academicGraph.referenceSnapshots &&
    snapshot.academicGraph.evidenceLinks === source.academicGraph.evidenceLinks &&
    snapshot.academicGraph.claimEvidenceRelations === source.academicGraph.claimEvidenceRelations
  );
}

function installCache(cache: VerifiedDocumentSnapshotCache): void {
  retireVerifiedDocumentSnapshotCache(cache.snapshot);
  const frozen = Object.freeze(cache);
  VERIFIED_CACHE_IDENTITIES.add(frozen);
  VERIFIED_SNAPSHOT_CACHES.set(cache.snapshot, frozen);
  activeEntryCount += 1;
  retainedCanonicalPayloadCodeUnits += cache.canonicalDocumentPayload.length;
}

function isDeepFrozenInertData(value: object): boolean {
  try {
    const pending: object[] = [value];
    const visited = new WeakSet<object>();
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || visited.has(current)) {
        continue;
      }
      if (!Object.isFrozen(current)) {
        return false;
      }
      visited.add(current);
      const isArray = Array.isArray(current);
      for (const key of Reflect.ownKeys(current)) {
        const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
        if (!isInertDataDescriptor(key, descriptor, isArray)) {
          return false;
        }
        if (descriptor.value !== null && typeof descriptor.value === 'object') {
          pending.push(descriptor.value as object);
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function isInertDataDescriptor(
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
  ownerIsArray: boolean,
): descriptor is PropertyDescriptor & { readonly value: unknown } {
  return (
    typeof key === 'string' &&
    descriptor !== undefined &&
    'value' in descriptor &&
    (descriptor.enumerable === true || (ownerIsArray && key === 'length'))
  );
}

function cacheError(
  reason: VerifiedDocumentSnapshotCacheError['reason'],
  safeMessage: string,
): Result<never, VerifiedDocumentSnapshotCacheError> {
  return {
    type: 'error',
    error: {
      reason,
      safeMessage,
    },
  };
}
