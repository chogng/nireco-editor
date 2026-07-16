# Gate 0 Bootstrap Execution Plan

- Plan date: 2026-07-16
- Normative specification: `NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md` v0.4.3
- Roadmap: `NIRECO_COMET_ROADMAP.md` v0.1.2
- Engineering standard: `NIRECO_COMET_ENGINEERING_CODING_STANDARD.md` v0.1.1
- Selected phase: Pre-S00 bootstrap for Phase 0 / Gate 0
- Execution status: **Local technical implementation complete across Nireco and Comet; Gate 0 blocked on reference-profile calibration and formal governance**

## Scope decision

仓库开始时只有三份规范文档，没有工程配置或实现。当前日期早于 Roadmap 的
S00 起始日，因此第一批工作选择 Gate 0 的可执行基础、最小纵向切片和隔离验证，
不提前冻结完整 Web Editor API、production filesystem layout、transport 或桌面壳。

本计划的完成目标是：

1. 将唯一工程规范变成机器可执行门禁；
2. 固定 Gate 0 vocabulary 和版本化 Contract Preview；
3. 提供 URI、Revision-bound reference、Model Registry 和 Proposal-only Agent
   路径的无 DOM 骨架；
4. 让 Mock 能按合同完成 handshake、固定 Revision 读取、创建 Draft Proposal
   和 staging high-level Semantic Edit；
5. 用 Schema、generated declarations、golden fixtures、sample traces、unit、
   property 和 conformance tests 证明这一切可从 clean checkout 重现；
6. 冻结 exact hash preimage、durability failure、Operation/Change Group identity、
   trusted ID 和 performance corpus；
7. 用 Chrome/WebKit 隔离 Spike 证明 Browser 输入边界及 controlled fallback；
8. 用只依赖 package exports 和 Contract Bundle 的 independent Comet consumer
   预检公开 package boundary，不依赖 Nireco 私有源码；
9. 在真实 Comet 独立 worktree 验证 Contract Loader、Adapter、Task/Tool
   envelope、Mock Trace、canonical Agent Host flow 和同版工程门禁，不能以
   Nireco 仓内 consumer harness 替代；
10. 按 Reference Profile 运行 benchmark calibration 并提交 raw result artifact；
11. 校准完成并取得远程 CI 后，再交给具名 Gate Owner 审阅和签署，不由本地实现
    完成自动退出 Gate。

## Execution slices

| Slice | Deliverable                                                                                                                                                                   | Verification                                                                                                                              | Status                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| G0-A  | pnpm/TypeScript/ESLint/Prettier/Vitest、分层 tsconfig、CI、PR/ADR 模板                                                                                                        | format, lint, typecheck, architecture, build                                                                                              | Complete                                                         |
| G0-B  | ADR-001–012、ADR-017、ADR-019、ADR-022、Gate report、risk register、reference profile                                                                                         | document version/configuration drift check                                                                                                | Complete                                                         |
| G0-C  | Resource URI、UTF-16 position、canonical JSON、snapshot/operation/transaction/revision/proposal/diff types                                                                    | unit + property tests                                                                                                                     | Complete                                                         |
| G0-D  | Workspace/Model Registry 接口与 in-memory single-flight registry                                                                                                              | lifecycle, dedupe, isolation, immutability tests                                                                                          | Complete                                                         |
| G0-E  | Contract Bundle `0.4-preview.1`、15 schemas、catalogs、fixtures、traces、generated declarations                                                                               | Ajv strict validation, golden SHA-256, generated drift                                                                                    | Complete                                                         |
| G0-F  | Contract-shaped in-memory Comet Mock，且 Agent 无 raw transaction/mainline commit 路径                                                                                        | schema-backed Mock conformance and no-bypass tests                                                                                        | Complete                                                         |
| G0-G  | ADR-011/012：exact hash preimage、Operation/Change Group identity、UUIDv7/UUIDv8 trusted ID                                                                                   | 7-domain byte vectors；portable/Node conformance；identity/order properties                                                               | Complete                                                         |
| G0-H  | ADR-010：单文档 Authority、WAL/Snapshot acknowledgment、typed durability failures 和 recovery                                                                                 | fault injection；WAL properties；tail/middle recovery fixtures                                                                            | Complete                                                         |
| G0-I  | Development Spec/Roadmap/manifest/package 的 performance profile 同步，并冻结 device/runtime/budgets/paths/version                                                            | `pnpm check:performance-profile`                                                                                                          | Complete（definition only；not performance pass）                |
| G0-J  | [ADR-017](../../adr/017-typescript-first-browser-runtime.md)：中文 IME、Selection、Clipboard、DOM divergence [isolation spike](../browser/browser-runtime-isolation-spike.md) | [Chrome](../browser/evidence/chrome-150.json) + [WebKit](../browser/evidence/webkit-26.5.json)，均 7/7 pass；evidence drift check         | Complete                                                         |
| G0-K  | [ADR-019](../../adr/019-contract-bundle-and-cross-repo-conformance.md)：package-export independent Comet consumer，固定 Revision read、Proposal-only flow 和 no-bypass        | build + independent typecheck + runtime/schema [consumer evidence](../../contracts/comet-integration/comet-consumer/evidence-report.json) | Complete（Nireco-side proxy）                                    |
| G0-L  | 真实 Comet 仓 Phase 0 deliverables、同版工程门禁、只读 Session、Draft Proposal、canonical Agent Host E2E 和 trace                                                             | [Comet local evidence](../gates/comet-gate-0-evidence.md)：local full verify/build、focused tests、trace conformance                      | Complete（local reproducible implementation；remote CI pending） |
| G0-M  | Reference-profile benchmark calibration、correctness summary、raw measurements 和 result artifact                                                                             | reproducible benchmark artifact matching `nireco-g0-r1-2026-07-16`                                                                        | Blocked（not yet measured）                                      |
| G0-N  | Gate Owner 复验、风险审阅和正式 Gate 决策                                                                                                                                     | 双仓 clean checkout、remote CI result + recorded governance decision                                                                      | Waiting on G0-M and formal signoff                               |

## Closed technical blockers

| Blocker | Closure                                                                                                                                                                                                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0-B001 | [ADR-011](../../adr/011-canonical-json-and-sha-256-hashing.md)、[7-domain byte vectors](../../contracts/comet-integration/fixtures/hash-preimages.json)、[portable/Node conformance](../../tests/conformance/hash-runtime.conformance.ts)                                                                                         |
| G0-B002 | [ADR-010](../../adr/010-single-document-authority.md)、[Authority fault tests](../../tests/unit/durability-authority.test.ts)、[WAL properties](../../tests/property/durability-wal.property.test.ts)、[recovery conformance](../../tests/conformance/recovery-durability.conformance.ts)                                         |
| G0-B003 | [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md)、[Change Group identity/order/supersedes tests](../../tests/unit/hash-change-group-identity.test.ts)、production UUID-profile [Semantic Diff fixture](../../contracts/comet-integration/fixtures/minimal-semantic-diff.json)                                           |
| G0-B004 | [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md)、[UUID allocator/parser property tests](../../tests/property/id-conformance.property.test.ts)、[common Schema](../../contracts/comet-integration/schemas/common.schema.json) 和 [manifest](../../contracts/comet-integration/contract.manifest.json) identity profiles |
| G0-B005 | [closure evidence](../performance/g0-b005-closure-evidence.md)、[reference profile](../performance/reference-profile.md)、Development Spec `0.4.3`、Roadmap `0.1.2` 和 automated drift check。只关闭规模定义漂移；实际 performance calibration 仍属于 G0-M                                                                        |

## Fail-closed controls retained

- `update-metadata` 保留在 negotiable Semantic Edit vocabulary 中，但在 Operation
  lowering 被规范化前不由 Mock 广告，并返回 `SEMANTIC_EDIT_UNSUPPORTED`。
- Mock 只广告已经实现的 capability；不得用低层操作模拟未实现 capability。
- Scoped session 不返回完整 Snapshot；staged edit 必须满足 session capability、
  document binding、node scope 和 delete/move policy。
- Generated declarations 只由 versioned JSON Schema 生成，CI 拒绝漂移。
- `apply()` 与 durability acknowledgment 分离；append/fsync/fence 失败不得伪装
  rollback，必须保留 memory head、拒绝 waiter 并进入 read-only。
- DOM、Composition buffer、Selection 和 Clipboard 都不是文档事实来源；无法验证的
  Browser mutation 必须重绘或进入只读保护。
- Independent Comet consumer 只能使用 package exports、manifest、Schema、
  generated declarations 和 fixtures；source-boundary check 拒绝 `src/**`、
  `dist/**` 私有路径。
- Nireco-side consumer 只证明 package boundary；真实 Comet
  [local integration evidence](../gates/comet-gate-0-evidence.md) 通过固定
  snapshot/package、strict loader、Adapter、trusted Task/Tool 和 canonical Agent
  Host E2E 独立证明 consumer-side implementation。
- Comet loader 必须使用 packed runtime canonical URI primitive，并对 RFC3339 UTC
  时间执行真实 calendar validation；不得依赖 WHATWG normalization 或宽松
  `Date.parse` 结果。
- Comet mutation response-loss 必须由 Host 以同一 operation/idempotency identity
  reconcile；不得将不确定提交结果缓存为不可恢复 terminal failure。
- Adapter、executor 和 task binding 的 session/proposal/idempotency/Turn state
  必须有显式容量上限；正常完成、成功 reconciliation 或 owning Turn durable
  release 后的 transient state 必须精确退休。
- Comet dependency installation 必须按
  `npm ci --ignore-scripts → direct contract checker → npm rebuild` 执行，防止未校验
  artifact lifecycle scripts 先运行。
- 没有 raw benchmark artifact 不得声称 performance pass 或 calibration complete。
- G0-M、远程 CI 和 Gate Owner signoff 未完成时，整体状态保持 `Blocked`。

## Completion commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:dependencies
pnpm check:licenses
```

`pnpm check` 覆盖 format、lint、architecture、全部 typecheck/test/build、
Contract/generated drift、independent consumer、document versions、performance
profile 和 Browser evidence。

真实 Comet 本地证据使用 `npm run verify`、`npm run build` 和 focused Nireco
tests；结果与 claim boundary 记录在
[Comet Gate 0 local evidence](../gates/comet-gate-0-evidence.md)。这些本地命令
不替代远程 CI。

## Handoff after local technical completion

G0-L 已达到 local reproducible implementation complete。下一步不是直接请求
Gate Owner 退出 Gate，而是完成 G0-M：按冻结 profile 在指定参考机生成 S/M/L
benchmark calibration artifact。之后取得 Comet 远程 CI 结果，由具名 Gate Owner
从双仓 clean checkout 复验并记录 `Exit`、`Conditional Exit` 或 `Hold`。

若退出 Gate 0，则进入 Gate 1/N1 的 production Authority/storage/transport
adapter 和真实 Comet 仓 current/previous Contract compatibility matrix。N5 的
真实 Chrome/Firefox/Safari/Electron、OS IME、移动端与 Accessibility 矩阵仍是
后续 Gate 工作。
