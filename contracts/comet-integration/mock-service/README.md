# Gate 0 Mock Service

This Mock implements only the previous `0.4-preview.1` contract. It is retained
in package `0.4.0-preview.2` for explicit compatibility evidence and does not
claim support for the schema-only preview.2 Gate 1 read contract.

The previous-contract in-memory Mock is exported from:

```ts
import { MockCometIntegrationService } from '@comet-internal/nireco-editor/comet-internal';
```

Implemented contract operations:

- `integration.handshake`
- `integration.open_session`
- `document.get_snapshot`
- `proposal.create`
- `proposal.stage_semantic_edits`

The handshake advertises only implemented Gate 0 capabilities. Snapshot reads
remain fixed to the session `DocumentRef`; scoped sessions fail closed for full
snapshot reads. Proposal writes accept only high-level Semantic Edits and never
expose raw Transaction, review acceptance, storage write, or mainline commit.

`update-metadata` is intentionally not advertised until a normative Operation
lowering exists.
