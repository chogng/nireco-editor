import { createHash } from 'node:crypto';

import type { IContentHasher } from '../../base/hashing/content-hasher.js';
import { parseContentHash, type ContentHash } from '../../base/ids/identifiers.js';

export class Sha256ContentHasher implements IContentHasher {
  async hashUtf8(value: string): Promise<ContentHash> {
    const digest = createHash('sha256').update(value, 'utf8').digest('hex');
    const parsed = parseContentHash(`sha256:${digest}`);
    if (parsed.type === 'invalid') {
      throw new Error('SHA-256 produced an invalid content hash.');
    }

    return parsed.value;
  }
}
