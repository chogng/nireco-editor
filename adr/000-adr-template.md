# ADR-NNN: Decision Title

- Status: Proposed
- Decision date: YYYY-MM-DD
- Owners: Team or named DRI
- Gate: Gate N
- Related specifications: links or section names
- Supersedes: None
- Superseded by: None

## Context

说明需要解决的问题、约束、已有事实，以及为什么该决定需要长期记录。不要把实现过程或会议纪要当作 Context。

## Decision

用可验证的规范语言陈述决定。对协议和核心不变量使用 MUST、MUST NOT、SHOULD、MAY；说明决定的适用范围和明确不适用的范围。

## Normative rules

- 列出调用方和实现方必须遵守的不变量。
- 明确失败模式、错误行为和并发边界。
- 明确哪些字段、状态或顺序属于 Contract。

## Contract and implementation impact

列出受影响的 public Contract、Schema、Fixture、服务边界、存储格式、迁移和跨仓消费者。若无影响，写明 “None”。

## Verification

列出使本决定可执行的自动化证据，例如：

- unit/property/conformance tests；
- golden vectors 或 golden traces；
- architecture/lint/generated-code checks；
- performance 或 crash-injection evidence。

## Consequences

### Positive

- 该决定带来的直接收益。

### Costs and constraints

- 被接受的复杂度、限制或迁移成本。

## Alternatives considered

说明被拒绝的主要替代方案及拒绝理由。不要罗列没有认真考虑过的方案。

## Deferred decisions and blockers

列出未由本 ADR 决定的事项。若它阻止某个 Gate 退出，必须给出 blocker ID、Owner、关闭条件和所需证据；不得用 “TBD” 隐藏。

## Change policy

Accepted ADR 的规范决定只能通过 superseding ADR 或明确的 amendment 改变。纯排版、链接和不改变语义的勘误可以直接修改。
