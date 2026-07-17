# Changelog

## Package 0.4.0-preview.2

- Publishes Contract Bundle `0.4-preview.2` with the Gate 1 revision-bound read
  data model and generated declarations.
- Defines all nine required Model/read request and result pairs, explicit
  `basedOnRevisionId`, strict paging, stable semantic search targets, and
  shallow scope-filtered node projections with no DOM offsets.
- Freezes the opaque read cursor profile at 1024 unpadded base64url characters,
  authenticated and bound to Session, Revision, service, complete Scope, query
  hash, logical position, and expiry.
- Marks preview.2 as schema-only. Neither Mock nor Real service conformance is
  claimed; the existing Mock and independent consumer evidence remain explicitly
  pinned to `0.4-preview.1`.
- Moves Bundle schema IDs, catalogs, fixture envelopes, recovery fixtures,
  traces, generated declarations, and package metadata to preview.2. Unchanged
  document, transaction, durability, proposal, and Semantic Edit protocol
  versions remain preview.1 and are not silently reinterpreted.

## 0.4-preview.2 - 2026-07-16

Gate 1 revision-bound read schema milestone based on specification `0.4.3`.

## Package 0.4.0-preview.1

- Pins the installable Nireco artifact used by the Comet Gate 0 consumer to Contract Bundle `0.4-preview.1`.

## 0.4-preview.1 - 2026-07-16

Initial Gate 0 contract preview based on specification `0.4.3`, roadmap `0.1.2`, and engineering standard `0.1.1`.

Added:

- Draft 2020-12 schemas for resource references, UTF-16 positions and anchors, canonical manuscripts, diagnostics, operations, transactions, linear revisions, Semantic Edits, proposals, Semantic Diffs, handshake/session messages, typed errors, traces, and golden fixture envelopes.
- A closed typed error catalog, explicit Agent capability matrix, and Semantic Edit catalog.
- Self-contained canonical fixtures for a minimal manuscript, transaction, proposal, and Semantic Diff.
- Read-only Session and Draft Proposal sample traces.
- Deterministic generated TypeScript declarations and generated-code drift checks.
- A contract-shaped in-memory Mock for handshake, fixed-Revision Snapshot reads,
  Draft Proposal creation, and high-level Semantic Edit staging.
- A schema-backed conformance runner for fixtures, hashes, traces, catalogs,
  canonical URI negatives, Mock request/results, and Agent no-bypass behavior.
- Exact seven-domain hash preimages with portable, Node, and browser byte-vector
  conformance.
- UUIDv7 allocated identities, persisted `OperationId`, deterministic UUIDv8
  Proposal Change Group identities, and production-profile fixtures.
- Durability error contracts plus WAL tail-truncation and middle-corruption
  recovery fixtures.
- A package-export-only independent Comet consumer harness and deterministic
  evidence report.

Contract decisions:

- `0.4-preview.1` is private and preview-only.
- Document and manuscript schema versions are `1.0.0-preview.1`.
- Wire fields and node discriminators follow the specification's English camelCase spelling.
- Resource URIs use an ASCII-visible wire form with Unicode percent-encoded and uppercase percent hex. Logical Nireco/Comet URIs additionally use lowercase scheme/host, no authority extras or query/fragment, at least two path segments, no trailing slash, and case-preserving paths.
- Nireco-owned production and Contract fixture IDs use the frozen UUIDv7/UUIDv8
  profile; readable legacy fixture IDs are rejected at production boundaries.
- Title, authors, abstract, and keywords live in snapshot metadata.
- The node vocabulary explicitly includes `hardBreak`, `horizontalRule`, `footnote`, `footnoteReference`, and `bibliographyPlaceholder`.
- Agent Sessions cannot receive commit, raw transaction, storage write, schema mutation, proposal acceptance, or review commit capabilities.

Known preview issue:

- `update-metadata` is a negotiable Semantic Edit, but the normative Operation union has no document-metadata operation. This release keeps metadata canonical and external to node attributes. Services omit the edit from `supportedSemanticEdits` and return `SEMANTIC_EDIT_UNSUPPORTED` during Proposal validation/compilation until a spec-approved lowering exists.
