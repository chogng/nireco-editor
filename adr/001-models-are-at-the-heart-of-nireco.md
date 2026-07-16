# ADR-001: Models Are at the Heart of Nireco

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core
- Gate: Gate 0
- Related specifications: Development Spec §§2, 4, 6, 16
- Supersedes: None
- Superseded by: None

## Context

Editor、DOM、文件、数据库记录和 Agent Task 都能暂时承载文稿状态，但它们的生命周期、寻址方式和一致性边界不同。若任一对象成为隐式事实来源，Revision、异步读取、Proposal 审阅和恢复都会出现无法验证的分叉。

## Decision

Nireco 的核心对象是 URI-addressed、revisioned semantic document `Model`：

```text
Nireco Core
= Resource URI
+ Revision
+ Semantic Position
+ Transaction
```

`Model` 是文档语义状态的运行时入口；Canonical Snapshot 是某一 Revision 的不可变状态。Editor 只是连接 Model 的 View，不拥有文档事实。

## Normative rules

- 每个在线文档操作 MUST 以 canonical `ResourceUri` 寻址 Model。
- 每个跨时间、异步、持久化、跨进程或 Agent 操作 MUST 显式携带 `RevisionId` 或 `baseRevisionId`。
- 文档中的位置 MUST 使用绑定 Revision 的 Semantic Position；DOM Range、全局字符 offset 和当前 Selection MUST NOT 成为持久地址。
- 已提交的状态变化 MUST 只通过 validated `Transaction` 发生。
- Selection、composition buffer、scroll position 和 ViewState MUST 留在具体 Editor View。
- Editor 创建、销毁或切换 MUST NOT 隐式创建、提交、删除或销毁持久文档。
- Model/Core MUST NOT 依赖 DOM、React、Agent SDK、网络状态或当前活动 Editor。
- Snapshot、Transaction、Revision、Proposal 和派生结果 MUST 能追溯到同一 URI/Revision 语境。

## Contract and implementation impact

公共 Contract 必须使用 `ResourceUri`、`DocumentRef`、`MutableDocumentTarget` 和 revision-bound result；不得公开裸 `documentId + offset`。Editor API 必须通过 `getModel`/`setModel` 连接 Model，不能持有独立文档副本作为事实来源。

## Verification

- Architecture test 禁止 Core 导入 DOM、Editor 和 Agent 层。
- Contract/schema test 禁止跨仓请求只携带裸文档 ID 或裸 offset。
- Lifecycle test 验证 `editor.dispose()` 不卸载或删除 Model。
- Revision-consistency test 验证异步结果不能混用不同 Revision。

## Consequences

### Positive

- 所有 View、人类输入和 Agent Proposal 共享同一套可审计语义。
- 无头服务、浏览器 Editor 和测试 Mock 可以消费同一核心 Contract。

### Costs and constraints

- 调用方必须显式管理 URI、Revision 和映射，不可依赖“当前文档”便利状态。
- View 恢复信息需要独立历史元数据。

## Alternatives considered

- **Editor/DOM 为核心**：拒绝，因为无法稳定支持无头服务、恢复和多 View。
- **文件或数据库记录为核心**：拒绝，因为物理位置不等于逻辑身份，且不能表达内存 Revision。
- **Agent Task 为核心**：拒绝，因为 Agent 生命周期不能拥有用户文档。

## Deferred decisions and blockers

具体 Authority 部署位置、Storage Adapter 和公共 SDK 不由本 ADR 决定，但后续设计不得绕过上述 Model 不变量。
