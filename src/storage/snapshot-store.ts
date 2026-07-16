import type { Result } from '../base/errors/nireco-error.js';
import { serializeCanonicalJson } from '../base/serialization/canonical-json.js';
import type { ResourceUri } from '../base/uri/resource-uri.js';
import type { DocumentSnapshot } from '../model/snapshot.js';
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
  readonly sequence: number;
  readonly documentHash: SnapshotManifest['documentHash'];
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
    const encoded = this.#codec.encode(input.snapshot);
    if (encoded.type === 'error') {
      return portError('snapshot-validate-temporary', 'corrupt', encoded.error.safeMessage);
    }

    const snapshotKey = `snapshot:${input.revision.id}`;
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

    const currentManifest = await this.#bytes.readManifest(input.revision.uri);
    if (currentManifest.type === 'error') {
      return currentManifest;
    }
    if (
      currentManifest.value !== undefined &&
      currentManifest.value.sequence > input.revision.sequence
    ) {
      return portError(
        'snapshot-manifest-switch',
        'generation-conflict',
        'The Snapshot manifest sequence cannot move backward.',
      );
    }

    return this.#bytes.switchManifest(input.fence, currentManifest.value?.generation ?? 0, {
      manifestVersion: 1,
      uri: input.revision.uri,
      revisionId: input.revision.id,
      sequence: input.revision.sequence,
      documentHash: input.revision.documentHash,
      snapshotKey,
    });
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

    const bytes = await this.#bytes.readSnapshot(uri, manifest.value.snapshotKey);
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
    if (!snapshotMatchesManifest(decoded.value, manifest.value)) {
      return portError(
        'snapshot-manifest-read',
        'corrupt',
        'The Snapshot identity does not match its manifest.',
      );
    }

    return {
      type: 'ok',
      value: {
        manifest: manifest.value,
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

function snapshotMatchesManifest(snapshot: DocumentSnapshot, manifest: SnapshotManifest): boolean {
  return (
    snapshot.revisionId === manifest.revisionId && snapshot.documentHash === manifest.documentHash
  );
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
