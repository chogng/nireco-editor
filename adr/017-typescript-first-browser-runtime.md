# ADR-017: TypeScript-first Browser Runtime Isolation Boundary

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Browser Runtime DRI
- Gate: Gate 0
- Related specifications: Development Spec §§16, 29.4, 32.2, 32.9
- Supersedes: None
- Superseded by: None

## Context

Browser `beforeinput`、Composition、Selection、Clipboard 和浏览器扩展造成的 DOM mutation 都可能绕过 Model/Transaction 语义。Gate 0 需要证明已冻结的 Revision、UTF-16 Position 和 Transaction 契约足以承载浏览器输入，同时不能让隔离 Spike 提前冻结 Web Editor 公共 API。

## Decision

V1 Browser Runtime 使用 TypeScript 实现浏览器适配层。DOM 始终是 Model 的可丢弃投影，浏览器事件只能经显式输入状态和受控转换产生 Transaction。Gate 0 只接受隔离 Spike 的技术边界和 fallback，不接受任何稳定 `INirecoEditor` 实现或 package export。

## Normative rules

- Browser Runtime MUST 显式表示 `Idle`、`Composing`、`ApplyingTransaction`、`PatchingDOM`、`RestoringSelection`、`HandlingNativeFallback` 和 `RecoveringDivergence` 状态。
- `insertText` MUST prevent native default，并由 revision-bound Selection 生成一个 Transaction。
- Composition target MUST 绑定开始时的 Revision、TextNode 和 UTF-16 range；一次成功 Composition MUST 生成且只生成一个 Transaction 和一个 Undo Group。
- Composition 期间 MUST NOT 为同步 Model 投影而重建候选文本 DOM。结束时 target 已 stale 的 Composition MUST 被取消，MUST NOT 产生 Transaction，并 MUST 从当前 Model 恢复 DOM。
- Selection bridge MUST 将 DOM offset 映射为 UTF-16 Semantic Position，并 MUST 拒绝 surrogate pair 中间位置。
- Paste MUST 先分类 MIME，再 sanitize、parse/validate 并原子提交；untrusted HTML MUST NOT 直接插入活动 DOM。
- MutationObserver MUST 只检测 divergence，不得把任意 mutation 当成文档事实。无法归类的 divergence MUST 从 Model 重绘；同一 runtime 连续三次 divergence 后 MUST 进入只读保护并记录 Diagnostic。
- Browser Spike MUST 留在 `spikes/browser-runtime/`，MUST NOT 被根 package export 或被 Core 导入。

## Contract and implementation impact

本决定不新增 Gate 0 public Contract 字段。它冻结 Browser Adapter 消费现有 Revision、UTF-16 Position 和 Transaction 契约时的失败语义。生产 Web Editor、OS 原生输入法矩阵、Accessibility 和完整 Clipboard fragment Schema 仍属于 N5；这些后续实现不得削弱本 ADR 的 fail-closed 规则。

## Verification

- `spikes/browser-runtime/` 在真实 Chrome 150 与 Playwright WebKit 26.5 中执行相同七个场景。
- 两个引擎均验证 7-domain hash byte vectors、`beforeinput → Transaction`、Composition 单 Transaction/Undo Group、stale Composition fallback、UTF-16 Selection fail-closed、恶意 HTML sanitize/atomic paste、DOM divergence 重绘与三次后只读保护。
- 版本化结果位于 `docs/browser/evidence/`；执行报告位于 `docs/browser/browser-runtime-isolation-spike.md`。
- 两个引擎结果均为 7/7 pass，浏览器控制台均为零 error 和零 warning。

## Consequences

### Positive

- Browser viability 在不冻结公共 Editor API 的情况下得到真实引擎证据。
- Safari/WebKit 的关键失败路径具有明确、可测试且不产生隐式写入的 fallback。
- DOM、Selection 和 Clipboard 不会成为第二事实来源。

### Costs and constraints

- Composition 结束需要将 native DOM 差异验证并编译为 Transaction。
- Runtime 必须维护 revision-bound composition target、投影抑制和 divergence 计数。
- Gate 0 的合成标准事件不能替代 N5 的真实 OS 输入法、移动端和辅助技术矩阵。

## Alternatives considered

- **把 `contenteditable` DOM 当事实来源**：拒绝，因为浏览器、扩展和输入法 mutation 无法满足 Revision 与原子提交语义。
- **Composition 每个 update 都提交**：拒绝，因为会破坏候选窗口并产生错误的 Undo 边界。
- **遇到未知 DOM mutation 时尽力保留**：拒绝，因为会把未验证状态带入文档。
- **在 Gate 0 冻结完整 Editor API**：拒绝，因为 Core Contract 尚不足以支撑所有 N5 行为。

## Deferred decisions and blockers

N5 必须补齐 Chrome、Firefox、Safari、Electron、移动端、中文/日文/韩文真实 OS 输入法、Emoji/组合字符/RTL 和屏幕阅读器矩阵。该矩阵是 Web Editor Alpha 的退出条件，不阻止本次 Gate 0 技术可行性结论。

## Change policy

Accepted ADR 的规范决定只能通过 superseding ADR 或明确的 amendment 改变。纯排版、链接和不改变语义的勘误可以直接修改。
