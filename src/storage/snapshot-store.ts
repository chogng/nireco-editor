import type { Result } from '../base/errors/nireco-error.js';
import { parseContentHash, parseRevisionId, parseTransactionId } from '../base/ids/identifiers.js';
import { serializeCanonicalJson } from '../base/serialization/canonical-json.js';
import { parseIsoTimestamp } from '../base/time/clock.js';
import { isDocumentUri, type ResourceUri } from '../base/uri/resource-uri.js';
import type { Revision } from '../model/revision/revision.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
import { decodeStrictActorRef } from '../model/transaction/transaction-runtime.js';
import type {
  AuthorityFence,
  DurabilityPortError,
  IAtomicSnapshotStore,
  SnapshotCommitInput,
  SnapshotManifest,
  SnapshotReadResult,
} from '../workspace/document-authority/durability-ports.js';
import { decodeUtf8, encodeUtf8 } from './wal-record-codec.js';

export interface SnapshotCodecError {
  readonly reason: 'canonicalization-failed' | 'invalid-utf8' | 'invalid-json' | 'schema-invalid';
  readonly safeMessage: string;
}

export interface IDocumentSnapshotDecoder {
  decode(value: unknown): Result<DocumentSnapshot, SnapshotCodecError>;
}

export interface ISnapshotCodec {
  encode(snapshot: DocumentSnapshot): Result<Uint8Array, SnapshotCodecError>;
  decode(bytes: Uint8Array): Result<DocumentSnapshot, SnapshotCodecError>;
}

export class CanonicalSnapshotCodec implements ISnapshotCodec {
  readonly #decoder: IDocumentSnapshotDecoder;

  constructor(decoder: IDocumentSnapshotDecoder) {
    this.#decoder = decoder;
  }

  encode(snapshot: DocumentSnapshot): Result<Uint8Array, SnapshotCodecError> {
    const serialized = serializeCanonicalJson(snapshot);
    if (serialized.type === 'error') {
      return codecError('canonicalization-failed', 'The Snapshot is not canonical JSON.');
    }
    return {
      type: 'ok',
      value: encodeUtf8(serialized.value),
    };
  }

  decode(bytes: Uint8Array): Result<DocumentSnapshot, SnapshotCodecError> {
    const decoded = decodeUtf8(bytes);
    if (decoded.type === 'error') {
      return codecError('invalid-utf8', 'The Snapshot is not valid UTF-8.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded.value) as unknown;
    } catch {
      return codecError('invalid-json', 'The Snapshot is not valid JSON.');
    }
    return this.#decoder.decode(parsed);
  }
}

interface SnapshotManifestDraft {
  readonly manifestVersion: 1;
  readonly uri: ResourceUri;
  readonly revisionId: SnapshotManifest['revisionId'];
  readonly parentRevisionId: SnapshotManifest['parentRevisionId'];
  readonly transactionId: SnapshotManifest['transactionId'];
  readonly sequence: number;
  readonly documentHash: SnapshotManifest['documentHash'];
  readonly actor: SnapshotManifest['actor'];
  readonly createdAt: SnapshotManifest['createdAt'];
  readonly snapshotKey: string;
}

export interface ISnapshotByteStorage {
  writeTemporary(
    fence: AuthorityFence,
    temporaryKey: string,
    bytes: Uint8Array,
  ): Promise<Result<void, DurabilityPortError>>;
  fsyncTemporary(
    fence: AuthorityFence,
    temporaryKey: string,
  ): Promise<Result<void, DurabilityPortError>>;
  readTemporary(
    uri: ResourceUri,
    temporaryKey: string,
  ): Promise<Result<Uint8Array, DurabilityPortError>>;
  atomicRename(
    fence: AuthorityFence,
    temporaryKey: string,
    snapshotKey: string,
  ): Promise<Result<void, DurabilityPortError>>;
  readManifest(
    uri: ResourceUri,
  ): Promise<Result<SnapshotManifest | undefined, DurabilityPortError>>;
  readSnapshot(
    uri: ResourceUri,
    snapshotKey: string,
  ): Promise<Result<Uint8Array | undefined, DurabilityPortError>>;
  switchManifest(
    fence: AuthorityFence,
    expectedGeneration: number,
    manifest: SnapshotManifestDraft,
  ): Promise<Result<SnapshotManifest, DurabilityPortError>>;
}

export interface AtomicSnapshotStoreOptions {
  readonly bytes: ISnapshotByteStorage;
  readonly codec: ISnapshotCodec;
}

export class AtomicSnapshotStore implements IAtomicSnapshotStore {
  readonly #bytes: ISnapshotByteStorage;
  readonly #codec: ISnapshotCodec;

  constructor(options: AtomicSnapshotStoreOptions) {
    this.#bytes = options.bytes;
    this.#codec = options.codec;
  }

  async commit(input: SnapshotCommitInput): Promise<Result<SnapshotManifest, DurabilityPortError>> {
    const manifestDraft = prepareSnapshotManifestDraft(input);
    if (manifestDraft.type === 'error') {
      return manifestDraft;
    }
    const persisted = await this.#persistSnapshot(input, manifestDraft.value.snapshotKey);
    if (persisted.type === 'error') {
      return persisted;
    }
    return this.#switchManifest(input, manifestDraft.value);
  }

  async #persistSnapshot(
    input: SnapshotCommitInput,
    snapshotKey: string,
  ): Promise<Result<void, DurabilityPortError>> {
    const encoded = this.#codec.encode(input.snapshot);
    if (encoded.type === 'error') {
      return portError('snapshot-validate-temporary', 'corrupt', encoded.error.safeMessage);
    }

    const temporaryKey = `${snapshotKey}.tmp`;
    const written = await this.#bytes.writeTemporary(input.fence, temporaryKey, encoded.value);
    if (written.type === 'error') {
      return written;
    }

    const synced = await this.#bytes.fsyncTemporary(input.fence, temporaryKey);
    if (synced.type === 'error') {
      return synced;
    }

    const validated = await this.#validateTemporary(input, temporaryKey, encoded.value);
    if (validated.type === 'error') {
      return validated;
    }

    const renamed = await this.#bytes.atomicRename(input.fence, temporaryKey, snapshotKey);
    if (renamed.type === 'error') {
      return renamed;
    }
    return {
      type: 'ok',
      value: undefined,
    };
  }

  async #switchManifest(
    input: SnapshotCommitInput,
    manifestDraft: SnapshotManifestDraft,
  ): Promise<Result<SnapshotManifest, DurabilityPortError>> {
    const currentManifest = await this.#bytes.readManifest(input.revision.uri);
    if (currentManifest.type === 'error') {
      return currentManifest;
    }
    const current =
      currentManifest.value === undefined
        ? undefined
        : normalizeSnapshotManifest(currentManifest.value, input.revision.uri);
    if (currentManifest.value !== undefined && current === undefined) {
      return portError(
        'snapshot-manifest-read',
        'corrupt',
        'The current Snapshot manifest does not contain a valid Revision identity.',
      );
    }
    const advance = validateManifestAdvance(current, input.revision);
    if (advance.type === 'error') {
      return advance;
    }

    const switched = await this.#bytes.switchManifest(
      input.fence,
      current?.manifest.generation ?? 0,
      manifestDraft,
    );
    if (switched.type === 'error') {
      return switched;
    }
    const normalized = normalizeSnapshotManifest(switched.value, input.revision.uri);
    return normalized === undefined
      ? portError(
          'snapshot-manifest-switch',
          'corrupt',
          'The switched Snapshot manifest lost its Revision identity.',
        )
      : {
          type: 'ok',
          value: normalized.manifest,
        };
  }

  async readLatest(
    uri: ResourceUri,
  ): Promise<Result<SnapshotReadResult | undefined, DurabilityPortError>> {
    const manifest = await this.#bytes.readManifest(uri);
    if (manifest.type === 'error') {
      return manifest;
    }
    if (manifest.value === undefined) {
      return {
        type: 'ok',
        value: undefined,
      };
    }

    const normalizedManifest = normalizeSnapshotManifest(manifest.value, uri);
    if (normalizedManifest === undefined) {
      return portError(
        'snapshot-manifest-read',
        'corrupt',
        'The Snapshot manifest does not contain a valid immutable Revision identity.',
      );
    }

    const bytes = await this.#bytes.readSnapshot(uri, normalizedManifest.manifest.snapshotKey);
    if (bytes.type === 'error') {
      return bytes;
    }
    if (bytes.value === undefined) {
      return portError(
        'snapshot-manifest-read',
        'corrupt',
        'The Snapshot manifest references a missing Snapshot.',
      );
    }

    const decoded = this.#codec.decode(bytes.value);
    if (decoded.type === 'error') {
      return portError('snapshot-manifest-read', 'corrupt', decoded.error.safeMessage);
    }
    if (!snapshotMatchesManifestRevision(decoded.value, normalizedManifest.revision)) {
      return portError(
        'snapshot-manifest-read',
        'corrupt',
        'The Snapshot identity does not match its manifest.',
      );
    }

    return {
      type: 'ok',
      value: {
        manifest: normalizedManifest.manifest,
        revision: normalizedManifest.revision,
        snapshot: decoded.value,
      },
    };
  }

  async #validateTemporary(
    input: SnapshotCommitInput,
    temporaryKey: string,
    expectedBytes: Uint8Array,
  ): Promise<Result<void, DurabilityPortError>> {
    const temporary = await this.#bytes.readTemporary(input.revision.uri, temporaryKey);
    if (temporary.type === 'error') {
      return temporary;
    }
    if (!equalBytes(temporary.value, expectedBytes)) {
      return portError(
        'snapshot-validate-temporary',
        'corrupt',
        'The temporary Snapshot changed while being written.',
      );
    }

    const decoded = this.#codec.decode(temporary.value);
    if (decoded.type === 'error' || !snapshotMatchesRevision(decoded, input)) {
      return portError(
        'snapshot-validate-temporary',
        'corrupt',
        decoded.type === 'error'
          ? decoded.error.safeMessage
          : 'The temporary Snapshot does not match the Revision.',
      );
    }

    return {
      type: 'ok',
      value: undefined,
    };
  }
}

function prepareSnapshotManifestDraft(
  input: SnapshotCommitInput,
): Result<SnapshotManifestDraft, DurabilityPortError> {
  const manifestDraft: SnapshotManifestDraft = {
    manifestVersion: 1,
    uri: input.revision.uri,
    revisionId: input.revision.id,
    parentRevisionId: input.revision.parentRevisionId,
    transactionId: input.revision.transactionId,
    sequence: input.revision.sequence,
    documentHash: input.revision.documentHash,
    actor: input.revision.actor,
    createdAt: input.revision.createdAt,
    snapshotKey: `snapshot:${input.revision.id}`,
  };
  if (input.fence.uri !== input.revision.uri) {
    return invalidSnapshotCommitIdentity();
  }
  if (input.snapshot.revisionId !== input.revision.id) {
    return invalidSnapshotCommitIdentity();
  }
  if (input.snapshot.documentHash !== input.revision.documentHash) {
    return invalidSnapshotCommitIdentity();
  }
  const normalized = normalizeSnapshotManifest(
    {
      ...manifestDraft,
      generation: 1,
    },
    input.revision.uri,
  );
  return normalized === undefined
    ? invalidSnapshotCommitIdentity()
    : {
        type: 'ok',
        value: manifestDraft,
      };
}

function invalidSnapshotCommitIdentity(): Result<never, DurabilityPortError> {
  return portError(
    'snapshot-validate-temporary',
    'corrupt',
    'The Snapshot commit does not contain a valid immutable Revision identity.',
  );
}

function validateManifestAdvance(
  current: NormalizedSnapshotManifest | undefined,
  nextRevision: Revision,
): Result<void, DurabilityPortError> {
  if (current === undefined) {
    return okResult();
  }
  if (current.manifest.generation === Number.MAX_SAFE_INTEGER) {
    return manifestGenerationConflict('The Snapshot manifest generation is exhausted.');
  }
  if (current.revision.sequence > nextRevision.sequence) {
    return manifestGenerationConflict('The Snapshot manifest sequence cannot move backward.');
  }
  if (
    current.revision.sequence === nextRevision.sequence &&
    !sameImmutableRevisionIdentity(current.revision, nextRevision)
  ) {
    return manifestGenerationConflict(
      'The Snapshot manifest cannot replace a different Revision at the same sequence.',
    );
  }
  return okResult();
}

function sameImmutableRevisionIdentity(left: Revision, right: Revision): boolean {
  const leftActor = serializeCanonicalJson(left.actor);
  const rightActor = serializeCanonicalJson(right.actor);
  return (
    left.id === right.id &&
    left.uri === right.uri &&
    left.parentRevisionId === right.parentRevisionId &&
    left.transactionId === right.transactionId &&
    left.sequence === right.sequence &&
    left.documentHash === right.documentHash &&
    left.createdAt === right.createdAt &&
    leftActor.type === 'ok' &&
    rightActor.type === 'ok' &&
    leftActor.value === rightActor.value
  );
}

function manifestGenerationConflict(safeMessage: string): Result<never, DurabilityPortError> {
  return portError('snapshot-manifest-switch', 'generation-conflict', safeMessage);
}

function okResult(): Result<void, DurabilityPortError> {
  return {
    type: 'ok',
    value: undefined,
  };
}

function snapshotMatchesRevision(
  decoded: Result<DocumentSnapshot, SnapshotCodecError>,
  input: SnapshotCommitInput,
): boolean {
  return (
    decoded.type === 'ok' &&
    decoded.value.revisionId === input.revision.id &&
    decoded.value.documentHash === input.revision.documentHash
  );
}

function snapshotMatchesManifestRevision(snapshot: DocumentSnapshot, revision: Revision): boolean {
  return snapshot.revisionId === revision.id && snapshot.documentHash === revision.documentHash;
}

interface NormalizedSnapshotManifest {
  readonly manifest: SnapshotManifest;
  readonly revision: Revision;
}

const SNAPSHOT_MANIFEST_KEYS: ReadonlySet<string> = new Set([
  'actor',
  'createdAt',
  'documentHash',
  'generation',
  'manifestVersion',
  'parentRevisionId',
  'revisionId',
  'sequence',
  'snapshotKey',
  'transactionId',
  'uri',
]);

function normalizeSnapshotManifest(
  value: unknown,
  expectedUri: ResourceUri,
): NormalizedSnapshotManifest | undefined {
  try {
    const fields = readClosedDataRecord(value, SNAPSHOT_MANIFEST_KEYS);
    if (fields?.get('manifestVersion') !== 1) {
      return undefined;
    }
    const identity = decodeManifestIdentity(fields, expectedUri);
    if (identity === undefined) {
      return undefined;
    }
    const state = decodeManifestState(fields, identity.revisionId);
    if (state === undefined) {
      return undefined;
    }
    if (
      (state.sequence === 0) !== (identity.parentRevisionId === null) ||
      identity.revisionId === identity.parentRevisionId
    ) {
      return undefined;
    }

    const revision: Revision = {
      id: identity.revisionId,
      uri: identity.uri,
      parentRevisionId: identity.parentRevisionId,
      transactionId: identity.transactionId,
      sequence: state.sequence,
      documentHash: identity.documentHash,
      actor: state.actor,
      createdAt: state.createdAt,
      durability: 'snapshot',
    };
    return {
      revision,
      manifest: {
        manifestVersion: 1,
        uri: identity.uri,
        revisionId: identity.revisionId,
        parentRevisionId: identity.parentRevisionId,
        transactionId: identity.transactionId,
        sequence: state.sequence,
        documentHash: identity.documentHash,
        actor: state.actor,
        createdAt: state.createdAt,
        snapshotKey: state.snapshotKey,
        generation: state.generation,
      },
    };
  } catch {
    return undefined;
  }
}

interface DecodedManifestIdentity {
  readonly uri: Revision['uri'];
  readonly revisionId: Revision['id'];
  readonly parentRevisionId: Revision['parentRevisionId'];
  readonly transactionId: Revision['transactionId'];
  readonly documentHash: Revision['documentHash'];
}

function decodeManifestIdentity(
  fields: ReadonlyMap<string, unknown>,
  expectedUri: ResourceUri,
): DecodedManifestIdentity | undefined {
  const uri = fields.get('uri');
  if (typeof uri !== 'string' || !isDocumentUri(uri) || uri !== expectedUri) {
    return undefined;
  }
  const revisionId = parseStringField(fields.get('revisionId'), parseRevisionId);
  const parentRevisionId = parseParentRevisionId(fields.get('parentRevisionId'));
  const transactionId = parseStringField(fields.get('transactionId'), parseTransactionId);
  const documentHash = parseStringField(fields.get('documentHash'), parseContentHash);
  if (
    revisionId === undefined ||
    parentRevisionId.type === 'invalid' ||
    transactionId === undefined ||
    documentHash === undefined
  ) {
    return undefined;
  }
  return {
    uri,
    revisionId,
    parentRevisionId: parentRevisionId.value,
    transactionId,
    documentHash,
  };
}

interface DecodedManifestState {
  readonly sequence: number;
  readonly actor: Revision['actor'];
  readonly createdAt: Revision['createdAt'];
  readonly snapshotKey: string;
  readonly generation: number;
}

function decodeManifestState(
  fields: ReadonlyMap<string, unknown>,
  revisionId: Revision['id'],
): DecodedManifestState | undefined {
  const actor = decodeStrictActorRef(fields.get('actor'));
  const createdAtValue = fields.get('createdAt');
  const createdAt =
    typeof createdAtValue === 'string' ? parseIsoTimestamp(createdAtValue) : undefined;
  if (actor === undefined || createdAt?.type !== 'valid') {
    return undefined;
  }
  const sequence = fields.get('sequence');
  const generation = fields.get('generation');
  const snapshotKey = fields.get('snapshotKey');
  if (
    !isNonNegativeSafeInteger(sequence) ||
    !isPositiveSafeInteger(generation) ||
    snapshotKey !== `snapshot:${revisionId}`
  ) {
    return undefined;
  }
  return {
    sequence,
    actor,
    createdAt: createdAt.value,
    snapshotKey,
    generation,
  };
}

function readClosedDataRecord(
  value: unknown,
  expectedKeys: ReadonlySet<string>,
): ReadonlyMap<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.size ||
    keys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))
  ) {
    return undefined;
  }
  const fields = new Map<string, unknown>();
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return undefined;
    }
    fields.set(key, descriptor.value);
  }
  return fields;
}

function parseStringField<TValue>(
  value: unknown,
  parse: (
    candidate: string,
  ) => { readonly type: 'valid'; readonly value: TValue } | { readonly type: 'invalid' },
): TValue | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = parse(value);
  return parsed.type === 'valid' ? parsed.value : undefined;
}

type ParentRevisionIdResult =
  | {
      readonly type: 'valid';
      readonly value: Revision['parentRevisionId'];
    }
  | {
      readonly type: 'invalid';
    };

function parseParentRevisionId(value: unknown): ParentRevisionIdResult {
  if (value === null) {
    return {
      type: 'valid',
      value: null,
    };
  }
  const parsed = parseStringField(value, parseRevisionId);
  return parsed === undefined
    ? {
        type: 'invalid',
      }
    : {
        type: 'valid',
        value: parsed,
      };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value >= 1;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function codecError(
  reason: SnapshotCodecError['reason'],
  safeMessage: string,
): Result<never, SnapshotCodecError> {
  return {
    type: 'error',
    error: {
      reason,
      safeMessage,
    },
  };
}

function portError(
  stage: DurabilityPortError['stage'],
  reason: DurabilityPortError['reason'],
  safeMessage: string,
): Result<never, DurabilityPortError> {
  return {
    type: 'error',
    error: {
      stage,
      reason,
      safeMessage,
    },
  };
}
