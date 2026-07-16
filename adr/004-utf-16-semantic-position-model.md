# ADR-004: UTF-16 Semantic Position Model

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core
- Gate: Gate 0
- Related specifications: Development Spec §§9, 12
- Supersedes: None
- Superseded by: None

## Context

Browser Selection 和 JavaScript string 使用 UTF-16 code unit，而 Rust string 使用 UTF-8 byte。若 Contract 只写 “offset”，emoji、组合字符和跨 runtime 映射会产生数据损坏。全局字符 offset 也不能稳定表达结构变化。

## Decision

跨层文本 offset 的唯一单位是 branded `Utf16Offset`。Semantic Position 由稳定节点身份与局部位置组成：

- `TextPosition` 指向 `TextNode.id + utf16Offset + affinity`；
- `NodeBoundaryPosition` 指向 `parentNodeId + childIndex + affinity`；
- 原子 inline node 的前后位置使用 Node Boundary，不使用占位字符 offset。

## Normative rules

- Offset MUST 位于 `[0, text.length]`，且 MUST NOT 落在 surrogate pair 中间。
- 光标移动、删除和 Selection 扩展 MUST 按 grapheme cluster；grapheme index 不替代协议 offset。
- Rust/WASM 边界 MUST 显式、可失败地转换 UTF-16 offset，MUST NOT 使用 UTF-8 byte offset。
- 正文 MUST NOT 为简化定位而隐式执行 NFC/NFD normalization。
- 每个 Position MUST 绑定声明它的 Revision。
- 跨 Revision 使用 Position MUST 经过 `PositionMap` 或 `PersistentAnchor` 恢复。
- ambiguous、deleted 或 orphaned 映射 MUST 显式返回状态，不得自动选择“最近”位置继续写入。
- Selection 是 View 状态；Comment、Claim、Evidence、Proposal 和异步任务必须使用 revision-bound Persistent Anchor。

Persistent Anchor 恢复顺序固定为：PositionMap、stable node ID、text quote/context、path hint，最后标记 orphaned。

## Contract and implementation impact

所有 offset 字段必须使用能表达 UTF-16 语义的命名和品牌类型。Contract decoder 必须拒绝负数、非整数、越界和 surrogate 中间位置。PositionMap 是每次成功 Transaction 的必需产物。

## Verification

- Golden vectors 覆盖 BMP、surrogate pair、ZWJ emoji、combining mark、CJK 和双向文本。
- Property test 生成非法 UTF-16 boundary 并验证 fail closed。
- Browser/Node/Rust conformance 验证同一位置 round-trip。
- PositionMap tests 覆盖 split、merge、move、delete 和 affinity。

## Consequences

### Positive

- Browser 编辑热路径无需把 DOM offset 转成另一种协议坐标。
- 跨 runtime 的差异被集中在显式转换边界。

### Costs and constraints

- grapheme 行为与存储 offset 是两套相关但不同的规则。
- 非 JavaScript runtime 必须维护 UTF-16 索引或转换工具。

## Alternatives considered

- **UTF-8 byte offset**：拒绝，因为 Browser/DOM 转换频繁且容易误用。
- **Unicode scalar/code point offset**：拒绝，因为 JavaScript 和 DOM 不直接采用。
- **grapheme index 作为协议位置**：拒绝，因为分段算法版本变化且不适合底层文本替换。
- **全局字符 offset**：拒绝，因为结构编辑后不稳定。

## Deferred decisions and blockers

Unicode grapheme/word segmentation 的具体数据版本必须由实现清单固定并进入 conformance metadata；升级该版本不得静默改变编辑行为。
