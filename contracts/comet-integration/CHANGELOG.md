# Changelog

## 0.4-preview.1 - 2026-07-16

Initial Gate 0 contract preview based on specification `0.4.2`, roadmap `0.1.1`, and engineering standard `0.1.1`.

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

Contract decisions:

- `0.4-preview.1` is private and preview-only.
- Document and manuscript schema versions are `1.0.0-preview.1`.
- Wire fields and node discriminators follow the specification's English camelCase spelling.
- Resource URIs use an ASCII-visible wire form with Unicode percent-encoded and uppercase percent hex. Logical Nireco/Comet URIs additionally use lowercase scheme/host, no authority extras or query/fragment, at least two path segments, no trailing slash, and case-preserving paths.
- Fixture IDs are readable opaque test values and do not freeze a production ID encoding.
- Title, authors, abstract, and keywords live in snapshot metadata.
- The node vocabulary explicitly includes `hardBreak`, `horizontalRule`, `footnote`, `footnoteReference`, and `bibliographyPlaceholder`.
- Agent Sessions cannot receive commit, raw transaction, storage write, schema mutation, proposal acceptance, or review commit capabilities.

Known preview issue:

- `update-metadata` is a negotiable Semantic Edit, but the normative Operation union has no document-metadata operation. This release keeps metadata canonical and external to node attributes. Services omit the edit from `supportedSemanticEdits` and return `SEMANTIC_EDIT_UNSUPPORTED` during Proposal validation/compilation until a spec-approved lowering exists.
