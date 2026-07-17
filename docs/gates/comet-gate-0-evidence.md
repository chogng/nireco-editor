# Comet Gate 0 Local Integration Evidence

- Assessment date: 2026-07-16
- Evidence scope: real Comet repository, independent local worktree
- Worktree: `/private/tmp/comet-nireco-gate0`
- Branch: `codex/nireco-gate0-contract`
- Base commit: `17c86ada`
- Contract version: `0.4-preview.1`
- Packed runtime version: `0.4.0-preview.1`
- Engineering standard version: `0.1.1`
- Result: **Local reproducible implementation complete; remote CI and formal signoff pending**

## Claim boundary

本页记录真实 Comet 仓的本地 Gate 0 integration evidence，用于补足
[Gate 0 Report](./gate-0-report.md) 中真实 consumer-side implementation 的技术证据。
实现位于独立 worktree 和上述 branch；原 `/Users/lance/Desktop/comet` 的 `main`
工作区保持 clean。

这些结果不声称变更已经 commit、push 或进入远程 CI，也不代表 Gate Owner 已经审阅
或签署。它们只证明当前独立 worktree 可以从固定 base 和固定 Nireco artifact
本地复现 Contract Loader、Adapter、Trusted Task/Tool boundary 与 canonical
Agent Host flow。

## Contract supply chain

Comet worktree 包含以下固定输入与 fail-closed controls：

- `contracts/nireco/contract-lock.json` 固定 54-file Contract snapshot、
  `0.4-preview.1` manifest digest、tree digest 和 Engineering Standard `0.1.1`；
- `contracts/nireco/0.4-preview.1` 保存完整 Contract Bundle snapshot；
- `contracts/nireco/artifacts/comet-internal-nireco-editor-0.4.0-preview.1.tgz`
  保存固定 packed runtime，lock 同时固定 SHA-256、integrity 和 required exports；
- `package.json`/`package-lock.json` 从上述本地 tar artifact 安装
  `@comet-internal/nireco-editor`，并固定 Ajv `8.20.0`；
- `scripts/verify/nireco-contract-check.ts` 在运行 dependency lifecycle scripts
  之前校验 snapshot、manifest、tree、tar、integrity、package exports、dependency
  lock 和禁止的 package lifecycle scripts；
- CI/release workflow 使用
  `npm ci --ignore-scripts → node scripts/verify/nireco-contract-check.ts → npm rebuild`
  顺序，避免未校验 artifact 在安装阶段先执行 lifecycle code。

本地 clean dependency reproduction、contract checker、rebuild、full verify 和 build
均已成功；远程 workflow 尚未在本证据中执行。

## Runtime integration

真实 Comet worktree 的实现表面如下。以下均为跨仓 code path，仅作文本记录：

| Surface              | Comet code path                                                                           | Gate 0 behavior                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract types/ports | `src/cs/platform/nireco/common/nirecoAdapter.ts`, `nirecoTasks.ts`, `nirecoAgentTools.ts` | 固定 Contract 版本、trusted task/session envelope 和仅两个 Gate 0 tools                                                                          |
| Contract loader      | `src/cs/platform/nireco/node/nirecoContractLoader.ts`                                     | 校验固定 manifest/schema bytes，使用 strict Ajv；复用 packed runtime 的 canonical Resource URI 判定并执行真实 UTC calendar validation            |
| Contract adapter     | `src/cs/platform/nireco/node/nirecoContractAdapter.ts`                                    | 只通过 injected public service port 执行 handshake、open/read/create/stage；验证 request/result、固定 Revision、Proposal revision 和 idempotency |
| Trusted task binding | `src/cs/platform/nireco/node/nirecoTaskBindings.ts`                                       | 只接受 exact accepted Turn 的 trusted task/session；拒绝 model-controlled trusted IDs、Revision drift 和超额绑定                                 |
| Tool contribution    | `src/cs/platform/nireco/node/nirecoAgentToolContribution.ts`                              | 只注册 `comet.document.inspect` 与 `comet.manuscript.propose-insert`                                                                             |
| Tool executor        | `src/cs/platform/nireco/node/nirecoAgentToolExecutor.ts`                                  | 将 trusted envelope 映射到固定 Revision read 或 Draft Proposal Semantic Edit，不暴露 commit、accept 或 raw Transaction                           |

Adapter、executor 和 task binding 的 session、proposal、idempotency、uncertain
mutation 与 accepted Turn 状态均有显式容量上限。正常完成或成功 reconcile 的
transient state 会退休；持续返回 unknown 的 mutation 会保留到 owning Turn
durably retired，再由 Host 精确调用原 endpoint 的 `release(call)` 清理。共享
Nireco session 按 exact context 引用计数，最后一个 trusted Turn 释放时幂等清理
该 session 的 Proposal 和 idempotency correlation。mutation 在服务已提交但
response 丢失时，由 Agent Host reconciliation 复用同一 operation identity 和
idempotency keys 对账，不把不确定结果错误缓存为不可恢复 terminal failure。

## Canonical Agent Host evidence

`src/cs/platform/nireco/test/node/nirecoGate0Integration.test.ts` 使用真实 packed
Nireco runtime 和 `MockCometIntegrationService`，经过 Comet canonical：

```text
AgentToolRegistry
→ AgentToolEndpointRegistry
→ AgentToolSetPreparationService
→ AgentToolCallAuthority
→ AgentToolExecutionService
→ NirecoContractAdapter
→ packed Nireco public service
```

测试中的 deterministic Fake Task Orchestrator、Model 和 Provider 只选择两个注册
tools。trusted `RequiredDocumentRef`、Nireco session、task/policy/workflow identity
由 accepted Turn binding 注入，不来自 model input。读取结果、Proposal base 和
staged edit 始终绑定同一固定 Revision。

版本化 trace 位于
`src/cs/platform/nireco/test/node/fixtures/gate0-agent-host-trace.json`，记录：

- packed runtime 仅通过公开 exports 使用，不导入 Nireco private source；
- exact accepted Turn、tool set、trusted task/session 和 fixed document Revision；
- read call 与 Proposal insert mutation 的 canonical Agent Host effect；
- create/stage 使用同一 host operation 派生的 idempotency keys；
- committed stage response-loss 后以同一 operation 成功 reconcile；
- 仅两个 registered tools，`rawTransaction=false`、`reviewCommit=false`，不存在
  commit/accept surface。

## Review closure

| Review finding                                                                        | Closure                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WHATWG URL normalization 可能接受 dot segment 或 percent-encoding 的非 canonical 前像 | Loader 直接使用 packed runtime 公开 canonical URI primitive；negative tests 覆盖 `/a/../b` 和 `%41`                                                              |
| `Date.parse` 可能接受不存在的 UTC 日历日期                                            | Loader 使用严格 RFC3339 UTC shape 和真实年月日/闰年 calendar comparison；negative tests 覆盖 `2026-02-30T00:00:00Z`                                              |
| mutation response-loss 被当作 terminal failure                                        | Host reconciliation 保留并复用同一 operation/idempotency identity，E2E 注入 committed-response-loss 并恢复结果                                                   |
| Adapter/executor/task state 可能长期无界                                              | 所有相关 maps 均配置显式正整数容量；正常完成、成功 reconciliation 或 owning Turn durable release 会精确退休状态；共享 session 在最后一个 trusted Turn 释放后回收 |
| 未校验 tar 可能在 install lifecycle 先执行                                            | 安装顺序改为 `--ignore-scripts`、直接 checker、再 `npm rebuild`；checker拒绝自动 lifecycle scripts                                                               |
| Electron 43 unit runtime 入口可能因 ESM ready 顺序或 CLI argv shape 卡死              | Electron test entry 修复 ready sequencing 和 renderer URL argv compatibility，full verify 的 Electron 1/1 通过                                                   |

## Local verification result

在上述独立 worktree 上完成的最终本地验证：

| Command / suite           | Result                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run verify`          | Pass：valid layers、54-file Nireco contract/package check、i18n、typecheck、Node `1314/1314`、3 browser test sources、Electron `1/1` |
| `npm run build`           | Pass                                                                                                                                 |
| Focused Nireco Node tests | `24/24` pass                                                                                                                         |

## Gate interpretation

这组证据把 [Gate 0 Risk Register](../risks/gate-0-risk-register.md) 中
`R-G0-015` 从 `Blocker` 降为 `Mitigated`，并使
[Gate 0 Bootstrap Plan](../plans/gate-0-bootstrap-plan.md) 的 `G0-L` 达到
“local reproducible implementation complete”。

它不替代 [Reference Profile](../performance/reference-profile.md) 中按能力激活的
后续 calibration。`G0-B005` 关闭 S/M/L 规模、identity 和 staged claim policy
漂移；Gate 1 Transaction/Read、Gate 2 Proposal 与 N5 Editor 的 raw measurements、
correctness summary 和 result artifact 在各自能力激活前保持
`Pending by design`，不是 Gate 0 latency pass，也不是 Gate 0 技术 blocker。
Gate 0 仍必须取得远程 CI 结果、具名 Gate Owner 复验和正式 signoff，才能作出
`Exit`、`Conditional Exit` 或 `Hold` 决定。
