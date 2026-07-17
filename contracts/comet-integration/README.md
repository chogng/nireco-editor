# Nireco–Comet Integration Contract

This directory is the self-contained Contract Bundle for contract version `0.4-preview.2`.
It adds the Gate 1 revision-bound read data model to the inherited Gate 0 schemas.
The matching immutable Nireco package artifact version is `0.4.0-preview.2`.

## Preview.2 support status

`0.4-preview.2` is a schema-only Gate 1 milestone. It defines
`workspace.resolve_model`, `document.get_head`, `document.get_snapshot`,
`document.get_outline`, `document.read_nodes`,
`document.read_node_neighborhood`, `document.search`,
`document.get_changes_since`, and `document.get_diagnostics`, but it does not
claim that either the Mock or Real service passes preview.2 Read Conformance.

The existing `MockCometIntegrationService` and independent consumer evidence
remain pinned to the previous `0.4-preview.1` contract. In source,
`COMET_CONTRACT_VERSION` therefore remains the legacy Mock version while
`CURRENT_COMET_CONTRACT_VERSION` identifies this Bundle. Consumers must
negotiate an exact version; there is no implicit preview.1-to-preview.2 adapter.

Normative inputs:

- Nireco development specification `0.4.3`
- Nireco–Comet roadmap `0.1.2`
- Nireco–Comet engineering standard `0.1.1`

The JSON Schemas are the source of truth. Deterministic TypeScript declarations generated
from the pinned schema compiler are included and checked for drift.

## Bundle layout

```text
contract.manifest.json
schemas/*.schema.json
error-codes.json
capability-matrix.json
semantic-edits.json
fixtures/*.json
recovery-fixtures/*.json
generated-types/*.d.ts
performance/reference-corpus-lock.json
mock-service/README.md
conformance-runner/README.md
sample-traces/*.json
CHANGELOG.md
README.md
```

All schemas use JSON Schema Draft 2020-12 and stable IDs under:

```text
https://contracts.nireco.dev/comet-integration/0.4-preview.2/schemas/
```

The conformance validator runs Ajv strict mode with `strictTuples: false` only
because the manuscript grammar intentionally uses open `prefixItems` sequences
(`heading + block*`, `paragraph + block*`). Exact tuples remain closed with
`items: false`, `minItems`, and `maxItems`.

The manifest is the authoritative index for schema paths, fixture payload schemas, expected hashes, catalogs, traces, and code-generation settings.

## Frozen Gate 0 choices

- Contract fields are English `camelCase`.
- Tagged document and operation unions use `type`; Semantic Edit unions use `kind`.
- Objects reject unknown fields by default with `additionalProperties: false`.
- The few open maps are explicit boundaries: JSON values, CSL-JSON, negotiated feature flags, operation attribute patches, and proposed-content attributes. Canonical schema validation still applies after compilation.
- Cross-repository document addresses always contain `uri + revisionId`; mutable targets contain `uri + baseRevisionId`.
- Text positions and text operation offsets are UTF-16 code units. Services must reject an offset in the middle of a surrogate pair, and user editing commands must align to grapheme boundaries.
- Mainline revision history is linear and single-parent.
- The Agent write path is `Semantic Edit -> Proposal`. The Agent has no commit, raw transaction, storage write, schema mutation, review accept, or review commit capability.

## URI and ID profile

Canonical `nireco:` and `comet:` logical URIs have:

- ASCII-visible wire characters only; Unicode is UTF-8 percent-encoded;
- lowercase scheme and host;
- no userinfo, query, fragment, or port;
- at least two non-empty path segments;
- no trailing slash;
- case-preserving path segments;
- uppercase hexadecimal in percent escapes.

`nireco://workspace-01/document/DocCaseA` is therefore valid and intentionally preserves path case.

Nireco-owned production identities are now frozen:

- allocated identities use canonical lowercase RFC 9562 UUIDv7;
- `OperationId` is an allocated UUIDv7 assigned by a trusted compiler or service
  before reducer entry;
- `ProposalChangeGroupId` is a deterministic UUIDv8 derived from the frozen
  domain-separated SHA-256 group-identity preimage;
- external identities such as a Comet task or tool invocation remain opaque
  integration-owned strings.

The production parsers reject uppercase UUIDs, non-RFC variants, the wrong UUID
version, and readable values such as `node-0001`. A named preview-fixture
compatibility parser exists only for older in-process tests and must never be
used at a production boundary. Contract fixtures use the production UUID profile.

Clock and entropy access belongs to the injected UUIDv7 seed source. The allocator
keeps output lexicographically monotonic when a timestamp repeats or moves
backwards; reducers never read a clock or random source.

## Gate 1 revision-bound read profile

Every preview.2 read result explicitly carries `document`,
`basedOnRevisionId`, `consistency`, and `status`. Paged results additionally
carry `items`, `truncated`, `approximateBytes`, and an opaque `nextCursor` when
and only when `truncated` is true. A request `maxResults` is bounded both by the
schema hard maximum of 1000 and the smaller negotiated Session limit.
Successful fixed-Snapshot and paged reads report only `current` or `stale`;
advancing the mutable head makes an older Session Snapshot stale rather than
changing the Revision it reads.
The same rule applies when `workspace.resolve_model` resolves a fixed
`DocumentRef`: successful resolution may be stale relative to the mutable head.

`document.read_nodes` and `document.read_node_neighborhood` return shallow node
projections. They include canonical attributes (or text and Marks), stable Node
IDs, and authorized child/parent metadata, but never recursively embed a
`DocumentNode` subtree. `nodeHash` is present only when the complete canonical
subtree covered by the hash is authorized (document-wide or allowed-Section
context), or for an exact authorized Text leaf. A partial exact non-Text
projection omits it so hidden descendants cannot be queried through a hash
oracle. Search returns stable Node or academic Entity targets, snippets, and
match kinds; raw DOM offsets are not part of the wire contract.

Scope is the Session grant. Request filters may only narrow it. An outside-Scope
read fails closed and must not reveal whether a Node exists. Each of
`allowedNodeIds` and `allowedSectionIds` is schema-capped at 1000 IDs,
and their combined count is capped at 1000 by the Session grant, read service,
and cursor-binding runtime checks. `maxContextDistance` is capped at 1000000 at
the same boundaries. The cursor is one
unpadded canonical base64url value, capped at 1024 characters and authenticated
with the manifest's domain-separated keyed SHA-256 profile. Its binding covers
Session, Revision, service, the complete canonical granted Scope, and the
canonical query hash. The token contains only a binding digest, expiry, logical
page offset, and version—never raw IDs, Scope values, a database key, or a DOM
position. Expired cursors and cursors replayed across a Revision, Scope, query,
Session, or service are rejected.

## Canonical hash preimages

Protocol hashes use profile `nireco-hash-preimage-1`. The exact byte sequence is:

```text
UTF8("NIRECO\0HASH\0V1\0" + domain + "\0" + canonicalJson(payload))
```

There is no BOM, trailing newline, Unicode normalization, locale-dependent sort,
or implicit field omission. SHA-256 output is lowercase
`sha256:<64 lowercase hex>`. A semantic change to any domain or payload requires
a new versioned domain; implementations must not silently reinterpret a V1 hash.

Frozen domains include document content, transaction, node, academic entity,
Proposal Change Group identity, Semantic Diff, and governance manifest. Document
content hashes include only `schemaId`, `schemaVersion`, `metadata`, `root`,
`academicGraph`, and `settings`. They exclude `format`, `formatVersion`,
`revisionId`, and `documentHash`.

`fixtures/hash-preimages.json` contains a concrete payload Schema ID, schema-valid
payload, canonical JSON, exact UTF-8 bytes in hex, and expected hash for every
frozen domain. Conformance validates each payload with Ajv strict mode before
comparing the browser-safe portable SHA-256 implementation with Node crypto.

## Manuscript schema

The canonical snapshot uses:

```text
format: nireco-document
formatVersion: 1.0.0-preview.1
schemaId: nireco.manuscript
schemaVersion: 1.0.0-preview.1
```

`metadata` contains the semantic `title`, `authors`, `abstract`, and `keywords`. These fields are not duplicated as content nodes.

The V1 preview vocabulary includes `hardBreak`, `horizontalRule`, `footnote`, `footnoteReference`, and `bibliographyPlaceholder` in addition to the structural, inline, figure, table, list, equation, citation, and cross-reference nodes. `frontMatter` remains an optional empty structural boundary in this preview; its semantic fields live in snapshot metadata.

The snapshot content hash payload covers:

```text
schemaId
schemaVersion
metadata
root
academicGraph
settings
```

It excludes the revision ID and the `documentHash` field itself.

## Golden fixtures

Each fixture is a `golden-fixture.schema.json` envelope. Its `payload` validates against `payloadSchemaId`, and `expectedCanonicalSha256` hashes only the payload using `nireco-canonical-json-0.1`.

`expectedCanonicalSha256` is an envelope drift checksum, not a protocol content
hash. Protocol content hashes always use the domain-separated preimage above.

## Operation and Semantic Diff identity

Every Operation carries a formal `OperationId` UUIDv7. The compiler persists the
ordered Operation list; display code must not re-sort it because operation order
can affect apply semantics.

Semantic Diff declares algorithm version `nireco-semantic-diff-1`. Change Group
IDs include document/revision identity, Proposal identity and revision, group
kind, canonical target refs, and persisted ordered Operation IDs. Target display
order therefore cannot change the ID, while a new Proposal Revision always does.

Canonical Group order is a deterministic topological order. Among simultaneously
ready groups, the tie-break is canonical target, group-kind rank, then Group ID.
Rebase `supersedes` mappings match groups of the same kind sharing a stable target
identity with the document revision removed; mappings and target Group IDs use
canonical group order. No text-similarity heuristic is permitted.

The minimal manuscript deliberately exercises:

- metadata-based title/authors/abstract/keywords;
- an emoji with UTF-16 length semantics;
- `hardBreak`;
- `horizontalRule`;
- `footnote` and `footnoteReference`;
- `bibliographyPlaceholder`.

The transaction appends punctuation after `Hello 🌍` at UTF-16 offset `8`.

Recovery fixtures additionally cover an incomplete trailing WAL frame and checksum
corruption in a middle frame. They use the ADR-010 frame:

```text
uint32 big-endian payload length
uint32 big-endian CRC-32/ISO-HDLC
canonical-JSON UTF-8 payload
```

Only an incomplete trailing frame is truncated. Middle corruption enters
`RECOVERY_REQUIRED` and is never silently skipped.

## Durability acknowledgment

`apply()` acknowledges only an atomic in-memory Revision. Consumers that require a
reliable save wait for
`revision.schema.json#/$defs/DurabilityAcknowledgement`.

Durability advances only `memory → wal → snapshot`. WAL append or fsync failure after
memory commit makes the Authority read-only and returns a typed durability error.
Snapshot failure leaves the WAL-safe Revision and previous manifest authoritative, so
an explicit Snapshot retry is safe.

## Packed performance corpus identity

`performanceEvidence.corpusIdentityPath` is relative to this Contract Bundle and
resolves to `performance/reference-corpus-lock.json`. The artifact freezes the S/M/L
profile ID, generator version, seed, exact counts, raw checksum and canonical Document
Hash, so an installed package does not depend on repository-only `docs/**` files to
resolve corpus identity.

The repository documentation copy remains
`docs/performance/reference-corpus-lock.json`. `pnpm check:reference-corpora` regenerates
all three corpora and requires both copies to match exactly. `pnpm contract:consumer`
also packs and installs the package in isolation, resolves the manifest path inside the
installed Bundle, and compares every identity against the installed production
generator. These are correctness/evidence checks only; they do not make a latency claim.
Superseded identities are retained byte-for-byte under `performance/history/`;
CI compares that append-only history with the pull-request or push base via
`pnpm check:reference-corpus-history`.

## Code generation and checks

Run:

```sh
pnpm contract:generate
pnpm contract:check
```

Generated declarations belong in:

```text
contracts/comet-integration/generated-types/
```

Do not hand-edit that directory. The inherited Gate 0 evidence pipeline is:

```text
Contract Schema
-> Generated TypeScript/Rust Types
-> Mock and Golden Fixtures
-> Adapter
-> Conformance
```

It remains previous-contract evidence only. Preview.2 can move to
runtime-supported status only after both Mock and Real services pass the same
Read Conformance and the cross-repository merge gate is enabled.

## Preview assumptions and follow-up

- `1.0.0-preview.1` is the Gate 0 document-format and built-in manuscript-schema version. The normative documents freeze the contract version but do not assign a separate concrete document/schema version.
- Proposed structured block attributes are accepted at a controlled proposal boundary and must be validated against `manuscript.schema.json` after trusted ID assignment and compilation.
- JSON Schema cannot express every cross-field invariant. `contract.manifest.json#runtimeConformance` is therefore normative alongside the schemas: all strings must be well-formed Unicode (no unpaired UTF-16 surrogate), Manuscript child-edge depth is capped at 256, inert/open JSON depth is capped at 1008, and Marks use the declared canonical order with at most one of each type and mutually exclusive subscript/superscript. A Transaction is capped at 8 MiB of canonical UTF-8, 262144 JSON values, 1024 Operations, 4096 Preconditions, and 1024 tool invocation IDs. Conformance must additionally check these limits, UTF-16 offset boundaries, diff/document revision equality, content hashes, node grammar after compilation, proposal state transitions, dependency closure, and scope/policy rules.
- The Transaction JSON-value count includes the root and every array item or object-property value. Object keys are not values; a shared in-memory value is counted again at every serialized occurrence, and cycles are invalid.
- The specification includes `update-metadata` as a negotiable Semantic Edit while its enumerated Operation algebra does not define a document-metadata operation. This bundle does not silently encode semantic metadata as manuscript-root attributes. Until a spec-approved lowering is enabled, a service must omit `update-metadata` from `supportedSemanticEdits`, and Proposal validation/compilation must return `SEMANTIC_EDIT_UNSUPPORTED`.
