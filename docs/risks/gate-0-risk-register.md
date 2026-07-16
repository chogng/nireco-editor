# Gate 0 Risk Register

- Review date: 2026-07-16
- Owner: Gate 0 DRI
- Status values: `Blocker`, `Open`, `Mitigated`, `Accepted`
- Review cadence: 每周；任何 trigger 命中后立即更新

风险关闭必须引用 ADR、Contract/Schema、test/fixture 或 run artifact。只有文字承诺不能把状态改为 `Mitigated`。

| ID       | Risk                                                                                     | Likelihood |   Impact | Trigger                                                              | Required mitigation / evidence                                                                 | Required owner role   | Status    |
| -------- | ---------------------------------------------------------------------------------------- | ---------: | -------: | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- | --------- |
| R-G0-001 | Hash 前像和 domain separation 不明确，跨 runtime 得到不同 Document/Transaction/Node hash |       High | Critical | 任一同输入 hash drift，或字段包含范围无法回答                        | 关闭 `G0-B001`；Accepted hash ADR；byte-level golden vectors；Browser/Node conformance         | Core/Contract DRI     | Blocker   |
| R-G0-002 | 内存 commit 后 WAL 失败语义不明确，调用方误认为已可靠保存                                |       High | Critical | fsync/append fault 后 API、head 或 retry 行为不一致                  | 关闭 `G0-B002`；durability state/error Contract；crash injection；recovery fixtures            | Storage/Authority DRI | Blocker   |
| R-G0-003 | Change Group/Operation identity 不稳定，Diff refresh 或 rebase 指向错误 group            |       High |     High | 同一 Proposal Revision 多次生成不同 ID，或 `operationIds` 无事实来源 | 关闭 `G0-B003`；ID/order/supersedes Schema；same-input golden fixtures                         | Proposal/Contract DRI | Blocker   |
| R-G0-004 | Trusted ID 只定义为 opaque string，碰撞、排序或跨仓生成规则漂移                          |     Medium |     High | 两仓采用不兼容 UUID/Base32/prefix 规则                               | 关闭 `G0-B004`；ID ADR；allocator conformance；collision/format vectors                        | Core/Contract DRI     | Blocker   |
| R-G0-005 | 双 Authority 写入造成线性 Revision 分叉                                                  |     Medium | Critical | 两个 owner 同时接受同 URI base 的写入                                | ADR-003 write path；exclusive ownership proof；handoff/restart test；fail closed               | Authority DRI         | Open      |
| R-G0-006 | URI alias/collision 产生重复 Model 或权限绕过                                            |     Medium | Critical | case、port、percent、dot segment 输入命中不同 key                    | ADR-002 vectors；idempotence property test；Registry/Authority alias test                      | URI/Core DRI          | Mitigated |
| R-G0-007 | UTF-16、grapheme 和 UTF-8 byte 混用导致错误删除或 Anchor                                 |     Medium | Critical | surrogate/ZWJ fixture round-trip 失败                                | ADR-004；Unicode vectors；Rust conversion conformance；invalid-boundary rejection              | Position DRI          | Mitigated |
| R-G0-008 | Hidden normalization 或多正文表示改变 Snapshot 而不产生 Transaction                      |     Medium | Critical | parse/render/reload 后 hash 或 node identity 漂移                    | ADR-005；single schema shape；split/merge/PositionMap property tests                           | Schema/Kernel DRI     | Mitigated |
| R-G0-009 | Transaction 中途失败留下 partial tree/graph/head/event                                   |     Medium | Critical | fault injection 任一点后 state 变化                                  | ADR-006；immutable draft；atomic fault matrix；inverse/replay tests                            | Kernel DRI            | Open      |
| R-G0-010 | Stale async validation 把旧 Proposal 标成 validated/needs-review                         |       High |     High | edit/rebase 之后旧 validation result 成功应用                        | ADR-008；captured Proposal/Base Revision；race tests；typed mismatch                           | Proposal DRI          | Mitigated |
| R-G0-011 | Semantic Diff grouping 不确定，部分接受破坏 Schema/Academic invariant                    |       High | Critical | dependency cycle、same-input drift、subset commit failure            | ADR-009；DAG/closure tests；atomic acceptance；golden fixtures                                 | Proposal DRI          | Open      |
| R-G0-012 | Development Spec、Roadmap、Contract 和机器配置漂移                                       |       High |     High | 同一术语/规模/字段出现两个规范值                                     | ADR-022；关闭 `G0-B005`；version/checksum/drift CI                                             | Governance DRI        | Blocker   |
| R-G0-013 | 参考性能结果无法复现或混合不同设备版本                                                   |     Medium |   Medium | benchmark 缺 profile/fixture/commit/raw data                         | 使用 `docs/performance/reference-profile.md`；immutable profile ID；result artifact validation | Performance DRI       | Mitigated |
| R-G0-014 | 中文 IME、Safari Selection 或 Paste 无法稳定映射到 Transaction                           |       High | Critical | Spike 出现不可恢复 DOM divergence 或 P0 corruption                   | 隔离 Spike；缩小 V1 schema/browser scope；controlled fallback；禁止 DOM 成为事实来源           | Browser Runtime DRI   | Open      |
| R-G0-015 | Mock 与真实 Nireco Contract 漂移，Comet 读取不同 Revision 或绕过 Proposal                |       High | Critical | Golden Trace 不一致或 Agent 获得 commit/raw transaction capability   | Versioned Bundle；generated drift check；no-bypass tests；cross-repo conformance               | Integration DRI       | Open      |
| R-G0-016 | 引入现成 editor kernel 或不兼容依赖破坏 clean-room                                       |        Low | Critical | dependency/SBOM 或 code-similarity review 命中                       | dependency allowlist；SBOM/license scan；ADR；clean-room review                                | Security/Legal DRI    | Open      |

## Escalation rules

- `Critical` risk trigger 命中后，相关 capability 合并立即停止，直到 Owner 提供 fail-closed mitigation。
- 任一 `Blocker` 未关闭时，Gate 0 状态必须保持 `Blocked`。
- `Mitigated` 只表示已有决策；缺少自动化证据时仍可在 Gate Report 作为 evidence blocker。
- 风险接受只允许非数据完整性风险，并必须由 Gate Owner 记录期限和补偿控制；数据损坏、双写、Agent bypass 和 hash drift 不可接受。
