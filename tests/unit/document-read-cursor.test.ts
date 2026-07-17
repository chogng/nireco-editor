import { describe, expect, it } from 'vitest';

import {
  parseContentHash,
  parseNodeId,
  parseRevisionId,
  parseSessionId,
  type ContentHash,
  type NodeId,
  type RevisionId,
  type SessionId,
} from '../../src/base/ids/identifiers.js';
import { parseIsoTimestamp, type IClock, type IsoTimestamp } from '../../src/base/time/clock.js';
import {
  MAX_DOCUMENT_READ_CURSOR_CHARACTERS,
  MAX_DOCUMENT_READ_CURSOR_SCOPE_IDS,
  PortableDocumentReadCursorCodec,
  type DocumentReadCursorBinding,
} from '../../src/services/document-service/cursor-codec.js';

const SESSION_ID = sessionId('018f0000-0000-7000-8000-000000000001');
const OTHER_SESSION_ID = sessionId('018f0000-0000-7000-8000-000000000002');
const REVISION_ID = revisionId('018f0000-0000-7000-8000-000000000003');
const OTHER_REVISION_ID = revisionId('018f0000-0000-7000-8000-000000000004');
const SECTION_ID = nodeId('018f0000-0000-7000-8000-000000000005');
const NODE_ID = nodeId('018f0000-0000-7000-8000-000000000006');
const OTHER_NODE_ID = nodeId('018f0000-0000-7000-8000-000000000007');
const QUERY_HASH = contentHash(`sha256:${'a'.repeat(64)}`);
const OTHER_QUERY_HASH = contentHash(`sha256:${'b'.repeat(64)}`);

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

describe('PortableDocumentReadCursorCodec', () => {
  it('round-trips a canonical opaque base64url cursor without exposing binding values', () => {
    const clock = new MutableClock('2026-07-16T12:00:00.125Z');
    const keyBytes = signingKey(0x31);
    const codec = new PortableDocumentReadCursorCodec({ clock, signingKey: keyBytes });
    keyBytes.fill(0xff);

    const issued = codec.issue({
      ...binding(),
      position: 37,
    });

    expect(issued.type).toBe('ok');
    if (issued.type === 'error') {
      return;
    }
    expect(issued.cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(issued.cursor.length).toBeLessThanOrEqual(MAX_DOCUMENT_READ_CURSOR_CHARACTERS);
    expect(codec.decode(issued.cursor, binding())).toEqual({
      type: 'ok',
      position: 37,
    });

    const decodedFrame = Buffer.from(issued.cursor, 'base64url').subarray(32).toString('ascii');
    expect(decodedFrame).not.toContain(SESSION_ID);
    expect(decodedFrame).not.toContain(REVISION_ID);
    expect(decodedFrame).not.toContain(NODE_ID);
    expect(decodedFrame).not.toContain(QUERY_HASH);
    expect(decodedFrame).not.toContain('31313131');
    expect(decodedFrame).toMatch(/^\{"b":"[a-f0-9]{64}","e":1784204100125,"p":37,"v":1\}$/u);
  });

  it('authenticates the exact body and rejects token or signing-key tampering', () => {
    const clock = new MutableClock('2026-07-16T12:00:00Z');
    const codec = new PortableDocumentReadCursorCodec({ clock, signingKey: signingKey(0x42) });
    const issued = codec.issue({ ...binding(), position: 11 });
    expect(issued.type).toBe('ok');
    if (issued.type === 'error') {
      return;
    }

    const replacement = issued.cursor.startsWith('A') ? 'B' : 'A';
    const tampered = `${replacement}${issued.cursor.slice(1)}`;
    expect(codec.decode(tampered, binding())).toEqual({
      type: 'error',
      reason: 'invalid-cursor',
    });

    const otherCodec = new PortableDocumentReadCursorCodec({
      clock,
      signingKey: signingKey(0x43),
    });
    expect(otherCodec.decode(issued.cursor, binding())).toEqual({
      type: 'error',
      reason: 'invalid-cursor',
    });
  });

  it('uses one non-enumerating error for wrong Session, Revision, service, Scope, and query hash', () => {
    const clock = new MutableClock('2026-07-16T12:00:00Z');
    const codec = new PortableDocumentReadCursorCodec({ clock, signingKey: signingKey(0x51) });
    const issued = codec.issue({ ...binding(), position: 91 });
    expect(issued.type).toBe('ok');
    if (issued.type === 'error') {
      return;
    }

    const mismatches: readonly DocumentReadCursorBinding[] = [
      { ...binding(), sessionId: OTHER_SESSION_ID },
      { ...binding(), revisionId: OTHER_REVISION_ID },
      { ...binding(), service: 'document.search' },
      {
        ...binding(),
        scope: {
          allowedNodeIds: [OTHER_NODE_ID],
          allowedSectionIds: [SECTION_ID],
          allowReadOutsideScopeForContext: false,
          maxContextDistance: 2,
        },
      },
      { ...binding(), queryHash: OTHER_QUERY_HASH },
    ];

    for (const mismatch of mismatches) {
      const result = codec.decode(issued.cursor, mismatch);
      expect(result).toEqual({ type: 'error', reason: 'invalid-cursor' });
      expect(JSON.stringify(result)).not.toContain(OTHER_NODE_ID);
    }
  });

  it('normalizes Scope ID set order while retaining every authorization-relevant field', () => {
    const clock = new MutableClock('2026-07-16T12:00:00Z');
    const codec = new PortableDocumentReadCursorCodec({ clock, signingKey: signingKey(0x61) });
    const issued = codec.issue({
      ...binding(),
      scope: {
        allowedNodeIds: [OTHER_NODE_ID, NODE_ID],
        allowedSectionIds: [SECTION_ID],
        allowReadOutsideScopeForContext: false,
        maxContextDistance: 2,
      },
      position: 4,
    });
    expect(issued.type).toBe('ok');
    if (issued.type === 'error') {
      return;
    }

    expect(
      codec.decode(issued.cursor, {
        ...binding(),
        scope: {
          allowedNodeIds: [NODE_ID, OTHER_NODE_ID],
          allowedSectionIds: [SECTION_ID],
          allowReadOutsideScopeForContext: false,
          maxContextDistance: 2,
        },
      }),
    ).toEqual({ type: 'ok', position: 4 });
    expect(
      codec.decode(issued.cursor, {
        ...binding(),
        scope: {
          allowedNodeIds: [NODE_ID, OTHER_NODE_ID],
          allowedSectionIds: [SECTION_ID],
          allowReadOutsideScopeForContext: true,
          maxContextDistance: 2,
        },
      }),
    ).toEqual({ type: 'error', reason: 'invalid-cursor' });
  });

  it('expires at the exact TTL boundary but checks binding before reporting expiry', () => {
    const clock = new MutableClock('2026-07-16T12:00:00Z');
    const codec = new PortableDocumentReadCursorCodec({
      clock,
      signingKey: signingKey(0x71),
      ttlSeconds: 10,
    });
    const issued = codec.issue({ ...binding(), position: 8 });
    expect(issued.type).toBe('ok');
    if (issued.type === 'error') {
      return;
    }

    clock.set('2026-07-16T12:00:09.999Z');
    expect(codec.decode(issued.cursor, binding())).toEqual({ type: 'ok', position: 8 });

    clock.set('2026-07-16T12:00:10Z');
    expect(codec.decode(issued.cursor, binding())).toEqual({
      type: 'error',
      reason: 'cursor-expired',
    });
    expect(codec.decode(issued.cursor, { ...binding(), sessionId: OTHER_SESSION_ID })).toEqual({
      type: 'error',
      reason: 'invalid-cursor',
    });
  });

  it('fails closed on malformed, padded, non-canonical, and oversized cursors', () => {
    const codec = new PortableDocumentReadCursorCodec({
      clock: new MutableClock('2026-07-16T12:00:00Z'),
      signingKey: signingKey(0x81),
    });

    for (const malformed of [undefined, null, 42, '', 'A', 'not+base64url', 'AAAA=', 'AAAA']) {
      expect(codec.decode(malformed, binding())).toEqual({
        type: 'error',
        reason: 'invalid-cursor',
      });
    }
    expect(codec.decode('A'.repeat(MAX_DOCUMENT_READ_CURSOR_CHARACTERS + 1), binding())).toEqual({
      type: 'error',
      reason: 'cursor-too-large',
    });
  });

  it('captures descriptor values without invoking getters and rejects accessor input', () => {
    const codec = new PortableDocumentReadCursorCodec({
      clock: new MutableClock('2026-07-16T12:00:00Z'),
      signingKey: signingKey(0x91),
    });
    let getterCalls = 0;
    const input = {
      position: 1,
      queryHash: QUERY_HASH,
      revisionId: REVISION_ID,
      service: 'document.read_nodes',
      scope: binding().scope,
      get sessionId(): SessionId {
        getterCalls += 1;
        return SESSION_ID;
      },
    };

    expect(codec.issue(input)).toEqual({ type: 'error', reason: 'invalid-binding' });
    expect(getterCalls).toBe(0);
  });

  it('rejects invalid production IDs, duplicate Scope IDs, invalid query hashes, and positions', () => {
    const codec = new PortableDocumentReadCursorCodec({
      clock: new MutableClock('2026-07-16T12:00:00Z'),
      signingKey: signingKey(0xa1),
    });

    expect(
      codec.issue({
        ...binding(),
        sessionId: '018F0000-0000-7000-8000-000000000001',
        position: 1,
      }),
    ).toEqual({ type: 'error', reason: 'invalid-binding' });
    expect(
      codec.issue({
        ...binding(),
        scope: { allowedNodeIds: [NODE_ID, NODE_ID] },
        position: 1,
      }),
    ).toEqual({ type: 'error', reason: 'invalid-binding' });
    const excessiveScopeIds = Array.from(
      { length: MAX_DOCUMENT_READ_CURSOR_SCOPE_IDS + 1 },
      (_, index) => nodeId(`018f0000-0000-7000-8009-${index.toString(16).padStart(12, '0')}`),
    );
    expect(
      codec.issue({
        ...binding(),
        scope: {
          allowedNodeIds: excessiveScopeIds.slice(0, 500),
          allowedSectionIds: excessiveScopeIds.slice(500),
        },
        position: 1,
      }),
    ).toEqual({ type: 'error', reason: 'invalid-binding' });
    expect(codec.issue({ ...binding(), queryHash: 'sha256:not-a-hash', position: 1 })).toEqual({
      type: 'error',
      reason: 'invalid-binding',
    });
    expect(codec.issue({ ...binding(), position: -1 })).toEqual({
      type: 'error',
      reason: 'invalid-binding',
    });
  });

  it('validates key and TTL configuration and reports an invalid injected clock', () => {
    const clock = new MutableClock('2026-07-16T12:00:00Z');
    expect(
      () => new PortableDocumentReadCursorCodec({ clock, signingKey: new Uint8Array(31) }),
    ).toThrow(TypeError);
    expect(
      () =>
        new PortableDocumentReadCursorCodec({
          clock,
          signingKey: signingKey(0xb1),
          ttlSeconds: 0,
        }),
    ).toThrow(TypeError);

    const invalidClock: IClock = {
      now: () => 'not-a-timestamp' as IsoTimestamp,
    };
    const codec = new PortableDocumentReadCursorCodec({
      clock: invalidClock,
      signingKey: signingKey(0xb2),
    });
    expect(codec.issue({ ...binding(), position: 1 })).toEqual({
      type: 'error',
      reason: 'clock-invalid',
    });
  });
});

function binding(): DocumentReadCursorBinding {
  return {
    sessionId: SESSION_ID,
    revisionId: REVISION_ID,
    service: 'document.read_nodes',
    scope: {
      allowedSectionIds: [SECTION_ID],
      allowedNodeIds: [NODE_ID],
      allowReadOutsideScopeForContext: false,
      maxContextDistance: 2,
    },
    queryHash: QUERY_HASH,
  };
}

function signingKey(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function timestamp(value: string): IsoTimestamp {
  const parsed = parseIsoTimestamp(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test timestamp: ${value}`);
  }
  return parsed.value;
}

function sessionId(value: string): SessionId {
  const parsed = parseSessionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Session ID: ${value}`);
  }
  return parsed.value;
}

function revisionId(value: string): RevisionId {
  const parsed = parseRevisionId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Revision ID: ${value}`);
  }
  return parsed.value;
}

function nodeId(value: string): NodeId {
  const parsed = parseNodeId(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Node ID: ${value}`);
  }
  return parsed.value;
}

function contentHash(value: string): ContentHash {
  const parsed = parseContentHash(value);
  if (parsed.type === 'invalid') {
    throw new Error(`Invalid test Content Hash: ${value}`);
  }
  return parsed.value;
}
