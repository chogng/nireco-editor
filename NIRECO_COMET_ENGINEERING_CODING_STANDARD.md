---
title: Nireco–Comet 工程与编码规范
version: 0.1.1
status: Normative Engineering Standard
language: zh-CN
canonical_filename: NIRECO_COMET_ENGINEERING_CODING_STANDARD.md
updated_at: 2026-07-16
based_on:
  - NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md v0.4.2
  - NIRECO_COMET_ROADMAP.md v0.1.1
applies_to:
  - Nireco Editor Repository
  - Comet Repository
owners:
  - Nireco Technical Lead
  - Comet Technical Lead
  - Cross-repository Contract DRI
---

# Nireco–Comet 工程与编码规范

## 0. 文档目的

本文档是 Nireco 与 Comet 两个仓库的长期工程规范。它同时规定：

- 源码的机械格式；
- TypeScript、浏览器代码和 Rust/WASM 的编码方式；
- 模块依赖和仓库边界；
- Nireco Core 的确定性与不可变性约束；
- Nireco–Comet 私有契约和 Comet Agent Tool 的实现规则；
- 错误、异步、生命周期、日志、安全与测试标准；
- Git、提交、评审、CI、发布和规范例外流程。

本规范的目标不是追求统一外观本身，而是确保以下性质能够长期成立：

```text
Correctness
Determinism
Reviewability
Recoverability
Contract Compatibility
Clean-room Independence
Agent Safety
```

机械格式由格式化器和 lint 配置自动执行；架构边界、确定性、事务语义和跨仓契约由本规范、架构测试、Conformance Suite 和代码评审共同执行。

### 0.1 规范性术语

- **必须（MUST）**：不满足即不得合并。
- **不得（MUST NOT）**：明确禁止。
- **应该（SHOULD）**：默认必须遵守；偏离需要在 PR 中说明，重大偏离需要 ADR。
- **可以（MAY）**：可选实现。
- **公共 API**：通过正式 entrypoint、Contract Bundle 或 Product API 对其他模块、仓库或进程承诺的接口。
- **内部 API**：同一仓库内部使用、可随实现调整且不形成兼容承诺的接口。
- **可信边界**：经过解析、鉴权、Capability/Scope 校验并转换成内部类型的边界。

### 0.2 适用优先级

出现冲突时，按以下顺序处理：

1. 安全与数据完整性要求；
2. Nireco 核心不变量；
3. Nireco–Comet Integration Contract；
4. 本编码规范；
5. 仓库局部约定；
6. 个人偏好。

仓库局部规则不得降低本规范要求。必须降低时，需要 ADR、到期时间和负责移除该例外的 Issue。

### 0.3 唯一权威文件与派生配置

`NIRECO_COMET_ENGINEERING_CODING_STANDARD.md` 是 Nireco 与 Comet 唯一的权威工程与编码规范。不得维护内容相近但独立演进的第二份规范。别名文件、站点页面、README 摘录和 onboarding 材料必须明确标记为非规范性派生内容，并固定本文件版本。

以下配置是本规范的机器可执行派生物：

```text
.editorconfig
Prettier configuration
ESLint rules and architecture boundaries
TypeScript base configs
Rust fmt/clippy policy
PR and ADR templates
CODEOWNERS
CI required checks
Contract/generated-code drift checks
```

派生配置不得静默降低本规范。规范与配置不一致时，合并必须停止：先修正规范或配置，再恢复门禁。两个仓库必须在仓库元数据或 CI 中固定所采用的规范版本和配置 hash。

本规范与开发规格、Roadmap 的职责边界为：

- 开发规格定义系统事实、Core 和 Contract 语义；
- Roadmap 定义 Gate、交付顺序和日期；
- 本规范定义代码如何实现、测试、评审和发布这些事实。

---

## 1. 工程原则

### 1.1 正确性优先于简洁技巧

代码必须优先表达业务不变量，而不是追求最少字符、最少类型或最少文件。

禁止用隐式行为隐藏关键状态转换：

```ts
// 禁止：setter 隐式提交 Revision。
model.content = nextContent;

// 必须：显式表达 Base Revision、Transaction 和提交结果。
const result = model.applyTransaction(transaction);
```

### 1.2 显式优先于魔法

必须显式表达：

- Resource URI；
- Base Revision；
- Semantic Position；
- Transaction；
- Capability 与 Scope；
- Proposal Revision；
- Cancellation；
- 持久化状态；
- 兼容版本。

不得依赖“当前编辑器”“最后打开的文档”“全局活动 Workspace”或其他隐藏上下文决定核心行为。

### 1.3 内核确定性优先于运行时便利

给定相同的：

```text
Snapshot + Transaction + Schema + Deterministic Services
```

Nireco Kernel 必须产生相同的：

```text
Result Snapshot + PositionMap + Diagnostics + Hash
```

Kernel 同步路径不得读取系统时间、随机数、网络、DOM、环境变量、全局 locale 或文件系统。

### 1.4 边界解析，内部可信

所有不可信输入必须在边界完成：

```text
Parse
→ Validate
→ Canonicalize
→ Brand
→ Enter Internal Domain
```

内部核心代码不得反复接收未验证的 `string`、任意 JSON 或模型生成对象。

### 1.5 组合优先于继承

默认使用：

- 小型纯函数；
- 明确服务接口；
- 组合对象；
- discriminated union；
- reducer；
- Provider/Adapter。

只有当对象具有稳定身份、生命周期或需要封装可变资源时才使用 class。不得为复用几行逻辑建立深层继承树。

### 1.6 可审阅优先于一次性大改

一个 PR 必须具有单一可描述目的。架构重构、行为变化和批量格式化不得混在同一个 PR 中。

### 1.7 Nireco 为 Comet 服务，但不依赖 Comet

依赖方向必须是：

```text
Nireco Contract
      ↑
Comet Adapter / Tools / Agent
```

Nireco 源码不得 import Comet 模块、模型 SDK、Prompt、Agent Framework 或 Comet Product State。

---

## 2. 仓库与模块边界

### 2.1 Nireco 的顶级依赖方向

Nireco 源码必须遵守：

```text
base
  ↓
model
  ↓
editor / academic / services
  ↓
features / comet-contract
  ↓
public entrypoints
```

允许依赖关系：

| 模块 | 可以依赖 |
|---|---|
| `base` | 仅标准库和批准的基础依赖 |
| `model` | `base` |
| `editor` | `base`、`model` |
| `academic` | `base`、`model` |
| `services` | `base`、`model`、必要的 `academic` |
| `features` | 下层公开的内部接口，不得反向成为 Core 依赖 |
| `comet-contract` | `base`、`model`、`services` 的稳定 DTO/服务接口 |
| `public` | 选择性重导出稳定 API |

以下依赖一律禁止：

```text
model → editor
model → features
model → comet-contract
base → model
Nireco → Comet
```

### 2.2 Comet 的顶级依赖方向

Comet 应遵守：

```text
product / task-api
        ↓
agent workflows / product services
        ↓
private agent-tools / context / evaluation
        ↓
nireco-adapter / source services / model providers
        ↓
external systems and Nireco Contract
```

Comet Tool Schema 不得反向渗入 Nireco。

### 2.3 源码目录不是 npm package

Nireco 第一阶段保持单一主发布边界。`model/`、`editor/`、`academic/`、`features/` 是源码模块，不是默认的独立 npm 包。

只有出现以下真实需求时才允许拆包：

- 独立运行环境；
- 不同 peer dependency；
- 独立发布周期；
- 可脱离主编辑器单独使用；
- 重量级 WASM/Native 产物。

拆包必须有 ADR，不得为了“看起来模块化”而拆包。

### 2.4 内部 barrel 文件

内部目录默认不得创建聚合式 `index.ts`。它们容易隐藏依赖、制造循环引用并扩大无意导出。

允许的位置：

- 正式公共 entrypoint；
- 生成的 Contract entrypoint；
- 非常小且边界稳定的叶子模块。

不得通过多层 barrel 深度重导出内部符号。

### 2.5 Composition Root

以下行为只能发生在 Composition Root：

- 读取环境变量；
- 选择 Storage、Authority、Clock、ID Allocator；
- 选择模型供应商；
- 注册 Feature；
- 创建 Workspace；
- 建立 Transport；
- 配置日志、指标和 Feature Flag。

核心模块不得直接读取 `process.env`、`window.location` 或全局配置。

---

## 3. 语言、文件与文本规范

### 3.1 代码语言

以下内容必须使用英文：

- 标识符；
- 文件名；
- commit message；
- PR 标题；
- 生产源码中的注释；
- 错误码；
- 日志字段；
- 公共 API 的 TSDoc/Rustdoc；
- Contract Schema 字段。

架构文档、产品文档和团队讨论可以使用中文。测试 Fixture 中为验证中文、日文等语言而出现的内容不受此限制。产品界面文案必须进入本地化系统，不得直接散落在 Core 代码中。

### 3.2 字符编码

所有文本文件必须：

```text
UTF-8 without BOM
LF line endings
Final newline required
Trailing whitespace forbidden
```

禁止在源码中使用不可见方向控制字符。确有 Unicode 测试需求时，必须通过转义、注释或 Fixture 明确其含义。

### 3.3 文件命名

默认使用 `kebab-case`：

```text
model-registry.ts
semantic-position.ts
proposal-review-view.ts
citation-validation.test.ts
```

例外：

- React 组件若 Comet 现有规范要求，可使用 `PascalCase.tsx`；
- 生成文件遵循生成器固定命名；
- Rust 使用 `snake_case.rs`。

测试文件：

```text
*.test.ts          单元/属性测试
*.browser.test.ts  浏览器行为测试
*.conformance.ts   契约一致性用例
*.bench.ts         基准测试
```

### 3.4 文件职责

一个源文件必须有清晰的主职责。以下信号表明需要拆分：

- 同时定义多个无关领域概念；
- 同时处理解析、持久化、UI 和网络；
- 导出大量不相关符号；
- 评审者无法用一句话描述该文件用途；
- 修改一个功能时总会触碰不相关代码。

不设置机械行数上限，但超过约 500 行的手写源码应在 PR 中解释其聚合理由。

---

## 4. 自动化工具与机械格式

### 4.1 标准工具链

TypeScript/JavaScript 仓库默认使用：

- 一个在 `packageManager` 字段中固定的包管理器；
- Nireco 新仓库默认使用 `pnpm`；
- TypeScript 编译器进行严格类型检查；
- ESLint 执行语义和架构规则；
- Prettier 执行机械格式；
- Vitest 执行 TypeScript 单元与属性测试；
- Playwright 执行浏览器测试。

Rust 使用：

- `rustfmt`；
- `clippy`；
- `cargo test`；
- 需要时使用 property/fuzz 工具。

工具版本必须被 lockfile、toolchain 文件或容器固定。CI 和本地必须运行相同主版本。

### 4.2 TypeScript 格式

标准格式：

```text
Indentation: 2 spaces
Print width: 100
Quotes: single
Semicolons: required
Trailing commas: all where valid
Arrow parentheses: always
Brace style: formatter default
End of line: LF
```

参考 Prettier 配置：

```js
/** @type {import('prettier').Config} */
export default {
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  endOfLine: 'lf',
  printWidth: 100,
  proseWrap: 'preserve',
  semi: true,
  singleAttributePerLine: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
};
```

不得通过手工对齐空格制造表格式代码；格式化器会移除这类对齐。

### 4.3 `.editorconfig`

仓库根目录必须包含：

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.rs]
indent_size = 4
```

### 4.4 格式化的职责边界

- 格式化结果不进行人工争论；
- 禁止在功能 PR 中批量重排无关文件；
- 格式规则变化必须独立 PR；
- CI 必须运行 formatter check，而不是在 CI 中静默改写文件。

### 4.5 双仓配置防漂移

Nireco 与 Comet 必须消费同一版本的工程配置基线。推荐建立一个私有、仅含开发配置的共享工具包或配置仓库，统一维护：

```text
ESLint base config
Prettier config
TypeScript base config
architecture boundary rules
commitlint config
shared CI actions
Contract lint rules
```

该共享配置属于开发工具，不属于 Nireco 产品运行时拆包。任何规则变化必须同时在 Nireco 和 Comet 的兼容性测试仓库上通过后才能发布。

两个仓库不得长期复制粘贴并独立演进同名 lint 规则。若暂时复制配置，必须由 CI 比较规范版本和配置 hash，直到共享基线可用。

---

## 5. TypeScript 编译标准

### 5.1 严格模式

所有手写 TypeScript 必须在严格模式下通过。基础配置至少包含：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true
  }
}
```

### 5.2 平台 lib 隔离

`base/` 和 `model/` 的 TypeScript 配置不得包含 DOM 类型。浏览器类型只允许出现在：

```text
editor/browser
platform/browser
browser tests
```

Node 类型只允许出现在 Node/CLI/构建/服务端模块。若一个文件同时需要 DOM 和 Node 类型，通常表示平台边界设计错误。

### 5.3 禁止 `any`

手写代码不得使用显式或隐式 `any`。

正确做法：

```ts
function parsePayload(value: unknown): ParseResult<Payload> {
  // Narrow and validate here.
}
```

禁止：

```ts
function parsePayload(value: any): Payload;
```

第三方类型确实错误时，必须在最小适配文件中隔离，并附 Issue 或 ADR。不得让 `any` 扩散到领域代码。

### 5.4 类型断言

允许断言的主要位置：

- 已完成运行时校验后的 brand 构造器；
- 浏览器 API 类型缺陷的最小适配层；
- 测试中构造故意非法输入。

禁止：

```ts
value as unknown as TargetType
```

禁止使用断言掩盖未处理的 `undefined`、协议不兼容或不完整分支。

### 5.5 非空断言

`!` 默认禁止。确有由结构不变量保证的场景时，应优先使用 `invariant()`，使失败带有明确错误和调试信息。

```ts
const node = snapshot.nodes.get(nodeId);
invariant(node !== undefined, 'Expected validated node to exist', { nodeId });
```

### 5.6 `interface` 与 `type`

- 对外可实现的有状态的 service/runtime contract 使用 `interface`；
- discriminated union、brand、函数类型和组合类型使用 `type`；
- 纯数据 DTO 可以使用 `interface`，但不得依赖 declaration merging；
- 不得仅因个人偏好在同一类别中混用。

### 5.7 `I` 前缀规则

只对具有运行时行为、生命周期或多实现的接口使用 `I` 前缀：

```ts
interface INirecoModel {}
interface IDocumentAuthority {}
interface IStorageAdapter {}
```

纯数据类型不使用：

```ts
interface DocumentRef {}
interface Revision {}
interface Transaction {}
```

禁止创建 `IUserData`、`IRevisionRecord` 这类纯 DTO 前缀。

### 5.8 可变性

公共和领域数据默认 `readonly`：

```ts
interface Transaction {
  readonly id: TransactionId;
  readonly baseRevisionId: RevisionId;
  readonly operations: readonly Operation[];
}
```

允许的可变对象必须满足至少一个条件：

- 是封装生命周期的运行时对象；
- 是不逃逸的局部 builder；
- 是性能热点中经过 benchmark 证明的内部实现。

可变 builder 必须以 `Mutable*` 或 `*Builder` 命名，并不得从公共 API 返回。

### 5.9 集合

- 公共 API 返回 `readonly T[]`、`ReadonlyMap` 或领域只读视图；
- 序列化 Contract 不得使用 `Map`、`Set`；
- 需要稳定顺序时必须显式排序，不得依赖普通对象或哈希表的偶然遍历顺序；
- 不得直接向调用者暴露内部数组引用。

### 5.10 `null` 与 `undefined`

- TypeScript 内部使用字段缺失/`undefined` 表示“未提供”；
- 跨 JSON 边界不传输 `undefined`；
- `null` 只在业务上需要表达“明确为空”时使用；
- 可选字段与可空字段不得混为一谈。

```ts
interface DocumentMetadata {
  readonly subtitle?: string; // Not provided.
  readonly archivedAt: IsoTimestamp | null; // Explicitly not archived.
}
```

### 5.11 数字与时间

- 不得使用裸 `number` 表达 Revision、offset、duration、byte length 等易混淆概念；
- 必须使用 brand 或字段名明确单位；
- 公共时间戳使用 UTC ISO 8601 字符串品牌类型；
- duration 字段名必须包含单位，例如 `timeoutMs`；
- 公共协议不得传输 `Date` 对象；
- 大于 JavaScript 安全整数范围的值使用十进制字符串。

### 5.12 函数写法

- 导出的具名函数优先使用 function declaration；
- 内联回调使用 arrow function；
- 超过两个同类位置参数或含多个布尔参数时使用 options object；
- 不得使用布尔位置参数表达模式；
- 默认使用 `const`，只有确实需要重新赋值时使用 `let`；
- 禁止 `var`；
- 禁止嵌套三元表达式；
- 默认值需要区分空字符串、`0` 和 `false` 时使用 `??`，不得误用 `||`；
- 热路径可以使用清晰的 `for` 循环，不强制为了函数式外观创建额外数组。

```ts
// 禁止。
openDocument(uri, true, false);

// 正确。
openDocument({
  uri,
  readOnly: true,
  recoverUnsavedChanges: false,
});
```

### 5.13 ESM、导出与枚举

- 生产源码使用 ESM；
- 禁止 CommonJS `require()` 和 `module.exports`，构建适配文件除外；
- 默认使用 named export；
- default export 只允许配置文件、框架约定入口或第三方互操作层；
- 禁止 TypeScript `enum` 和 `const enum` 进入公共 API/Contract；
- 默认使用 string literal union 或 `as const` 对象；
- 对常量对象做形状校验时优先使用 `satisfies`，不要用宽泛 `as`。

```ts
const proposalStates = {
  Draft: 'draft',
  Validated: 'validated',
  NeedsReview: 'needs-review',
} as const satisfies Record<string, ProposalState>;
```

### 5.14 控制流与复杂度

- 优先使用 guard clause 减少深层嵌套；
- 单个函数的 cyclomatic complexity 默认不得超过 12；
- 超过阈值需要拆分状态或提取具名步骤，算法型代码可在评审中说明例外；
- switch 不得隐式 fallthrough；
- 不得使用 truthy/falsy 判断混淆 `0`、空字符串和缺失值；
- 仅为缩短代码而压缩多步状态转换是不允许的。

### 5.15 class 使用

适合使用 class：

- Workspace；
- Model；
- Editor View；
- Disposable resource；
- 有状态的 registry/adapter。

不适合使用 class：

- Operation；
- Transaction；
- Revision DTO；
- 纯验证器；
- 纯转换函数。

class 不得通过 getter 执行 I/O、分配大量对象或修改状态。

---

## 6. 命名规范

### 6.1 通用标识符

| 对象 | 规范 | 示例 |
|---|---|---|
| 类型、class、interface | `PascalCase` | `SemanticPosition` |
| 函数、变量、方法 | `camelCase` | `applyTransaction` |
| 常量 | 只对真正静态常量使用 `UPPER_SNAKE_CASE` | `MAX_INLINE_DEPTH` |
| 文件/目录 | `kebab-case` | `position-map.ts` |
| Rust 模块/函数 | `snake_case` | `apply_transaction` |
| 错误码 | `UPPER_SNAKE_CASE` | `BASE_REVISION_MISMATCH` |
| Tool 名称 | 点分层级小写 | `comet.proposal.preview` |

### 6.2 缩写

缩写在标识符中按普通单词处理：

```text
Uri, Id, Html, Json, Http, Utf16, Sha256, Wasm
```

推荐：

```ts
ResourceUri
proposalId
parseJson
utf16Offset
```

不推荐：

```ts
ResourceURI
proposalID
parseJSONData
UTF16Offset
```

对外已有协议字段一旦冻结，不得仅为风格调整破坏兼容。

### 6.3 后缀语义

统一使用：

- `*Id`：不透明身份；
- `*Ref`：带资源或版本上下文的引用；
- `*Uri`：规范资源 URI；
- `*Request`：服务输入；
- `*Result`：成功结果；
- `*Options`：本地调用选项；
- `*Config`：长期配置；
- `*Event`：已发生事件负载；
- `*Error`：机器可处理错误；
- `*Service`：领域应用服务；
- `*Provider`：可替换能力来源；
- `*Adapter`：不同协议或系统之间的转换；
- `*Registry`：身份到运行时对象的映射；
- `*Builder`：局部可变构建器；
- `*Snapshot`：不可变状态快照。

### 6.4 布尔值

布尔变量和属性必须使用可读前缀：

```text
is, has, can, should, allow, enable, require
```

禁止含糊命名：

```ts
const flag = true;
const active = false;
```

使用：

```ts
const isReadOnly = true;
const requiresVerifiedEvidence = false;
```

### 6.5 Discriminator

序列化联合类型默认使用 `type`：

```ts
type Operation =
  | { readonly type: 'insert-node'; ... }
  | { readonly type: 'delete-node'; ... };
```

`kind` 用于对象内部的语义分类，而不是决定整个数据结构形状：

```ts
interface Actor {
  readonly id: ActorId;
  readonly kind: 'human' | 'agent' | 'system';
}
```

### 6.6 命令与事件

命令使用动词短语：

```text
proposal.openReview
citation.insert
editor.toggleBold
```

事件使用已发生语义：

```text
onDidApplyTransaction
onDidChangeSelection
onDidFlushDurableState
```

不得使用含糊的 `onChange` 表示多个不同状态变化。

---

## 7. Import 与依赖写法

### 7.1 `import type`

纯类型依赖必须使用 `import type`：

```ts
import type { RevisionId, Transaction } from '../model/types.js';
```

### 7.2 Import 分组

按以下分组，并由 lint 自动排序：

1. 必要的 side-effect import；
2. 标准库/平台；
3. 外部依赖；
4. 仓库绝对内部模块；
5. 相对模块；
6. 样式或静态资源。

组之间空一行。

### 7.3 Side-effect import

Side-effect import 必须非常少，并在模块名或注释中表明目的：

```ts
import './register-default-features.js';
```

不得通过导入顺序隐式建立核心服务依赖。

### 7.4 路径边界

- 同一小模块内可以使用相对路径；
- 跨顶级模块使用受控内部 alias；
- 禁止穿越另一个模块的 `internal/`、`private/` 目录；
- 禁止从 `dist/`、生成产物或测试辅助目录导入生产代码；
- 禁止深度导入外部包未声明的内部路径。

### 7.5 循环依赖

生产代码不得存在循环依赖。CI 必须进行循环依赖检测。

发现循环时应：

1. 提取真正的下层类型；
2. 反转依赖为接口；
3. 移动 Composition Root；
4. 删除不必要的 barrel。

不得通过动态 import 掩盖同步核心循环。

---

## 8. 公共 API 与契约设计

### 8.1 默认不公开

只有从正式 entrypoint 显式导出的符号才是公共 API。新增导出必须回答：

- 谁是调用者；
- 兼容承诺是什么；
- 是否可序列化；
- 是否泄露内部实现；
- 如何演进或弃用；
- 是否需要 Comet Contract 版本变更。

### 8.2 参数对象

公共方法除简单 getter 外，默认使用 request/options object：

```ts
interface OpenModelRequest {
  readonly uri: ResourceUri;
  readonly authorityMode: 'read-write' | 'read-only';
}

function openModel(request: OpenModelRequest): Promise<INirecoModel>;
```

这允许向后兼容地增加可选字段，也避免位置参数误用。

### 8.3 可序列化边界

跨仓、跨进程、Worker、WASM 或存储边界中的类型不得包含：

- class instance；
- function；
- DOM node；
- `Map`/`Set`；
- `Date`；
- `Error` instance；
- Symbol；
- circular reference；
- `undefined` 字段；
- 非有限数字。

### 8.4 Discriminated Union 优先

禁止用多个可选字段模拟互斥状态：

```ts
// 禁止。
interface MappingResult {
  readonly position?: SemanticPosition;
  readonly deleted?: boolean;
  readonly conflicted?: boolean;
}

// 正确。
type MappingResult =
  | { readonly type: 'mapped'; readonly position: SemanticPosition }
  | { readonly type: 'deleted' }
  | { readonly type: 'conflicted'; readonly conflict: MappingConflict };
```

### 8.5 兼容演进

- Public API 和 Contract 必须遵守 SemVer；
- 0.x 仍然需要明确 breaking change；
- 删除字段前必须有弃用期或重大版本；
- 新增 required field 是 breaking change；
- 改变字段语义即使类型不变也属于 breaking change；
- Contract Capability 必须可协商；
- 不得通过服务器端静默改变同版本语义。

### 8.6 弃用

弃用 API 必须包含：

```ts
/**
 * @deprecated Use `createProposalReview()` instead.
 * Removal target: contract 1.0.
 */
```

并提供迁移路径。禁止无替代方案地大面积弃用。

### 8.7 API 文档

公共 API 必须说明：

- 作用对象和 Revision 语义；
- 是否同步或异步；
- 错误；
- 幂等性；
- 是否产生持久化；
- cancellation；
- 生命周期和 dispose 责任；
- 线程/Authority 限制。

---

## 9. Nireco Core 编码规则

### 9.1 核心公式

所有 Core 代码必须围绕：

```text
Resource URI + Revision + Semantic Position + Transaction
```

任何异步操作、Proposal、持久化引用和 Comet 调用都不得只依赖当前 Editor Selection 或裸 `documentId`。

### 9.2 Brand 类型

核心身份不得使用可互换裸字符串：

```ts
declare const brand: unique symbol;

type Brand<T, TName extends string> = T & {
  readonly [brand]: TName;
};

type ResourceUri = Brand<string, 'ResourceUri'>;
type RevisionId = Brand<string, 'RevisionId'>;
type NodeId = Brand<string, 'NodeId'>;
```

Brand 只能由边界 parser/factory 创建。

### 9.3 URI

- URI 必须在进入 Model Registry 前 canonicalize；
- URI 比较只比较 canonical form；
- 不得通过字符串拼接构造 URI；
- 不得把标题、路径或用户可变名称作为规范身份；
- 文件路径和数据库主键不得替代 Resource URI。

### 9.4 Revision-bound 操作

所有可能跨时间执行的读取和写入必须显式绑定 Revision：

```ts
interface RequiredDocumentRef {
  readonly uri: ResourceUri;
  readonly revisionId: RevisionId;
}
```

仅面向当前 UI 的即时 getter 可以省略 Revision；一旦结果进入任务、缓存、异步队列、Proposal 或跨进程调用，就必须固定 Revision。

### 9.5 Snapshot 不可变

外部获得的 Snapshot 必须不可变。不得直接修改节点对象：

```ts
// 禁止。
node.attrs.level = 2;

// 正确。
const transaction = createTransaction({
  baseRevisionId,
  operations: [setNodeAttribute(...)],
});
```

### 9.6 Reducer 纯度

Operation reducer 必须：

- 同步；
- 无 I/O；
- 无 clock/random；
- 无日志副作用；
- 无 DOM；
- 无网络；
- 不调用 Agent；
- 不修改输入 Snapshot；
- 对相同输入产生相同输出。

### 9.7 Transaction 原子性

Transaction 内任一 Operation 或 precondition 失败时，整个 Transaction 不得产生部分提交。

不得在 reducer 中捕获错误后继续应用后续 Operation。

### 9.8 Exhaustive handling

所有 Operation、Position、MappingResult 和 ProposalState 的 switch 必须穷尽：

```ts
function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${String(value)}`);
}

switch (operation.type) {
  case 'insert-node':
    return applyInsertNode(snapshot, operation);
  case 'delete-node':
    return applyDeleteNode(snapshot, operation);
  default:
    return assertNever(operation);
}
```

CI 必须禁止非穷尽 switch 通过宽泛 default 被静默吞掉。

### 9.9 ID、Clock 与 Hash 注入

Core 不得直接调用：

```ts
Date.now();
new Date();
Math.random();
crypto.randomUUID();
```

必须使用 Workspace 注入的：

```ts
IClock
IIdAllocator
IContentHasher
```

### 9.10 Position 与 Unicode

- 协议 offset 必须明确为 `utf16Offset`；
- 光标移动、删除和 Selection 扩展必须按 grapheme cluster；
- 不得将 UTF-8 byte offset 直接写入 TS Contract；
- 不得在编辑时隐式做 NFC/NFD 归一化；
- 所有位置计算必须经过 Position/Mapping 模块，不得在 Feature 中自行实现第二套 offset 算法。

### 9.11 Selection 所有权

Selection 属于具体 Editor View，不属于 Model。Model Transaction 不得隐式读取“当前 Selection”。

需要恢复 Selection 时，必须把 View-side metadata 与 Transaction/Undo Group 关联，而不是写入 Canonical Snapshot。

### 9.12 Derived data

Outline、Bibliography、Diagnostics、Search Index 和 Semantic Diff 必须声明 `basedOnRevisionId`。

缓存 key 必须至少包含：

```text
Resource URI + Revision + Algorithm/Schema Version
```

不得将旧 Revision 的派生结果冒充当前结果。

---

## 10. Operation、Transaction 与 Proposal 风格

### 10.1 Operation 必须小而确定

Operation 表达最小稳定状态变换，不表达 UI 命令、Agent 意图或网络流程。

```ts
type Operation =
  | InsertNodeOperation
  | DeleteNodeOperation
  | ReplaceTextOperation
  | SetNodeAttributeOperation;
```

Operation 不得包含：

- callback；
- DOM Range；
- function；
- 当前时间；
- 随机 ID 生成逻辑；
- 未解析的模型文本指令。

### 10.2 Transaction 不等于 Command

```text
Command       用户/产品意图
SemanticEdit  Comet 高层编辑意图
Transaction   Kernel 原子状态转换
```

不得让 Command 或 Agent Tool 直接成为 Transaction Union 的 variant。

### 10.3 Preconditions

对 stale state、内容 hash、节点存在性或 schema 条件的要求必须显式放入 precondition，不得依赖调用前的“刚检查过”。

### 10.4 Proposal Revision

每次修改 Proposal 必须提交 `expectedProposalRevision`。服务必须在版本不匹配时返回可机器处理冲突，不得 last-write-wins。

### 10.5 Semantic Diff

Semantic Diff 是正式数据模型。生成代码必须：

- 绑定 document Revision 和 proposal Revision；
- 产生稳定的 Group ID；
- 显式表达依赖；
- 区分结构移动与删除+插入；
- 保留 Citation/Evidence 变化；
- 不依赖 UI 文本生成 Group identity。

### 10.6 部分接受

部分接受必须计算依赖闭包。不得接受一个正文变化却留下无效 Citation、孤立 Evidence Link 或损坏的结构关系。

---

## 11. 错误处理

### 11.1 禁止字符串错误协议

不得通过错误消息文本判断恢复方式：

```ts
// 禁止。
if (error.message.includes('revision')) { ... }
```

必须使用 typed error code/category。

### 11.2 Expected failure 与 exception

纯领域和 Kernel 层：

- 验证失败；
- precondition 失败；
- stale revision；
- position conflict；
- schema invalid；

属于预期结果，必须返回 `Result`/discriminated union，不使用异常控制正常流程。

基础设施层：

- 磁盘损坏；
- 网络断开；
- 权限拒绝；
- 未预期第三方失败；

可以抛出或 reject，但进入公共边界前必须转换为 `NirecoError`/`CometError`。

### 11.3 统一 Error 结构

```ts
interface NirecoError {
  readonly code: NirecoErrorCode;
  readonly category:
    | 'validation'
    | 'conflict'
    | 'permission'
    | 'compatibility'
    | 'storage'
    | 'transport'
    | 'internal';
  readonly retryable: boolean;
  readonly safeMessage: string;
  readonly debugId: DebugId;
  readonly suggestedAction?:
    | 'retry'
    | 'reread'
    | 'rebase'
    | 'request-permission'
    | 'user-review'
    | 'abort';
}
```

`safeMessage` 可以展示给用户或跨边界传输，不得包含正文、Prompt、密钥或完整路径。

### 11.4 `catch`

`catch` 必须至少执行以下之一：

- 恢复；
- 转换成更有语义的错误；
- 增加可操作上下文后重新抛出；
- 在任务边界记录并终止。

禁止空 catch、只 `console.log` 后继续、或返回伪成功。

### 11.5 Assertion

`invariant()` 用于程序员错误和已验证不变量。用户输入错误不得触发 assertion crash，而应返回 validation error。

### 11.6 错误上下文

错误上下文应包含 ID、Revision、operation type 等低敏信息。不得默认附带完整文档内容、Evidence excerpt 或模型上下文。

---

## 12. 异步、并发与取消

### 12.1 禁止 floating Promise

所有 Promise 必须被：

- `await`；
- `return`；
- 显式交给受控任务管理器；
- 或使用带错误处理的 `void` helper。

禁止无说明地：

```ts
saveDocument();
```

### 12.2 Core reducer 不得 async

Operation/Transaction reducer 必须同步。I/O 在 reducer 前后由 Authority/Service 管理。

### 12.3 Model 串行写入

同一 Model 的主分支 Transaction 必须串行提交。不得通过多个并发 Promise 直接修改共享状态。

### 12.4 不跨 `await` 持有锁

若实现使用 mutex/lease，必须在 I/O 前释放，或使用明确的队列/lease 协议。不得跨任意外部 await 持有内存锁。

### 12.5 Cancellation

长时间操作必须接受 CancellationToken 或 AbortSignal。取消语义必须说明：

- 提交点之前：可以终止且无状态变化；
- 提交点之后：不能假装已撤销，只能取消后续派生工作；
- 部分外部副作用：必须进入可恢复状态。

### 12.6 Timeout

Timeout 必须由调用层明确设置，不得在深层库中隐藏默认超时。字段使用 `timeoutMs`。

### 12.7 并发限制

批量 Source、Evidence、导入或网络调用必须使用有界并发。不得对用户规模数据无条件 `Promise.all()`。

### 12.8 幂等

可能因重试而重复到达的写操作必须具有 `idempotencyKey` 或等价机制。相同 key 和相同输入必须返回同一逻辑结果；相同 key 与不同输入必须失败。

---

## 13. 生命周期、事件与资源释放

### 13.1 Disposable

所有以下资源必须可释放：

- Editor；
- Model subscription；
- DOM event listener；
- Worker；
- Transport；
- File watch；
- Provider registration；
- Timer；
- Agent task subscription。

统一使用 `Disposable`/`DisposableStore` 模式。

### 13.2 `dispose()` 幂等

`dispose()` 必须可重复调用，第二次调用不得再次产生副作用或抛出无意义错误。

### 13.3 事件顺序

事件必须在状态成功提交后发布。Reducer 执行期间不得调用外部 listener。

推荐顺序：

```text
apply transaction
→ update in-memory model
→ create revision
→ publish model event
→ schedule render/derived work
→ persist/flush event
```

### 13.4 禁止重入修改

listener 中发起的新 Transaction 必须进入下一队列轮次，不得在当前提交栈中重入 reducer。

### 13.5 Event payload

事件负载必须只读、revision-bound，并包含足够身份信息：

```ts
interface ModelTransactionAppliedEvent {
  readonly uri: ResourceUri;
  readonly previousRevisionId: RevisionId;
  readonly revisionId: RevisionId;
  readonly transactionId: TransactionId;
}
```

### 13.6 Editor 与 Model 生命周期

必须区分：

```text
editor.dispose()     销毁 View
model.dispose()      从 Workspace 卸载 Model
deleteResource()     删除持久化资源
```

任何一个操作不得隐式执行另一个操作。

---

## 14. Browser、DOM 与 UI 代码

### 14.1 DOM 不是事实来源

DOM 仅是 Snapshot 的投影。持久化、Agent、Undo 和验证不得读取 DOM 作为权威文档状态。

### 14.2 DOM 访问边界

直接 DOM API 只允许位于：

```text
editor/browser
platform/browser
browser-specific tests
```

`model/`、`academic/` 和 Contract DTO 不得引用 `Node`、`Range`、`Selection`、`HTMLElement`。

### 14.3 输入状态机

`beforeinput`、composition、selectionchange、clipboard 和 drag/drop 必须通过集中状态机处理。Feature 不得各自监听并解释同一组输入事件。

### 14.4 IME

- 一次 composition 默认形成一个 Undo Group；
- composition 期间不得破坏浏览器正在维护的 composing text；
- 禁止只针对英语键盘路径实现编辑行为；
- 中文、日文、韩文输入必须进入浏览器矩阵。

### 14.5 Selection

- DOM Selection 与 Semantic Selection 的转换集中实现；
- 不得把 DOM Range 长期保存到异步任务；
- 渲染后 Selection 恢复必须使用 Semantic Position/Anchor；
- Bidi、atom node 前后位置和 grapheme boundary 必须有测试。

### 14.6 `innerHTML`

默认禁止直接赋值 `innerHTML`。需要渲染经过验证的导入 HTML 时，必须使用集中 sanitizer/Trusted Types 边界，并有安全测试。

禁止：

```ts
element.innerHTML = userContent;
```

### 14.7 CSS

Nireco 样式必须：

- 使用 `--nireco-*` 命名公共 CSS custom property；
- 避免污染宿主全局；
- 使用 logical properties 支持 RTL；
- 使用统一 z-index layer token；
- 支持 `prefers-reduced-motion`；
- 支持 forced-colors/high contrast；
- 不使用未说明的 `!important`；
- 不依赖宿主全局 reset 才能正确工作。

### 14.8 可访问性

交互组件必须具有：

- 键盘路径；
- 清晰焦点；
- 正确 role/name/state；
- 屏幕阅读器可理解文本；
- 不仅依赖颜色表达状态；
- Proposal Diff 的插入、删除、Citation 和 Evidence 语义提示。

### 14.9 UI 文案

- Core 错误码不直接作为用户文案；
- 产品文案在 Comet 本地化层；
- Nireco 可提供中性的 message key 和结构化参数；
- 不得在业务逻辑中拼接本地化句子。

---

## 15. Command、Feature 与 Provider

### 15.1 Command

Command 表达用户或产品意图，必须声明：

- ID；
- 可执行条件；
- 输入类型；
- 可能产生的 Transaction/Proposal；
- Undo Group；
- 是否需要 Editor Selection；
- 权限要求。

Command 不得绕过 Model API 修改内部状态。

### 15.2 Feature

Feature 是源码组织和组合单位，不是默认独立 package。Feature 可以贡献：

- command；
- view；
- decoration；
- keybinding；
- panel；
- provider；
- diagnostic presentation。

Feature 不得定义第二套：

- document model；
- position model；
- history；
- transaction；
- authority。

### 15.3 Provider

Provider 必须：

- 可注册和 dispose；
- 有明确优先级或选择规则；
- 支持 cancellation；
- 返回 revision-bound 结果；
- 不偷偷写入 Model；
- 不在调用者未知的情况下访问网络。

### 15.4 Feature Flag

Feature Flag 必须在中心 registry 定义，具有：

- typed key；
- 默认值；
- owner；
- 创建原因；
- 移除条件或日期。

不得在业务代码中散落环境变量判断。

---

## 16. Nireco–Comet Contract 编码规范

### 16.1 Schema-first

跨仓契约的事实来源是版本化 Schema/Manifest，不是任一仓库手写 TypeScript interface。

流程必须是：

```text
Contract Schema
→ Generated TypeScript/Rust Types
→ Mock and Golden Fixtures
→ Adapter
→ Conformance
```

生成类型不得手工修改。

### 16.2 Resource identity

所有跨仓文档操作必须使用：

```ts
interface RequiredDocumentRef {
  readonly uri: ResourceUri;
  readonly revisionId: RevisionId;
}
```

不得只传 `documentId`、Editor ID 或活动 Tab。

### 16.3 Revision consistency

一次 Task Session 的读取默认固定在同一 Base Revision。不同 Revision 的 Outline、Nodes、Diagnostics 和 Evidence Link 不得被无提示拼接。

### 16.4 Capability negotiation

握手必须协商：

- Contract version；
- capability；
- semantic edit version；
- schema version；
- limits；
- transport features。

调用方不得仅根据服务版本字符串猜测能力。

### 16.5 Pagination

分页结果必须包含：

```ts
interface PageResult<T> {
  readonly items: readonly T[];
  readonly nextCursor?: Cursor;
  readonly truncated: boolean;
  readonly basedOnRevisionId: RevisionId;
  readonly approximateBytes: number;
}
```

不得静默截断。

### 16.6 Contract error

Contract Error 必须是稳定机器码，并提供 `suggestedAction`。Adapter 不得把 transport exception 直接暴露给 Agent Tool。

### 16.7 Golden fixtures

Golden Fixture 必须：

- canonical serialize；
- 标记 contract/schema 版本；
- 包含 expected hash；
- 由双方 CI 消费；
- 修改时要求 Contract DRI 审阅。

---

## 17. Comet Private Agent Tool 编码规范

### 17.1 Tool 属于 Comet

Tool 名称、描述、模型输入 Schema、Prompt 和执行器只存在于 Comet。Nireco 只提供确定性 Service/Contract。

### 17.2 Tool 命名

格式：

```text
comet.<domain>.<action>
```

示例：

```text
comet.document.inspect
comet.manuscript.propose_rewrite
comet.citations.propose_supported_citation
comet.proposal.submit_for_review
```

Tool 名称一旦进入评估数据集，不得随意重命名；需要版本迁移时保留明确映射。

### 17.3 模型输入与可信 Envelope 分离

模型只能生成业务参数。以下字段必须由可信 Orchestrator/Executor 注入，模型不得覆盖：

```text
taskId
traceId
sessionId
document URI
baseRevisionId
proposalId
expectedProposalRevision
policySnapshotId
capabilityGrantId
actorId
modelId
idempotencyKey
```

代码结构必须体现分离：

```ts
interface ModelToolInput {
  readonly target: SemanticTargetRef;
  readonly replacement: StructuredContent;
  readonly rationale?: string;
}

interface TrustedToolContext {
  readonly taskId: TaskId;
  readonly document: RequiredDocumentRef;
  readonly capabilityGrantId: CapabilityGrantId;
  readonly policySnapshotId: PolicySnapshotId;
}
```

不得把两者合并成一个由模型完整填写的 JSON Schema。

### 17.4 Tool Executor

Tool Executor 必须按顺序执行：

```text
Resolve trusted task state
→ Validate tool input
→ Verify capability and scope
→ Check idempotency
→ Call Comet Adapter/Nireco Service
→ Map typed result/error
→ Append audit event
→ Return model-safe result
```

### 17.5 禁止 Raw 写入 Tool

以下 Tool 永远不得提供给模型：

```text
commit
apply_raw_transaction
execute_javascript
set_html
write_database
accept_proposal
merge_revision
```

Comet Agent 只能创建、修改、预览、rebase 和提交 Proposal 供用户审阅。

### 17.6 Tool 粒度

模型 Tool 应表达学术/写作语义，而不是 offset-level 操作。

正确：

```text
propose_rewrite
propose_supported_citation
find_unsupported_claims
```

禁止：

```text
insert_text_at_offset
set_node_attr
apply_operation_array
```

### 17.7 Source、Evidence 与 Citation

代码必须强制以下流程：

```text
Source discovery
→ Source import/read
→ Evidence proposal and trusted verification
→ Reference/Evidence identity
→ Supported Citation proposal
```

搜索结果或 metadata-only 记录不得直接标记为 verified Citation。

模型提出 excerpt/locator 后，可信执行层必须重新读取 Source，计算 hash，并验证 locator。

### 17.8 Tool 结果最小化

Tool 返回给模型的内容应满足任务所需最小化。默认不得返回：

- 完整文档；
- 完整 PDF；
- 原始权限对象；
- 内部数据库结构；
- 安全调试栈；
- 其他用户数据。

### 17.9 Tool 评估

每个生产 Tool 必须具有：

- 成功 Golden Trace；
- 权限拒绝用例；
- stale revision 用例；
- invalid evidence 用例；
- idempotent retry 用例；
- Prompt injection 来源文本用例；
- token/response size 预算。

---

## 18. 序列化、Canonical 数据与 Hash

### 18.1 Canonical JSON

所有需要 hash、签名、Golden Fixture 或跨语言一致性的 JSON 必须使用统一 Canonical Encoder。不得依赖普通 `JSON.stringify()` 的偶然对象构造顺序作为长期协议。

### 18.2 Hash 算法

- 内容完整性默认使用 SHA-256；
- Revision ID、Transaction ID 和 Content Hash 是不同概念；
- Hash 输入必须明确版本和字段集合；
- volatile metadata 不进入文档内容 hash；
- asset 使用内容寻址 hash；
- Hash 字符串必须包含算法前缀，例如 `sha256:`。

### 18.3 JSON 字段

- 字段名使用 `camelCase`；
- 不输出 `undefined`；
- 对象字段顺序由 canonical encoder 决定；
- array 顺序具有业务语义，除非 Schema 明确表示 set；
- 非有限 number 禁止；
- 二进制数据不得 base64 内嵌到普通高频 Contract，使用 asset/resource reference。

### 18.4 Forward compatibility

未知字段的行为必须由每个 Schema 指定：

- strict reject；
- preserve round-trip；
- ignore with diagnostic。

不得由不同调用方自行猜测。

### 18.5 Migration

Migration 必须：

- 显式声明 from/to version；
- 可重复执行或检测已执行；
- 不依赖当前时间/网络；
- 产生 migration report；
- 保留原始备份；
- 有 Golden Fixture 和 downgrade/rollback 策略说明。

---

## 19. Rust 与 WASM 规范

### 19.1 使用边界

Rust/WASM 适用于：

- codec；
- validation；
- migration；
- diff/indexing；
- snapshot compression；
- 批量 Source/文档处理。

普通按键、DOM Selection、composition 和同步渲染路径不得为了语言统一而跨 WASM 边界。

### 19.2 Rust 格式与 lint

- `cargo fmt --check` 必须通过；
- `cargo clippy --all-targets --all-features -- -D warnings` 必须通过；
- crate 默认 `#![forbid(unsafe_code)]`；
- 任何允许 unsafe 的 crate/module 必须有 ADR、`SAFETY` 注释和专门评审。

### 19.3 Panic

生产库代码不得使用无说明的：

```rust
unwrap()
expect("failed")
unreachable!()
todo!()
```

`expect` 只允许用于由结构不变量保证的不可达情况，消息必须说明不变量。跨 FFI/WASM 边界不得传播 panic。

### 19.4 Error

使用具名 error enum 和稳定 code。不得只返回自由文本字符串。Error 到 TypeScript Contract 的映射必须有 Conformance Test。

### 19.5 Serialization

Rust 序列化必须匹配 Contract：

- `camelCase` fields；
- tagged union 使用 `type`；
- 不向协议暴露 `usize`；
- UTF-16 offset 必须显式转换和验证；
- 不依赖 Rust HashMap 遍历顺序生成 canonical output。

### 19.6 Determinism

Rust Core 同样不得直接读取系统时间和随机源。使用注入值或输入参数。

### 19.7 WASM 边界

- 使用粗粒度批处理调用；
- 不为每次 keystroke 创建大量 JS/Rust 往返；
- 输入输出必须版本化；
- 大二进制优先使用 `Uint8Array`/buffer transfer；
- 失败必须转换为 typed result，不抛出不可解析的 JS string。

---

## 20. 日志、指标与隐私

### 20.1 结构化日志

生产代码不得直接使用 `console.log`。使用注入的 structured logger：

```ts
logger.info('proposal.validated', {
  proposalId,
  documentUriHash,
  proposalRevision,
  diagnosticCount,
});
```

### 20.2 日志级别

- `debug`：开发诊断，生产默认关闭；
- `info`：关键生命周期和状态转换；
- `warn`：可恢复异常或降级；
- `error`：任务/操作失败，需要调查；
- `fatal`：Authority、数据完整性或进程级失败。

不得把正常 validation failure 全部记录为 error。

### 20.3 禁止记录的数据

默认禁止记录：

- 完整文稿文本；
- Prompt/response 全文；
- Evidence excerpt；
- PDF 内容；
- API key/token；
- 本地完整路径；
- 用户输入的敏感元数据。

需要调试内容时，必须经过明确开发开关、脱敏和保留期限控制。

### 20.4 Trace

跨 Comet Tool、Adapter、Nireco Service 的请求必须携带 `traceId`、`taskId`、`toolInvocationId` 等低敏身份，用于关联而非记录内容。

### 20.5 指标命名

指标使用稳定低基数维度。不得把 URI、用户输入、错误消息或 Node ID 作为 metric label。

---

## 21. 安全编码

### 21.1 所有外部内容不可信

以下内容都必须视为不可信：

- 用户导入文档；
- HTML/Markdown/DOCX；
- PDF/Web Source；
- Comet 模型输出；
- Transport payload；
- Clipboard；
- 插件/Provider 结果；
- 持久化文件。

### 21.2 Prompt injection 隔离

Source 文本只属于 Evidence/Data，不得成为 Agent 权限或系统指令。代码结构必须区分：

```text
Trusted Instructions / Policy
Untrusted Source Content
Model-generated Arguments
Trusted Execution Context
```

### 21.3 权限

权限检查必须在可信执行层完成。模型输出的 capability、scope 或 document reference 不具有效力。

### 21.4 禁止动态执行

生产路径禁止：

```text
eval
new Function
动态执行来源代码
任意 LaTeX 宏执行
从文档加载可执行脚本
```

### 21.5 路径与资源

文件路径必须 canonicalize，并验证位于允许根目录。防止 traversal、symlink escape 和 archive bomb。

### 21.6 资源限制

解析器和导入器必须设置：

- 最大文件大小；
- 最大节点数；
- 最大深度；
- 最大解压比例；
- 最大字符串长度；
- 超时/取消；
- 内存预算。

### 21.7 Secrets

Nireco 不持有模型密钥。Comet secrets 只能由受控 secret provider 提供，不得进入文档包、日志、Contract Fixture 或前端 bundle。

---

## 22. 测试规范

### 22.1 测试金字塔

必须包含：

```text
Unit
Property-based
Fuzz
Conformance
Browser behavior
Integration
Golden trace
Fault injection
Performance benchmark
```

仅有 happy-path 单元测试不满足 Core 合并要求。

### 22.2 测试命名

测试描述使用英文并表达行为：

```ts
describe('applyTransaction', () => {
  it('rejects a transaction whose base revision is stale', () => {
    // ...
  });
});
```

禁止 `test1`、`works`、`basic test`。

### 22.3 测试位置

- 纯模块单元测试可以与源码同目录放置为 `*.test.ts`；
- 跨模块集成、浏览器、Conformance、Fuzz 和 Golden Fixture 放入仓库根 `tests/`；
- 生产源码不得 import `tests/`；
- 公共 Fixture builder 放入明确的 test-support 目录，不得进入发布 entrypoint。

### 22.4 Arrange–Act–Assert

测试应清晰分成准备、执行、断言。复杂 Fixture 使用 builder，不在每个测试内复制大段 JSON。

### 22.5 确定性

测试不得依赖：

- 当前时间；
- 随机未固定 seed；
- 外部网络；
- 测试执行顺序；
- 本机 locale/timezone；
- 任意 sleep。

使用 Fake Clock、Deterministic ID Allocator、固定 seed 和本地 Fixture。

### 22.6 禁止 sleep-based 测试

禁止：

```ts
await new Promise((resolve) => setTimeout(resolve, 1000));
```

使用事件、fake timer、poll-with-deadline 或显式 durability handle。

### 22.7 Core 必测不变量

每个 Operation/Transaction 变化至少覆盖：

- 正常应用；
- 非法 Schema；
- stale Base Revision；
- invalid position；
- normalization；
- inverse/undo；
- position mapping；
- serialization round-trip；
- deterministic hash；
- failure atomicity。

### 22.8 Property-based Testing

以下模块必须有属性测试：

- position mapping；
- transaction inverse；
- normalization idempotence；
- canonical serialization；
- rebase；
- proposal partial acceptance dependency closure；
- UTF-16/grapheme handling。

### 22.9 Fuzz

Parser、clipboard、HTML import、canonical decoder、Operation decoder 和 migration 必须接受 fuzz。Crash、hang、OOM 或非确定性输出均视为缺陷。

### 22.10 Browser matrix

浏览器测试必须覆盖项目规格定义的 Chrome、Firefox、Safari，以及中文 IME 真实/自动化验证。浏览器差异 workaround 必须有回归测试和浏览器版本说明。

### 22.11 Conformance

Mock Service 与真实 Nireco 必须通过同一套 Contract Conformance。Comet Adapter 对二者的可观察行为必须一致。

### 22.12 Coverage 门禁

建议基线：

| 区域 | 行覆盖 | 分支覆盖 | 额外要求 |
|---|---:|---:|---|
| `model/transaction/position/revision` | ≥95% | ≥90% | Property + mutation/fuzz |
| Contract/Adapter/Tool Executor | ≥90% | ≥85% | Golden Trace + Conformance |
| 一般 services/features | ≥85% | ≥80% | 集成测试 |
| Browser runtime | 不以单一覆盖率代替行为矩阵 | 不以单一覆盖率代替行为矩阵 | 浏览器/IME/Selection 测试 |

覆盖率下降必须在 PR 中说明。不得通过无意义断言或排除关键文件提高数字。

### 22.13 Snapshot test

Snapshot test 只用于稳定结构化输出。不得用巨大 snapshot 替代精确断言。Snapshot 更新必须由评审者阅读 diff。

---

## 23. 性能编码规范

### 23.1 先度量

性能优化必须有 benchmark/profile。不得用复杂缓存和可变共享状态解决未经测量的问题。

### 23.2 热路径

以下属于热路径：

- keystroke → transaction；
- position mapping；
- model → DOM patch；
- selection restore；
- incremental diagnostics；
- semantic diff recompute。

热路径不得：

- 全文 JSON stringify；
- 全量 deep clone；
- 同步网络/存储；
- 大量临时正则或对象分配；
- O(n²) 遍历而无上限。

### 23.3 算法复杂度

非显然算法必须在注释或设计文档说明复杂度和输入边界。任何可能超过 O(n log n) 的文档级算法需有 benchmark。

### 23.4 缓存

缓存必须定义：

- key；
- revision/schema/version 绑定；
- invalidation；
- size limit；
- disposal；
- stale behavior。

禁止无界 Map 缓存。

### 23.5 性能回归

关键 benchmark 必须保存基线。超过预设阈值时 CI 报警；核心输入延迟和大型文档内存回归不得无解释合并。

---

## 24. 注释、文档与 ADR

### 24.1 注释解释“为什么”

禁止重复代码字面含义：

```ts
// Increment count by one.
count += 1;
```

应该解释不变量、浏览器缺陷、协议原因或安全限制。

### 24.2 TSDoc/Rustdoc

公共 API、关键 Core 算法和非显然不变量必须有文档。文档必须与类型同步并包含必要示例。

### 24.3 TODO

TODO 必须关联 Issue：

```ts
// TODO(NIR-142): Remove the compatibility branch after schema v2 migration.
```

禁止：

```ts
// TODO: fix later
```

临时 workaround 必须说明：

- 原因；
- 影响；
- 移除条件；
- Issue。

### 24.4 ADR

以下变化必须 ADR：

- Core 类型或不变量；
- Contract breaking change；
- 模块依赖方向；
- 新 runtime dependency；
- public package 拆分；
- Authority/Storage 模型；
- Rust/WASM 进入新路径；
- 允许 unsafe；
- 放宽安全或 clean-room 规则。

### 24.5 示例可编译

公共文档中的 TypeScript 示例应进入类型检查或文档测试，避免示例长期失真。

---

## 25. 依赖、许可证与 Clean-room

### 25.1 依赖最小化

新增 runtime dependency 必须说明：

- 为什么标准库/已有工具不够；
- 维护活跃度；
- bundle/性能影响；
- 许可证；
- 安全历史；
- 替换成本；
- 是否进入 Core 热路径。

### 25.2 禁止编辑器内核依赖

Nireco 不得引入 ProseMirror、Lexical、Slate、BlockSuite、CKEditor、Textbus 等编辑器运行时或其派生内核依赖。

研究这些项目只允许形成抽象设计结论，不得复制源码、测试 Fixture、模块结构、命名体系或实现表达。

### 25.3 Lockfile 与版本

- lockfile 必须提交；
- 禁止 wildcard dependency；
- 自动更新必须通过完整 CI；
- 不得直接依赖未固定分支或个人 fork；
- 紧急 pin 必须有后续 Issue。

### 25.4 License 与 SBOM

CI 必须维护：

- 许可证 allowlist/denylist；
- SBOM；
- 依赖审计；
- 归属信息；
- 生成物来源记录。

### 25.5 Agent 生成代码

Agent 生成代码与人工代码执行完全相同的评审、测试和 clean-room 规则。

不得要求 Agent“照着某开源编辑器源码重写”。Agent 输出若包含疑似第三方源码表达，必须停止使用并重新 clean-room 实现。

---

## 26. Git、Commit 与 Branch

### 26.1 Branch 命名

推荐：

```text
feat/NIR-123-semantic-position
fix/NIR-241-ime-selection-restore
refactor/NIR-310-transaction-normalization
chore/NIR-088-contract-fixtures
```

Comet Issue 可使用 `COM-` 前缀。

### 26.2 Conventional Commit

Commit 和 PR title 使用：

```text
<type>(<scope>): <imperative summary>
```

类型：

```text
feat fix refactor perf test docs build ci chore revert
```

推荐 scope：

```text
base model transaction revision proposal editor academic contract
adapter tools agent source storage security build ci docs
```

示例：

```text
feat(transaction): add precondition validation
fix(editor): preserve selection across composition commit
refactor(contract): separate model input from trusted context
```

### 26.3 Commit 内容

- 一个 commit 应保持可构建或明确标记为仅中间步骤；
- 不得把无关格式化混入；
- 不得提交密钥、真实用户文稿、生产 PDF 或本地配置；
- 生成物只在仓库政策要求时提交；
- commit message 使用祈使语气。

### 26.4 Merge 策略

默认使用 squash merge。PR title 成为主分支 commit message。需要保留多 commit 演进的特殊 PR 应在合并前说明。

### 26.5 禁止直接推送主分支

主分支必须受保护，通过 PR、CI 和 required review 合并。紧急修复也必须有事后审阅记录。

---

## 27. Pull Request 与代码评审

### 27.1 PR 描述

PR 至少包含：

```markdown
## Problem
## Decision / Implementation
## Invariants affected
## Tests
## Compatibility / Migration
## Security / Privacy
## Performance
## Follow-ups
```

不适用项应写 `N/A`，不得完全省略关键风险。

### 27.2 PR 规模

- 必须拆分无关变化；
- 手写逻辑变化应该尽量控制在约 600 行以内；
- 超过 1,000 行手写变更必须解释为什么无法拆分；
- 生成代码、Fixture 和机械迁移应与手写逻辑分开统计。

### 27.3 Required review

- 普通模块：至少一名 owner；
- `model/transaction/position/revision`：至少两名评审，其中一名 Core DRI；
- Contract 变化：Nireco Contract DRI + Comet Contract DRI；
- Security/permission/Tool Executor：Security owner 或指定评审；
- Rust unsafe：两名相关专家和 ADR。

### 27.4 评审重点顺序

1. 是否破坏不变量；
2. 是否存在安全/数据损坏风险；
3. API/Contract 是否正确；
4. 并发、取消、错误和恢复；
5. 测试是否证明行为；
6. 可读性；
7. 机械风格。

机械风格应交给自动工具，不消耗主要评审时间。

### 27.5 Comment 处理

- 评审意见必须明确 `blocking`、`suggestion` 或 `question`；
- 争议涉及长期架构时转 ADR，而不是在 PR 评论中无限讨论；
- 不得只 resolve comment 而不回复处理方式。

### 27.6 禁止自批自合

作者不得作为唯一批准者合并自己的 PR。Bot 的成功不等于人工架构审阅。

---

## 28. CI 与合并门禁

### 28.1 每个 PR 必须通过

```text
format check
lint
architecture boundaries
TypeScript typecheck
unit tests
property tests for affected core modules
build
license/dependency audit
secret scan
generated-code consistency
```

按目录触发：

```text
browser tests
contract conformance
Rust fmt/clippy/test
WASM build
performance smoke
```

### 28.2 主分支/夜间完整 CI

- 全浏览器矩阵；
- fuzz corpus；
- fault injection；
- cross-repo Conformance；
- Golden Trace；
- benchmark regression；
- migration matrix；
- crash recovery；
- SBOM 生成。

### 28.3 自定义禁止规则

Nireco lint/architecture test 至少禁止：

```text
any
as unknown as
non-null assertion
Date.now/Math.random in Core
DOM import in model/base
console.* in production
innerHTML outside sanitizer boundary
eval/new Function
cross-layer reverse imports
internal barrel cycles
Comet imports in Nireco
raw transaction Tool in Comet
model-controlled trusted envelope fields
```

### 28.4 API/Contract diff

CI 必须检测：

- public API accidental export；
- Contract Schema breaking change；
- generated types drift；
- capability manifest drift；
- Fixture hash drift。

Breaking change 没有版本提升和 changelog 时不得合并。

### 28.5 Flaky test

不得通过自动重跑长期隐藏 flaky test。发现 flaky 后必须：

- 建 Issue；
- 标记 owner；
- 最短时间修复；
- 若临时 quarantine，必须设到期时间。

---

## 29. Generated Code

### 29.1 标记

生成文件顶部必须包含：

```text
GENERATED FILE — DO NOT EDIT.
Source: <schema or generator>
Generator version: <version>
```

### 29.2 不手改

任何生成代码变更必须通过修改源 Schema/生成器完成。CI 必须重新生成并验证工作区无 diff。

### 29.3 生成代码隔离

生成代码放入明确 `generated/` 目录，不与手写逻辑混杂。手写 adapter 包裹生成类型，而不是直接向业务层暴露生成器细节。

### 29.4 生成器确定性

相同输入和生成器版本必须产生字节级相同输出。生成器不得写入当前时间戳造成无意义 diff。

---

## 30. Definition of Done

一项代码工作只有在以下适用项完成后才算 Done：

- 行为和不变量实现完成；
- 类型检查、lint、格式通过；
- 单元/属性/浏览器/Conformance 测试已添加；
- 错误、取消、并发和恢复路径已考虑；
- Public API/Contract 文档已更新；
- Golden Fixture/Schema/生成类型已同步；
- 性能影响已测量或说明无影响；
- 安全与隐私检查已完成；
- Migration/兼容策略已提供；
- 日志不泄露内容；
- PR 已获得所需 owner 审阅；
- 无未关联 Issue 的 TODO；
- 无临时禁用测试或 lint。

---

## 31. 规范例外

### 31.1 最小范围

Lint disable 必须限制到最小行或最小文件，并说明原因：

```ts
// eslint-disable-next-line <rule> -- Browser API typing is incorrect; see NIR-412.
```

禁止文件级或目录级 blanket disable，除非 ADR 批准。

### 31.2 例外记录

重大例外必须包含：

- 规则；
- 原因；
- 风险；
- owner；
- Issue；
- 到期/移除条件；
- 替代保护措施。

### 31.3 规范修改

修改本规范需要：

- PR；
- Nireco 与 Comet 技术负责人审阅；
- 对自动化配置的对应更新；
- 若影响核心或 Contract，附 ADR；
- 更新版本和 changelog；
- 更新依赖文档的 front matter 版本引用；
- 检查 Roadmap Gate、Contract Bundle、Fixture 和派生配置是否需要同步；
- 确认没有新增第二份权威规范副本。

---

### 31.4 跨文档同步矩阵

| 变更类型 | 必须更新 | 条件性更新 |
|---|---|---|
| Core/Schema/Transaction/Revision/Proposal 语义 | 开发规格、ADR、测试/Fixture | Roadmap、编码规范 |
| Nireco–Comet Contract | 开发规格、Contract Bundle、Changelog、Golden Trace | Roadmap、编码规范 |
| Sprint、日期、人员或阶段 | Roadmap | 开发规格（若改变 Gate 语义或范围） |
| 代码风格、lint、CI、评审或依赖规则 | 本规范、派生配置 | Roadmap（若影响 Gate） |
| 安全边界或 Agent 权限 | 开发规格、ADR、本规范、测试 | Roadmap |

CI 必须检测三份规范性文档中的版本引用是否陈旧。影响 Core 或 Contract 的 PR 在依赖文档未同步前不得合并。

---

## 32. 快速评审清单

### 32.1 TypeScript

- [ ] 无 `any`、双重断言和无理由非空断言；
- [ ] public/contract 类型只读且可序列化；
- [ ] 联合类型使用 discriminator 并穷尽；
- [ ] `null`/`undefined` 语义明确；
- [ ] 时间、offset、duration 和 ID 不使用含糊裸类型；
- [ ] 无隐藏全局状态和环境读取；
- [ ] 所有资源可 dispose；
- [ ] 所有 Promise 被处理。

### 32.2 Nireco Core

- [ ] 操作绑定 Resource URI/Base Revision；
- [ ] Reducer 同步、纯、确定；
- [ ] Snapshot 未被原地修改；
- [ ] 失败原子；
- [ ] PositionMap/Anchor/Undo 已测试；
- [ ] 未引入 DOM、clock、random、network；
- [ ] derived result 绑定 Revision。

### 32.3 Comet Tool

- [ ] Tool 属于 Comet，不渗入 Nireco；
- [ ] 模型输入与 Trusted Context 分离；
- [ ] Capability/Scope 在 Executor 重新校验；
- [ ] 没有 Raw Transaction/Commit 后门；
- [ ] Source/Evidence/Citation 流程完整；
- [ ] 结果对模型最小化；
- [ ] 具备幂等、stale revision 和权限测试；
- [ ] Audit/Trace 已记录但未泄露内容。

### 32.4 Browser

- [ ] DOM 仅为投影；
- [ ] Selection 未长期保存为 DOM Range；
- [ ] Composition/IME 路径已覆盖；
- [ ] Listener/observer/timer 已 dispose；
- [ ] 无未受控 `innerHTML`；
- [ ] 键盘和可访问性路径可用；
- [ ] CSS 未污染宿主全局。

### 32.5 PR

- [ ] 目的单一且规模可审阅；
- [ ] 不变量和兼容影响已说明；
- [ ] 测试证明行为而非实现；
- [ ] 无无关格式化；
- [ ] ADR/文档/Fixture 已同步；
- [ ] 所需跨仓 owner 已评审。

---

## 33. 推荐基础配置附录

### 33.1 TypeScript 基础配置示意

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "skipLibCheck": false,
    "noEmit": true
  }
}
```

Core、Browser、Node、Test 必须通过独立 `tsconfig` 增加各自 lib/types，不得在一个全局配置中混入所有平台类型。

### 33.2 推荐脚本

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:browser": "playwright test",
    "test:conformance": "node ./scripts/run-conformance.mjs",
    "test:fuzz": "node ./scripts/run-fuzz.mjs",
    "bench": "vitest bench",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test"
  }
}
```

具体命令可以随构建系统调整，但门禁语义不得降低。

### 33.3 推荐代码模式

```ts
export interface ApplyTransactionRequest {
  readonly document: RequiredDocumentRef;
  readonly transaction: Transaction;
}

export type ApplyTransactionResult =
  | {
      readonly type: 'applied';
      readonly revision: Revision;
      readonly positionMap: PositionMap;
    }
  | {
      readonly type: 'rejected';
      readonly error: TransactionValidationError;
    };

export function applyTransaction(
  snapshot: DocumentSnapshot,
  request: ApplyTransactionRequest,
): ApplyTransactionResult {
  const validation = validateTransaction(snapshot, request.transaction);
  if (validation.type === 'invalid') {
    return {
      type: 'rejected',
      error: validation.error,
    };
  }

  return reduceTransaction(snapshot, request.transaction);
}
```

### 33.4 禁止模式示例

```ts
// 1. 以当前 UI 隐式决定目标文档。
const model = getActiveEditor().getModel();

// 2. 用任意 JSON 和断言进入 Core。
const transaction = payload as Transaction;

// 3. Agent 直接提交底层操作。
await tool.call('apply_raw_transaction', modelOutput);

// 4. 在 reducer 中产生随机 ID 和时间。
const revision = {
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
};

// 5. 使用 DOM 作为持久化正文。
save(editorElement.innerHTML);

// 6. 依赖错误文本恢复。
if (error.message.includes('stale')) {
  await retry();
}
```

---

## 34. 规范落地清单

本规范批准后，两个仓库必须完成以下一次性落地工作：

### 34.1 Nireco 仓库

- 建立严格分层 `tsconfig`；
- 建立 ESLint boundary rules；
- 禁止 Core 中 DOM、clock、random 和反向依赖；
- 提供 `IClock`、`IIdAllocator`、`IContentHasher` 测试实现；
- 建立 formatter、lint、typecheck、unit、property 和 architecture CI；
- 建立 CODEOWNERS，覆盖 Core 与 Contract；
- 建立 PR template、ADR template 和 generated-code check。

### 34.2 Comet 仓库

- 建立 Nireco Adapter 与 Tool Executor 的目录边界；
- 建立模型输入/Trusted Context 的独立类型与 lint 规则；
- 禁止 Agent Tool 直接调用 commit/raw transaction；
- 建立 Tool Golden Trace、权限、幂等和 stale revision 测试；
- 建立 Contract Bundle codegen 与 drift check；
- 建立 Agent 输出数据最小化和日志脱敏规则。

### 34.3 双仓

- 固定同一工程规范版本，并在 CI 中校验版本和配置 hash；
- Gate 0 前启用共享 lint/format/tsconfig、architecture boundary、generated-code 和文档版本检查；
- Gate 1 前启用 cross-repo Conformance CI；
- 为规范例外建立统一 Issue 标签和到期检查；
- 将本规范加入新成员 onboarding 与 PR 合并门禁。

---

## 35. 最终约束

Nireco 与 Comet 的代码风格最终必须服务于以下不可妥协的系统事实：

```text
Model is the source of truth.
URI identifies the resource.
Revision identifies the state.
Semantic Position identifies the location.
Transaction is the only committed state transition.
Proposal is the only Agent write path.
Comet is the only specialized Agent.
Nireco never depends on Comet.
External content and model output are always untrusted.
Every important behavior must be deterministic, reviewable, testable, and recoverable.
```

任何写法即使“更短”或“更方便”，只要削弱上述性质，就不符合本规范。
