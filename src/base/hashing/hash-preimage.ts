import type { IContentHasher } from './content-hasher.js';
import type { ContentHash } from '../ids/identifiers.js';
import { serializeCanonicalJson } from '../serialization/canonical-json.js';

export const HASH_PREIMAGE_PROFILE = 'nireco-hash-preimage-1';
export const HASH_PREIMAGE_PREFIX = 'NIRECO\0HASH\0V1\0';

export const HASH_DOMAINS = {
  academicEntity: 'nireco.academic-entity.v1',
  documentContent: 'nireco.document-content.v1',
  governanceManifest: 'nireco.governance-manifest.v1',
  node: 'nireco.node.v1',
  proposalChangeGroup: 'nireco.proposal-change-group.v1',
  semanticDiff: 'nireco.semantic-diff.v1',
  transaction: 'nireco.transaction.v1',
} as const;

export type HashDomain = (typeof HASH_DOMAINS)[keyof typeof HASH_DOMAINS];

export type HashPreimageResult =
  | {
      readonly type: 'ok';
      readonly canonicalJson: string;
      readonly preimage: string;
    }
  | {
      readonly type: 'error';
      readonly reason: 'canonical-json';
      readonly path: string;
    };

export type CanonicalHashResult =
  | {
      readonly type: 'ok';
      readonly hash: ContentHash;
      readonly canonicalJson: string;
      readonly preimage: string;
    }
  | {
      readonly type: 'error';
      readonly reason: 'canonical-json';
      readonly path: string;
    };

/**
 * Exact protocol preimage:
 *
 * UTF8("NIRECO\0HASH\0V1\0" + domain + "\0" + canonicalJson(payload))
 *
 * Domain names are frozen ASCII constants. Canonical JSON escapes embedded U+0000,
 * so the NUL separator cannot collide with payload bytes.
 */
export function createCanonicalHashPreimage(
  domain: HashDomain,
  payload: unknown,
): HashPreimageResult {
  const canonical = serializeCanonicalJson(payload);
  if (canonical.type === 'error') {
    return {
      type: 'error',
      reason: 'canonical-json',
      path: canonical.error.path,
    };
  }

  return {
    type: 'ok',
    canonicalJson: canonical.value,
    preimage: `${HASH_PREIMAGE_PREFIX}${domain}\0${canonical.value}`,
  };
}

export async function hashCanonicalJson(
  hasher: IContentHasher,
  domain: HashDomain,
  payload: unknown,
): Promise<CanonicalHashResult> {
  const preimage = createCanonicalHashPreimage(domain, payload);
  if (preimage.type === 'error') {
    return preimage;
  }

  return {
    type: 'ok',
    hash: await hasher.hashUtf8(preimage.preimage),
    canonicalJson: preimage.canonicalJson,
    preimage: preimage.preimage,
  };
}
