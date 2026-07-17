# Gate 0 Report: Core Vocabulary and Contract Preview

- Assessment date: 2026-07-16
- Gate owner: Unassigned — must be named before the Gate decision
- Overall status: **Blocked — local technical scope is complete; remote CI and named Gate Owner signoff remain pending**
- Open technical blocker count: **0**
- Decision baseline: ADR-001–ADR-012, ADR-017, ADR-019 and ADR-022
- Execution plan: [Gate 0 Bootstrap Plan](../plans/gate-0-bootstrap-plan.md)
- Performance profile: `nireco-g0-r1-2026-07-16`
- Current latency claim: No latency suite has passed
- Risk register: [Gate 0 Risk Register](../risks/gate-0-risk-register.md)

## Executive assessment

Gate 0 的核心 vocabulary、Nireco 工程门禁、Contract Bundle Preview、
generated declarations、Golden Fixtures、sample traces 和 contract-shaped Mock
均已形成可执行证据。`G0-B001`–`G0-B005` 的技术关闭条件已经由 Accepted ADR、
byte/crash vectors、自动化测试和 drift checks 满足；Browser Runtime 隔离 Spike
也在 Chrome 与 WebKit 中完成相同的 7 个场景。这些结论只关闭 Nireco 仓内本轮
列出的技术 blocker，不等于满足整个双仓 Gate 0。

[ADR-019](../../adr/019-contract-bundle-and-cross-repo-conformance.md) 的独立 Comet
consumer 从 package exports、Schema、generated declarations 和 Mock 入口执行
固定 Revision 读取与 Proposal-only 写入闭环。该 harness 是 Nireco 仓内的
consumer-boundary 证明。Development Spec §32.2 和 Roadmap §5.3 要求的真实
Comet 仓实现现已由 [Comet Gate 0 local evidence](./comet-gate-0-evidence.md)
补齐：独立 worktree `/private/tmp/comet-nireco-gate0`、branch
`codex/nireco-gate0-contract`、base `17c86ada` 包含固定 54-file Contract
snapshot、packed runtime tar、lock/checker、strict loader、public-service
adapter、trusted task binding、两项 Gate 0 Tool 以及 canonical Agent Host
Registry/Preparation/Authority/Execution E2E 和版本化 trace。原
`/Users/lance/Desktop/comet` 的 `main` 工作区保持 clean。

最终 review 已关闭 canonical URI/真实 UTC 日历校验、mutation response-loss
同 operation/idempotency reconciliation、adapter/executor/task map 容量上限与
durable release 回收、安装前 contract verification，以及 Electron 43 ESM
ready/CLI argv 兼容问题。
该 worktree 的 `npm run verify`、`npm run build` 和 focused Nireco tests 均通过；
full verify 包括 Node `1314/1314`、3 个 browser sources 和 Electron `1/1`。
这些是本地可复现证据，不声称变更已经 commit、push、通过远程 CI 或取得 Gate
Owner signoff。

参考设备、runtime、S/M/L corpus 和预算已由
[Reference Profile](../performance/reference-profile.md) 冻结，并新增按生产能力
激活的 staged calibration policy：Gate 0 激活 corpus/hash/evidence
infrastructure 与已实现 correctness baseline；Gate 1 激活 Transaction/Read；
Gate 2 激活 Proposal；N5 激活 Editor。后续 suite 的状态是
`Pending by design`，不是 Gate 0 blocker，也绝不是 Pass。当前没有 latency
artifact，因此不得标记任何 latency suite 或整个 Editor performance pass。
`R-G0-015` 和 `R-G0-017` 均为 `Mitigated`，Gate 0 技术 blocker 为零。整体仍因
Comet 远程 CI、具名 Gate Owner 复验和正式 signoff 保持 `Blocked`。真实 Comet
仓 current/previous Contract compatibility matrix 仍是 Gate 1 工作。

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
| [ADR-010](../../adr/010-single-document-authority.md)                               | 单文档 Authority、WAL/Snapshot acknowledgment 与 fail-closed recovery     |
| [ADR-011](../../adr/011-canonical-json-and-sha-256-hashing.md)                      | Exact hash preimage、domain separation 和跨 runtime byte vectors          |
| [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md)                          | UUIDv7 allocated ID、UUIDv8 Change Group、Operation ID/order/supersedes   |
| [ADR-017](../../adr/017-typescript-first-browser-runtime.md)                        | Browser 输入状态机、DOM 投影边界和 controlled fallback                    |
| [ADR-019](../../adr/019-contract-bundle-and-cross-repo-conformance.md)              | Package-export independent Comet consumer conformance                     |
| [ADR-022](../../adr/022-normative-engineering-standard-and-automated-governance.md) | 唯一工程规范和 fail-closed automated governance                           |

## Frozen decisions and scope boundaries

以下事项已作出 Gate 0 决定，不再作为开放架构选择：

- **Authority write path**：所有 mainline write 必须走
  `INirecoModel.applyTransaction → Workspace DocumentAuthority.apply → serialized reducer/durability`。
  Browser/sidecar/server 只决定部署，不改变唯一提交入口。
- **URI trailing slash**：只对 `nireco:`/`comet:` logical URI 移除非根尾斜杠；
  HTTP(S)/file/doi 保留路径语义。
- **Proposal validation checkpoint**：成功路径必须经过独立 `validated` 状态，
  不允许 `validating → needs-review`。
- **Partial acceptance**：选择集先扩展为 dependency closure，再编译成单一
  mainline Transaction；Agent 没有 acceptance capability。
- **Durability acknowledgment**：`apply()` 只确认原子内存提交；`whenDurable()`
  才确认 WAL/Snapshot。append、fsync 或 fence 失败保留 memory head 并将
  Authority 置为 read-only。
- **Identity**：production allocated identity 使用 canonical lowercase UUIDv7；
  Operation 具有 persisted UUIDv7 ID；Change Group 使用 exact payload 派生 UUIDv8，
  并按确定性拓扑顺序和 stable-target lineage 生成 `supersedes`。
- **Browser boundary**：DOM 仅是 Model 投影；Composition、Selection、Clipboard
  和未知 mutation 必须经 Transaction 或 controlled redraw/fail-closed fallback。

这些决定均有本仓 unit/property/contract conformance、真实浏览器或独立消费者证据。

## Technical blocker closure

| ID      | Closed decision                                 | Reproducible evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status |
| ------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| G0-B001 | Exact hash byte preimages                       | [ADR-011](../../adr/011-canonical-json-and-sha-256-hashing.md) freezes `UTF8("NIRECO\0HASH\0V1\0" + domain + "\0" + canonicalJson(payload))`, seven domains and exact envelopes；[hash vectors](../../contracts/comet-integration/fixtures/hash-preimages.json)；[portable/Node conformance](../../tests/conformance/hash-runtime.conformance.ts)；Browser vector result in [Spike report](../browser/browser-runtime-isolation-spike.md)                                                                                  | Closed |
| G0-B002 | Durability failure and acknowledgment semantics | [ADR-010](../../adr/010-single-document-authority.md)；[Authority fault tests](../../tests/unit/durability-authority.test.ts)；[WAL framing properties](../../tests/property/durability-wal.property.test.ts)；[tail/middle recovery conformance](../../tests/conformance/recovery-durability.conformance.ts)；[recovery fixtures](../../contracts/comet-integration/recovery-fixtures/)                                                                                                                                   | Closed |
| G0-B003 | Change Group and Operation identity             | [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md) freezes persisted UUIDv7 Operation ID, derived UUIDv8 Change Group identity, canonical topological order and deterministic `supersedes`；[identity/order/supersedes tests](../../tests/unit/hash-change-group-identity.test.ts)；production-profile [Semantic Diff fixture](../../contracts/comet-integration/fixtures/minimal-semantic-diff.json)                                                                                                              | Closed |
| G0-B004 | Trusted ID scheme                               | [ADR-012](../../adr/012-trusted-id-allocator-and-clock.md) freezes strict RFC 9562 UUIDv7/UUIDv8 profiles and injected seed source；[allocator/parser property tests](../../tests/property/id-conformance.property.test.ts) cover byte vector, rollback/repeated-clock monotonicity, format rejection and randomized round-trip；[common Schema](../../contracts/comet-integration/schemas/common.schema.json) and [manifest](../../contracts/comet-integration/contract.manifest.json) freeze the production UUID profile | Closed |
| G0-B005 | Normative performance corpus drift              | Development Spec `0.4.3` and Roadmap `0.1.2` now use 15k/75k/200k words；[closure evidence](../performance/g0-b005-closure-evidence.md)；[reference profile](../performance/reference-profile.md)；`pnpm check:performance-profile` checks profile ID, versions, values and evidence links。该 closure 只关闭规模定义漂移，不代表 benchmark calibration 或 performance pass                                                                                                                                                | Closed |

五项均通过版本化 artifact 和机器检查关闭，不依赖口头确认或 opaque placeholder。

## Exit criteria evidence matrix

| Gate 0 exit criterion                                                              | Current evidence                                                                                                                                                                                                                                                                                                                            | Status                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 两仓不再使用裸 `documentId + offset` 作为跨仓地址                                  | Nireco branded URI/Revision/Position、Schema、source scan 和 canonical URI tests；[Comet local evidence](./comet-gate-0-evidence.md) 的 trusted `RequiredDocumentRef`、strict canonical URI loader、fixed-Revision E2E 和 model-controlled trusted-ID rejection                                                                             | Pass（local cross-repo evidence）              |
| Snapshot、Transaction、Revision、Proposal、Semantic Diff 均有可验证 Schema         | 15 个 Draft 2020-12 Schema、versioned manifest、16 个 generated declarations、Ajv/fixture/hash conformance；Comet 固定 54-file snapshot、manifest/tree/package lock 和 pre-install checker                                                                                                                                                  | Pass（Contract Preview）                       |
| Comet 仅依赖公开 Contract/Mock 完成 handshake、fixed-Revision read、Draft Proposal | [independent consumer evidence](../../contracts/comet-integration/comet-consumer/evidence-report.json) 和 [consumer tests](../../tests/comet-consumer/public-contract.consumer.test.mjs) 证明 Nireco package boundary；[real Comet E2E evidence](./comet-gate-0-evidence.md) 证明 public packed runtime、Adapter、Task/Tool 和 trace        | Pass（local real Comet implementation）        |
| `ChangeSet` 无多重含义                                                             | ADR terminology + architecture AST prohibition                                                                                                                                                                                                                                                                                              | Pass（Nireco 仓）                              |
| 无 Public Tool、MCP、BYOA 路线                                                     | Restricted Nireco package exports 与 no-bypass tests；Comet 只注册 inspect/propose-insert 两项 Tool，trace 证明 `rawTransaction=false`、`reviewCommit=false` 且无 commit/accept surface                                                                                                                                                     | Pass（local cross-repo evidence）              |
| Gate 0 decision ADR Accepted                                                       | ADR-001–ADR-012、ADR-017、ADR-019、ADR-022                                                                                                                                                                                                                                                                                                  | Pass（Nireco decision set）                    |
| 两仓固定同一工程规范版本并启用基础 PR 门禁                                         | Nireco 固定 v0.1.1；Comet contract lock/checker 同样固定 v0.1.1，workflow 配置 `npm ci --ignore-scripts → checker → npm rebuild`，本地 full verify 通过                                                                                                                                                                                     | Pass（local configuration；remote CI pending） |
| 不存在第二份权威编码规范或长期配置漂移                                             | Nireco 唯一根规范、配置 hash 和 document/profile checks；Comet 只消费固定 Contract snapshot/package/standard version，并由 checker fail closed                                                                                                                                                                                              | Pass（local cross-repo evidence）              |
| Browser IME/Selection/Clipboard Spike 不阻断或有 fallback                          | [ADR-017](../../adr/017-typescript-first-browser-runtime.md)、[7/7 Chrome evidence](../browser/evidence/chrome-150.json)、[7/7 WebKit evidence](../browser/evidence/webkit-26.5.json) 和 [controlled fallback report](../browser/browser-runtime-isolation-spike.md)                                                                        | Pass（isolated spike）                         |
| URI/Schema/Position/Transaction/Proposal/hash/recovery golden fixtures             | Manifest-indexed Contract fixtures、7-domain hash vectors、recovery tail/corruption vectors 和 unit/property/conformance tests                                                                                                                                                                                                              | Pass（Preview）                                |
| Reference hardware、runtime、S/M/L corpus、预算和 staged activation policy 冻结    | [Reference Profile](../performance/reference-profile.md) 与 [G0-B005 closure evidence](../performance/g0-b005-closure-evidence.md)；机器检查固定 profile ID、device/runtime、budgets、paths、closure version、corpora、activation matrix 和 claim boundary。这里只证明定义、hash/evidence infrastructure 与当前 correctness baseline 可复现 | Pass（Gate 0 definition/control only）         |
| Gate 1 Transaction/Read performance suites                                         | Production Transaction/Read 尚未按对应 Gate 完整激活；没有 raw latency artifact                                                                                                                                                                                                                                                             | Pending by design（not Pass）                  |
| Gate 2 Proposal performance/correctness suites                                     | Production Proposal/Semantic Diff/closure 尚未按对应 Gate 激活                                                                                                                                                                                                                                                                              | Pending by design（not Pass）                  |
| N5 Editor performance/correctness suites                                           | Production DOM patch、key-to-paint、IME/Paste/Undo suite 尚未按对应 Track 激活                                                                                                                                                                                                                                                              | Pending by design（not Pass）                  |
| 真实 Comet 仓 current/previous Contract compatibility matrix                       | 尚未执行；该 compatibility matrix 是 Gate 1 residual control，不替代 Gate 0 local implementation evidence                                                                                                                                                                                                                                   | Deferred to Gate 1                             |

## Gate 0 implementation evidence and remaining prerequisites

本次技术关闭与本地 integration 已交付：

1. Versioned Contract Bundle manifest、15 个 Schema、16 个 generated outputs 和
   production-profile fixtures。
2. Exact hash preimages、portable/Node conformance，以及 Browser 中相同 7-domain
   vectors。
3. `apply()`/`whenDurable()`、append/fsync/fence fault、Snapshot manifest 和
   tail/middle corruption recovery evidence。
4. UUIDv7/UUIDv8、Operation ID、same-input Change Group、canonical order 和
   deterministic `supersedes` evidence。
5. Chrome/WebKit Browser isolation evidence与 controlled fallback。
6. Package-export independent Comet consumer、schema-backed fixed-Revision read、
   Proposal-only flow 和 no-bypass evidence。
7. Development Spec/Roadmap/profile 数值同步，以及 production S/M/L generator、
   六项 exact count、seed、raw checksum、canonical Document Hash lock 和 automated
   drift check（`pnpm check:reference-corpora`）。
8. Nireco required checks：format、lint、typecheck、architecture、generated/contract
   drift、consumer、docs/version、performance profile 和 Browser evidence。
9. [真实 Comet local evidence](./comet-gate-0-evidence.md)：固定 Contract
   snapshot/tar/checker、strict loader、Adapter、trusted Task/Tool boundary、
   canonical Agent Host E2E、response-loss reconciliation、bounded state、durable
   release retirement 和 trace。
10. Comet local `npm run verify`、`npm run build` 与 focused Nireco `24/24` tests；
    full verify 包括 Node `1314/1314`、3 browser sources 和 Electron `1/1`。

进入 Gate Owner 决策前仍须：

1. 对 Comet 变更取得远程 CI 结果；当前证据只有独立本地 worktree 验证；
2. 命名 Gate Owner，从 clean checkout 复验双仓证据并记录 `Exit`、
   `Conditional Exit` 或 `Hold`。

Gate 1、Gate 2 与 N5 suite 的 raw measurements、correctness summary 和 result
artifact 是对应能力激活时的退出条件，不是 Gate 0 的倒置前置条件。它们当前均为
`Pending by design`；任何缺少 artifact 的 latency 指标都不得标为 Pass。

## Gate decision

```text
Technical assessment: G0-B001 through G0-B005 CLOSED
Cross-repo integration risk: R-G0-015 MITIGATED by local real-Comet evidence
Performance sequencing risk: R-G0-017 MITIGATED by staged capability activation and fail-closed claim checks
Open technical blockers: NONE
Overall Gate 0 status: BLOCKED
Reason: remote CI and named Gate Owner signoff are not recorded.
Current performance claim: corpus/hash/evidence infrastructure and implemented correctness baselines only; NO LATENCY SUITE PASS.
Next action: obtain remote CI evidence, then have the named Gate Owner record the formal decision; activate Transaction/Read calibration with Gate 1 implementation.
Deferred beyond Gate 0: current/previous Contract compatibility matrix, production transport/storage adapters, and the N5 browser/OS matrix.
```
