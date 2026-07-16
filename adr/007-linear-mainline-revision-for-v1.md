# ADR-007: Linear Mainline Revision for V1

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core
- Gate: Gate 0
- Related specifications: Development Spec §13
- Supersedes: None
- Superseded by: None

## Context

V1 需要确定的 head、Undo、恢复和 Proposal Acceptance，但尚不需要 Git 式 merge DAG 或多人 CRDT。过早引入多父历史会扩大所有 Contract、PositionMap 和 Authority 的复杂度。

## Decision

V1 主分支采用严格线性 Revision history。每个非 genesis Revision 恰有一个 `parentRevisionId`，由一个成功 Transaction 产生，并成为 Authority 的新 head。

Proposal 使用独立的 Proposal Revision Log；Proposal revision 不是主分支 Revision。接受 Proposal 时，在当前 mainline head 上提交一个普通 Transaction，产生一个新的单父 Revision，并通过 Provenance 关联 Proposal。

## Normative rules

- Revision MUST immutable，并包含 URI、opaque Revision ID、single parent、Transaction ID、sequence、document hash、Actor、time 和 durability state。
- Revision ID MUST NOT 等同于 content hash；相同内容 MAY 产生不同 Revision。
- 每个 successor 的 `sequence` MUST 等于 parent sequence 加一；Authority handoff 不得重置 sequence。
- Revision 排序 MUST 使用 parent/sequence，不依赖 wall-clock time。
- Authority MUST 在 base mismatch 时返回 `BASE_REVISION_MISMATCH`，不得 last-write-wins。
- Undo/Redo MUST 提交 inverse Transaction 并产生新 Revision，MUST NOT 删除或重写历史。
- Rebase、Compaction 和 Proposal Acceptance MUST NOT 改写已有 mainline Revision。
- 一次 Proposal Acceptance MUST 形成一个原子 mainline Transaction 和一个 composite undo group。
- 每个 Revision MUST 可追溯到 producing Transaction；每个 committed Transaction MUST 只产生一个 mainline Revision。
- V1 Contract MUST 使用单一 `parentRevisionId`，不得提前公开 `parentIds[]`。

## Durability vocabulary

Revision durability 名称固定为：

```text
memory   authority 已完成内存 commit
wal      对应 WAL record 已满足持久化确认
snapshot Revision 已被有效持久 Snapshot 覆盖
```

状态只允许单调推进，不能从 `wal` 或 `snapshot` 回退为 `memory`。`applyTransaction()` 的 commit 结果与 `whenDurable()` 的持久化结果必须分离。

## Contract and implementation impact

Revision Schema 只包含单 parent。History、Undo、replay、Proposal provenance 和 Authority handoff 都必须保留该线性语义。未来 DAG 需要 superseding ADR 和 breaking Contract migration。

## Verification

- Property test 验证 parent/sequence 连续且 head 唯一。
- Undo/Redo test 验证产生新 Revision，不重写旧 Snapshot。
- Replay test 验证 Transaction order 与 head hash。
- Proposal accept test 验证一个 acceptance 只产生一个 mainline Revision。
- Corrupt/missing parent test 必须进入 recovery mode。

## Consequences

### Positive

- head、replay、Undo 和审计简单且可确定。
- Proposal 可独立演进而不把草稿变成主分支。

### Costs and constraints

- 并发写入必须串行或显式 rebase。
- V1 不支持多父 merge、多人 CRDT 或离线双向合并。

## Alternatives considered

- **Revision DAG**：延后；当前没有多人 merge 需求来抵消复杂度。
- **可变 head snapshot 无历史**：拒绝，因为无法审计、恢复或可靠 Undo。
- **Proposal 直接成为 mainline branch**：拒绝，因为草稿会污染 Authority history。

## Deferred decisions and blockers

- **G0-B002 — Durability failure semantics（Closed 2026-07-16）**：由
  [ADR-010](./010-single-document-authority.md) 冻结 WAL framing/checksum、
  append+fsync acknowledgment、内存 commit 后的 fail-closed 行为、
  `whenDurable()` rejection、Snapshot manifest 原子切换与 crash fixtures。
- 多父 DAG、CRDT 和 retention policy 明确延后，不是 Gate 0 的实现承诺。
