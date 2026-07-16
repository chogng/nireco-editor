# ADR-009: Semantic Diff and Partial Acceptance

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Proposal
- Gate: Gate 0
- Related specifications: Development Spec §15
- Supersedes: None
- Superseded by: None

## Context

纯字符 Diff 不能可靠表达结构移动、Citation、Evidence 和 Claim relation，也不能决定哪些修改必须一起接受。若 UI 自行分组底层 Operation，审阅结果无法稳定重放或评估。

## Decision

Semantic Diff 是绑定 Document Revision 与 Proposal Revision 的正式核心数据模型。`ProposalChangeGroup` 是唯一部分接受单位；Character Diff 只是按需显示的派生视图。

## Normative rules

- Semantic Diff MUST 包含 document/base identity、Proposal ID、Proposal Revision、generation Revision、ordered groups、summary 和 diagnostics。
- 相同 canonical Snapshot、Proposal Revision、schema/algorithm version MUST 生成相同 group structure、dependency graph 和 semantic content。
- Group kind 至少覆盖 content insert/rewrite/delete、structure move、citation add/replace、evidence/claim relation 和 metadata。
- 同段连续纯文本 change 默认合并为 rewrite group。
- Structure move MUST 表达为 move，不能退化为 delete+insert。
- Citation、Evidence 和 Claim changes MUST 显式呈现；依赖关系用 `dependsOn` 表达。
- Dependency graph MUST 是可验证 DAG；cycle 或 missing dependency 必须使 Diff 无效。
- 同一 Proposal Revision 的重复读取 MUST 返回相同 Group ID。
- Proposal 内容变化 MUST 产生新 Proposal Revision 和新 Group IDs；Rebase MUST 提供 old-to-new `supersedes` mapping。
- Group ID MUST 由可信 Nireco service 生成，MUST NOT 由 Agent 或 UI 顺序决定。
- 只允许 `needs-review` Proposal 执行 acceptance。
- Review Service MUST 校验 expected Proposal Revision、expected head Revision、Diff binding 和所有 group。
- 部分接受 MUST 计算 transitive dependency closure，并在提交前向用户呈现 effective accepted set。
- effective set MUST 编译为一个原子 mainline Transaction；任何 Schema/Academic invariant 失败都不得部分 commit。
- 审计 MUST 同时记录 requested groups、effective closure、未接受摘要、Actor、Transaction 和 resulting Revision。
- Agent MUST NOT 调用 accept/reject/commit API。

## Contract and implementation impact

Semantic Diff/ProposalChangeGroup 必须有版本化 Schema 与 algorithm version。Review request 使用 branded Group IDs 和 expected head。接受结果必须能从 Revision 追溯到 Proposal、Diff、group closure 和用户决定。

## Verification

- Golden fixtures 验证相同输入的 deterministic grouping。
- Property tests 验证 dependency closure、DAG 和 subset invariant。
- Negative tests 拒绝 stale Proposal/head、unknown group、cycle 和 invariant-breaking subset。
- Atomicity test 验证多个 accepted groups 只产生一个 Transaction/Revision。
- No-bypass test 验证 Agent capability 不包含 acceptance。

## Consequences

### Positive

- 用户可以审阅结构化学术变化而不是不稳定字符片段。
- 部分接受、评估和 provenance 共享同一事实模型。

### Costs and constraints

- Diff generator 必须理解 Schema 和 Academic graph。
- Grouping algorithm 变化是 Contract/fixture 变化，不能视为纯 UI 优化。

## Alternatives considered

- **Character Diff 作为事实来源**：拒绝，因为不能表达结构和依赖。
- **Operation 逐条接受**：拒绝，因为底层粒度会破坏语义不变量。
- **UI 临时分组**：拒绝，因为不可重放且跨客户端漂移。

## Deferred decisions and blockers

- **G0-B003 — Change Group identity**：`ProposalChangeGroupId` 的 exact derivation/persistence、`operationIds` 的身份来源、canonical group ordering，以及 `supersedes` mapping 的生成语义尚未完全冻结。必须在 Contract 中选择 deterministic derived ID 或持久分配方案，并以 golden fixtures 证明 same-input stability 后，Gate 0 才能关闭。
- 高级重构的最小可接受粒度可在保持上述依赖与原子性规则下后续收敛。
