import { describe, expect, it } from 'vitest';

import { parseIsoTimestamp, type IClock, type IsoTimestamp } from '../../src/base/time/clock.js';
import {
  MAX_DOCUMENT_READ_CONTEXT_DISTANCE,
  MAX_DOCUMENT_READ_SCOPE_IDS,
} from '../../src/services/document-service/document-read-types.js';
import { InMemoryDocumentReadSessionStore } from '../../src/services/document-service/in-memory-document-read-session-store.js';
import {
  DeterministicIdAllocator,
  validDocumentUri,
  validIsoTimestamp,
} from '../test-support/fixtures.js';

const URI = validDocumentUri('nireco://workspace-01/document/read-session-store');

describe('InMemoryDocumentReadSessionStore', () => {
  it('captures, sorts, and deeply freezes a grant instead of retaining caller-owned values', () => {
    const ids = new DeterministicIdAllocator();
    const clock = new MutableClock('2026-07-20T00:00:00Z');
    const store = new InMemoryDocumentReadSessionStore({ clock, ids });
    const sessionId = ids.allocateSessionId();
    const revisionId = ids.allocateRevisionId();
    const firstNodeId = ids.allocateNodeId();
    const secondNodeId = ids.allocateNodeId();
    const scope = {
      allowedNodeIds: [secondNodeId, firstNodeId],
      allowReadOutsideScopeForContext: false,
      maxContextDistance: 0,
    };
    const document = { uri: URI, revisionId };

    const opened = store.open({
      sessionId,
      document,
      scope,
      expiresAt: validIsoTimestamp('2026-07-20T01:00:00Z'),
    });
    expect(opened).toMatchObject({
      type: 'ok',
      value: {
        document,
        scope: {
          allowedNodeIds: [firstNodeId, secondNodeId],
        },
      },
    });
    if (opened.type === 'error') {
      throw new Error(opened.error.safeMessage);
    }

    scope.allowedNodeIds.length = 0;
    document.revisionId = ids.allocateRevisionId();
    expect(store.resolve(sessionId)).toBe(opened.value);
    expect(store.resolve(sessionId)).toMatchObject({
      document: { uri: URI, revisionId },
      scope: { allowedNodeIds: [firstNodeId, secondNodeId] },
    });
    expect(Object.isFrozen(opened.value)).toBe(true);
    expect(Object.isFrozen(opened.value.document)).toBe(true);
    expect(Object.isFrozen(opened.value.scope)).toBe(true);
    expect(Object.isFrozen(opened.value.scope.allowedNodeIds)).toBe(true);
  });

  it('expires at the exact boundary and never revives when the clock moves backwards', () => {
    const ids = new DeterministicIdAllocator();
    const clock = new MutableClock('2026-07-20T00:00:00.0001Z');
    const store = new InMemoryDocumentReadSessionStore({ clock, ids });
    const sessionId = ids.allocateSessionId();
    expect(
      openSession(store, ids, sessionId, validIsoTimestamp('2026-07-20T01:00:00.0002Z')).type,
    ).toBe('ok');

    clock.set('2026-07-20T01:00:00.0001Z');
    expect(store.resolve(sessionId)).toMatchObject({ document: { uri: URI } });
    clock.set('2026-07-20T01:00:00.0002Z');
    expect(store.resolve(sessionId)).toEqual({ status: 'expired' });
    clock.set('2026-07-20T00:30:00Z');
    expect(store.resolve(sessionId)).toEqual({ status: 'expired' });
  });

  it('reports an unavailable clock without revoking or reviving the Session', () => {
    const ids = new DeterministicIdAllocator();
    const clock = new UntrustedMutableClock('2026-07-20T00:00:00Z');
    const store = new InMemoryDocumentReadSessionStore({ clock, ids });
    const sessionId = ids.allocateSessionId();
    expect(openSession(store, ids, sessionId).type).toBe('ok');

    clock.setRaw('not-a-clock-value');
    expect(store.resolve(sessionId)).toEqual({ status: 'clock-unavailable' });
    expect(store.resolve(sessionId)).toEqual({ status: 'clock-unavailable' });
    clock.throwOnRead();
    expect(store.resolve(sessionId)).toEqual({ status: 'clock-unavailable' });

    clock.setRaw('2026-07-20T00:30:00Z');
    expect(store.resolve(sessionId)).toMatchObject({ document: { uri: URI } });
    clock.setRaw('2026-07-20T01:00:00Z');
    expect(store.resolve(sessionId)).toEqual({ status: 'expired' });
    clock.setRaw('2026-07-20T00:30:00Z');
    expect(store.resolve(sessionId)).toEqual({ status: 'expired' });
  });

  it('keeps revoked, unknown, and disposed Sessions fail closed', () => {
    const ids = new DeterministicIdAllocator();
    const clock = new MutableClock('2026-07-20T00:00:00Z');
    const store = new InMemoryDocumentReadSessionStore({ clock, ids });
    const sessionId = ids.allocateSessionId();
    expect(openSession(store, ids, sessionId).type).toBe('ok');
    expect(store.revoke(sessionId)).toBe(true);
    expect(store.resolve(sessionId)).toBeUndefined();
    expect(store.resolve(ids.allocateSessionId())).toBeUndefined();
    expect(openSession(store, ids, sessionId)).toMatchObject({
      type: 'error',
      error: { code: 'IDEMPOTENCY_CONFLICT', category: 'conflict' },
    });

    const activeSessionId = ids.allocateSessionId();
    expect(openSession(store, ids, activeSessionId).type).toBe('ok');
    store.dispose();
    expect(store.resolve(activeSessionId)).toBeUndefined();
    expect(openSession(store, ids, ids.allocateSessionId())).toMatchObject({
      type: 'error',
      error: { code: 'SESSION_REVOKED', category: 'permission' },
    });
  });

  it('rejects expired, malformed, duplicate, and oversized grants with typed errors', () => {
    const ids = new DeterministicIdAllocator();
    const clock = new MutableClock('2026-07-20T00:00:00Z');
    const store = new InMemoryDocumentReadSessionStore({ clock, ids });
    const sessionId = ids.allocateSessionId();
    const revisionId = ids.allocateRevisionId();
    const nodeId = ids.allocateNodeId();
    const common = {
      sessionId,
      document: { uri: URI, revisionId },
      expiresAt: validIsoTimestamp('2026-07-20T01:00:00Z'),
    };

    expect(
      store.open({
        ...common,
        expiresAt: validIsoTimestamp('2026-07-20T00:00:00Z'),
        scope: {},
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'SESSION_EXPIRED', retryable: true },
    });
    expect(store.open({ ...common, scope: { allowedNodeIds: [nodeId, nodeId] } })).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(
      store.open({
        ...common,
        scope: { allowedNodeIds: [nodeId], allowedSectionIds: [nodeId] },
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(
      store.open({
        ...common,
        sessionId: 'session-readable-preview-id',
        scope: {},
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(
      store.open({
        ...common,
        scope: { maxContextDistance: MAX_DOCUMENT_READ_CONTEXT_DISTANCE + 1 },
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(
      store.open({
        ...common,
        scope: { maxContextDistance: MAX_DOCUMENT_READ_CONTEXT_DISTANCE },
      }),
    ).toMatchObject({ type: 'ok' });

    const oversizedIds = Array.from({ length: MAX_DOCUMENT_READ_SCOPE_IDS + 1 }, () =>
      ids.allocateNodeId(),
    );
    expect(store.open({ ...common, scope: { allowedNodeIds: oversizedIds } })).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(
      store.open({
        ...common,
        scope: {
          allowedNodeIds: oversizedIds.slice(0, 500),
          allowedSectionIds: oversizedIds.slice(500),
        },
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
  });

  it('does not execute accessors while capturing an untrusted grant', () => {
    const ids = new DeterministicIdAllocator();
    const store = new InMemoryDocumentReadSessionStore({
      clock: new MutableClock('2026-07-20T00:00:00Z'),
      ids,
    });
    let getterReads = 0;
    const scope = Object.defineProperty({}, 'allowedNodeIds', {
      enumerable: true,
      get(): readonly string[] {
        getterReads += 1;
        return [];
      },
    });

    expect(
      store.open({
        sessionId: ids.allocateSessionId(),
        document: { uri: URI, revisionId: ids.allocateRevisionId() },
        scope,
        expiresAt: validIsoTimestamp('2026-07-20T01:00:00Z'),
      }),
    ).toMatchObject({
      type: 'error',
      error: { code: 'SCHEMA_INVALID' },
    });
    expect(getterReads).toBe(0);
  });

  it('preserves explicitly empty scope arrays instead of widening them to document-wide access', () => {
    const ids = new DeterministicIdAllocator();
    const store = new InMemoryDocumentReadSessionStore({
      clock: new MutableClock('2026-07-20T00:00:00Z'),
      ids,
    });
    const sessionId = ids.allocateSessionId();
    const opened = store.open({
      sessionId,
      document: { uri: URI, revisionId: ids.allocateRevisionId() },
      scope: { allowedNodeIds: [] },
      expiresAt: validIsoTimestamp('2026-07-20T01:00:00Z'),
    });
    expect(opened).toMatchObject({
      type: 'ok',
      value: { scope: { allowedNodeIds: [] } },
    });
    const resolved = store.resolve(sessionId);
    expect(resolved).toMatchObject({ scope: { allowedNodeIds: [] } });
    if (resolved === undefined || 'status' in resolved) {
      throw new Error('Expected an active document read Session grant.');
    }
    expect(resolved.scope).toHaveProperty('allowedNodeIds');
  });
});

function openSession(
  store: InMemoryDocumentReadSessionStore,
  ids: DeterministicIdAllocator,
  sessionId: ReturnType<DeterministicIdAllocator['allocateSessionId']>,
  expiresAt: IsoTimestamp = validIsoTimestamp('2026-07-20T01:00:00Z'),
) {
  return store.open({
    sessionId,
    document: {
      uri: URI,
      revisionId: ids.allocateRevisionId(),
    },
    scope: {},
    expiresAt,
  });
}

class MutableClock implements IClock {
  #value: IsoTimestamp;

  constructor(value: string) {
    this.#value = timestamp(value);
  }

  now(): IsoTimestamp {
    return this.#value;
  }

  set(value: string): void {
    this.#value = timestamp(value);
  }
}

class UntrustedMutableClock implements IClock {
  #value: string;
  #throws = false;

  constructor(value: string) {
    this.#value = value;
  }

  now(): IsoTimestamp {
    if (this.#throws) {
      throw new Error('clock unavailable');
    }
    return this.#value as IsoTimestamp;
  }

  setRaw(value: string): void {
    this.#value = value;
    this.#throws = false;
  }

  throwOnRead(): void {
    this.#throws = true;
  }
}

function timestamp(value: string): IsoTimestamp {
  const parsed = parseIsoTimestamp(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid MutableClock timestamp: ${value}`);
  }
  return parsed.value;
}
