import { describe, expect, it } from 'vitest';

import type { Result } from '../../src/base/errors/nireco-error.js';
import { HASH_DOMAINS } from '../../src/base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable } from '../../src/base/hashing/portable-sha-256.js';
import {
  parseTransactionId,
  type RevisionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import type { DocumentUri } from '../../src/base/uri/resource-uri.js';
import {
  getDocumentSnapshotCacheDiagnostics,
  getVerifiedDocumentSnapshotCache,
} from '../../src/model/document-snapshot-cache.js';
import { createDocumentIndex } from '../../src/model/node/document-index.js';
import type { Revision } from '../../src/model/revision/revision.js';
import { createDocumentHashPayload, type DocumentSnapshot } from '../../src/model/snapshot.js';
import type { Transaction } from '../../src/model/transaction/transaction.js';
import { validateDocumentSnapshot } from '../../src/model/schema/manuscript-validator.js';
import { InMemoryDurableStorage } from '../../src/storage/in-memory-durable-storage.js';
import {
  AtomicSnapshotStore,
  CanonicalSnapshotCodec,
  type IDocumentSnapshotDecoder,
  type SnapshotCodecError,
} from '../../src/storage/snapshot-store.js';
import { PortableWalRecordCodec } from '../../src/storage/wal-record-codec.js';
import { InMemoryAuthorityLeaseCoordinator } from '../../src/workspace/document-authority/authority-lease.js';
import { SingleDocumentAuthority } from '../../src/workspace/document-authority/single-document-authority.js';
import type { IDocumentAuthority } from '../../src/workspace/contracts.js';
import type { IIdAllocator } from '../../src/workspace/id-allocator.js';
import { InMemoryModelRegistry } from '../../src/workspace/in-memory-model-registry.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  MINIMAL_FIXTURE_IDS,
  validDocumentUri,
  validIsoTimestamp,
  validUtf16Offset,
} from '../test-support/fixtures.js';

describe('Kernel CommitPreparer and SingleDocumentAuthority', () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    'rejects an unrecoverable initial Revision sequence %s',
    (sequence) => {
      const uri = validDocumentUri('nireco://workspace-01/document/invalid-initial-revision');
      const initialSnapshot = createMinimalSnapshot();
      const initialRevision = {
        ...createInitialRevision(uri, initialSnapshot),
        sequence,
      };

      expect(() => createAuthorityForInitialState(initialRevision, initialSnapshot)).toThrow(
        'Initial Authority Revision, Snapshot, URI, and lease must agree and be durable.',
      );
    },
  );

  it('commits a real ReplaceText transaction through memory, WAL and Snapshot durability', async () => {
    const harness = createHarness();
    const transaction = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      {
        start: 0,
        end: 5,
        replacement: 'Welcome',
      },
    );

    const committed = await harness.authority.apply(transaction);

    expect(committed.type).toBe('ok');
    if (committed.type === 'error') {
      throw new Error(committed.error.safeMessage);
    }
    expect(readText(committed.value.snapshot)).toBe('Welcome, Nireco.');
    expect(committed.value.snapshot.documentHash).not.toBe(harness.initialSnapshot.documentHash);
    expect(committed.value.positionMap.fromRevisionId).toBe(harness.initialSnapshot.revisionId);
    expect(committed.value.positionMap.toRevisionId).toBe(committed.value.revisionId);
    expect(committed.value.inverse.operations[0]).toMatchObject({
      type: 'replace-text',
      replacement: 'Hello',
    });
    expect(Object.isFrozen(committed.value.positionMap)).toBe(true);
    expect(Object.isFrozen(committed.value.inverse)).toBe(true);
    expect(Object.isFrozen(committed.value.inverse.operations)).toBe(true);
    expect(harness.authority.getRevision(committed.value.revisionId)).toMatchObject({
      type: 'ok',
      value: {
        parentRevisionId: harness.initialSnapshot.revisionId,
        sequence: 1,
        transactionId: transaction.id,
        documentHash: committed.value.snapshot.documentHash,
        durability: 'memory',
      },
    });

    await expect(
      harness.authority.whenDurable(harness.uri, committed.value.revisionId, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'ok',
      value: {
        revisionId: committed.value.revisionId,
        achievedDurability: 'snapshot',
        authorityMode: 'read-write',
      },
    });
    expect(harness.storage.currentManifest(harness.uri)).toMatchObject({
      revisionId: committed.value.revisionId,
      documentHash: committed.value.snapshot.documentHash,
      sequence: 1,
    });
  });

  it('commits an ordered multi-ReplaceText draft with a reverse inverse through durability', async () => {
    const harness = createHarness();
    const seed = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      {
        start: 7,
        end: 13,
        replacement: 'Kernel runtime',
      },
    );
    const firstOperation = seed.operations[0];
    if (firstOperation.type !== 'replace-text') {
      throw new Error('Expected a ReplaceText operation.');
    }
    const transaction: Transaction = {
      ...seed,
      operations: [
        firstOperation,
        {
          id: harness.ids.allocateOperationId(),
          type: 'replace-text',
          textNodeId: MINIMAL_FIXTURE_IDS.text,
          startUtf16Offset: validUtf16Offset(14),
          endUtf16Offset: validUtf16Offset(21),
          replacement: 'replay',
        },
      ],
    };

    const committed = await harness.authority.apply(transaction);
    expect(committed.type).toBe('ok');
    if (committed.type === 'error') {
      throw new Error(committed.error.safeMessage);
    }
    expect(readText(committed.value.snapshot)).toBe('Hello, Kernel replay.');
    expect(committed.value.inverse.operations.map((operation) => operation.replacement)).toEqual([
      'runtime',
      'Nireco',
    ]);
    expect(Object.isFrozen(committed.value.inverse.operations)).toBe(true);

    await expect(
      harness.authority.whenDurable(harness.uri, committed.value.revisionId, 'snapshot'),
    ).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'snapshot',
        revisionId: committed.value.revisionId,
      },
    });
    expect(harness.storage.currentManifest(harness.uri)).toMatchObject({
      revisionId: committed.value.revisionId,
      documentHash: committed.value.snapshot.documentHash,
    });
  });

  it('activates only the committed Authority head cache and releases it on dispose', async () => {
    const baseline = getDocumentSnapshotCacheDiagnostics();
    const harness = createHarness();

    try {
      expect(getVerifiedDocumentSnapshotCache(harness.initialSnapshot)?.snapshot).toBe(
        harness.initialSnapshot,
      );
      expect(getDocumentSnapshotCacheDiagnostics().activeEntryCount).toBe(
        baseline.activeEntryCount + 1,
      );
      const transaction = createTransaction(
        harness.ids,
        harness.uri,
        harness.initialSnapshot.revisionId,
        harness.initialSnapshot.documentHash,
        {
          start: 0,
          end: 0,
          replacement: 'x',
        },
      );
      const committed = await harness.authority.apply(transaction);
      expect(committed.type).toBe('ok');
      if (committed.type === 'error') {
        throw new Error(committed.error.safeMessage);
      }

      expect(getVerifiedDocumentSnapshotCache(harness.initialSnapshot)).toBeUndefined();
      expect(getVerifiedDocumentSnapshotCache(committed.value.snapshot)?.snapshot).toBe(
        committed.value.snapshot,
      );
      expect(getDocumentSnapshotCacheDiagnostics().activeEntryCount).toBe(
        baseline.activeEntryCount + 1,
      );
    } finally {
      await harness.authority.dispose();
    }

    expect(getDocumentSnapshotCacheDiagnostics()).toEqual(baseline);
  });

  it('leaves head, Snapshot and WAL untouched when a later ordered Operation fails', async () => {
    const harness = createHarness();
    const seed = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      {
        start: 14,
        end: 14,
        replacement: ' draft',
      },
    );
    const firstOperation = seed.operations[0];
    if (firstOperation.type !== 'replace-text') {
      throw new Error('Expected a ReplaceText operation.');
    }
    const transaction: Transaction = {
      ...seed,
      operations: [
        firstOperation,
        {
          id: harness.ids.allocateOperationId(),
          type: 'replace-text',
          textNodeId: MINIMAL_FIXTURE_IDS.text,
          startUtf16Offset: validUtf16Offset(999),
          endUtf16Offset: validUtf16Offset(999),
          replacement: 'never-applied',
        },
      ],
    };

    const rejected = await harness.authority.apply(transaction);

    expect(rejected).toMatchObject({
      type: 'error',
      error: {
        code: 'POSITION_INVALID',
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: harness.initialSnapshot.revisionId,
    });
    expect(harness.authority.getRevision(harness.initialSnapshot.revisionId)).toMatchObject({
      type: 'ok',
      value: {
        sequence: 0,
        documentHash: harness.initialSnapshot.documentHash,
      },
    });
    expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
    expect(harness.storage.currentManifest(harness.uri)).toBeUndefined();
    expect(readText(harness.initialSnapshot)).toBe('Hello, Nireco.');
  });

  it('keeps heterogeneous ordered Operations behind CAPABILITY_UNSUPPORTED', async () => {
    const harness = createHarness();
    const seed = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      { start: 0, end: 0, replacement: 'x' },
    );
    const transaction: Transaction = {
      ...seed,
      operations: [
        seed.operations[0],
        {
          id: harness.ids.allocateOperationId(),
          type: 'set-node-attributes',
          nodeId: MINIMAL_FIXTURE_IDS.paragraph,
          attributes: { alignment: 'center' },
        },
      ],
    };

    await expect(harness.authority.apply(transaction)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'CAPABILITY_UNSUPPORTED',
        category: 'compatibility',
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: harness.initialSnapshot.revisionId,
    });
    expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
  });

  it('rejects reuse of a committed Transaction ID on a later Revision', async () => {
    const harness = createHarness();
    const firstTransaction = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      {
        start: 0,
        end: 5,
        replacement: 'First',
      },
    );
    const first = await harness.authority.apply(firstTransaction);
    if (first.type === 'error') {
      throw new Error(first.error.safeMessage);
    }
    await harness.authority.whenDurable(harness.uri, first.value.revisionId, 'wal');
    const secondTransaction = {
      ...createTransaction(
        harness.ids,
        harness.uri,
        first.value.revisionId,
        first.value.snapshot.documentHash,
        {
          start: 0,
          end: 5,
          replacement: 'Again',
        },
      ),
      id: firstTransaction.id,
    };

    const rejected = await harness.authority.apply(secondTransaction);

    expect(rejected).toMatchObject({
      type: 'error',
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        currentRevisionId: first.value.revisionId,
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: first.value.revisionId,
    });
  });

  it('exposes the Authority path as the writable Model entrypoint and preserves revision reads', async () => {
    const harness = createHarness();
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority: harness.authority,
    });
    const created = await registry.create({
      uri: harness.uri,
      snapshot: harness.initialSnapshot,
    });
    if (created.type === 'error') {
      throw new Error(created.error.safeMessage);
    }
    const transaction = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      {
        start: 14,
        end: 14,
        replacement: '!',
      },
    );

    const committed = await created.value.applyTransaction(transaction);

    expect(committed.type).toBe('ok');
    if (committed.type === 'error') {
      throw new Error(committed.error.safeMessage);
    }
    expect(created.value.headRevisionId).toBe(committed.value.revisionId);
    expect(created.value.getSnapshot()).toMatchObject({
      type: 'ok',
      value: {
        revisionId: committed.value.revisionId,
      },
    });
    expect(created.value.getSnapshot(harness.initialSnapshot.revisionId)).toEqual({
      type: 'ok',
      value: harness.initialSnapshot,
    });
    expect(readText(committed.value.snapshot)).toBe('Hello, Nireco.!');

    await expect(
      created.value.whenDurable(committed.value.revisionId, 'wal'),
    ).resolves.toMatchObject({
      type: 'ok',
      value: {
        achievedDurability: 'wal',
      },
    });
    const durableWalBytes = harness.storage.durableWalBytes(harness.uri);
    expect(durableWalBytes.length).toBeGreaterThan(0);
    await created.value.dispose();
    expect(registry.get(harness.uri)).toBeUndefined();
    expect(harness.storage.durableWalBytes(harness.uri)).toEqual(durableWalBytes);
  });

  it('refreshes an attached Model when the shared Authority commits through another caller', async () => {
    const harness = createHarness();
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority: harness.authority,
    });
    const created = await registry.create({
      uri: harness.uri,
      snapshot: harness.initialSnapshot,
    });
    if (created.type === 'error') {
      throw new Error(created.error.safeMessage);
    }
    const transaction = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      {
        start: 0,
        end: 5,
        replacement: 'External',
      },
    );

    const committed = await harness.authority.apply(transaction);
    if (committed.type === 'error') {
      throw new Error(committed.error.safeMessage);
    }

    await expect.poll(() => created.value.headRevisionId).toBe(committed.value.revisionId);
    expect(created.value.getSnapshot()).toMatchObject({
      type: 'ok',
      value: {
        revisionId: committed.value.revisionId,
        documentHash: committed.value.snapshot.documentHash,
      },
    });
    expect(created.value.getSnapshot(harness.initialSnapshot.revisionId)).toEqual({
      type: 'ok',
      value: harness.initialSnapshot,
    });
  });

  it('synchronizes a commit that lands between Authority alignment and subscription', async () => {
    const harness = createHarness();
    const transaction = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      {
        start: 0,
        end: 5,
        replacement: 'Raced',
      },
    );
    let triggered = false;
    let externalCommit: ReturnType<SingleDocumentAuthority['apply']> | undefined;
    const authority = wrapAuthority(harness.authority, {
      getSnapshot(uri, revisionId) {
        const snapshot = harness.authority.getSnapshot(uri, revisionId);
        if (!triggered) {
          triggered = true;
          externalCommit = harness.authority.apply(transaction);
        }
        return snapshot;
      },
    });
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority,
    });

    const created = await registry.create({
      uri: harness.uri,
      snapshot: harness.initialSnapshot,
    });
    if (created.type === 'error' || externalCommit === undefined) {
      throw new Error('Expected Model creation and the raced Authority commit to succeed.');
    }
    const committed = await externalCommit;
    if (committed.type === 'error') {
      throw new Error(committed.error.safeMessage);
    }

    expect(created.value.headRevisionId).toBe(committed.value.revisionId);
    expect(created.value.getSnapshot()).toMatchObject({
      type: 'ok',
      value: {
        revisionId: committed.value.revisionId,
        documentHash: committed.value.snapshot.documentHash,
      },
    });
  });

  it('keeps the winning Authority-backed Model when concurrent creates synchronize', async () => {
    const harness = createHarness();
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority: harness.authority,
    });

    const [first, second] = await Promise.all([
      registry.create({
        uri: harness.uri,
        snapshot: harness.initialSnapshot,
      }),
      registry.create({
        uri: harness.uri,
        snapshot: harness.initialSnapshot,
      }),
    ]);

    expect([first.type, second.type].sort()).toEqual(['error', 'ok']);
    const winner =
      first.type === 'ok' ? first.value : second.type === 'ok' ? second.value : undefined;
    expect(winner).toBeDefined();
    expect(winner?.isDisposed).toBe(false);
    expect(registry.get(harness.uri)).toBe(winner);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('rejects an Authority-backed Model whose supplied Snapshot is not the Authority head', async () => {
    const harness = createHarness();
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority: harness.authority,
    });
    const staleSnapshot: DocumentSnapshot = {
      ...harness.initialSnapshot,
      revisionId: harness.ids.allocateRevisionId(),
    };

    await expect(
      registry.create({
        uri: harness.uri,
        snapshot: staleSnapshot,
      }),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'BASE_REVISION_MISMATCH',
        currentRevisionId: harness.initialSnapshot.revisionId,
      },
    });
    expect(registry.getAll()).toHaveLength(0);
  });

  it('rejects an Authority-backed Model whose Snapshot identity disagrees with the Authority', async () => {
    const harness = createHarness();
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority: harness.authority,
    });
    const pendingSnapshot: DocumentSnapshot = {
      ...harness.initialSnapshot,
      metadata: {
        ...harness.initialSnapshot.metadata,
        title: 'A different canonical manuscript',
      },
    };
    const hashed = hashCanonicalJsonPortable(
      HASH_DOMAINS.documentContent,
      createDocumentHashPayload(pendingSnapshot),
    );
    if (hashed.type === 'error') {
      throw new Error('Expected the mismatched Snapshot to remain canonical.');
    }
    const mismatchedSnapshot: DocumentSnapshot = {
      ...pendingSnapshot,
      documentHash: hashed.hash,
    };

    await expect(
      registry.create({
        uri: harness.uri,
        snapshot: mismatchedSnapshot,
      }),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'BASE_REVISION_MISMATCH',
        currentRevisionId: harness.initialSnapshot.revisionId,
      },
    });
    expect(registry.getAll()).toHaveLength(0);
  });

  it('rejects an Authority handle that claims a different URI', async () => {
    const harness = createHarness();
    const otherUri = validDocumentUri('nireco://workspace-01/document/other-document');
    const authority = wrapAuthority(harness.authority, {
      async open() {
        return {
          type: 'ok',
          value: {
            uri: otherUri,
            headRevisionId: harness.initialSnapshot.revisionId,
          },
        };
      },
    });
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority,
    });

    await expect(
      registry.create({
        uri: harness.uri,
        snapshot: harness.initialSnapshot,
      }),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'BASE_REVISION_MISMATCH',
      },
    });
    expect(registry.getAll()).toHaveLength(0);
  });

  it('rejects a Transaction targeting a different URI before invoking the Model Authority', async () => {
    const harness = createHarness();
    let applyCount = 0;
    const authority = wrapAuthority(harness.authority, {
      async apply(transaction) {
        applyCount += 1;
        return harness.authority.apply(transaction);
      },
    });
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority,
    });
    const created = await registry.create({
      uri: harness.uri,
      snapshot: harness.initialSnapshot,
    });
    if (created.type === 'error') {
      throw new Error(created.error.safeMessage);
    }
    const otherUri = validDocumentUri('nireco://workspace-01/document/other-document');

    const rejected = await created.value.applyTransaction(
      createTransaction(
        harness.ids,
        otherUri,
        harness.initialSnapshot.revisionId,
        harness.initialSnapshot.documentHash,
        {
          start: 0,
          end: 0,
          replacement: 'x',
        },
      ),
    );

    expect(rejected).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_NOT_FOUND',
        suggestedAction: 'abort',
      },
    });
    expect(applyCount).toBe(0);
  });

  it('contains hostile runtime Transaction objects at both Model and Authority boundaries', async () => {
    const harness = createHarness();
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority: harness.authority,
    });
    const created = await registry.create({
      uri: harness.uri,
      snapshot: harness.initialSnapshot,
    });
    if (created.type === 'error') {
      throw new Error(created.error.safeMessage);
    }
    const hostile = new Proxy({} as Transaction, {
      ownKeys() {
        throw new Error('Runtime Transaction traps must not escape the API boundary.');
      },
    });

    await expect(created.value.applyTransaction(hostile)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
        category: 'validation',
      },
    });
    await expect(harness.authority.apply(hostile)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'SCHEMA_INVALID',
        category: 'validation',
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toEqual({
      type: 'ok',
      value: harness.initialSnapshot.revisionId,
    });
    expect(harness.storage.durableWalBytes(harness.uri)).toHaveLength(0);
  });

  it('drains an in-flight Authority apply without reviving a disposed Model', async () => {
    const harness = createHarness();
    const applyGate = createDeferred<undefined>();
    const authority = wrapAuthority(harness.authority, {
      async apply(transaction) {
        await applyGate.promise;
        return harness.authority.apply(transaction);
      },
    });
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority,
    });
    const created = await registry.create({
      uri: harness.uri,
      snapshot: harness.initialSnapshot,
    });
    if (created.type === 'error') {
      throw new Error(created.error.safeMessage);
    }
    const transaction = createTransaction(
      harness.ids,
      harness.uri,
      harness.initialSnapshot.revisionId,
      harness.initialSnapshot.documentHash,
      {
        start: 0,
        end: 5,
        replacement: 'Disposed',
      },
    );

    const pendingCommit = created.value.applyTransaction(transaction);
    const disposing = created.value.dispose();
    expect(created.value.isDisposed).toBe(true);
    expect(registry.get(harness.uri)).toBe(created.value);
    expect(created.value.dispose()).toBe(disposing);
    await expect(
      registry.create({
        uri: harness.uri,
        snapshot: harness.initialSnapshot,
      }),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_URI_ALREADY_EXISTS',
      },
    });
    applyGate.resolve(undefined);

    const committed = await pendingCommit;
    await disposing;

    expect(committed.type).toBe('ok');
    expect(created.value.headRevisionId).toBe(harness.initialSnapshot.revisionId);
    expect(registry.get(harness.uri)).toBeUndefined();
    expect(created.value.getSnapshot()).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    if (committed.type === 'ok') {
      const replacement = await registry.create({
        uri: harness.uri,
        snapshot: committed.value.snapshot,
      });
      expect(replacement.type).toBe('ok');
    }
  });

  it('fails closed when callers reopen or read a disposed Authority', async () => {
    const harness = createHarness();
    const registry = new InMemoryModelRegistry({
      ids: harness.ids,
      authority: harness.authority,
    });

    const disposing = harness.authority.dispose();
    expect(harness.authority.dispose()).toBe(disposing);
    await disposing;

    await expect(harness.authority.open(harness.uri)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    await expect(harness.authority.getHead(harness.uri)).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    expect(harness.authority.getSnapshot(harness.uri)).toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    await expect(
      registry.create({
        uri: harness.uri,
        snapshot: harness.initialSnapshot,
      }),
    ).resolves.toMatchObject({
      type: 'error',
      error: {
        code: 'MODEL_DISPOSED',
      },
    });
    expect(registry.getAll()).toHaveLength(0);
  });
});

interface Harness {
  readonly uri: DocumentUri;
  readonly initialSnapshot: DocumentSnapshot;
  readonly ids: IIdAllocator;
  readonly storage: InMemoryDurableStorage;
  readonly authority: SingleDocumentAuthority;
}

function createHarness(): Harness {
  const uri = validDocumentUri('nireco://workspace-01/document/kernel-authority');
  const initialSnapshot = createMinimalSnapshot();
  const initialRevision = createInitialRevision(uri, initialSnapshot);
  const ids = new DeterministicIdAllocator();
  const leases = new InMemoryAuthorityLeaseCoordinator();
  const acquired = leases.acquire(uri, 'kernel-authority');
  if (acquired.type !== 'acquired') {
    throw new Error('Expected the kernel Authority lease.');
  }
  const storage = new InMemoryDurableStorage({
    isFenceCurrent: (fence) => leases.isFenceCurrent(fence),
  });
  const authority = new SingleDocumentAuthority({
    uri,
    initialRevision,
    initialSnapshot,
    lease: acquired.lease,
    wal: storage,
    walCodec: new PortableWalRecordCodec(),
    snapshots: new AtomicSnapshotStore({
      bytes: storage,
      codec: new CanonicalSnapshotCodec(new ProductionSnapshotDecoder()),
    }),
    ids,
  });
  return {
    uri,
    initialSnapshot,
    ids,
    storage,
    authority,
  };
}

interface TextChange {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

function createTransaction(
  ids: IIdAllocator,
  uri: DocumentUri,
  baseRevisionId: RevisionId,
  documentHash: DocumentSnapshot['documentHash'],
  change: TextChange,
): Transaction {
  return {
    id: ids.allocateTransactionId(),
    target: {
      uri,
      baseRevisionId,
    },
    actor: {
      type: 'human',
      id: 'human-1',
    },
    operations: [
      {
        id: ids.allocateOperationId(),
        type: 'replace-text',
        textNodeId: MINIMAL_FIXTURE_IDS.text,
        startUtf16Offset: validUtf16Offset(change.start),
        endUtf16Offset: validUtf16Offset(change.end),
        replacement: change.replacement,
      },
    ],
    preconditions: [
      {
        kind: 'node-exists',
        nodeId: MINIMAL_FIXTURE_IDS.text,
      },
      {
        kind: 'document-hash',
        expected: documentHash,
      },
    ],
    metadata: {
      source: 'human-input',
      undoGroupId: 'typing-1',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
  };
}

function createInitialRevision(uri: DocumentUri, snapshot: DocumentSnapshot): Revision {
  return {
    id: snapshot.revisionId,
    uri,
    parentRevisionId: null,
    transactionId: productionTransactionId('018f0000-0000-7000-8000-00000000a001'),
    sequence: 0,
    documentHash: snapshot.documentHash,
    actor: {
      type: 'system',
      id: 'recovery',
      role: 'recovery',
    },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
    durability: 'snapshot',
  };
}

function createAuthorityForInitialState(
  initialRevision: Revision,
  initialSnapshot: DocumentSnapshot,
): SingleDocumentAuthority {
  const leases = new InMemoryAuthorityLeaseCoordinator();
  const acquired = leases.acquire(initialRevision.uri, 'initial-state-validation');
  if (acquired.type !== 'acquired') {
    throw new Error('Expected the initial-state validation lease.');
  }
  const storage = new InMemoryDurableStorage({
    isFenceCurrent: (fence) => leases.isFenceCurrent(fence),
  });
  return new SingleDocumentAuthority({
    uri: initialRevision.uri,
    initialRevision,
    initialSnapshot,
    lease: acquired.lease,
    wal: storage,
    walCodec: new PortableWalRecordCodec(),
    snapshots: new AtomicSnapshotStore({
      bytes: storage,
      codec: new CanonicalSnapshotCodec(new ProductionSnapshotDecoder()),
    }),
    ids: new DeterministicIdAllocator(),
  });
}

function productionTransactionId(value: string): TransactionId {
  const parsed = parseTransactionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Expected a production Transaction ID: ${value}`);
  }
  return parsed.value;
}

function readText(snapshot: DocumentSnapshot): string {
  const indexed = createDocumentIndex(snapshot);
  if (indexed.type === 'error') {
    throw new Error(indexed.error.safeMessage);
  }
  const node = indexed.value.getNode(MINIMAL_FIXTURE_IDS.text);
  if (node?.type !== 'text') {
    throw new Error('Expected the kernel fixture TextNode.');
  }
  return node.value;
}

class ProductionSnapshotDecoder implements IDocumentSnapshotDecoder {
  decode(value: unknown): Result<DocumentSnapshot, SnapshotCodecError> {
    const validated = validateDocumentSnapshot(value);
    return validated.type === 'error'
      ? {
          type: 'error',
          error: {
            reason: 'schema-invalid',
            safeMessage: validated.error.safeMessage,
          },
        }
      : {
          type: 'ok',
          value: value as DocumentSnapshot,
        };
  }
}

function wrapAuthority(
  authority: IDocumentAuthority,
  overrides: Partial<IDocumentAuthority>,
): IDocumentAuthority {
  return {
    open: overrides.open ?? ((uri) => authority.open(uri)),
    getHead: overrides.getHead ?? ((uri) => authority.getHead(uri)),
    getSnapshot:
      overrides.getSnapshot ?? ((uri, revisionId) => authority.getSnapshot(uri, revisionId)),
    apply: overrides.apply ?? ((transaction) => authority.apply(transaction)),
    getDurability:
      overrides.getDurability ?? ((uri, revisionId) => authority.getDurability(uri, revisionId)),
    whenDurable:
      overrides.whenDurable ??
      ((uri, revisionId, target) => authority.whenDurable(uri, revisionId, target)),
    subscribe: overrides.subscribe ?? ((uri, listener) => authority.subscribe(uri, listener)),
  };
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolvePromise: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value): void {
      if (resolvePromise === undefined) {
        throw new Error('Deferred promise resolver was not initialized.');
      }
      resolvePromise(value);
    },
  };
}
