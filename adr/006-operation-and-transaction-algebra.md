# ADR-006: Operation and Transaction Algebra

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core
- Gate: Gate 0
- Related specifications: Development Spec §§11–12
- Supersedes: None
- Superseded by: None

## Context

键盘输入、Command、Import、Migration、Validator Fix 和 Proposal Acceptance 若各自拥有写入语义，系统无法统一保证原子性、Undo、PositionMap、Replay 和审计。UI intent 也不适合作为 Kernel reducer 的状态代数。

## Decision

`Operation` 是最小、确定性、可序列化的状态变换；`Transaction` 是针对一个 `baseRevisionId` 原子提交的有序 Operation 集合。Command、Agent Tool 和 Semantic Edit 只能编译为 Transaction，不能成为 Operation union 的 variant。

V1 Operation 代数覆盖：

- node insert/delete/move；
- text replacement；
- node attribute and mark changes；
- academic entity create/update/delete；
- academic relation link/unlink。

## Normative rules

- Operation MUST 明确 discriminator、目标、payload 和必要 precondition。
- Reducer MUST 是同步 pure computation；MUST NOT 读取 DOM、clock、random、network、storage 或当前 Selection。
- 所有新 ID、Actor、time 和可信 metadata MUST 在进入 reducer 前分配或注入。
- Transaction MUST 包含 `TransactionId`、`MutableDocumentTarget`、Actor、ordered operations、preconditions、metadata 和 trusted creation time。
- 同一 Model 的 Transaction MUST 经唯一 Authority 串行执行。
- Authority MUST 按以下顺序处理：parse/schema、base check、preconditions、operation validation、immutable draft apply、canonical normalization、academic validation、PositionMap、inverse payload、document hash、Revision allocation、in-memory commit。
- 上述任一步在 in-memory commit 前失败，MUST 不产生 Snapshot、head、event、WAL 或 partial side effect。
- Canonical normalization MUST 属于可重放的 Transaction apply；后台任务不得静默改变 canonical state。
- 每个成功 Transaction MUST 产生一个 PositionMap 和 inverse operation/payload。
- Reducer 执行期间 MUST NOT 发布可重入事件；listener 发起的新 Transaction 进入下一队列轮次。
- `applyTransaction()` 成功只表示 authority in-memory commit；取消不得撤销已产生的 Revision。
- `validateTransaction()` MUST 无副作用，且其成功不能替代 commit 时重新检查 base/preconditions。
- `ChangeSet` MUST NOT 作为核心协议类型；变化单位名称固定为 Operation、Transaction 和 ProposalChangeGroup。

## Contract and implementation impact

Operation/Transaction Schema 必须是 discriminated、immutable 和可独立验证的。错误必须区分 parse/schema、base mismatch、precondition、operation、normalization 和 academic invariant failure。Agent-facing Contract 只接受高层 Semantic Edit，不公开 Raw Transaction capability。

## Verification

- Unit/property tests 覆盖每个 Operation 的 apply/inverse。
- Fault injection 在原子流程每一步失败并验证 head/hash/event 均未部分更新。
- Replay test 验证相同 Snapshot + Transaction 得到相同 Snapshot、PositionMap 和 inverse。
- Architecture test 禁止 reducer 导入 I/O、DOM、Clock 或 ID allocator。
- Reentrancy test 验证 listener 写入进入下一队列轮次。

## Consequences

### Positive

- 所有写入来源共享同一正确性和审计边界。
- Undo、Rebase 和 Proposal Acceptance 可以建立在同一代数上。

### Costs and constraints

- 高层编辑必须有显式 compiler。
- Operation schema 变化需要同步 inverse、PositionMap、fixtures 和 consumers。

## Alternatives considered

- **Command 直接修改 Model**：拒绝，因为 UI intent 不可稳定 replay。
- **Agent Tool 直接提交 Raw Operation**：拒绝，因为绕过可信语义与权限边界。
- **每个 Operation 单独 commit**：拒绝，因为无法表达跨树/图不变量的原子变化。

## Deferred decisions and blockers

- **G0-B001 — Hash preimages**：`DocumentHash`、`TransactionHash`、node/document precondition hash 的 exact byte preimage、domain separation、字段包含/排除和输出编码尚未冻结。在关闭前不得宣称跨 runtime hash conformance。
- **G0-B003 — Operation identity**：`ProposalChangeGroup.operationIds` 引用了尚未在 Operation Contract 中定义的稳定 `OperationId`。必须决定正式 ID、稳定结构 key 或移除该字段，并提供 Schema/fixture。
