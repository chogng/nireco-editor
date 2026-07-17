import type { Result } from '../../src/base/errors/nireco-error.js';
import {
  parseNodeId,
  parseSessionId,
  parseTransactionId,
  type NodeId,
  type SessionId,
  type TransactionId,
} from '../../src/base/ids/identifiers.js';
import type { Revision } from '../../src/model/revision/revision.js';
import { validateDocumentSnapshot } from '../../src/model/schema/manuscript-validator.js';
import type { DocumentSnapshot } from '../../src/model/snapshot.js';
import { AtomicSnapshotStore, CanonicalSnapshotCodec } from '../../src/storage/snapshot-store.js';
import type {
  IDocumentSnapshotDecoder,
  SnapshotCodecError,
} from '../../src/storage/snapshot-store.js';
import { InMemoryDurableStorage } from '../../src/storage/in-memory-durable-storage.js';
import { PortableWalRecordCodec } from '../../src/storage/wal-record-codec.js';
import { Preview2ReadWireAdapter } from '../../src/integration/comet/preview2-read-wire-adapter.js';
import { PortableDocumentReadCursorCodec } from '../../src/services/document-service/cursor-codec.js';
import { CanonicalSnapshotDocumentDiagnosticsSource } from '../../src/services/document-service/canonical-snapshot-diagnostics-source.js';
import { InProcessDocumentReadService } from '../../src/services/document-service/document-read-service.js';
import { InMemoryDocumentReadSessionStore } from '../../src/services/document-service/in-memory-document-read-session-store.js';
import type { DocumentReadScope } from '../../src/services/document-service/document-read-types.js';
import {
  SingleDocumentAuthorityRevisionHistorySource,
  type DocumentRevisionHistorySource,
} from '../../src/services/document-service/document-revision-history-source.js';
import { InProcessResolveModelService } from '../../src/services/workspace-service/resolve-model-service.js';
import { AuthorityBackedNirecoModel } from '../../src/workspace/authority-backed-model.js';
import { InMemoryAuthorityLeaseCoordinator } from '../../src/workspace/document-authority/authority-lease.js';
import { SingleDocumentAuthority } from '../../src/workspace/document-authority/single-document-authority.js';
import { InMemoryModelRegistry } from '../../src/workspace/in-memory-model-registry.js';
import {
  createMinimalSnapshot,
  DeterministicIdAllocator,
  FixedClock,
  MINIMAL_FIXTURE_IDS,
  validDocumentUri,
  validIsoTimestamp,
} from '../test-support/fixtures.js';
import {
  definePreview2ReadSourceConformance,
  type Preview2ReadSourceConformanceFixture,
} from '../test-support/preview2-read-source-conformance.js';

const URI = validDocumentUri('nireco://workspace-01/document/preview2-shared-read');
const FULL_SESSION = productionSessionId('018f0000-0000-7000-8000-000000000801');
const OTHER_SESSION = productionSessionId('018f0000-0000-7000-8000-000000000802');
const SCOPED_SESSION = productionSessionId('018f0000-0000-7000-8000-000000000803');
const UNKNOWN_SESSION = productionSessionId('018f0000-0000-7000-8000-000000000899');
const ABSENT_NODE = productionNodeId('018f0000-0000-7000-8000-000000000899');

type ModelBoundary = 'in-memory' | 'authority-backed';

definePreview2ReadSourceConformance({
  name: 'registry in-memory Model boundary (not transport Mock)',
  createFixture: () => createFixture('in-memory'),
});

definePreview2ReadSourceConformance({
  name: 'SingleDocumentAuthority-backed Model boundary (not transport Real)',
  createFixture: () => createFixture('authority-backed'),
});

async function createFixture(
  modelBoundary: ModelBoundary,
): Promise<Preview2ReadSourceConformanceFixture> {
  const ids = new DeterministicIdAllocator();
  const clock = new FixedClock();
  const snapshot = createMinimalSnapshot();
  const authority =
    modelBoundary === 'authority-backed' ? createAuthority(snapshot, ids) : undefined;
  const registry = new InMemoryModelRegistry({
    ids,
    ...(authority === undefined ? {} : { authority }),
  });
  const created = await registry.create({ uri: URI, snapshot });
  if (created.type === 'error') {
    await authority?.dispose();
    throw new Error(`The ${modelBoundary} conformance Model could not be created.`);
  }
  if (created.value instanceof AuthorityBackedNirecoModel !== (authority !== undefined)) {
    await created.value.dispose();
    await authority?.dispose();
    throw new Error('The conformance fixture did not install the requested Model boundary.');
  }

  const document = { uri: URI, revisionId: snapshot.revisionId } as const;
  const sessions = new InMemoryDocumentReadSessionStore({ clock, ids });
  openSession(sessions, FULL_SESSION, document, {});
  openSession(sessions, OTHER_SESSION, document, {});
  openSession(sessions, SCOPED_SESSION, document, {
    allowedNodeIds: [MINIMAL_FIXTURE_IDS.paragraph],
  });

  const documentRead = new InProcessDocumentReadService({
    source: registry,
    sessions,
    ids,
    cursorAdapter: new PortableDocumentReadCursorCodec({
      clock,
      signingKey: new Uint8Array(32).fill(modelBoundary === 'in-memory' ? 31 : 47),
    }),
    revisionHistorySource:
      authority === undefined
        ? emptyHistorySource()
        : new SingleDocumentAuthorityRevisionHistorySource({
            uri: URI,
            authority,
            ids,
          }),
    diagnosticsSource: new CanonicalSnapshotDocumentDiagnosticsSource({
      source: registry,
      ids,
    }),
  });
  const boundary = new Preview2ReadWireAdapter({
    resolveModel: new InProcessResolveModelService({ source: registry, ids }),
    documentRead,
    ids,
  });

  return {
    boundary,
    fullContext: { sessionId: FULL_SESSION, document },
    otherSessionContext: { sessionId: OTHER_SESSION, document },
    scopedContext: { sessionId: SCOPED_SESSION, document },
    unknownSessionContext: { sessionId: UNKNOWN_SESSION, document },
    nodes: {
      cursorFirst: MINIMAL_FIXTURE_IDS.body,
      cursorSecond: MINIMAL_FIXTURE_IDS.paragraph,
      readable: MINIMAL_FIXTURE_IDS.text,
      outsideScope: MINIMAL_FIXTURE_IDS.frontMatter,
      absent: ABSENT_NODE,
    },
    async dispose(): Promise<void> {
      sessions.dispose();
      await registry.unload(URI);
      await authority?.dispose();
    },
  };
}

function openSession(
  sessions: InMemoryDocumentReadSessionStore,
  sessionId: typeof FULL_SESSION,
  document: { readonly uri: typeof URI; readonly revisionId: DocumentSnapshot['revisionId'] },
  scope: DocumentReadScope,
): void {
  const opened = sessions.open({
    sessionId,
    document,
    scope,
    expiresAt: validIsoTimestamp('2026-07-21T00:00:00Z'),
  });
  if (opened.type === 'error') {
    throw new Error(`The read conformance Session could not be opened: ${opened.error.code}.`);
  }
}

function emptyHistorySource(): DocumentRevisionHistorySource {
  return {
    getRevisions: () => ({ type: 'ok', value: [] }),
  };
}

function createAuthority(
  snapshot: DocumentSnapshot,
  ids: DeterministicIdAllocator,
): SingleDocumentAuthority {
  const leases = new InMemoryAuthorityLeaseCoordinator();
  const acquired = leases.acquire(URI, 'preview2-shared-read-authority');
  if (acquired.type !== 'acquired') {
    throw new Error('The read conformance Authority lease was unavailable.');
  }
  const storage = new InMemoryDurableStorage({
    isFenceCurrent: (fence) => leases.isFenceCurrent(fence),
  });
  const initialRevision: Revision = {
    id: snapshot.revisionId,
    uri: URI,
    parentRevisionId: null,
    transactionId: productionTransactionId('018f0000-0000-7000-8000-000000000701'),
    sequence: 0,
    documentHash: snapshot.documentHash,
    actor: { type: 'system', id: 'preview2-shared-read', role: 'recovery' },
    createdAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
    durability: 'snapshot',
  };
  return new SingleDocumentAuthority({
    uri: URI,
    initialRevision,
    initialSnapshot: snapshot,
    lease: acquired.lease,
    wal: storage,
    walCodec: new PortableWalRecordCodec(),
    snapshots: new AtomicSnapshotStore({
      bytes: storage,
      codec: new CanonicalSnapshotCodec(new ConformanceSnapshotDecoder()),
    }),
    ids,
  });
}

class ConformanceSnapshotDecoder implements IDocumentSnapshotDecoder {
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
      : { type: 'ok', value: value as DocumentSnapshot };
  }
}

function productionSessionId(value: string): SessionId {
  const parsed = parseSessionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid production Session ID: ${value}.`);
  }
  return parsed.value;
}

function productionNodeId(value: string): NodeId {
  const parsed = parseNodeId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid production Node ID: ${value}.`);
  }
  return parsed.value;
}

function productionTransactionId(value: string): TransactionId {
  const parsed = parseTransactionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid production Transaction ID: ${value}.`);
  }
  return parsed.value;
}
