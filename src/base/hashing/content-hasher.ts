import type { ContentHash } from '../ids/identifiers.js';

export interface IContentHasher {
  hashUtf8(value: string): Promise<ContentHash>;
}
