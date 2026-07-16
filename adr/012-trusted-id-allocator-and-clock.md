# ADR-012: Trusted ID Allocator and Clock

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core and Proposal
- Gate: Gate 0
- Related specifications: Development Spec §§3, 11, 15
- Supersedes: None
- Superseded by: None

## Context

规范要求 reducer 不读取 clock 或 random，但此前 production ID representation
仍是未冻结 opaque string。Operation 使用裸 `string`，Change Group 由 allocator
顺序产生，canonical group order 与 rebase `supersedes` 也未冻结。这使同一
Proposal Revision 无法证明 same-input stable identity，并允许可读 fixture ID
误入 production boundary。

## Decision

可信身份分成两类：

1. **Allocated ID**：canonical lowercase RFC 9562 UUIDv7。
2. **Derived ID**：从冻结的 domain-separated SHA-256 digest 生成 canonical
   lowercase RFC 9562 UUIDv8。

所有 UUID MUST 使用 `8-4-4-4-12` lowercase hexadecimal 形式和 RFC variant
`10`. Production parser MUST 拒绝 uppercase、non-canonical spelling、错误
variant 和错误 UUID version。

Allocated UUIDv7 用于 Workspace、Revision、Transaction、Operation、Node、
Academic Entity、Proposal、Session 与 Debug identity。`ProposalChangeGroupId`
是 Derived UUIDv8。外部 Comet task、trace、request、tool invocation 和 actor
identity 仍可由其 owning system 以 opaque string 表达。

## Trusted UUIDv7 allocation

`UuidV7IdAllocator` 只消费注入的 seed：

```ts
interface UuidV7Seed {
  unixMilliseconds: number;
  randomBytes: Uint8Array; // exactly 10 bytes
}

interface IUuidV7SeedSource {
  nextSeed(): UuidV7Seed;
}
```

composition root 拥有 ambient clock 与 cryptographic entropy。allocator、compiler
和 reducer 均不得直接读取 `Date`、`crypto`、`Math.random()` 或网络。

UUIDv7 byte layout：

- bytes `0..5`：48-bit Unix epoch milliseconds, big endian；
- high nibble of byte `6`：version `7`；
- remaining 74 bits：injected entropy；
- high bits of byte `8`：RFC variant `10`。

若 timestamp 重复或回退，allocator 保持上一个 timestamp/random field 并对
74-bit random field 做 big-endian increment，以保证同一 allocator instance
输出严格 lexicographic monotonic。74-bit overflow 必须显式失败，不能回绕。

所有新 ID 必须在进入 reducer 前分配。Operation 现在包含正式 branded
`OperationId`；该 UUIDv7 由 trusted command/proposal compiler 分配并与 Operation
一起持久化。Reducer 不得替换或补发 Operation ID。

## Preview fixture compatibility

旧的可读值（如 `node-1`）只允许通过明确命名的
`parsePreviewFixture*Id()` test helper。默认 `parseNodeId()`、
`parseRevisionId()` 等 production-boundary parser 只接受正确 UUID version。

Preview compatibility path：

- MUST NOT 由 integration、storage、codec、public API 或 service boundary 调用；
- MUST NOT 出现在 Contract fixtures；
- MUST NOT 作为 production allocator fallback；
- 可以在旧 in-process unit fixture 完成迁移前暂时存在。

## Operation identity

`OperationId` 是正式品牌类型和 Contract Schema definition。每个 Operation 的
`id` 必须是 Allocated UUIDv7。Transaction 中的 Operation array order 是 compiler
产生并持久化的 apply order；Semantic Diff `operationIds` 按该 order 引用。
UI、Diff renderer 和 hash encoder MUST NOT 重新排序 Operation。

## Proposal Change Group identity

Semantic Diff algorithm version 固定为：

```text
nireco-semantic-diff-1
```

每个 Group ID 使用 domain `nireco.proposal-change-group.v1`。其 exact identity
payload 为：

```text
algorithmVersion
documentUri
generatedAgainstRevisionId
proposalId
proposalRevision
kind
targetRefs
operationIds
```

规则：

- `targetRefs` 先各自 canonical JSON encode，再按 Unicode code point order
  排序，所以 UI target display order 不影响 ID；
- `operationIds` 保持 trusted compiler 的 persisted apply order；
- `dependsOn` 不进入 identity payload，避免 Group ID dependency cycle；
- rationale、warnings、before/after rendering 与 summary 不进入 ID；
- SHA-256 digest 的前 16 bytes 作为 UUID payload，再设置 version `8` 和 RFC
  variant bits；
- Proposal content 变化必须增加 `proposalRevision`，因此 MUST 产生新 Group IDs；
- 相同 exact identity payload MUST 产生相同 Group ID。

## Canonical Group order

Group list 使用 deterministic topological sort：

1. dependency 必须存在且 graph 必须是 DAG；
2. 只从当前 in-degree 为 `0` 的 ready set 选择；
3. ready tie-break 依次为 canonical first target、固定 Group kind rank、Group ID；
4. dependency 始终排在 dependent 前。

Group kind rank 固定：

```text
insert-content
rewrite-content
delete-content
move-structure
add-citation
replace-citation
change-evidence
change-claim-relation
metadata
```

Operation order 与 Group order 是不同概念；topological Group sort 不得修改
Operation apply order。

## Rebase supersedes mapping

`supersedes` 只使用可审计、确定性的 stable-target lineage：

- previous/current Group kind 必须相同；
- target identity 包含 document URI 与 node/entity/range/metadata target；
- 比较时仅移除 document `revisionId`，不得移除 target ID、offset 或 metadata
  field；
- 一个 previous Group 映射到所有共享至少一个 stable target 的 current Groups，
  以 canonical Group order 排列；
- mapping 自身按 previous canonical Group order 排列；
- 没有 stable-target match 时省略 mapping；
- 禁止用文本相似度、UI order、rationale 或模型判断猜测 lineage。

上述规则支持 deterministic one-to-one、split 和 merge mapping。无法映射比错误
映射安全；产品可将未映射 Group 显示为新增/移除。

## Verification

- byte-level UUIDv7 construction vector；
- strict UUIDv7/UUIDv8 parser negative cases；
- property tests 覆盖随机 timestamp/entropy round-trip；
- repeated/rollback clock monotonic and collision tests；
- same Group seed stability、target-order invariance 与 Proposal Revision change；
- dependency-aware canonical group ordering；
- cross-revision deterministic supersedes mapping；
- Contract fixtures 全部使用 production UUID profile。

## Consequences

### Positive

- 可信 ID 格式、Operation identity 与 Change Group identity 不再含糊。
- reducer 保持纯函数，同时 production identity 具备 time-sortable allocation。
- Same Proposal Revision 可稳定重读，rebase lineage 可跨 runtime 重放。

### Costs and constraints

- 可读 ID 不再是 production wire value。
- UUIDv7 seed source 必须由 platform composition root 安全实现。
- Grouping algorithm 或 identity payload 变化需要新 algorithm/domain version。

## Alternatives considered

- **所有 ID 都用随机 UUIDv4**：拒绝，因为没有 time ordering，且仍未解决
  deterministic Group identity。
- **Change Group 也分配 UUIDv7**：拒绝，因为重复生成无法证明 same-input
  stability。
- **Operation 使用数组 index**：拒绝，因为重排或 partial grouping 会改变身份。
- **用文本相似度生成 supersedes**：拒绝，因为不可稳定重放且难以审计。

## Deferred decisions and blockers

None for G0-B003 or G0-B004. Platform cryptographic seed adapters可在后续 runtime
里实现，但必须满足本 ADR 的 seed、monotonicity、parser 和 conformance contract。
