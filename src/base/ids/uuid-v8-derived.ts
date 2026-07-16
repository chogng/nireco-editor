import { parseProposalChangeGroupId, type ProposalChangeGroupId } from './identifiers.js';

export function createDerivedProposalChangeGroupId(digest: Uint8Array): ProposalChangeGroupId {
  if (digest.length < 16) {
    throw new RangeError('A derived UUIDv8 requires at least 16 digest bytes.');
  }

  const uuidBytes = digest.slice(0, 16);
  uuidBytes[6] = ((uuidBytes[6] ?? 0) & 0x0f) | 0x80;
  uuidBytes[8] = ((uuidBytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(uuidBytes, (value) => value.toString(16).padStart(2, '0')).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
  const parsed = parseProposalChangeGroupId(uuid);
  if (parsed.type === 'invalid') {
    throw new Error('SHA-256 digest could not be encoded as a canonical UUIDv8.');
  }
  return parsed.value;
}
