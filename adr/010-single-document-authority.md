# ADR-010: Single Document Authority and Durability Failure Semantics

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Storage / Authority
- Gate: Gate 0
- Related specifications: Development Spec §7, §11.4, §11.7, §13.4–13.6, §18.4–18.5
- Supersedes: None
- Superseded by: None

## Context

Nireco separates an accepted in-memory commit from reliable persistence. The existing
`memory`, `wal`, and `snapshot` vocabulary did not define the byte boundary of a WAL
record, the exact acknowledgment point, or what happens when append or fsync fails
after the mainline head has already advanced. It also left Revision immutability in
tension with a durability field that changes over time.

A second failure class is split ownership. Two authorities that can allocate from the
same base may produce a fork even if each process is internally serialized. Storage
writes therefore need an ownership fence in addition to an in-memory mutex.

## Decision

Each canonical document URI has one writable Authority lease and a monotonically
increasing fencing epoch. A commit is prepared synchronously against the current head,
validated without side effects, and then installed atomically in memory. The Authority
returns that `memory` result separately from its asynchronous durability pipeline.

Revision identity is immutable. Durability is mutable sidecar state keyed by
`RevisionId`; a serialized Revision is a projection of the immutable identity plus the
highest acknowledged sidecar level. Advancing durability does not change Revision ID,
document hash, transaction identity, parent, sequence, actor, or timestamp.

The durability pipeline is:

```text
atomic in-memory head switch
→ append one framed WAL record
→ fsync the WAL
→ acknowledge wal
→ optionally write and fsync a temporary snapshot
→ validate the temporary snapshot
→ atomically rename it
→ atomically compare-and-switch the snapshot manifest
→ acknowledge snapshot
```

`apply()` MUST resolve after the in-memory head switch and MUST NOT wait for WAL or
Snapshot I/O. `whenDurable()` is the only durability acknowledgment API. A
`whenDurable(revisionId, "snapshot")` waiter MUST cause the Authority to schedule the
Snapshot path after that Revision reaches `wal`; it cannot rely on an unrelated caller
to make the waiter complete.

## Normative rules

- Durability MUST only advance `memory → wal → snapshot`; repeated or lower-level
  acknowledgments are idempotent and MUST NOT regress state.
- A WAL frame MUST contain, in order, a four-byte unsigned big-endian payload length,
  a four-byte unsigned big-endian CRC-32/ISO-HDLC checksum of the payload, and the
  canonical-JSON UTF-8 payload.
- WAL decode MUST reject a valid-JSON payload whose bytes are not exactly the canonical
  serialization of the decoded record.
- A WAL payload MUST identify record version, canonical URI, Revision ID, parent
  Revision ID, sequence, Transaction ID, transaction hash, document hash, and replay
  input.
- A Revision MUST NOT reach `wal` until append and fsync both succeed under the same
  current Authority fence.
- At most one `memory`-only mainline Revision MAY exist per Authority. Until it reaches
  `wal` or fails, another apply MUST fail closed without changing head or storage.
- If append, fsync, or the ownership fence fails after memory commit, the Authority
  MUST retain the committed in-memory head, enter read-only mode, reject affected
  `whenDurable(revisionId, "wal" | "snapshot")` waiters with a typed durability error,
  and MUST NOT allocate another Revision. It MUST NOT pretend the memory commit rolled
  back.
- WAL failure recovery requires reopening from the latest valid Snapshot plus durable
  WAL. The failed Authority instance MUST NOT retry writes in place.
- Snapshot failure MUST leave the Revision at `wal`, MUST leave the previous manifest
  authoritative, and MAY be retried explicitly. Snapshot failure alone does not make a
  WAL-safe Authority read-only. A stale fence at any Snapshot write or manifest switch
  is ownership loss, so the Authority MUST become read-only and MUST reject Snapshot
  waiters as durability-unreachable.
- A Snapshot manifest switch MUST be atomic and compare the expected generation. It
  MUST reference only a fully written, fsynced, validated, and atomically renamed
  Snapshot. Manifest sequence MUST NOT move backward.
- A newly opened Authority MUST start from a `wal`- or `snapshot`-durable Revision; a
  `memory`-only Revision cannot be accepted as a recovery base.
- Recovery MUST validate the Snapshot, decode the entire durable WAL stream, and
  enforce exact URI, strictly increasing sequence, parent, and unique Revision-ID
  continuity even for records at or before the selected Snapshot sequence.
- An incomplete trailing WAL frame MUST be truncated to the last complete valid frame.
  The truncate operation MUST compare the durable byte length observed by recovery
  before replacing it with the shorter length. A checksum, canonical payload, length
  header with evidence of a subsequent complete frame, parent, sequence, duplicate
  Revision ID, transaction, document-hash, or schema failure in the middle MUST enter
  recovery-required mode and MUST NOT be skipped or truncated as if it were a tail.
- Every WAL append and Snapshot manifest switch MUST carry the Authority fencing
  epoch. Storage MUST reject a stale epoch. A lease loss before memory commit produces
  no state change; a lease loss after memory commit follows the WAL failure rule.
- Reducer and validation work MUST remain synchronous and outside storage I/O. The
  durability implementation consumes an injected prepared commit/replay input and
  does not define the document reducer.

## Contract and implementation impact

- `INirecoModel` and `IDocumentAuthority` expose `getDurability()` and
  `whenDurable()`.
- `CommitResult` exposes `revisionId`, the committed immutable `snapshot`,
  `transactionHash`, and the literal `memory` acknowledgment in both runtime and JSON
  Schema.
- Revision Contract adds explicit durability acknowledgment and authority-mode
  projections while preserving the existing Revision wire shape.
- Typed errors distinguish append failure, fsync failure, unreachable durability,
  Snapshot commit failure, and recovery-required state.
- Storage ports carry an Authority fence. The in-memory reference adapter implements
  fault injection, crash loss of non-fsynced WAL bytes, Snapshot manifest
  compare-and-switch, and byte corruption helpers.
- This ADR freezes the Gate 0 framing and failure semantics. It does not freeze a
  production filesystem layout or network lease backend.

## Verification

- Unit tests cover `apply()` versus `whenDurable()`, monotonic promotion, append/fsync
  failure, fail-closed read-only transition, stale fencing, and atomic manifest switch.
- Property tests cover WAL frame round-trip and arbitrary incomplete-tail truncation.
- Recovery conformance fixtures cover incomplete tail and middle corruption.
- Architecture checks keep reducers independent of I/O and keep storage behind
  Authority ports.

## Consequences

### Positive

- Callers cannot confuse editing success with durable-save success.
- A post-commit storage failure is explicit and recoverable without rewriting history.
- Storage fencing prevents a stale Authority from making a durable split-brain write.
- Snapshot failure cannot replace a known-good manifest.

### Costs and constraints

- The Gate 0 implementation permits only one un-fsynced Revision at a time.
- The CRC protects record framing and corruption detection; cryptographic transaction
  and document hashes remain separate validation inputs.
- Production adapters must provide real exclusive leases, fsync, atomic rename, and
  atomic manifest compare-and-switch semantics.

## Alternatives considered

- **Wait for fsync inside `apply()`**: rejected because it collapses editing and
  durability semantics and increases interactive latency.
- **Roll back head after WAL failure**: rejected because observers may already have
  seen the committed Revision and rollback would rewrite mainline history.
- **Continue writing after WAL failure**: rejected because it creates an unbounded
  volatile branch that cannot be proven recoverable.
- **Treat a Snapshot file as current before manifest switch**: rejected because a
  crash could expose a partial or unvalidated Snapshot.
- **Process-local mutex only**: rejected because it cannot fence another process or a
  stale leader.

## Deferred decisions and blockers

- Group commit, WAL segment rotation, compaction retention, encryption, production
  filesystem layout, distributed lease backend, and Authority handoff token wire
  format are deferred beyond Gate 0.
- These deferred items do not reopen G0-B002. Closing G0-B002 requires the Contract,
  typed errors, crash fixtures, and automated evidence listed above.

## Change policy

The WAL frame, acknowledgment point, fail-closed transition, recovery classification,
and Snapshot manifest ordering are normative. Changing them requires a superseding ADR
or an explicit amendment with regenerated Contract artifacts and recovery vectors.
