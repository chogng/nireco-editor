import {
  parseDebugId,
  parseEntityId,
  parseNodeId,
  parseOperationId,
  parseProposalId,
  parseRevisionId,
  parseSessionId,
  parseTransactionId,
  parseWorkspaceId,
  type DebugId,
  type EntityId,
  type IdentifierParseResult,
  type NodeId,
  type OperationId,
  type ProposalId,
  type RevisionId,
  type SessionId,
  type TransactionId,
  type WorkspaceId,
} from './identifiers.js';

export interface UuidV7Seed {
  readonly unixMilliseconds: number;
  readonly randomBytes: Uint8Array;
}

export interface IUuidV7SeedSource {
  nextSeed(): UuidV7Seed;
}

export type UuidV7AllocationErrorReason =
  'invalid-timestamp' | 'invalid-random-byte-count' | 'sequence-exhausted';

export class UuidV7AllocationError extends Error {
  readonly reason: UuidV7AllocationErrorReason;

  constructor(reason: UuidV7AllocationErrorReason) {
    super(`Unable to allocate UUIDv7: ${reason}.`);
    this.name = 'UuidV7AllocationError';
    this.reason = reason;
  }
}

/**
 * Trusted UUIDv7 allocation boundary.
 *
 * The source owns ambient clock and entropy access. This allocator only consumes
 * injected seeds, preserving the reducer rule that core code never reads time or
 * randomness. UUIDs remain lexicographically monotonic if the clock repeats or
 * moves backwards.
 */
export class UuidV7IdAllocator {
  readonly #source: IUuidV7SeedSource;
  #previousBytes: Uint8Array | undefined;

  constructor(source: IUuidV7SeedSource) {
    this.#source = source;
  }

  allocateWorkspaceId(): WorkspaceId {
    return this.#allocate(parseWorkspaceId);
  }

  allocateRevisionId(): RevisionId {
    return this.#allocate(parseRevisionId);
  }

  allocateTransactionId(): TransactionId {
    return this.#allocate(parseTransactionId);
  }

  allocateOperationId(): OperationId {
    return this.#allocate(parseOperationId);
  }

  allocateNodeId(): NodeId {
    return this.#allocate(parseNodeId);
  }

  allocateEntityId(): EntityId {
    return this.#allocate(parseEntityId);
  }

  allocateProposalId(): ProposalId {
    return this.#allocate(parseProposalId);
  }

  allocateSessionId(): SessionId {
    return this.#allocate(parseSessionId);
  }

  allocateDebugId(): DebugId {
    return this.#allocate(parseDebugId);
  }

  #allocate<TIdentifier>(
    parse: (value: string) => IdentifierParseResult<TIdentifier>,
  ): TIdentifier {
    const candidate = createUuidV7Bytes(this.#source.nextSeed());
    const bytes =
      this.#previousBytes === undefined
        ? candidate
        : ensureMonotonicUuidV7(candidate, this.#previousBytes);
    this.#previousBytes = bytes;

    const parsed = parse(formatUuid(bytes));
    if (parsed.type === 'invalid') {
      throw new UuidV7AllocationError('invalid-random-byte-count');
    }
    return parsed.value;
  }
}

export function createUuidV7(seed: UuidV7Seed): string {
  return formatUuid(createUuidV7Bytes(seed));
}

function createUuidV7Bytes(seed: UuidV7Seed): Uint8Array {
  validateSeed(seed);

  const bytes = new Uint8Array(16);
  writeTimestamp(bytes, seed.unixMilliseconds);
  const random = seed.randomBytes;
  bytes[6] = 0x70 | ((random[0] ?? 0) & 0x0f);
  bytes[7] = random[1] ?? 0;
  bytes[8] = 0x80 | ((random[2] ?? 0) & 0x3f);
  for (let index = 9; index < 16; index += 1) {
    bytes[index] = random[index - 6] ?? 0;
  }
  return bytes;
}

function validateSeed(seed: UuidV7Seed): void {
  if (
    !Number.isSafeInteger(seed.unixMilliseconds) ||
    seed.unixMilliseconds < 0 ||
    seed.unixMilliseconds > 0xffff_ffff_ffff
  ) {
    throw new UuidV7AllocationError('invalid-timestamp');
  }
  if (seed.randomBytes.length !== 10) {
    throw new UuidV7AllocationError('invalid-random-byte-count');
  }
}

function writeTimestamp(bytes: Uint8Array, timestamp: number): void {
  let remaining = timestamp;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
}

function ensureMonotonicUuidV7(candidate: Uint8Array, previous: Uint8Array): Uint8Array {
  if (compareTimestamp(candidate, previous) > 0) {
    return candidate;
  }

  const next = previous.slice();
  if (!incrementRandomField(next)) {
    throw new UuidV7AllocationError('sequence-exhausted');
  }
  return next;
}

function compareTimestamp(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < 6; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function incrementRandomField(bytes: Uint8Array): boolean {
  for (let index = 15; index >= 9; index -= 1) {
    if (incrementByte(bytes, index, 0xff)) {
      return true;
    }
  }
  if (incrementByte(bytes, 8, 0xbf, 0x80)) {
    return true;
  }
  if (incrementByte(bytes, 7, 0xff)) {
    return true;
  }
  return incrementByte(bytes, 6, 0x7f, 0x70);
}

function incrementByte(bytes: Uint8Array, index: number, maximum: number, reset = 0): boolean {
  const value = bytes[index] ?? reset;
  if (value < maximum) {
    bytes[index] = value + 1;
    return true;
  }
  bytes[index] = reset;
  return false;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}
