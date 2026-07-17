import { describe, expect, it } from 'vitest';

import { MAX_CANONICAL_JSON_DEPTH } from '../../src/base/serialization/canonical-json.js';
import { crc32, encodeUtf8, PortableWalRecordCodec } from '../../src/storage/wal-record-codec.js';

describe('PortableWalRecordCodec', () => {
  it('returns typed corruption for a checksum-valid over-deep replay input', () => {
    const depth = MAX_CANONICAL_JSON_DEPTH + 100;
    const replayInput = `${'['.repeat(depth)}null${']'.repeat(depth)}`;
    const payload = encodeUtf8(
      [
        '{"documentHash":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
        ',"parentRevisionId":"018f0000-0000-7000-8000-000000000001"',
        ',"recordType":"commit"',
        ',"recordVersion":1',
        `,"replayInput":${replayInput}`,
        ',"revisionId":"018f0000-0000-7000-8000-000000000002"',
        ',"sequence":1',
        ',"transactionHash":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
        ',"transactionId":"018f0000-0000-7000-8000-000000000003"',
        ',"uri":"nireco://workspace-01/document/deep-wal"}',
      ].join(''),
    );
    const framed = new Uint8Array(8 + payload.byteLength);
    const header = new DataView(framed.buffer, framed.byteOffset, framed.byteLength);
    header.setUint32(0, payload.byteLength, false);
    header.setUint32(4, crc32(payload), false);
    framed.set(payload, 8);

    expect(() => new PortableWalRecordCodec().decode(framed)).not.toThrow();
    expect(new PortableWalRecordCodec().decode(framed)).toMatchObject({
      type: 'corrupt',
      corruptionOffset: 0,
      reason: 'invalid-record',
    });
  });

  it('fails closed within a bounded resynchronization budget', () => {
    const byteLength = 64 * 1024;
    const framed = new Uint8Array(byteLength);
    const view = new DataView(framed.buffer, framed.byteOffset, framed.byteLength);
    view.setUint32(0, byteLength, false);
    for (let offset = 8; offset + 8 < byteLength / 2; offset += 8) {
      view.setUint32(offset, byteLength / 2, false);
      view.setUint32(offset + 4, 0, false);
    }

    expect(new PortableWalRecordCodec().decode(framed)).toMatchObject({
      type: 'corrupt',
      corruptionOffset: 0,
      reason: 'invalid-length',
    });
  });
});
