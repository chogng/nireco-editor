# Gate 0 Risk Register

- Review date: 2026-07-16
- Owner: Gate 0 DRI — Gate Owner still unassigned
- Status values: `Blocker`, `Open`, `Mitigated`, `Accepted`
- Nireco technical blockers `G0-B001`–`G0-B005`: **0 open**
- Overall Gate 0 blocker count: **0**
- Current latency claim: No latency suite has passed
- Review cadence: 每周；任何 trigger 命中后立即更新

风险缓解必须引用 ADR、Contract/Schema、test/fixture 或 run artifact。只有文字承诺
不能把状态改为 `Mitigated`。`Mitigated` 表示 Gate 0 所需控制和自动化证据已存在，
不表示该风险在后续 production runtime 中永久消失。Nireco 仓内 proxy 本身不能
替代真实 Comet 仓 artifact；现有真实 Comet 证据是独立本地 worktree 的可复现结果，
不替代远程 CI 或 Gate Owner signoff。Profile definition 也不能替代已激活
suite 的 benchmark run artifact；未激活 suite 必须保持 `Pending by design`。

## Nireco technical blocker closure summary

下列五项关闭的是本轮明确列出的 Nireco-side 技术 blocker。Performance
sequencing 另由 `R-G0-017` 的 staged activation control 管理。

| Blocker | Risk coverage      | Closure evidence                                                                                                                                                                                                                                                                                                              | Status |
| ------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| G0-B001 | R-G0-001           | [ADR-011](../../adr/011-canonical-json-and-sha-256-hashing.md)、[7-domain hash vectors](../../contracts/comet-integration/fixtures/hash-preimages.json)、[portable/Node conformance](../../tests/conformance/hash-runtime.conformance.ts)、[Browser vector evidence](../browser/browser-runtime-isolation-spike.md)           | Closed |
| G0-B002 | R-G0-002           | [ADR-010](../../adr/010-single-document-authority.md)、[Authority fault tests](../../tests/unit/durability-authority.test.ts)、[WAL property tests](../../tests/property/durability-wal.property.test.ts)、[recovery conformance](../../tests/conformance/recovery-durability.conformance.ts)                                 | Closed |
| G0-B003 | R-G0-003, R-G0-011 | [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md)、[same-input identity/order/supersedes tests](../../tests/unit/hash-change-group-identity.test.ts)、production-profile [Semantic Diff fixture](../../contracts/comet-integration/fixtures/minimal-semantic-diff.json)                                              | Closed |
| G0-B004 | R-G0-004           | [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md)、[UUID allocator/parser properties](../../tests/property/id-conformance.property.test.ts)、[common Schema](../../contracts/comet-integration/schemas/common.schema.json) 和 [manifest](../../contracts/comet-integration/contract.manifest.json) identity profiles | Closed |
| G0-B005 | R-G0-012, R-G0-013 | Development Spec `0.4.3`、Roadmap `0.1.2`、[closure evidence](../performance/g0-b005-closure-evidence.md)、[reference profile](../performance/reference-profile.md)、`pnpm check:performance-profile`。关闭 S/M/L 规模定义漂移；不宣称 latency pass，各 suite 在对应能力激活时产生 raw calibration                            | Closed |

## Risk register

| ID       | Risk                                                                                     | Likelihood |   Impact | Trigger                                                                               | Required mitigation / current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                    | Required owner role   | Status    |
| -------- | ---------------------------------------------------------------------------------------- | ---------: | -------: | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| R-G0-001 | Hash 前像和 domain separation 不明确，跨 runtime 得到不同 Document/Transaction/Node hash |       High | Critical | 任一同输入 hash drift，或字段包含范围无法回答                                         | [ADR-011](../../adr/011-canonical-json-and-sha-256-hashing.md) freezes exact bytes/envelopes；[7-domain vectors](../../contracts/comet-integration/fixtures/hash-preimages.json)；[portable/Node conformance](../../tests/conformance/hash-runtime.conformance.ts)；Chrome/WebKit 均匹配 vectors                                                                                                                                                                          | Core/Contract DRI     | Mitigated |
| R-G0-002 | 内存 commit 后 WAL 失败语义不明确，调用方误认为已可靠保存                                |       High | Critical | fsync/append fault 后 API、head 或 retry 行为不一致                                   | [ADR-010](../../adr/010-single-document-authority.md) separates `apply()`/`whenDurable()`；[fault tests](../../tests/unit/durability-authority.test.ts) cover append/fsync/fence/read-only/manifest retry；[WAL properties](../../tests/property/durability-wal.property.test.ts) and [recovery vectors](../../tests/conformance/recovery-durability.conformance.ts)                                                                                                      | Storage/Authority DRI | Mitigated |
| R-G0-003 | Change Group/Operation identity 不稳定，Diff refresh 或 rebase 指向错误 group            |       High |     High | 同一 Proposal Revision 多次生成不同 ID，或 `operationIds` 无事实来源                  | [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md) freezes persisted UUIDv7 Operation ID、derived UUIDv8 Change Group、canonical order 和 stable-target `supersedes`；[five focused tests](../../tests/unit/hash-change-group-identity.test.ts) cover golden vector、target order、revision change、DAG order and rebase mapping                                                                                                                                  | Proposal/Contract DRI | Mitigated |
| R-G0-004 | Trusted ID 只定义为 opaque string，碰撞、排序或跨仓生成规则漂移                          |     Medium |     High | 两仓采用不兼容 UUID/Base32/prefix 规则                                                | [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md) freezes strict RFC 9562 UUIDv7/UUIDv8 profiles；[property tests](../../tests/property/id-conformance.property.test.ts) cover exact byte vector、strict parsing、repeated/rollback clock monotonicity and randomized round-trip；fixtures use production UUID profile                                                                                                                                           | Core/Contract DRI     | Mitigated |
| R-G0-005 | 双 Authority 写入造成线性 Revision 分叉                                                  |     Medium | Critical | 两个 owner 同时接受同 URI base 的写入                                                 | ADR-003 + [ADR-010](../../adr/010-single-document-authority.md) freeze single lease/fencing epoch；reference [Authority tests](../../tests/unit/durability-authority.test.ts) reject second live lease and stale fence。Production exclusive lease backend与 handoff/restart proof仍属于 Gate 1                                                                                                                                                                           | Authority DRI         | Open      |
| R-G0-006 | URI alias/collision 产生重复 Model 或权限绕过                                            |     Medium | Critical | case、port、percent、dot segment 输入命中不同 key                                     | ADR-002 vectors；idempotence property test；Registry/Authority alias test                                                                                                                                                                                                                                                                                                                                                                                                 | URI/Core DRI          | Mitigated |
| R-G0-007 | UTF-16、grapheme 和 UTF-8 byte 混用导致错误删除或 Anchor                                 |     Medium | Critical | surrogate/ZWJ fixture round-trip 失败                                                 | ADR-004；Unicode vectors；invalid-boundary rejection；[Browser Spike](../browser/browser-runtime-isolation-spike.md) verifies UTF-16 offset after emoji and fail-closed surrogate midpoint。Rust conversion conformance remains a later-runtime check                                                                                                                                                                                                                     | Position DRI          | Mitigated |
| R-G0-008 | Hidden normalization 或多正文表示改变 Snapshot 而不产生 Transaction                      |     Medium | Critical | parse/render/reload 后 hash 或 node identity 漂移                                     | ADR-005；single schema shape；split/merge/PositionMap property tests                                                                                                                                                                                                                                                                                                                                                                                                      | Schema/Kernel DRI     | Mitigated |
| R-G0-009 | Transaction 中途失败留下 partial tree/graph/head/event                                   |     Medium | Critical | fault injection 任一点后 state 变化                                                   | ADR-006；immutable draft；atomic fault matrix；inverse/replay tests。Gate 0 Authority reference rejects invalid prepared input without state change；完整 reducer fault matrix仍为后续 Kernel work                                                                                                                                                                                                                                                                        | Kernel DRI            | Open      |
| R-G0-010 | Stale async validation 把旧 Proposal 标成 validated/needs-review                         |       High |     High | edit/rebase 之后旧 validation result 成功应用                                         | ADR-008；captured Proposal/Base Revision；race tests；typed mismatch                                                                                                                                                                                                                                                                                                                                                                                                      | Proposal DRI          | Mitigated |
| R-G0-011 | Semantic Diff grouping 不确定，部分接受破坏 Schema/Academic invariant                    |       High | Critical | dependency cycle、same-input drift、subset commit failure                             | ADR-009 + [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md) now freeze identity、DAG order and deterministic lineage；[focused tests](../../tests/unit/hash-change-group-identity.test.ts) cover those controls。Production atomic partial-acceptance compiler/invariant matrix remains Gate 1 work                                                                                                                                                              | Proposal DRI          | Open      |
| R-G0-012 | Development Spec、Roadmap、Contract 和机器配置漂移                                       |       High |     High | 同一术语/规模/字段出现两个规范值                                                      | ADR-022；[G0-B005 closure](../performance/g0-b005-closure-evidence.md) aligns Spec `0.4.3`/Roadmap `0.1.2` at 15k/75k/200k；document-version、configuration hash and performance-profile checks fail closed                                                                                                                                                                                                                                                               | Governance DRI        | Mitigated |
| R-G0-013 | 参考性能结果无法复现或混合不同设备版本                                                   |     Medium |   Medium | benchmark 缺 profile/fixture/commit/raw data                                          | [Reference Profile](../performance/reference-profile.md) freezes immutable profile ID、hardware、corpus、workload and result schema；machine check protects references。实际 benchmark result artifacts尚未生成，且本次 closure不声称已满足性能预算                                                                                                                                                                                                                       | Performance DRI       | Mitigated |
| R-G0-014 | 中文 IME、Safari Selection 或 Paste 无法稳定映射到 Transaction                           |       High | Critical | Spike 出现不可恢复 DOM divergence 或 P0 corruption                                    | [ADR-017](../../adr/017-typescript-first-browser-runtime.md) + [Spike report](../browser/browser-runtime-isolation-spike.md)；[Chrome](../browser/evidence/chrome-150.json) 和 [WebKit](../browser/evidence/webkit-26.5.json) 均 7/7 pass，覆盖单 Composition Transaction、stale fallback、Selection、paste sanitize、divergence read-only protection                                                                                                                     | Browser Runtime DRI   | Mitigated |
| R-G0-015 | 真实 Comet Gate 0 Adapter/Tool/Task boundary 与 Contract 漂移或暴露 Agent bypass         |       High | Critical | Loader/Adapter/Trusted Envelope/trace/checker 不可复现，或 Tool 暴露 commit/raw path  | [ADR-019](../../adr/019-contract-bundle-and-cross-repo-conformance.md) 的 Nireco consumer evidence，加上 [real Comet local evidence](../gates/comet-gate-0-evidence.md)：branch `codex/nireco-gate0-contract`、base `17c86ada`，固定 54-file snapshot/package、strict loader、trusted Task/Tool、canonical Agent Host E2E、response-loss reconciliation、bounded state 和 durable release retirement，local verify/build/focused tests 全部通过。远程 CI/signoff 尚未记录 | Integration DRI       | Mitigated |
| R-G0-016 | 引入现成 editor kernel 或不兼容依赖破坏 clean-room                                       |        Low | Critical | dependency/SBOM 或 code-similarity review 命中                                        | dependency allowlist；SBOM/license scan；ADR；clean-room review                                                                                                                                                                                                                                                                                                                                                                                                           | Security/Legal DRI    | Open      |
| R-G0-017 | 未按生产能力分阶段激活 calibration，导致未实现 suite 倒置阻塞 Gate 或被虚假标为 Pass     |       High |     High | 未激活 capability 被要求提供结果，或没有 raw artifact 却出现 latency/correctness Pass | [Reference Profile](../performance/reference-profile.md) 冻结 staged activation matrix：Gate 0 corpus/hash/evidence infrastructure 与已实现 correctness baseline；Gate 1 Transaction/Read；Gate 2 Proposal；N5 Editor。`pnpm check:performance-profile` fail closed 验证矩阵、状态和 claim boundary。未来 suite 均为 `Pending by design`；当前没有 latency Pass                                                                                                           | Performance DRI       | Mitigated |

## Open Gate 0 blockers

- None.

`G0-B005` 已关闭的只是 Development Spec、Roadmap 与 Reference Profile
15k/75k/200k 规模值漂移。`R-G0-017` 的 `Mitigated` 状态表示激活顺序与
fail-closed claim control 已存在，不表示实测延迟、吞吐或内存已经通过。Gate 1、
Gate 2 与 N5 suite 在激活时仍必须提交各自 raw measurements、correctness summary
和 result artifact。

## Mitigated cross-repo Gate 0 risk

`R-G0-015` 已由 [Comet Gate 0 local evidence](../gates/comet-gate-0-evidence.md)
降为 `Mitigated`。真实 Comet 独立 worktree 已实现 Contract Loader、
`NirecoAdapter`、`RequiredDocumentRef`/Trusted Tool Envelope、Fake
Orchestrator/Model/Provider、两项 Tool mapping、只读 Session、Draft Proposal、
response-loss reconciliation 和版本化 trace，并通过 local full verify/build。

这项状态只表示 Gate 0 local technical evidence 可复现。变更尚未在本登记中声明为
commit/push，也没有远程 CI 或具名 Gate Owner signoff。真实 Comet 仓
current/previous Contract compatibility matrix 仍是 Gate 1 residual control。

## Residual open risks

以下 `Open` 项不再是 Gate 0 技术 blocker，但 Gate Owner 应在决定中确认其后续归属：

- `R-G0-005`：production Authority lease/handoff/restart proof；
- `R-G0-009`：完整 Transaction reducer fault matrix 与 inverse/replay；
- `R-G0-011`：production atomic partial-acceptance compiler/invariant matrix；
- `R-G0-016`：持续 dependency/SBOM/license/clean-room review；
- Gate 1 Transaction/Read、Gate 2 Proposal 和 N5 Editor calibration：
  `Pending by design`，在各自能力激活时转为对应 Gate 的退出义务。

## Escalation rules

- `Critical` risk trigger 命中后，相关 capability 合并立即停止，直到 Owner 提供
  fail-closed mitigation。
- 任何新证据使 `G0-B001`–`G0-B005` 之一失效，或产生新的 Gate 0 `Blocker`，
  Gate Report 必须保持或回退为 `Blocked`。
- `Mitigated` 只表示已有 Gate 0 决策和自动化证据；production adapter、真实跨仓
  CI 或更广浏览器矩阵仍按其后续 Gate 验证。
- 风险接受只允许非数据完整性风险，并必须由 Gate Owner 记录期限和补偿控制；
  数据损坏、双写、Agent bypass 和 hash drift 不可接受。
- 若 Comet local reproduction 失效、后续远程 CI 暴露 contract/trace/bypass
  回归，或 canonical URI/UTC/reconciliation/bounded-state control 失效，
  `R-G0-015` 必须重新打开为 `Blocker`。
- 若 staged activation matrix 被删除、未激活 suite 被写为 Pass，或已激活 suite
  在没有 raw artifact 时被写为 latency/correctness Pass，`R-G0-017` 必须重新
  打开为 `Blocker`。
- 即使 Gate 0 技术 blocker 为零，仍须取得远程 CI 结果并由具名 Gate Owner 完成
  双仓复验和正式 signoff；这些治理前置未完成时不得宣告 Gate 0 `Exit`。
