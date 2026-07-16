# Gate 0 Bootstrap Execution Plan

- Plan date: 2026-07-16
- Normative specification: `NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md` v0.4.2
- Roadmap: `NIRECO_COMET_ROADMAP.md` v0.1.1
- Engineering standard: `NIRECO_COMET_ENGINEERING_CODING_STANDARD.md` v0.1.1
- Selected phase: Pre-S00 bootstrap for Phase 0 / Gate 0

## Scope decision

仓库开始时只有三份规范文档，没有工程配置或实现。当前日期早于 Roadmap 的
S00 起始日，因此第一批工作选择 Gate 0 的可执行基础和最小纵向切片，而不是提前
实现 Web Editor、DOM 输入、Transaction Kernel、持久化或桌面壳。

本计划的完成目标是：

1. 将唯一工程规范变成机器可执行门禁；
2. 固定 Gate 0 vocabulary 和版本化 Contract Preview；
3. 提供 URI、Revision-bound reference、Model Registry 和 Proposal-only Agent
   路径的无 DOM 骨架；
4. 让 Mock 能按合同完成 handshake、固定 Revision 读取、创建 Draft Proposal
   和 staging high-level Semantic Edit；
5. 用 Schema、generated declarations、golden fixtures、sample traces、unit、
   property 和 conformance tests 证明这一切可从 clean checkout 重现；
6. 对规范自身尚未冻结的事项保持 fail-closed，并明确记录为 Gate blocker。

## Execution slices

| Slice | Deliverable                                                                                                            | Verification                                           | Status   |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- |
| G0-A  | pnpm/TypeScript/ESLint/Prettier/Vitest、分层 tsconfig、CI、PR/ADR 模板                                                 | format, lint, typecheck, architecture, build           | Complete |
| G0-B  | ADR-001–009、ADR-022、Gate report、risk register、reference profile                                                    | document version/configuration drift check             | Complete |
| G0-C  | Resource URI、opaque IDs、UTF-16 position、canonical JSON、snapshot/operation/transaction/revision/proposal/diff types | unit + property tests                                  | Complete |
| G0-D  | Workspace/Model Registry 接口与 in-memory single-flight registry                                                       | lifecycle, dedupe, isolation, immutability tests       | Complete |
| G0-E  | Contract Bundle `0.4-preview.1`、15 schemas、catalogs、fixtures、traces、generated declarations                        | Ajv strict validation, golden SHA-256, generated drift | Complete |
| G0-F  | Contract-shaped in-memory Comet Mock，且 Agent 无 raw transaction/mainline commit 路径                                 | schema-backed Mock conformance and no-bypass tests     | Complete |
| G0-G  | Hash preimage、durability failure、Change Group/Operation identity、trusted ID 和 performance corpus 冻结              | accepted ADR/amendment + cross-runtime vectors         | Blocked  |
| G0-H  | 中文 IME、Safari Selection、Clipboard isolation spike                                                                  | browser evidence report or approved fallback           | Pending  |

## Fail-closed decisions

- `update-metadata` 保留在 negotiable Semantic Edit vocabulary 中，但在 Operation
  lowering 被规范化前不由 Mock 广告，并返回 `SEMANTIC_EDIT_UNSUPPORTED`。
- Mock 只广告已经实现的 capability；不得用低层操作模拟未实现 capability。
- Scoped session 不返回完整 Snapshot；staged edit 必须满足 session capability、
  document binding、node scope 和 delete/move policy。
- Generated declarations 只由 versioned JSON Schema 生成，CI 拒绝漂移。
- Gate blocker 未关闭时，Gate 0 状态保持 `Blocked`，不能用 opaque placeholder
  或降低门禁来宣称通过。

## Completion command

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:dependencies
pnpm check:licenses
```

Gate 0 的后续实现顺序为：关闭 `G0-B001`–`G0-B005`，完成 Browser Spike，再进入
N1 的 Document Authority、Resource Provider、in-memory Storage 和完整生命周期。
