# ADR-019: Contract Bundle and Independent Comet Consumer Conformance

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Contract DRI and Comet Contract DRI
- Gate: Gate 0
- Related specifications: Development Spec §§20–21, 29; Roadmap §§5, 14
- Supersedes: None
- Superseded by: None

## Context

Nireco 与 Comet 分仓并行开发。只在 Nireco 仓内测试 `src/**` 类型或 Mock
实现，不能证明 Comet 能仅凭已发布 Contract Bundle 和 package entrypoint
完成集成，也不能发现私有路径被意外当成跨仓 API 的问题。

Gate 0 因此需要一个具备独立消费者约束的可执行 harness：它使用与 Comet
仓相同的可见面，执行最小只读与 Proposal 写入闭环，并产生可机器复验的
evidence report。

## Decision

Contract Bundle 是 Comet 适配器实现的唯一 Nireco 协议来源。Nireco 仓维护
一个独立 Comet consumer harness，模拟 clean consumer。它的 Nireco 输入只允许
读取：

- package 根公开导出；
- `@comet-internal/nireco-editor/comet-internal` Mock entrypoint；
- `@comet-internal/nireco-editor/contract-types/integration` generated declaration entrypoint；
- Contract Manifest、JSON Schemas、generated declarations 和 fixtures。

Harness MUST NOT import `src/**`、`dist/**` 内部路径或 Kernel 私有对象。
Node 标准库和用于编译 JSON Schema 的通用验证库不属于 Nireco API，可作为
consumer-side tooling 使用。

## Normative rules

- Consumer MUST 从 package exports 解析 Nireco runtime 和 Mock；不得使用相对
  `src`/`dist` 路径。
- Generated declaration consumer MUST 独立 typecheck，并至少覆盖 handshake、
  session、snapshot、proposal create 和 semantic edit staging messages。
- Runtime consumer MUST 用 Bundle Schema 验证 request/result，并执行：
  handshake、task-bound session、fixed-Revision snapshot read、draft Proposal
  create 和 Semantic Edit stage。
- Snapshot result 的 `revisionId` MUST 等于 Session 固定的 `DocumentRef`；
  consumer 不得依赖活动 Editor 或隐式 head。
- Agent surface MUST NOT 暴露 raw Transaction、review acceptance、storage write
  或 mainline commit；harness 必须同时检查公开 prototype、handshake feature
  flags 和 manifest safety declarations。
- Evidence report MUST 是确定性的提交文件，并由 harness 的实际结果逐字段比较；
  手改 Pass 结论而没有相同行为必须使检查失败。
- Contract、Mock operation、package export 或 generated type 变化 MUST 运行
  `pnpm contract:consumer`。

## Contract and implementation impact

Contract wire schema不变。Manifest 新增 performance 与 independent consumer
evidence 索引；package CI 增加 consumer 和 performance-profile 检查。Comet
仓可以复制该 harness 的 consumer-side逻辑，但不得复制 Nireco 私有类型。

## Verification

- `pnpm contract:consumer` 从已构建 package exports 运行 independent consumer。
- 同一命令将 package 打成 tarball，在隔离临时目录离线安装 tarball，并只把
  consumer-side Ajv tooling 显式挂入该临时 consumer；随后从安装产物执行相同
  harness，source checkout 解析不得通过。
- Consumer typecheck 只引用 public package declarations；generated declarations 通过
  `@comet-internal/nireco-editor/contract-types/integration` 的 type-only export 解析。
- Node test 对实际 harness report 与提交的 `evidence-report.json` 做深比较。
- Source-boundary check 扫描 consumer 文件，拒绝 `src/`、`dist/` 或其他私有
  import。
- `pnpm contract:check` 同时执行 generated drift、Nireco conformance 和
  independent consumer conformance。

## Consequences

### Positive

- Nireco 仓能够在 Comet 合并前发现 package export、Schema、Mock 和 generated
  declarations 的跨仓断裂。
- Gate evidence 不再只依赖同仓内部测试。
- Proposal-only/no-commit 边界由真实消费者路径持续验证。

### Costs and constraints

- Consumer 检查需要先构建 package，因此比纯 unit test 更慢。
- Harness 只能证明 Gate 0 的最小契约闭环；后续服务仍需扩展 cross-repo matrix。

## Alternatives considered

- **只运行 Nireco 内部 conformance tests**：拒绝，因为它们可以无意中依赖
  `src/**` 私有路径。
- **提交静态 evidence 文档但不执行**：拒绝，因为结论会随 Contract 漂移。
- **等待真实 Comet 仓完成后再验证**：拒绝，因为这会重新串行化两个仓库。

## Deferred decisions and blockers

- Gate 1 前仍需在真实 Comet 仓启用 current/previous Contract compatibility
  matrix；本 ADR 的 harness 是 Gate 0 独立消费者证据，不替代真实双仓 CI。
- Transport-level Worker/IPC conformance 在相应 transport implementation 存在后
  加入，不属于 Gate 0 in-process Mock 的关闭条件。

## Change policy

本 ADR 的 consumer 可见面或 no-bypass 语义只能通过 superseding ADR 或明确
amendment 改变。增加新 Contract operation 时必须同步 harness 与 evidence。
