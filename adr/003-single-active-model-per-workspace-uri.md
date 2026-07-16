# ADR-003: Single Active Model per Workspace URI

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core
- Gate: Gate 0
- Related specifications: Development Spec §§4, 6, 7
- Supersedes: None
- Superseded by: None

## Context

同一 Workspace 内若同一文档存在两个可写 Model 实例，它们会拥有不同的 head、事件队列、缓存和 Undo history。仅靠调用方约定无法避免并发 open/create 的竞态。

## Decision

同一 Workspace 中，每个 canonical `ResourceUri` 最多存在一个 active `INirecoModel`。Model Registry 是该不变量的唯一生命周期协调者。

## Normative rules

- `create`、`resolve`、`get` 和 `unload` MUST 在查找前 canonicalize URI。
- 已有 active Model 时，`create` MUST 返回 `MODEL_URI_ALREADY_EXISTS`，不得返回第二个实例。
- 并发 `resolve` MUST single-flight，并为同一 canonical URI 返回同一 active instance。
- `get` MUST 是无副作用查询；`resolve` MAY 加载；`create` MUST 只用于显式新建。
- `unload`/`model.dispose()` 只从当前 Workspace 移除运行时 Model，MUST NOT 删除持久资源。
- `resource.delete()` 必须是独立、授权并审计的操作。
- 不同 Workspace MAY 加载同一 URI，但不得因此假设内存状态同步或同时获得写权。
- 可写 Model 必须先获得该 URI 的 `DocumentAuthority`；未获得唯一 Authority 时只能 fail closed 为 read-only/closed。

权威写入路径冻结为：

```text
Editor / Command / Review Controller
→ INirecoModel.applyTransaction
→ Workspace DocumentAuthority.apply
→ serialized validation and reducer
→ Revision allocation and in-memory commit
→ durability pipeline
```

Model、Editor、Agent Tool 和 Storage Adapter MUST NOT 绕过 `DocumentAuthority.apply` 直接推进 mainline head。Authority 部署在 Browser、sidecar 或 server 不改变此路径。

## Contract and implementation impact

Registry 必须拥有按 canonical URI 的原子状态或 single-flight map。Model 的可写能力必须与 Authority handle 生命周期绑定；Authority 丢失后不得继续分配 Revision。

## Verification

- 并发 create/resolve stress test 证明同 URI 只有一个 active instance。
- Alias URI test 证明 canonical 等价 URI 不产生第二个 Model。
- Lifecycle test 区分 Editor dispose、Model unload 和 resource delete。
- Architecture/no-bypass test 禁止 Model 外部直接调用 reducer 或 Storage commit。
- Dual-authority test 必须 fail closed。

## Consequences

### Positive

- 每个 Workspace 内的事件、Undo 和派生索引共享唯一 head。
- UI 多 View 不需要复制文档状态。

### Costs and constraints

- Registry 需要处理并发加载、失败清理和 shutdown drain。
- 跨 Workspace/进程写入仍需要 Authority 的排他所有权证明。

## Alternatives considered

- **每个 Editor 一个 Model**：拒绝，因为会造成 head 和 Undo 分叉。
- **允许重复 Model 并靠事件同步**：拒绝，因为这等价于引入未定义的复制协议。
- **全局单例 Registry**：拒绝，因为破坏测试隔离和多租户边界。

## Deferred decisions and blockers

Authority lease/lock、handoff token 和跨进程 owner discovery 的具体协议需要独立 Authority ADR；在该协议完成前，实现只能提供单进程写 Authority 或明确的 read-only 模式。
