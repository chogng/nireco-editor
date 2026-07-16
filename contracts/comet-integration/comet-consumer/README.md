# Independent Comet Consumer Harness

This directory is a standalone consumer of the Gate 0 Contract Bundle. Its
Nireco-facing inputs are deliberately restricted to:

- `@comet-internal/nireco-editor`
- `@comet-internal/nireco-editor/protocol`
- `@comet-internal/nireco-editor/comet-internal`
- `@comet-internal/nireco-editor/contract-types/integration`
- `contract.manifest.json`, generated declarations, schemas and fixtures

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
executing the same harness from that installed tarball.
The runtime harness validates every Gate 0 request/result against the Bundle
schemas and proves:

- versioned handshake;
- task-bound session;
- fixed-Revision snapshot read;
- draft Proposal creation;
- Semantic Edit staging;
- absence of raw Transaction, review acceptance and commit surfaces.

The actual deterministic result must equal `evidence-report.json`.
