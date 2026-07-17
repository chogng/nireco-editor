# Independent Comet Consumer Harness

This harness remains pinned to `0.4-preview.1`. Its evidence is previous-contract
compatibility evidence only; it is not preview.2 Read Conformance or a current
cross-repository merge gate.

The harness loads schemas from the current preview.2 Bundle, validates the
legacy Mock messages against the retained preview.1 definitions, and asserts the
manifest's current/previous support matrix. The type-only consumer also compiles
all nine preview.2 read request/result declarations without invoking them.

This directory is a standalone consumer of the Gate 0 Contract Bundle. Its
Nireco-facing inputs are deliberately restricted to:

- `@comet-internal/nireco-editor`
- `@comet-internal/nireco-editor/protocol`
- `@comet-internal/nireco-editor/comet-internal`
- `@comet-internal/nireco-editor/contract-types/integration`
- `contract.manifest.json`, generated declarations, schemas, fixtures and the packed
  S/M/L corpus identity artifact

It must not import Nireco `src/**`, `dist/**` internals or Kernel-private
objects. Node built-ins and Ajv are consumer-side tooling rather than Nireco
API.

Run from the repository root:

```sh
pnpm contract:consumer
```

The command builds the package, typechecks `type-consumer.ts` against the public
entrypoints and generated declarations, executes the Node consumer test, then
packs and installs the package into an isolated temporary consumer before
executing the same harness from that installed tarball. The packed check also
requires `performanceEvidence.corpusIdentityPath` to remain inside the installed
Contract Bundle and verifies its S/M/L identities against the installed generator.
The runtime harness validates every Gate 0 request/result against the Bundle
schemas and proves:

- versioned handshake;
- task-bound session;
- fixed-Revision snapshot read;
- draft Proposal creation;
- Semantic Edit staging;
- absence of raw Transaction, review acceptance and commit surfaces.

The actual deterministic result must equal `evidence-report.json`.
