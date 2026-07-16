# Gate 0 Report: Core Vocabulary and Contract Preview

- Assessment date: 2026-07-16
- Gate owner: Unassigned — must be named before closure
- Overall status: **Blocked**
- Decision baseline: ADR-001–ADR-009 and ADR-022
- Execution plan: [Gate 0 Bootstrap Plan](../plans/gate-0-bootstrap-plan.md)
- Performance profile: `nireco-g0-r1-2026-07-16`
- Risk register: `docs/risks/gate-0-risk-register.md`

## Executive assessment

Gate 0 的核心 vocabulary、Nireco 工程门禁、Contract Bundle Preview、
generated declarations、Golden Fixtures、sample traces 和 contract-shaped Mock
已形成可执行证据。Accepted ADR 只表示“决定可执行”，上述 bootstrap 证据也不等于
durability、cross-runtime hash、Browser 或跨仓 Gate 证据已完成。

当前不得宣布 Gate 0 通过。阻塞原因包括 hash byte preimage、durability failure
semantics、Change Group/Operation identity、trusted ID scheme、上游规范的
performance profile 漂移、Comet 仓对应证据和 Browser Spike。Mock 目前是 Gate 0
in-memory contract implementation，不是完整生产服务；wire 入口的通用 runtime
Schema validation 仍需在正式 Adapter/transport boundary 落地。

## Accepted decision set

| ADR                                                                                 | Frozen decision                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [ADR-001](../../adr/001-models-are-at-the-heart-of-nireco.md)                       | Model 是 URI-addressed、revisioned semantic document；Editor 是 View      |
| [ADR-002](../../adr/002-resource-uri-canonicalization.md)                           | Resource URI canonicalization 和 logical URI constraints                  |
| [ADR-003](../../adr/003-single-active-model-per-workspace-uri.md)                   | 单 Workspace/URI 单 active Model；Authority-only write path               |
| [ADR-004](../../adr/004-utf-16-semantic-position-model.md)                          | UTF-16 Semantic Position、grapheme editing、revision binding              |
| [ADR-005](../../adr/005-unified-inline-node-representation.md)                      | 唯一 `InlineNode[]` 正文表示                                              |
| [ADR-006](../../adr/006-operation-and-transaction-algebra.md)                       | Deterministic Operation 与 atomic Transaction                             |
| [ADR-007](../../adr/007-linear-mainline-revision-for-v1.md)                         | V1 linear mainline Revision 与 inverse-Transaction Undo                   |
| [ADR-008](../../adr/008-proposal-revision-state-machine.md)                         | Proposal optimistic revision 和显式 `validating → validated`              |
| [ADR-009](../../adr/009-semantic-diff-and-partial-acceptance.md)                    | Semantic Diff、Change Group dependency closure、atomic partial acceptance |
| [ADR-022](../../adr/022-normative-engineering-standard-and-automated-governance.md) | 唯一工程规范和 fail-closed automated governance                           |

## Resolved but implementation-dependent points

以下事项已作出 Gate 0 决定，不再作为开放架构选择：

- **Authority write path**：所有 mainline write 必须走 `INirecoModel.applyTransaction → Workspace DocumentAuthority.apply → serialized reducer/durability`。Browser/sidecar/server 只决定部署，不改变唯一提交入口。
- **URI trailing slash**：只对 `nireco:`/`comet:` logical URI 移除非根尾斜杠；HTTP(S)/file/doi 保留路径语义。
- **Proposal validation checkpoint**：成功路径必须经过独立 `validated` 状态，不允许 `validating → needs-review`。
- **Partial acceptance**：选择集先扩展为 dependency closure，再编译成单一 mainline Transaction；Agent 没有 acceptance capability。

这些决定已有本仓 unit/property/contract conformance 的第一批证据；跨 runtime、
crash、Browser 和 Comet 仓证据仍按下表与 blocker 管理。

## Decision blockers

| ID      | Unfrozen point                                  | Why it blocks Gate 0                                                                                                                                                                                               | Required closure                                                                                            |
| ------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| G0-B001 | Exact hash byte preimages                       | 虽已有 canonical JSON 方向和 `sha256:<hex>` shape，但 Document/Transaction/Node/precondition/governance hash 的 domain tag、字段 envelope、UTF-8 bytes 和 inclusion/exclusion 不完整；无法做跨 runtime golden hash | Accepted hash ADR or ADR amendment；byte-level preimage spec；Browser/Node vectors；更新 Schema/fixtures    |
| G0-B002 | Durability failure and acknowledgment semantics | `memory/wal/snapshot` 名称已固定，但内存 commit 后 append/fsync 失败、retry/read-only transition、`whenDurable` rejection、record/checksum 和 manifest switch 未冻结                                               | Storage/Authority decision；typed errors；crash matrix；WAL/snapshot recovery fixtures                      |
| G0-B003 | Change Group and Operation identity             | `ProposalChangeGroupId` 仍是 opaque allocator output，`operationIds: string[]` 没有正式 Operation identity，canonical order 与 `supersedes` mapping 的生成语义未冻结；无法证明 same-input stable Diff              | 决定 derived vs persisted ID；定义/移除 Operation ID；冻结 ordering/mapping semantics；golden Diff fixtures |
| G0-B004 | Trusted ID scheme                               | 当前 Contract 刻意只冻结 opaque string，开发规格仅“推荐 UUIDv7 或等价”；Gate 0 roadmap 要求 ID 方案冻结                                                                                                            | Accepted ID allocator ADR；格式/version/prefix/entropy 决定；cross-runtime vectors 和 collision tests       |
| G0-B005 | Normative performance corpus drift              | Development Spec 使用约 20k/100k/300k words，Roadmap 使用 15k/75k/200k。Reference Profile 已选择后者作为 Gate benchmark，但上游规范仍不一致，违反 ADR-022                                                          | 同步 Development Spec 与 Roadmap 对 profile 的引用/数值；docs/version drift check 通过                      |

上述 blocker 不得通过口头确认或把字段标成 opaque 来关闭。

## Exit criteria evidence matrix

| Gate 0 exit criterion                                                      | Current evidence                                                                                                  | Status              |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------- |
| 不再使用裸 `documentId + offset` 作为跨仓地址                              | Branded URI/Revision/Position types、Schema、source scan 和 canonical URI negative tests                          | Pass（Nireco 仓）   |
| Snapshot、Transaction、Revision、Proposal、Semantic Diff 均有可验证 Schema | 15 个 Draft 2020-12 Schema、versioned manifest、16 个 generated declarations、Ajv/fixture/hash conformance        | Pass（Preview）     |
| Comet 仅依赖 Mock 完成 handshake、fixed-Revision read、Draft Proposal      | Contract-shaped Mock、read/create/stage schema validation、2 条 versioned trace 和 idempotency/scope/policy tests | Pass（Nireco Mock） |
| `ChangeSet` 无多重含义                                                     | ADR terminology + architecture AST prohibition                                                                    | Pass                |
| 无 Public Tool、MCP、BYOA 路线                                             | restricted package exports、forbidden dependency/directory checks 和 no-bypass conformance                        | Pass（当前仓）      |
| ADR-001–009 与 ADR-022 Accepted                                            | 本报告所列 ADR 文件                                                                                               | Pass                |
| 两仓固定同一工程规范版本并启用 required checks                             | Nireco formatter/lint/typecheck/architecture/generated/docs CI 与 configuration hash 已建立；Comet 仓不在本工作区 | Blocked（跨仓）     |
| 不存在第二份权威编码规范或长期配置漂移                                     | 唯一根规范、固定版本引用、配置 SHA-256 和 document-version checker                                                | Pass（Nireco 仓）   |
| Browser IME/Selection/Clipboard Spike 不阻断或有 fallback                  | 尚无隔离技术报告和可引用结果                                                                                      | Blocked             |
| URI/Schema/Position/Transaction/Proposal golden fixtures                   | 4 个 manifest-indexed fixture、canonical SHA-256、document hash、URI/UTF-16/property/conformance tests            | Pass（Preview）     |
| Reference hardware 和 S/M/L corpus 冻结                                    | [Reference Profile](../performance/reference-profile.md) 已定义；上游数值同步受 `G0-B005` 阻塞                    | Partial             |

## Evidence required for re-assessment

本次 bootstrap 已交付：

1. Versioned Contract Bundle manifest、15 个 Schema 和 16 个 generated outputs。
2. Strict Schema validation、positive fixtures、URI/node grammar negative vectors。
3. URI、UTF-16、canonical JSON/hash、Proposal state 和 Semantic Diff tests。
4. In-memory Mock Service + handshake/read/create/stage conformance + Golden Trace。
5. Nireco required checks：format、lint、typecheck、architecture、generated/contract drift、docs/version。

Gate Owner 只能在以下剩余 artifact 均可从 clean checkout 重现后重新评估：

1. Browser IME/Safari Selection/Clipboard Spike report，含失败路径与 fallback。
2. `G0-B001`–`G0-B005` closure links及对应 cross-runtime/crash vectors。
3. Comet 仓相同工程规范、Adapter/Mock Trace 和 cross-repo conformance evidence。
4. 正式 wire boundary 的 generated DTO/runtime Schema validation 和内部品牌类型转换。
5. 更新后的 risk register，所有 Blocker 状态关闭。

## Gate decision

```text
Decision: DO NOT EXIT GATE 0
Reason: accepted vocabulary exists, but decision and evidence blockers remain.
Next review: after all G0 blockers have named owners and closure artifacts.
```
