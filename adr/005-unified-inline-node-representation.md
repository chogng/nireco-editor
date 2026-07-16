# ADR-005: Unified Inline Node Representation

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core
- Gate: Gate 0
- Related specifications: Development Spec §8
- Supersedes: None
- Superseded by: None

## Context

同时允许 paragraph `text`、`TextSpan[]`、通用 child node 和占位字符会产生多套正文事实来源。Parser、Renderer、Position、Diff 与 Hash 难以对同一内容得出一致结果。

## Decision

V1 Manuscript Schema 采用唯一正文表示：

- Block container 使用显式 `children`；
- `ParagraphNode.children` 和其他 inline container 统一为 `InlineNode[]`；
- 普通文本只由 `TextNode { id, type: "text", value, marks }` 表达；
- Citation、CrossReference、InlineEquation、FootnoteReference 和 HardBreak 是显式 inline node；
- 原子 inline node 不编码为私用区字符、object replacement character 或普通文本。

任何兼容 adapter 都必须在进入 Canonical Snapshot 前转换成该表示，不能把第二套表达保留为隐藏事实来源。

## Normative rules

- Schema MUST 为每个 inline node 定义 parent、cardinality、editable/atom 和 split/merge 规则。
- 相邻且 marks 完全相同的 TextNode MAY 在 canonical normalization 中合并；合并保留左 ID，并在 PositionMap 记录右 ID alias/tombstone。
- TextNode split MUST 保留左 ID，并由 trusted `IdAllocator` 为右片段分配新 ID。
- 空 TextNode 默认移除，除非 Schema 明确要求占位。
- Mark 顺序 MUST canonicalize；Renderer 不得决定冲突 Mark 的事实语义。
- Normalization MUST 是 Transaction 的可重放阶段，MUST NOT 在后台静默修改 Snapshot。
- 正文 Unicode code units MUST 原样保留，不做语义无关 normalization。
- Character Diff 和 DOM text content 均为派生视图，不是 Canonical Snapshot。

## Contract and implementation impact

Canonical Schema、Transaction Operation、PositionMap、import/export 和 Semantic Diff 必须只支持该 inline 代数。旧格式若出现 `text`/`spans` 并行字段，decoder 必须迁移或拒绝，不能择一静默丢弃。

## Verification

- Schema negative tests 拒绝并行正文表示和 inline 占位字符协议。
- Parse/serialize golden fixture 验证单一 canonical shape。
- Split/merge property tests 验证文本语义、ID alias 和 PositionMap。
- Renderer round-trip test 证明 DOM 不是事实来源。

## Consequences

### Positive

- Position、Operation、Hash 和 Semantic Diff 共享不可歧义的正文结构。
- Academic inline 对象可保留结构化身份。

### Costs and constraints

- Importer 必须显式解析并迁移传统 span/HTML 表示。
- 文本 merge/split 需要稳定 ID 与 PositionMap 规则。

## Alternatives considered

- **Paragraph string + annotation ranges**：拒绝，因为结构化 inline 的身份和嵌套关系脆弱。
- **多种正文 shape 并存**：拒绝，因为每个消费者都会形成不同优先级。
- **占位字符表示 atom**：拒绝，因为复制、搜索和 Unicode 处理容易泄漏实现细节。

## Deferred decisions and blockers

完整 V1 node/attribute catalog 由 Canonical Manuscript Schema 冻结；新增 inline kind 是 Schema/Contract 变化，必须提供迁移和 fixture。
