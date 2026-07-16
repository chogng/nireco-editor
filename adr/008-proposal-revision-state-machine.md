# ADR-008: Proposal Revision State Machine

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Proposal
- Gate: Gate 0
- Related specifications: Development Spec §14
- Supersedes: None
- Superseded by: None

## Context

Proposal 是主分支之外的可变审阅对象。若 Proposal 内容、验证结果、Diff 和状态没有独立版本，异步 validation、rebase、重试和用户审阅会互相覆盖。

## Decision

每个 Proposal 具有独立、单调递增的 `proposalRevision`，所有 mutation 使用 optimistic concurrency。状态集合固定为：

```text
draft
validating
validated
needs-review
conflicted
accepted
partially-accepted
rejected
discarded
expired
```

`validating → validated` 是必须保留的显式成功转换；实现不得把成功 validation 直接折叠成 `needs-review`。

## Normative transition table

| From             | Allowed to                                                 | Required condition                                              |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `draft`          | `validating`                                               | 请求绑定 expected Proposal Revision                             |
| `validating`     | `validated`                                                | validation 成功且结果仍绑定同一 content/base input              |
| `validating`     | `draft`                                                    | 可编辑 validation failure                                       |
| `validating`     | `conflicted`                                               | target/base 无法确定映射                                        |
| `validated`      | `needs-review`                                             | blocking diagnostics 为零，Diff 绑定当前 Proposal/Base Revision |
| `validated`      | `draft`                                                    | 显式内容编辑或 reopen                                           |
| `validated`      | `conflicted`                                               | base/semantic conflict                                          |
| `needs-review`   | `accepted`, `partially-accepted`, `rejected`, `conflicted` | 仅可信 Review Controller                                        |
| `conflicted`     | `draft`                                                    | successful rebase/reopen，之后必须重新 validation               |
| `conflicted`     | `discarded`                                                | 显式放弃                                                        |
| any non-terminal | `discarded`, `expired`                                     | 审计摘要已保留                                                  |

终态为 `accepted`、`partially-accepted`、`rejected`、`discarded` 和 `expired`。

## Normative rules

- 每个 mutation，包括 semantic edit、rebase、status transition、reopen 和 validation result apply，MUST 携带 `expectedProposalRevision`。
- 成功 mutation MUST 返回新的 `proposalRevision`；不匹配返回 `PROPOSAL_REVISION_MISMATCH`，不得 last-write-wins。
- 异步 validation MUST 捕获其输入的 Proposal Revision、base Revision、schema/policy version；stale result MUST 丢弃或返回 typed mismatch，不能覆盖新草稿。
- `validated` MUST 表示 validation snapshot 已成功落在当前 Proposal Revision 上；`needs-review` MUST 表示内容冻结且 Diff 可审阅。
- 不允许 `validating → needs-review`、`draft → needs-review` 或 Agent 直接进入 accepted/rejected 状态。
- `needs-review` 后 semantic edits 冻结。继续编辑只能创建新 Proposal，或由产品控制器显式 reopen 为新 Proposal Revision 并使旧 Diff 失效。
- Comet Agent MAY 创建/修改/验证/提交 Proposal 供审阅，但 MUST NOT reopen `needs-review` Proposal、接受、拒绝或 commit mainline。
- 终态 Proposal MUST immutable；`partially-accepted` 的未接受内容保留审计摘要，不复用原 Proposal 继续编辑。
- Rebase MUST 产生新 Proposal Revision、更新 base、保留旧 revision、重新验证并重建 Diff。

## Contract and implementation impact

Proposal Schema 必须包含 status、base Revision、proposalRevision、validation snapshot、optional Diff 和 provenance。每个 mutation endpoint 使用 `ProposalRef`。Event/audit log 必须记录 from/to state 和 actor。

## Verification

- Exhaustive transition test 拒绝表外边。
- Concurrency test 验证两个相同 expected revision 的写入最多一个成功。
- Async validation race test 验证 stale result 不可产生 `validated`。
- Freeze test 验证 `needs-review` 后 Agent edit/reopen 被拒绝。
- Terminal immutability test 覆盖所有终态。

## Consequences

### Positive

- Validation、Diff 和审阅可绑定确定草稿。
- 重试、rebase 和多客户端编辑不会静默覆盖。

### Costs and constraints

- 状态转换也需要版本管理和审计。
- 调用方必须在冲突后重新读取 Proposal。

## Alternatives considered

- **单一 draft/review/done 状态**：拒绝，因为无法表达异步 validation 和 conflict。
- **last-write-wins**：拒绝，因为会使用户审阅的 Diff 失效。
- **`validating → needs-review` 快捷转换**：拒绝，因为丢失可验证的 validated checkpoint。

## Deferred decisions and blockers

Proposal retention 时限、过期阈值和产品 UI 文案由 policy 决定；它们不得改变状态机或终态不可变性。
