# Nireco–Comet Integration Contract

This directory is the self-contained Gate 0 source bundle for contract version `0.4-preview.1`.

Normative inputs:

- Nireco development specification `0.4.2`
- Nireco–Comet roadmap `0.1.1`
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
generated-types/*.d.ts
mock-service/README.md
conformance-runner/README.md
sample-traces/*.json
CHANGELOG.md
README.md
```

All schemas use JSON Schema Draft 2020-12 and stable IDs under:

```text
https://contracts.nireco.dev/comet-integration/0.4-preview.1/schemas/
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

IDs are opaque. Fixtures use readable values such as `rev-0001` and `node-0001`; this does not freeze UUID, UUIDv7, Base32, or any other production representation.

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

The snapshot content hash covers:

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

The minimal manuscript deliberately exercises:

- metadata-based title/authors/abstract/keywords;
- an emoji with UTF-16 length semantics;
- `hardBreak`;
- `horizontalRule`;
- `footnote` and `footnoteReference`;
- `bibliographyPlaceholder`.

The transaction appends punctuation after `Hello 🌍` at UTF-16 offset `8`.

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

Do not hand-edit that directory. The expected pipeline is:

```text
Contract Schema
-> Generated TypeScript/Rust Types
-> Mock and Golden Fixtures
-> Adapter
-> Conformance
```

## Preview assumptions and follow-up

- `1.0.0-preview.1` is the Gate 0 document-format and built-in manuscript-schema version. The normative documents freeze the contract version but do not assign a separate concrete document/schema version.
- Proposed structured block attributes are accepted at a controlled proposal boundary and must be validated against `manuscript.schema.json` after trusted ID assignment and compilation.
- JSON Schema cannot express every cross-field invariant. Conformance must additionally check UTF-16 surrogate boundaries, diff/document revision equality, content hashes, node grammar after compilation, proposal state transitions, dependency closure, and scope/policy rules.
- The specification includes `update-metadata` as a negotiable Semantic Edit while its enumerated Operation algebra does not define a document-metadata operation. This bundle does not silently encode semantic metadata as manuscript-root attributes. Until a spec-approved lowering is enabled, a service must omit `update-metadata` from `supportedSemanticEdits`, and Proposal validation/compilation must return `SEMANTIC_EDIT_UNSUPPORTED`.
