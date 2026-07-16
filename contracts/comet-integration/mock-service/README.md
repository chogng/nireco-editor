# Gate 0 Mock Service

The version-matched in-memory mock is exported from:

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
