---
title: Nireco Editor 开发规格与 Comet 特化智能体集成契约
version: 0.4.2
status: Core-first Parallel Implementation Plan
language: zh-CN
companion_documents:
  - NIRECO_COMET_ROADMAP.md v0.1.1
  - NIRECO_COMET_ENGINEERING_CODING_STANDARD.md v0.1.1
updated_at: 2026-07-16
owners:
  - Nireco Editor Team
  - Comet Agent Team
---

# Nireco Editor 开发规格与 Comet 特化智能体集成契约

## 0. 文档目的与版本说明

本文档是 Nireco 的核心架构、实现计划与 Nireco–Comet 私有集成契约。它同时服务两个独立、并行开发的仓库：

1. **Nireco**：为 Comet 建设的 Web 原生学术文档模型、编辑器内核与确定性文档服务；
2. **Comet**：面向最终用户的研究与写作产品，以及唯一的第一方特化学术写作智能体。

两者关系类似：

```text
Nireco : Comet
≈
Monaco Editor : VS Code
```

该类比只说明产品依赖和工程边界：Nireco 必须是可独立构建、测试、嵌入和演进的编辑基础设施，但它首先为 Comet 的产品需求而存在。Nireco 在 0.x 阶段保持私有，不承诺公共 SDK、公共插件生态、公共 MCP Server 或第三方 Agent 接入。

Nireco 采用 clean-room 自主实现原则。其他编辑器项目仅用于研究公开问题、交互行为、架构取舍和失败模式；不得复制、移植或改写其源码、私有接口、测试夹具、模块结构或实现表达。

### 0.1 0.4.2 的核心修订

本版本不再按“功能模块并列”组织规格，而改为按实现脊柱组织：

```text
Resource URI
→ Workspace / Model Registry
→ Nireco Model
→ Canonical Snapshot / Schema
→ Semantic Position
→ Operation / Transaction
→ Revision / Durability
→ Proposal / Semantic Diff
→ Editor View
→ Nireco Services
→ Comet Private Agent Tools
```

本版本冻结以下关键决策：

1. **Models are at the heart of Nireco。** Nireco 的核心不是 Editor、DOM、Agent 或数据库记录，而是 URI 唯一寻址的版本化语义文档 Model。
2. **Nireco Core = Resource URI + Revision + Semantic Position + Transaction。** Model 承载这四个维度。
3. **Editor 只是 Model 的 View。** Selection 属于具体 Editor View，不属于 Model。
4. **主文档 Revision 在第一版采用线性历史。** Proposal 使用独立 Proposal Revision Log；暂不实现完整 Git 式多父 DAG。
5. **状态变化单位是 Transaction。** `ChangeSet` 不再作为核心术语；Proposal 的可部分接受单元统一称为 `ProposalChangeGroup`。
6. **正文只采用一种规范表示。** Paragraph 使用统一的 `InlineNode[]`，不再同时存在 `text` 字段、`TextSpan[]` 和 `text` 节点三套表达。
7. **协议中的文本 offset 使用 UTF-16 code unit。** 光标移动和删除按 grapheme cluster 对齐；Rust 实现不得使用 UTF-8 byte offset 代替。
8. **所有异步、持久化和 Agent 操作必须显式绑定 Revision。** 不得只传模糊的 `documentId` 或当前活动 Editor。
9. **Semantic Diff 是核心数据模型，不只是 UI。** 它决定 Proposal 审阅、部分接受、依赖闭包和 Comet 评估。
10. **Nireco 不定义 LLM Tool Schema。** Nireco 提供确定性私有 Integration Contract；Comet 在自己的仓库中定义和执行私有 Agent Tools。
11. **Comet 是唯一的特化智能体。** 外部 Agent 不得调用 Nireco Tools；Nireco 也不公开通用 Tools。
12. **Comet Agent 只能创建和修改 Proposal。** Commit 只能由用户审阅控制器或明确授权的非模型产品控制器完成。
13. **Nireco 与 Comet 分仓并行开发。** Nireco 必须先交付 Contract Bundle、Mock Service、Golden Fixtures 和 Conformance Runner，使 Comet 可提前开发。
14. **Source 资产与 Manuscript 资产分属不同系统。** Comet 拥有研究来源与全文；Nireco 拥有文稿内容、引用链接、证据定位快照和文章内资产。
15. **Document Authority 必须唯一。** 对每个规范 URI，在任一时刻只能有一个权威主分支 Revision 分配者。
16. **实施顺序改为 Gate 驱动。** Proposal、Semantic Diff、Revision-bound Read 和 Contract Preview 必须在完整 Web Editor 与 Comet Writing Agent 之前完成。
17. **Contract 不再作为后置阶段一次性交付。** Nireco 从 Phase 0 开始持续发布 Preview Bundle，Comet 从只读 Adapter 开始并行接入，随后逐 Gate 增加 Proposal 与 Academic 能力。
18. **浏览器运行时允许提前做隔离 Spike，但不得先于 Core Gate 冻结公开 API。** DOM、IME 和 Selection 原型只能消费已冻结的 Model/Position/Transaction 契约。
19. **工程与编码规范成为规范性配套文档。** 两个仓库必须共同固定 `NIRECO_COMET_ENGINEERING_CODING_STANDARD.md` 的版本，并通过自动化配置落实格式、类型、架构边界、Contract、测试和安全门禁；不得维护第二份并行权威规范。

### 0.2 规范性术语

- **必须（MUST）**：不满足即违反本规格。
- **应该（SHOULD）**：原则上必须遵守；偏离需要 ADR。
- **可以（MAY）**：可选，不影响核心兼容性。
- **不得（MUST NOT）**：明确禁止。
- **Workspace**：一个 Nireco Runtime 的根容器，拥有 Model Registry、URI 规范化、Authority、Storage、Schema、Clock、ID 分配器与服务生命周期。
- **Resource URI**：逻辑资源的稳定规范身份，不等于文件路径或数据库主键。
- **Model**：某个 Resource URI 在当前 Workspace 中的唯一活动运行时表示。
- **Snapshot**：某个 Revision 对应的不可变文档状态。
- **Semantic Position**：以稳定节点身份和 UTF-16 offset 表达的文档位置。
- **Operation**：最小确定性状态变换。
- **Transaction**：针对一个 Base Revision 原子提交的一组 Operation。
- **Revision**：一次成功 Transaction 后产生的不可变主分支状态身份。
- **Proposal**：尚未进入主分支的结构化修改集合。
- **Proposal Revision**：Proposal 草稿本身的乐观并发版本。
- **ProposalChangeGroup**：Semantic Diff 中可独立审阅的语义修改组。
- **Semantic Diff**：Proposal 相对目标 Revision 的结构化、学术语义化变更表示。
- **Evidence**：可定位到来源具体内容、用于支持、反驳或提供上下文的材料。
- **Nireco–Comet Integration Contract**：Nireco 与 Comet 之间私有、版本化、传输无关的确定性服务契约。
- **Comet Private Agent Tools**：仅存在于 Comet 仓库、仅供 Comet Agent 使用的模型 Tool Schema 和执行器。

### 0.3 文档层级与同步治理

本项目只有以下三份长期规范性文档：

| 文档 | 唯一职责 | 不得替代的内容 |
|---|---|---|
| 本开发规格 | 产品边界、Nireco Core、领域模型、Nireco–Comet Contract 与系统不变量 | 不负责具体 Sprint 日期和机械代码格式 |
| `NIRECO_COMET_ROADMAP.md` | 阶段、Sprint、Gate、人员假设和交付顺序 | 不得自行改写 Core 或 Contract 语义 |
| `NIRECO_COMET_ENGINEERING_CODING_STANDARD.md` | 代码风格、模块边界、测试、CI、评审、安全和工程门禁 | 不得自行创造新的产品能力或 Contract 语义 |

`NIRECO_COMET_ENGINEERING_CODING_STANDARD.md` 是唯一权威编码规范文件。任何别名、摘录或生成页面只能声明其来源和版本，不得成为第二规范源。

文档同步规则如下：

1. Core、Schema、Transaction、Revision、Proposal 或 Contract 语义变更，必须先更新本规格和 ADR；若影响交付顺序或代码门禁，还必须同步 Roadmap 或编码规范。
2. Roadmap 日期或资源变化只修改 Roadmap；若改变 Gate 语义、产品范围或架构顺序，必须同时更新本规格。
3. 机械代码风格、lint、测试和 CI 规则只在编码规范中定义，并由仓库配置生成或验证。
4. 三份文档的 front matter 必须固定所依赖文档版本。CI 必须检测陈旧版本引用和重复权威文件。
5. 任何规范变更必须附 Changelog；重大变化需要 ADR，并说明对两个仓库、Contract Bundle、Fixture 和迁移的影响。

---

## 1. 产品定义与边界

### 1.1 产品定位

Nireco 不是“带 AI 按钮的富文本编辑器”，也不是面向所有第三方 Agent 的通用文档平台。Nireco 是：

> 为 Comet 建设的、Web 原生、结构化、版本化、可被特化智能体安全操作的学术文档模型与编辑器基础设施。

Comet 是：

> 使用 Nireco 文档能力、研究资料、证据系统和私有写作工作流，为用户完成研究与学术写作任务的产品及唯一第一方特化智能体。

### 1.2 Nireco 的职责

Nireco 必须负责：

- Resource URI、Workspace 和 Model Registry；
- 版本化语义文档 Model；
- Canonical Snapshot 与 Schema；
- Operation、Transaction、PositionMap 和 Validation；
- Revision、History、Undo/Redo 与 Durability；
- Proposal、Semantic Diff、部分接受与审阅提交；
- 学术节点、Citation、Reference Snapshot、Claim 和 Evidence Link；
- 浏览器 DOM 投影、IME、Selection、Clipboard、Drag & Drop 和 Accessibility；
- 确定性 Document Services；
- 私有 Nireco–Comet Integration Contract；
- Contract Bundle、Mock、Fixture 与 Conformance Runner。

### 1.3 Comet 的职责

Comet 必须负责：

- 用户研究和写作工作流；
- Comet Agent Host、Planner、Executor 与 Task State；
- 模型调用、Prompt、Tool Loop、重试、预算和取消；
- 私有 Agent Tools 的名称、描述、输入输出和组合策略；
- Context Builder、Retrieval、Source Ranking 和 Evidence Selection；
- 研究来源、PDF、网页、全文提取和索引；
- Comet Nireco Adapter；
- Agent Evaluations 和反馈闭环；
- 对外 Comet Task API；
- Product UI、Agent Panel、项目、账户、同步和权限。

### 1.4 明确不做

Nireco 0.x 不做：

- 公共 Agent Tools；
- 公共 MCP Server；
- 外部 Agent SDK；
- Bring Your Own Agent；
- 任意第三方 Kernel Extension；
- Word 式精确分页；
- 任意 DOCX 无损往返；
- 完整多人实时 CRDT 协作；
- 任意 LaTeX 宏执行；
- 第三方编辑器运行时复用；
- 将模型 SDK、Prompt 或 Agent Framework 放入 Nireco。

Comet 可以在未来支持 Bring Your Own Model，但 Agent 编排、Tool、Context、权限、Proposal 和审阅流程仍由 Comet 控制。


### 1.5 目标用户

第一版主要服务：

- 中文和英文学术论文作者；
- 综述作者；
- 需要管理 Reference、Source、Evidence 和 Citation 的研究人员；
- 在 Comet 中与特化智能体共同写作、审阅和修订的用户；
- 研究团队中的作者、导师和审阅者。

第一版不以通用企业文档、法律合同、演示文稿、白板或数据库编辑为主要场景。

### 1.6 核心产品闭环

第一版必须完成：

```text
用户编辑结构化 Manuscript
→ Comet 管理 Source 与 Evidence
→ Comet Agent 在固定 Revision 上读取授权范围
→ Agent 创建 Proposal
→ Proposal 插入正文、Claim、Evidence Link 与 Citation
→ Nireco 生成 Semantic Diff
→ 用户全部或部分接受
→ Nireco 原子提交 Transaction
→ Bibliography / CrossReference / Academic Graph 更新
→ Revision、Undo、恢复和 Provenance 可验证
```

### 1.7 MVP 功能范围

Nireco MVP 必须支持：

- Title、Author、Abstract、Keyword；
- Section、Heading、Paragraph、List、BlockQuote；
- Figure、Caption、基础 Table、Equation、Footnote；
- Citation、Reference Snapshot、Claim、Evidence Link；
- Bibliography、Outline、Find、Comment；
- Proposal Review、Semantic Diff、部分接受；
- Revision、Undo/Redo、自动保存和 Crash Recovery；
- Nireco JSON/Package、安全 HTML、Markdown 和纯文本；
- Comet 只读 Tool、Proposal Tool 和 Evidence/Citation 闭环。

Nireco MVP 不要求完整 CSL、DOCX 无损往返、多人 CRDT、精确分页或公共插件生态。

## 2. Nireco Core：第一性定义

### 2.1 核心表述

> **Models are at the heart of Nireco.**
>
> A Nireco Model is a URI-addressed, revisioned semantic document. Its URI provides stable logical identity, its Revision identifies an immutable document state, and its Semantic Positions identify meaningful locations inside that state. All changes are applied through validated Transactions.

中文版：

> **Nireco 的核心是版本化语义文档 Model。**
>
> 每个 Model 由规范 Resource URI 唯一标识，由 Revision 确定不可变状态，由 Semantic Position 定位文档中的语义位置和对象，并且只通过经过校验的 Transaction 发生变化。

压缩公式：

```text
Nireco Core
= Resource URI
+ Revision
+ Semantic Position
+ Transaction
```

### 2.2 四个核心问题

```text
Resource URI      → 这是哪一份逻辑文档？
Revision          → 这是该文档的哪个确定状态？
Semantic Position → 这是该状态中的哪个位置或对象？
Transaction       → 状态如何原子地变为下一 Revision？
```

### 2.3 不是规范身份的对象

以下对象不得作为 Nireco 文档的规范身份：

- DOM Element；
- DOM Range；
- 浏览器 Tab；
- Editor 实例 ID；
- 本地文件路径；
- 数据库自增 ID；
- Comet Task ID；
- Proposal ID；
- 内存对象地址；
- 当前窗口或当前 Selection。

### 2.4 六条核心不变量

1. **Model 是核心。** 所有编辑、渲染、导入、诊断、Proposal 和 Comet 操作都作用于 Model。
2. **URI 是身份。** 同一 Workspace 中，同一 canonical URI 最多存在一个活动 Model。
3. **Revision 是状态。** 所有异步、持久化和 Agent 操作必须显式绑定 Base Revision。
4. **Semantic Position 是位置。** 持久化位置不得只使用 DOM Range 或全局字符 offset。
5. **Editor 是 View。** Editor 的创建、销毁和 Selection 不决定 Model 生命周期。
6. **Transaction 是变化。** 人类输入、导入、格式修复、迁移和 Comet Proposal 最终都转换为同一 Transaction 代数。

## 3. 基础类型与标识系统

### 3.1 Brand 类型

所有跨层身份必须使用不可混淆的品牌类型：

```ts
export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type ResourceUri = Brand<string, "ResourceUri">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type RevisionId = Brand<string, "RevisionId">;
export type TransactionId = Brand<string, "TransactionId">;
export type NodeId = Brand<string, "NodeId">;
export type EntityId = Brand<string, "EntityId">;
export type ProposalId = Brand<string, "ProposalId">;
export type ProposalChangeGroupId = Brand<string, "ProposalChangeGroupId">;
export type SessionId = Brand<string, "SessionId">;
export type ContentHash = Brand<string, "ContentHash">;
```

不得在公共契约中以裸 `string` 代替具有不同语义的 ID。

### 3.2 ID 分配

Kernel reducer 不得调用随机数或系统时间。所有新 ID 由受信 `IdAllocator` 在 Transaction 构造前分配：

```ts
export interface IdAllocator {
  allocateNodeId(kind: NodeKind): NodeId;
  allocateEntityId(kind: AcademicEntityKind): EntityId;
  allocateTransactionId(): TransactionId;
  allocateRevisionId(): RevisionId;
  allocateProposalId(): ProposalId;
}
```

推荐使用 UUIDv7 或等价的 128-bit 不透明 Base32 标识。ID 不得编码标题、用户名、顺序、文件路径或敏感内容。

模型不能生成可信 ID。Comet Tool 输入只能使用临时 `clientRef`：

```ts
interface ClientAllocatedObject {
  clientRef: string;
}
```

Comet Tool Executor 或 Nireco Service 返回正式映射：

```ts
interface AssignedIdMap {
  [clientRef: string]: NodeId | EntityId;
}
```

### 3.3 Clock

所有时间由受信 Clock 注入：

```ts
export interface Clock {
  now(): string; // RFC 3339 UTC
}
```

Kernel 不得直接读取 `Date.now()`。Revision 顺序由父 Revision 和单调提交序号决定，不依赖墙上时钟。

## 4. Workspace 与运行时根容器

### 4.1 Workspace 定义

Workspace 是 Nireco Runtime 的根容器：

```ts
export interface INirecoWorkspace extends AsyncDisposable {
  readonly id: WorkspaceId;
  readonly models: IModelRegistry;
  readonly schemas: ISchemaRegistry;
  readonly resources: IResourceProviderRegistry;
  readonly authority: DocumentAuthority;
  readonly storage: StorageAdapter;
  readonly ids: IdAllocator;
  readonly clock: Clock;

  createEditor(
    container: HTMLElement,
    options: CreateEditorOptions,
  ): INirecoEditor;
}
```

Workspace 必须拥有：

- URI canonicalization；
- Model Registry；
- Schema Registry；
- Resource Provider Registry；
- Document Authority；
- Storage Adapter；
- ID Allocator；
- Clock；
- 服务生命周期；
- 受控事件总线；
- 缓存与派生索引的隔离范围。

### 4.2 Workspace 不变量

- 同一 Workspace 中，同一 canonical Resource URI 只能有一个活动 Model；
- 不同 Workspace 可以加载同一 URI，但不得假设其内存状态自动同步；
- Workspace dispose 必须先拒绝新事务、等待或取消后台任务、flush 持久化状态，再释放 Model 和 Editor；
- Workspace 不得隐式成为全局单例；
- 测试必须可以创建多个完全隔离的 Workspace。

## 5. Resource URI 与资源身份

### 5.1 URI 是逻辑身份，不是物理位置

规范文档 URI 示例：

```text
nireco://workspace-01/document/doc-7QH9V8
```

研究来源和证据可以由 Comet 命名：

```text
comet://workspace-01/reference/ref-103
comet://workspace-01/source/source-28
comet://workspace-01/evidence/evidence-812
```

外部资源可以使用标准 URI：

```text
doi:10.1234/example.2026.001
https://example.org/paper.pdf
file:///Users/alice/papers/paper.nireco
```

`file:` 和 `https:` URI 是物理资源位置；Nireco 文稿的 canonical identity 应优先使用稳定的 `nireco:` URI。

### 5.2 URI 规则

Resource URI 必须：

- 稳定且唯一；
- 可规范化和可比较；
- 不包含可变标题；
- 不包含当前 Revision；
- 不依赖文件名或窗口；
- 不直接暴露敏感内容；
- 使用不透明稳定 ID；
- 对大小写、百分号编码、尾斜杠和默认端口有确定规范化规则。

### 5.3 ResourceRef 层次

```ts
export interface ResourceRef {
  uri: ResourceUri;
}

export interface DocumentRef extends ResourceRef {
  revisionId: RevisionId;
}

export interface MutableDocumentTarget extends ResourceRef {
  baseRevisionId: RevisionId;
}
```

持久化任务、Proposal 和 Comet Session 必须使用显式 Revision；只有同步 UI 查询可以通过专用 API 表示“当前 head”。

### 5.4 语义引用

```ts
export interface NodeRef {
  document: DocumentRef;
  nodeId: NodeId;
}

export interface AcademicEntityRef {
  document: DocumentRef;
  entityId: EntityId;
}

export interface DocumentRangeRef {
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
```

### 5.5 Resource Provider

```ts
export interface ResourceProvider {
  canHandle(uri: ResourceUri): boolean;
  read(uri: ResourceUri, signal: AbortSignal): Promise<ResourceSnapshot>;
  write?(
    uri: ResourceUri,
    change: ResourceChange,
    signal: AbortSignal,
  ): Promise<ResourceWriteResult>;
  watch?(
    uri: ResourceUri,
    listener: ResourceChangeListener,
  ): Disposable;
}
```

Nireco 默认解析 `nireco:` 文稿资源。Comet 解析 `comet:` Reference、Source 和 Evidence 资源。Nireco 可以保存这些资源的链接，但不接管 Comet 的全文和检索系统。

## 6. Model Registry 与 Model 生命周期

### 6.1 Model Registry

```ts
export interface IModelRegistry {
  create(options: CreateModelOptions): Promise<INirecoModel>;
  resolve(uri: ResourceUri): Promise<INirecoModel>;
  get(uri: ResourceUri): INirecoModel | undefined;
  getAll(): readonly INirecoModel[];
  unload(uri: ResourceUri): Promise<void>;
}
```

当同一 canonical URI 已有活动 Model 时，`create` 必须返回 `MODEL_URI_ALREADY_EXISTS`，不得创建第二套内存状态。

### 6.2 Model API

```ts
export interface INirecoModel extends AsyncDisposable {
  readonly uri: ResourceUri;
  readonly schemaId: string;
  readonly headRevisionId: RevisionId;

  getSnapshot(revisionId?: RevisionId): DocumentSnapshot;

  applyTransaction(
    transaction: Transaction,
  ): Promise<CommitResult>;

  validateTransaction(
    transaction: Transaction,
  ): TransactionValidationResult;

  onDidCommit(listener: RevisionCommitListener): Disposable;
  onDidChangeDurability(listener: DurabilityListener): Disposable;
}
```

### 6.3 生命周期区分

```text
editor.dispose()   → 销毁一个 View，不销毁 Model
model.dispose()    → 从当前 Workspace 卸载 Model，不等于删除持久化文档
resource.delete()  → 删除持久化资源，需要显式权限和审计
```

Model dispose 后：

- 已持久化数据保持存在；
- 所有连接 View 必须断开或进入关闭状态；
- 未完成 Transaction 构造器失效；
- 后台派生任务取消；
- 再次 `resolve(uri)` 可以创建新的活动 Model。

### 6.4 一个 Model，多种 View

同一 Model 可以连接：

- 正文编辑 View；
- 只读 View；
- Outline；
- Proposal Review；
- Semantic Diff；
- Citation Audit；
- 第二个窗口的镜像 View。

Selection 和 ViewState 不进入 Model。

## 7. Document Authority 与并发模型

### 7.1 Authority 定义

对每个 Resource URI，在任一时刻必须只有一个权威主分支 Revision 分配者：

```ts
export interface DocumentAuthority {
  open(ref: ResourceRef): Promise<DocumentHandle>;
  getHead(uri: ResourceUri): Promise<RevisionId>;
  apply(transaction: Transaction): Promise<CommitResult>;
  subscribe(
    uri: ResourceUri,
    listener: DocumentAuthorityListener,
  ): Disposable;
}
```

Authority 可以由浏览器、Desktop sidecar 或服务端实现，但契约必须相同。

### 7.2 第一版并发策略

- 主分支 Transaction 串行提交；
- 每个 Transaction 必须声明 `baseRevisionId`；
- Base Revision 不匹配时不得隐式覆盖，返回 `BASE_REVISION_MISMATCH`；
- Proposal 不占用主分支写锁；
- Proposal Rebase 显式执行；
- 同设备多 Tab 采用 Leader 模式：只有一个写入 Leader，其他 Tab 只读或通过 Leader 转发；
- 第一版不实现多人 CRDT；
- 第一版不允许两个 Authority 同时为同一 URI 分配 Revision。

### 7.3 Authority 切换

Authority 切换必须包含：

1. 停止接受新写入；
2. flush 已提交但未持久化的 Revision；
3. 生成 Authority handoff token；
4. 新 Authority 校验 head Revision 和 Document Hash；
5. 更新订阅者；
6. 旧 Authority 进入只读或关闭。

发生不一致时必须 fail closed，不能自动选择“较新的本地时间”。

## 8. Canonical Document Snapshot 与 Schema

### 8.1 Snapshot 是不可变状态

```ts
export interface DocumentSnapshot {
  format: "nireco-document";
  formatVersion: string;
  schemaId: string;
  schemaVersion: string;
  revisionId: RevisionId;
  documentHash: ContentHash;

  metadata: ManuscriptMetadata;
  root: ManuscriptNode;
  academicGraph: AcademicGraphSnapshot;
  settings: DocumentSemanticSettings;
}
```

Snapshot 不包含 canonical URI；URI 由 Model 和 `DocumentRef` 提供。这样同一快照可以在导出、测试和内容寻址场景中复用，但所有在线操作仍必须携带 `DocumentRef`。

Snapshot 必须：

- 不可变；
- 可 canonical serialize；
- 可在 Browser、Worker、Node 和未来 Rust 实现间一致解析；
- 不包含 DOM、Selection、Editor ViewState、网络句柄或模型状态；
- 不包含临时索引和缓存；
- 对未知字段采用明确兼容策略。

### 8.2 唯一正文表示

Block 节点统一使用 `children`，Paragraph 统一使用 `InlineNode[]`。不得同时存在 `text?: TextSpan[]`、`children?: DocumentNode[]` 和独立 `text` 节点三套表达。

```ts
export type BlockNode =
  | SectionNode
  | ParagraphNode
  | HeadingNode
  | FigureNode
  | TableNode
  | DisplayEquationNode
  | BlockQuoteNode
  | CodeBlockNode
  | ListNode
  | HorizontalRuleNode;

export type InlineNode =
  | TextNode
  | CitationNode
  | CrossReferenceNode
  | InlineEquationNode
  | FootnoteReferenceNode
  | HardBreakNode;

export interface ParagraphNode {
  id: NodeId;
  type: "paragraph";
  attrs: ParagraphAttributes;
  children: InlineNode[];
}

export interface TextNode {
  id: NodeId;
  type: "text";
  value: string;
  marks: Mark[];
}
```

一个段落的真实内容可以是：

```text
TextNode
→ CitationNode
→ TextNode
→ InlineEquationNode
→ TextNode
```

Citation、CrossReference 和 InlineEquation 是原子 inline 节点，不编码为占位字符，也不降级为普通文本。

### 8.3 Schema 内容语法

第一版只支持一个内置 Manuscript Schema。Schema 必须明确每种节点的：

- `kind`：block、inline、atom；
- 必填属性和默认值；
- 允许父节点；
- 允许子节点；
- 最小/最大基数；
- 是否可为空；
- 是否可编辑；
- 是否可拆分、合并、复制和移动；
- 是否参与大纲、编号和导出；
- 属性迁移规则。

建议内容语法：

```text
manuscript
  → frontMatter? body bibliographyPlaceholder?

body
  → block+

section
  → heading block*

heading
  → inline*

paragraph
  → inline*

figure
  → figureAsset figureCaption?

figureCaption
  → inline*

table
  → tableCaption? tableRow+

tableRow
  → tableCell+

tableCell
  → paragraph+

list
  → listItem+

listItem
  → paragraph block*

footnote
  → block+
```

### 8.4 第一版节点范围

第一版必须支持：

- manuscript；
- frontMatter；
- body；
- section；
- heading；
- paragraph；
- text；
- citation；
- crossReference；
- inlineEquation；
- displayEquation；
- figure、figureAsset、figureCaption；
- table、tableRow、tableCell、tableCaption；
- list、listItem；
- blockQuote；
- codeBlock；
- footnote、footnoteReference；
- bibliographyPlaceholder。

第一版表格限制：

- 不支持合并单元格；
- 不支持嵌套表格；
- tableCell 内只允许 paragraph 和有限 block；
- 不支持跨单元格富 Selection；
- 复制粘贴先保证矩形普通表格；
- 复杂表格导入必须降级并产生 Diagnostic。

### 8.5 Mark 模型

```ts
export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "code" }
  | { type: "link"; href: string; title?: string }
  | { type: "subscript" }
  | { type: "superscript" };
```

Mark 顺序必须 canonical normalize。冲突 Mark 的解析顺序由 Schema 固定，不由 Renderer 决定。

### 8.6 TextNode 规范化与 ID 规则

相邻且 marks 完全相同的 TextNode 可以合并，但必须遵守：

1. 保留左侧 TextNode ID；
2. 右侧 TextNode ID 进入 PositionMap 的 alias/tombstone 记录；
3. 指向右侧节点的 Anchor 必须映射到保留节点的新 UTF-16 offset；
4. 合并不能发生在 Transaction 外的隐藏状态；
5. normalize 生成的 Operation 必须进入 Transaction 结果或可重放的 canonicalization phase；
6. 空 TextNode 默认删除，除非 Schema 明确要求用于占位；
7. 不得对正文执行隐式 NFC/NFD 改写。

TextNode 拆分时：

- 左片段保留原 ID；
- 右片段由 IdAllocator 分配新 ID；
- PositionMap 明确记录边界 affinity。

### 8.7 未知节点与未知属性

0.x 默认策略：

- Major Schema 不兼容时拒绝打开为可编辑 Model；
- 可识别但不支持的节点以只读 `unsupportedNode` 包装并保留原始 canonical payload；
- 未知非关键属性可保留在 `extensions` 命名空间；
- 未知关键属性导致 `SCHEMA_VERSION_UNSUPPORTED`；
- 导出不得静默丢弃未知内容。

## 9. Unicode、文本与 Semantic Position

### 9.1 Offset 单位

跨层协议中的文本 offset 统一使用 **UTF-16 code unit**：

```ts
export type Utf16Offset = Brand<number, "Utf16Offset">;
```

原因：

- JavaScript 字符串索引采用 UTF-16；
- DOM Range 和 Selection 使用 UTF-16 code unit；
- 浏览器输入事件天然以该坐标工作；
- 可以减少 TS 编辑路径中的转换。

约束：

- Rust 实现必须显式转换 UTF-16 offset，不得用 UTF-8 byte offset 代替；
- 光标左右移动、删除字符和 Selection 扩展必须按 grapheme cluster；
- word boundary 使用可测试的 Unicode 分词策略；
- 搜索可使用归一化副本，但正文不可被隐式归一化；
- 序列化保留原始 Unicode code units 的合法字符串内容。

### 9.2 Position 联合类型

```ts
export type SemanticPosition =
  | TextPosition
  | NodeBoundaryPosition;

export interface TextPosition {
  kind: "text";
  textNodeId: NodeId;
  utf16Offset: Utf16Offset;
  affinity: "before" | "after";
}

export interface NodeBoundaryPosition {
  kind: "node-boundary";
  parentNodeId: NodeId;
  childIndex: number;
  affinity: "before" | "after";
}
```

`TextPosition` 只允许指向 TextNode。Citation 等原子 inline 节点前后的位置使用 `NodeBoundaryPosition`。

### 9.3 Range 与 Selection

```ts
export interface SemanticRange {
  anchor: SemanticPosition;
  focus: SemanticPosition;
}

export interface EditorSelection {
  ranges: SemanticRange[];
  primaryRangeIndex: number;
  direction: "forward" | "backward";
}
```

第一版只需保证单主 Selection；类型允许未来多 Selection。Selection 是 Editor View 状态，不是 Model 状态。

### 9.4 Persistent Anchor

批注、Claim、Evidence Link、Proposal 和异步任务不能只保存瞬时 Position。持久 Anchor 需要：

```ts
export interface PersistentAnchor {
  document: DocumentRef;
  primary: SemanticPosition;
  targetNodeId?: NodeId;
  textQuote?: {
    exact: string;
    prefix?: string;
    suffix?: string;
    normalizedHash?: ContentHash;
  };
  pathHint?: NodeId[];
}
```

恢复顺序：

1. 通过 PositionMap 精确映射；
2. 通过稳定节点 ID；
3. 通过 text quote 和上下文；
4. 通过 path hint；
5. 无法恢复时标记 `orphaned`，不得静默指向错误文本。

### 9.5 Position 合法性

- offset 必须位于 `[0, text.length]`；
- 不允许落在 surrogate pair 中间；
- 编辑命令必须将用户光标对齐至 grapheme boundary；
- node boundary 的 childIndex 必须位于 `[0, children.length]`；
- Position 必须属于声明的 Revision；
- 跨 Revision 使用 Position 时必须经过 PositionMap 或 Anchor 恢复。

## 10. 学术语义图与资源所有权

### 10.1 树与图

结构树表达阅读顺序；语义图表达非树关系：

```text
Claim ──supportedBy────> EvidenceLink
Claim ──contradictedBy─> EvidenceLink
Citation ──references──> ReferenceSnapshot
EvidenceLink ──locatedIn─> Comet Source
CrossReference ──targets─> Figure/Table/Equation/Section
CommentThread ──anchors─> PersistentAnchor
Revision ──producedBy──> Provenance
```

### 10.2 所有权边界

Comet 规范拥有：

- 项目文献库；
- PDF、网页和数据集全文；
- Source Retrieval；
- 内容提取和全文索引；
- Source 访问控制；
- Source 内容版本；
- Evidence 候选提取与排序。

Nireco 规范拥有：

- 文档中的 Citation 节点；
- 可重复渲染的 Reference Snapshot；
- Evidence Link 和 locator；
- Evidence excerpt 的最小审阅快照；
- Claim 与 Evidence 的关系；
- Citation、Claim 和 Proposal 的结构化变化；
- 文稿内 Figure、Image 和附件资产。

### 10.3 Reference Snapshot

```ts
export interface ReferenceSnapshot {
  id: EntityId;
  externalUri?: ResourceUri;
  cslJson: Record<string, unknown>;
  metadataHash: ContentHash;
  capturedAt: string;
  sourceProvider?: string;
}
```

Reference Snapshot 是文稿可重复渲染所需的最小书目快照，不等于 Comet 文献库的完整对象。

### 10.4 Evidence Link

```ts
export interface EvidenceLink {
  id: EntityId;
  uri: ResourceUri; // 通常是 comet://.../evidence/...
  sourceUri: ResourceUri;
  sourceContentHash: ContentHash;
  locator: EvidenceLocator;
  excerpt?: string;
  excerptHash?: ContentHash;
  verificationStatus:
    | "verified"
    | "provisional"
    | "metadata-only"
    | "stale"
    | "rejected";
  verifiedBy?: ActorRef;
  verifiedAt?: string;
}
```

`verified` 只说明：来源身份、内容版本、locator 和 excerpt 可追溯。它不等于学术结论为真，也不代表 Evidence 一定充分支持 Claim。

### 10.5 Claim 与证据关系

```ts
export interface ClaimEntity {
  id: EntityId;
  anchor: PersistentAnchor;
  textSnapshot: string;
  textHash: ContentHash;
}

export interface ClaimEvidenceRelation {
  claimId: EntityId;
  evidenceId: EntityId;
  relation:
    | "supports"
    | "partially-supports"
    | "contradicts"
    | "context-only"
    | "unclear";
  assessedBy: ActorRef;
  confidence?: number;
}
```

Claim 文本变化后，旧关系必须重新校验或标记 stale。

### 10.6 Manuscript Asset 与 Research Source Asset

```text
Manuscript Asset
- 图像
- 图表数据文件
- 文章内附件
- 由 Nireco 管理并进入文档包

Research Source Asset
- PDF
- 网页快照
- 数据集
- 由 Comet 管理，不默认复制进 .nireco 包
```

离线审阅所需的最小 Evidence excerpt 可以进入 Nireco 文档包；完整研究来源默认不进入。

## 11. Operation Algebra 与 Transaction

### 11.1 术语分层

```text
Operation             → 最小状态操作
Transaction           → 原子状态转换单位
Revision              → Transaction 提交后的主分支状态
Proposal              → 未提交的修改集合
ProposalChangeGroup   → 可部分接受的审阅单元
```

`ChangeSet` 不作为规范类型名使用，以避免与 Transaction 和 ProposalChangeGroup 混淆。

### 11.2 Operation 联合类型

```ts
export type Operation =
  | InsertNodeOperation
  | DeleteNodeOperation
  | MoveNodeOperation
  | ReplaceTextOperation
  | SetNodeAttributesOperation
  | AddMarkOperation
  | RemoveMarkOperation
  | CreateAcademicEntityOperation
  | UpdateAcademicEntityOperation
  | DeleteAcademicEntityOperation
  | LinkAcademicEntitiesOperation
  | UnlinkAcademicEntitiesOperation;
```

每个 Operation 必须：

- 可序列化；
- 可 deterministic apply；
- 明确目标节点/实体；
- 明确前置条件；
- 产生 PositionMap fragment；
- 能生成 inverse operation 或 inverse payload；
- 不依赖 DOM；
- 不读取随机数、系统时间或网络；
- 不隐式改变不相关节点。

### 11.3 Transaction 类型

```ts
export interface Transaction {
  id: TransactionId;
  target: MutableDocumentTarget;
  actor: ActorRef;
  intent?: string;
  operations: Operation[];
  preconditions: TransactionPrecondition[];
  metadata: TransactionMetadata;
  createdAt: string;
}

export interface TransactionMetadata {
  source:
    | "human-input"
    | "command"
    | "import"
    | "migration"
    | "validator-fix"
    | "proposal-accept";
  undoGroupId?: string;
  proposalId?: ProposalId;
  proposalRevision?: number;
  cometTaskId?: string;
  toolInvocationIds?: string[];
  idempotencyKey?: string;
}
```

### 11.4 原子应用流程

```text
Parse
→ Schema validation
→ Base Revision check
→ Preconditions check
→ Operation validation
→ Apply to immutable draft
→ Canonical normalization
→ Academic invariant validation
→ Generate PositionMap
→ Generate inverse operations
→ Compute Document Hash
→ Allocate Revision
→ Commit in memory
→ Append WAL
→ Publish post-commit events
→ Flush snapshot asynchronously
```

任何一步在内存 commit 前失败，整个 Transaction 不产生副作用。

### 11.5 Preconditions

```ts
export type TransactionPrecondition =
  | { kind: "node-exists"; nodeId: NodeId }
  | { kind: "node-hash"; nodeId: NodeId; expected: ContentHash }
  | { kind: "entity-exists"; entityId: EntityId }
  | { kind: "schema-version"; expected: string }
  | { kind: "document-hash"; expected: ContentHash };
```

Comet 生成的 Proposal Transaction 必须至少包含目标节点存在性和必要内容 hash 前置条件。

### 11.6 Canonical Normalization

Normalization 是 Transaction 应用的一部分，而不是后台偷偷改文档。包括：

- 合并相邻同 Mark TextNode；
- 删除非法空节点；
- 补齐 Schema 默认属性；
- 规范 Mark 顺序；
- 校正必需占位节点；
- 更新派生编号所需的稳定输入；
- 不执行语义改写或 Unicode 正规化。

Normalization 结果必须可在 TS 与未来 Rust conformance tests 中一致重放。

### 11.7 Transaction 串行与重入

- 同一 Model 的 Transaction 串行执行；
- reducer 执行期间不得发出可重入事件；
- 监听器提交的新 Transaction 进入下一队列轮次；
- `applyTransaction()` 成功代表内存 commit 成功；
- `whenDurable(revisionId)` 才表示可靠持久化；
- commit 后取消只能停止后续派生工作，不能取消已经产生的 Revision。

## 12. PositionMap、Anchor 映射与冲突

### 12.1 PositionMap

每个成功 Transaction 必须产生 PositionMap：

```ts
export interface PositionMap {
  fromRevisionId: RevisionId;
  toRevisionId: RevisionId;
  mapPosition(position: SemanticPosition): MappedPositionResult;
  mapNodeId(nodeId: NodeId): MappedNodeResult;
  compose(next: PositionMap): PositionMap;
}
```

### 12.2 映射结果

```ts
export type MappedPositionResult =
  | { status: "mapped"; position: SemanticPosition }
  | { status: "deleted"; nearest?: SemanticPosition }
  | { status: "ambiguous"; candidates: SemanticPosition[] }
  | { status: "orphaned" };
```

不得在 ambiguous 或 orphaned 时自动选取“看起来最近”的位置并继续写入。

### 12.3 Rebase 基础

Proposal 从 `baseRevisionId` Rebase 到新 head 时：

1. 组合中间 Revision 的 PositionMap；
2. 映射每个 Semantic Edit 的目标；
3. 验证 node/content hash preconditions；
4. 重算 Academic relation；
5. 生成新的 Proposal Revision；
6. 重算 Semantic Diff；
7. 对无法确定的目标产生 Conflict。

### 12.4 Conflict 分类

```ts
export type ConflictKind =
  | "target-deleted"
  | "target-moved-ambiguously"
  | "content-changed"
  | "schema-changed"
  | "citation-changed"
  | "evidence-stale"
  | "dependency-broken"
  | "scope-no-longer-valid";
```

Conflict 必须可机器处理，并包含建议动作，不得只返回自由文本。

## 13. Revision、历史、Undo 与 Durability

### 13.1 第一版 Revision 模型

主文档 Revision 在第一版使用严格线性历史：

```ts
export interface Revision {
  id: RevisionId;
  uri: ResourceUri;
  parentRevisionId: RevisionId | null;
  transactionId: TransactionId;
  sequence: number;
  documentHash: ContentHash;
  actor: ActorRef;
  createdAt: string;
  durability: "memory" | "wal" | "snapshot";
}
```

第一版不使用 `parentIds[]`，不实现多父 Merge DAG。Proposal Branch 使用独立 Proposal Revision Log，并在接受时在当前主分支产生一个新的单父 Revision；其来源通过 Provenance 关联 Proposal。

### 13.2 Revision 不变量

- Revision 不可修改；
- Revision ID 是不透明身份，不等于内容 hash；
- 相同内容可以产生不同 Revision；
- `sequence` 只在单一 Authority 内单调递增；
- Revision 顺序不依赖 `createdAt`；
- 主分支不会因 Undo、Rebase 或 Compaction 被重写；
- 所有 Revision 必须能追溯到 Transaction。

### 13.3 Undo/Redo

Undo 不删除历史，而是提交 inverse Transaction：

```text
Revision r10
→ user transaction t11
→ Revision r11
→ undo creates inverse transaction t12
→ Revision r12
```

建议 Undo Group 规则：

- 连续键入：按时间窗口、相邻位置和相同输入类型合并；
- 一次 IME composition：一个 Undo Group；
- 一次 Paste：一个 Undo Group；
- 一次命令：默认一个 Undo Group；
- 一次 Proposal 接受：一个 Composite Undo Group；
- Proposal 草稿不进入主文档 Undo Stack；
- 多个 View 共享 Model 的文档 Undo 历史；
- Selection 恢复信息存于 View-side history metadata。

### 13.4 Durability 状态

```text
memory    → 已在权威 Model 中提交
wal       → 已追加到 write-ahead log
snapshot  → 已进入持久 Snapshot，可完成日志压缩
```

`applyTransaction()` 返回内存提交结果。需要可靠保存的调用必须等待：

```ts
await model.whenDurable(revisionId, "wal");
```

或：

```ts
await model.whenDurable(revisionId, "snapshot");
```

### 13.5 崩溃恢复

规范事实来源：

```text
Latest Valid Snapshot
+ Subsequent Valid Transaction Log
```

恢复过程：

1. 校验 Snapshot hash；
2. 从 Snapshot Revision 开始读取 WAL；
3. 按 sequence 和 parentRevisionId 重放；
4. 校验每次 transaction hash、document hash 和 schema；
5. 遇到尾部不完整记录时截断到最后一个有效边界；
6. 遇到中间损坏时进入 recovery mode，不静默跳过；
7. 重建派生索引。

### 13.6 Compaction

Compaction 可以：

- 生成新 Snapshot；
- 丢弃已包含在 Snapshot 且超过保留窗口的 WAL；
- 保留审计所需的 Revision/Transaction 摘要；
- 清理没有 Proposal、Comment 或 Provenance 引用的 tombstone。

Compaction 不得改变文档语义、Revision ID 或 Anchor 映射结果。

## 14. Proposal 状态机

### 14.1 Proposal 定义

Proposal 是尚未进入主分支的结构化修改集合：

```ts
export interface Proposal {
  id: ProposalId;
  documentUri: ResourceUri;
  baseRevisionId: RevisionId;
  proposalRevision: number;
  actor: ActorRef;
  status: ProposalStatus;
  semanticEdits: SemanticEdit[];
  validation: ProposalValidationSnapshot;
  diff?: SemanticDiff;
  provenance: ProposalProvenance;
  createdAt: string;
  updatedAt: string;
}
```

### 14.2 状态

```ts
export type ProposalStatus =
  | "draft"
  | "validating"
  | "validated"
  | "needs-review"
  | "conflicted"
  | "accepted"
  | "partially-accepted"
  | "rejected"
  | "discarded"
  | "expired";
```

### 14.3 合法转换

```text
draft
  → validating
  → validated
  → needs-review

validating
  → draft        validation failed but editable
  → conflicted

validated
  → draft        explicit edit/reopen
  → needs-review
  → conflicted

needs-review
  → accepted
  → partially-accepted
  → rejected
  → conflicted

conflicted
  → draft        successful rebase/reopen
  → discarded

任何非终态
  → discarded
  → expired
```

终态：

```text
accepted
partially-accepted
rejected
discarded
expired
```

终态 Proposal 不得原地修改。

### 14.4 Proposal Revision

所有修改 Proposal 的请求必须携带：

```ts
export interface ProposalRef {
  proposalId: ProposalId;
  expectedProposalRevision: number;
}
```

成功后返回新的 `proposalRevision`。不匹配时返回 `PROPOSAL_REVISION_MISMATCH`。

`needs-review` 后 Proposal 内容冻结。继续修改必须：

- 创建新 Proposal；或
- 由产品控制器显式 reopen，生成新的 Proposal Revision，并使旧 Diff 失效。

Comet Agent 不得自行 reopen 已提交审阅的 Proposal。

### 14.5 Rebase 语义

Proposal Rebase：

- 不重写主分支 Revision；
- 生成新的 Proposal Revision；
- 更新 `baseRevisionId`；
- 保留旧 Proposal Revision 供审计；
- 重新验证 Scope、Evidence、Citation 和 Schema；
- 重新生成 Semantic Diff；
- 通过 `supersedes` 映射旧/新 Change Group。

### 14.6 过期策略

Proposal 可以因以下原因过期：

- 超过产品保留时限；
- Base Revision 距 head 超过策略阈值；
- Schema Major 变化；
- Source/Evidence 权限被撤销；
- Task 被删除且未进入审阅。

进入 `expired` 前必须保留可审计摘要，不得静默删除。

## 15. Semantic Diff 与部分接受

### 15.1 Semantic Diff 是核心模型

Semantic Diff 不只是字符 diff。它必须表达：

- 新增、改写、删除或移动了哪些结构；
- 新增或替换了哪些 Citation；
- Claim 与 Evidence 关系如何变化；
- 哪些修改必须一起接受；
- 哪些修改可以独立接受；
- 修改为什么被提出；
- 当前 Diff 基于哪个 Revision 和 Proposal Revision。

### 15.2 数据模型

```ts
export interface SemanticDiff {
  id: string;
  document: DocumentRef;
  proposalId: ProposalId;
  proposalRevision: number;
  generatedAgainstRevisionId: RevisionId;
  groups: ProposalChangeGroup[];
  summary: SemanticDiffSummary;
  diagnostics: Diagnostic[];
}

export interface ProposalChangeGroup {
  id: ProposalChangeGroupId;
  kind:
    | "insert-content"
    | "rewrite-content"
    | "delete-content"
    | "move-structure"
    | "add-citation"
    | "replace-citation"
    | "change-evidence"
    | "change-claim-relation"
    | "metadata";
  targetRefs: SemanticTargetRef[];
  operationIds: string[];
  dependsOn: ProposalChangeGroupId[];
  before?: DocumentFragment;
  after?: DocumentFragment;
  citationChanges: CitationChange[];
  evidenceChanges: EvidenceChange[];
  rationale?: string;
  warnings: Diagnostic[];
}
```

### 15.3 分组规则

第一版分组必须确定性：

- 同一 Paragraph 中连续的纯文本 Operation 默认合并为一个 rewrite group；
- 段落移动表达为 `move-structure`，不得退化为 delete + insert；
- Citation 插入默认独立 group，但如果正文内容依赖该 Citation 才成立，则正文 group 依赖 Citation group；
- 创建 Reference Snapshot、Evidence Link 和 Citation 的底层 Operation 可以聚合为一个 `add-citation` group；
- Claim 文本改写与其 Evidence relation 更新必须通过依赖关系连接；
- 删除包含 Citation 的段落必须显式展示 Citation 删除；
- 用户不可接受会破坏 Schema 或 Academic invariant 的 group 子集。

### 15.4 Group ID 稳定性

- 在同一 Proposal Revision 中，多次读取 Diff 必须返回相同 Group ID；
- Proposal 内容变化后生成新的 Proposal Revision 和新 Group ID；
- Rebase 后通过 `supersedes` 映射旧 Group 到新 Group；
- Group ID 不由模型生成；
- Group ID 不应由 UI 展示顺序决定。

### 15.5 部分接受

用户选择接受一组 Group 时，Review Service 必须计算依赖闭包：

```ts
interface AcceptProposalGroupsRequest {
  proposal: ProposalRef;
  acceptedGroupIds: ProposalChangeGroupId[];
  expectedHeadRevisionId: RevisionId;
}
```

处理流程：

1. 校验 Proposal 处于 `needs-review`；
2. 校验当前 head；
3. 计算依赖闭包；
4. 检查未接受 group 是否导致不完整语义；
5. 将选中 group 转换为一个原子 Transaction；
6. 记录用户 Actor；
7. 提交主分支；
8. Proposal 进入 `accepted` 或 `partially-accepted`；
9. 生成审阅结果和未接受内容摘要。

Agent 不能调用该接口。

### 15.6 Character Diff

Character Diff 是 Semantic Diff 的可选派生视图：

- 只用于显示；
- 不作为接受单位；
- 不作为 Transaction 的事实来源；
- 必须绑定 Revision 和 Group；
- 大文档中可以按需生成。

## 16. Editor View 与浏览器运行时

### 16.1 Model 与 Editor 分离

```ts
export interface INirecoEditor extends Disposable {
  getModel(): INirecoModel | null;
  setModel(model: INirecoModel | null): void;

  getSelection(): EditorSelection;
  setSelection(selection: EditorSelection): void;

  getViewState(): EditorViewState;
  restoreViewState(state: EditorViewState): void;

  executeCommand(id: string, args?: unknown): Promise<CommandResult>;
  focus(): void;
  layout(): void;
}
```

Selection 必须从 Model API 移出。不同 Editor 可以连接同一 Model 并拥有不同 Selection。

### 16.2 DOM 只是投影

```text
Document Snapshot
→ Render Tree
→ DOM Patch
```

DOM 不是真实状态。MutationObserver 只能用于检测 divergence 和浏览器 fallback，不得将任意 DOM 变化反向当成规范文档。

### 16.3 输入状态机

浏览器运行时必须显式管理：

```text
Idle
Composing
ApplyingTransaction
PatchingDOM
RestoringSelection
HandlingNativeFallback
RecoveringDivergence
Disposed
```

状态转换必须可测试，不允许用散落布尔值隐式表达。

### 16.4 beforeinput 映射

第一版至少覆盖：

| `inputType` | 默认策略 |
|---|---|
| `insertText` | preventDefault，构造 ReplaceText Transaction |
| `insertCompositionText` | composition buffer，结束时单 Transaction |
| `insertParagraph` | preventDefault，执行 split block command |
| `insertLineBreak` | preventDefault，插入 HardBreak 或按 Schema 拆分 |
| `deleteContentBackward` | grapheme-aware delete command |
| `deleteContentForward` | grapheme-aware delete command |
| `deleteWordBackward` | Unicode word boundary delete |
| `deleteByCut` | 由 Clipboard pipeline 生成 Transaction |
| `insertFromPaste` | sanitize → parse → validate → Transaction |
| `insertFromDrop` | sanitize → resolve target → Transaction |
| `historyUndo` | preventDefault，调用 Model History |
| `historyRedo` | preventDefault，调用 Model History |
| `formatBold` | command，不依赖浏览器 execCommand |

Safari 或移动端不可靠事件只能进入受控 fallback；fallback 产生的 DOM 差异必须被解析成 Transaction 或被恢复，不得直接保留。

### 16.5 IME 与 Composition

- 一次 composition 是一个 Undo Group；
- composition 中不执行会破坏候选窗口的 DOM 重建；
- composition target 必须绑定 Model Revision 和 TextNode；
- 主分支发生外部变化时，优先延迟 patch；无法安全映射则取消 composition 并恢复；
- composition 结束后生成单一 Transaction；
- 中文、日文、韩文和组合 Emoji 必须进入浏览器矩阵测试。

### 16.6 Clipboard

Paste pipeline：

```text
Read clipboard
→ classify MIME
→ sanitize untrusted payload
→ parse into import fragment
→ schema adaptation
→ asset extraction
→ academic link validation
→ preview diagnostics if lossy
→ atomic Transaction
```

不得直接将 clipboard HTML 插入 DOM。复制时应同时提供：

- `text/plain`；
- 安全 HTML；
- Nireco 私有结构化 fragment MIME。

### 16.7 DOM Divergence

检测到浏览器或扩展造成的 DOM divergence 时：

1. 暂停用户命令；
2. 判断是否是已知 native fallback；
3. 能解析则生成 Transaction；
4. 不能解析则从 Model 重新渲染受影响 subtree；
5. 恢复 Selection；
6. 记录 Diagnostic 和 Trace；
7. 连续 divergence 超过阈值时进入只读保护模式。

### 16.8 Event 顺序

一次成功输入的规范事件顺序：

```text
editor.willExecuteCommand
model.willApplyTransaction
model.didCommitRevision
editor.willPatchDOM
editor.didPatchDOM
editor.didChangeSelection
storage.didChangeDurability   // 异步
```

- reducer 期间不发布可重入事件；
- listener 触发的新 Transaction 排队至下一轮；
- Event payload 不可变；
- View event 和 Model event 必须区分；
- 事件顺序进入 conformance tests。

### 16.9 Accessibility

必须支持：

- 语义 HTML；
- 键盘完整操作；
- 屏幕阅读器可读的 Citation、Equation、Figure 和 Review 状态；
- 高对比度和系统缩放；
- 不依赖颜色表达 Diff；
- Proposal change group 的可导航描述；
- IME 和辅助技术共存测试。

## 17. Commands、Features 与公共 Editor API

### 17.1 Command

```ts
export interface CommandDefinition<TArgs = unknown> {
  id: string;
  canExecute(context: CommandContext, args: TArgs): boolean;
  execute(context: CommandContext, args: TArgs): Promise<CommandResult>;
}
```

Command 只能通过 Model API 产生 Transaction，不直接改 DOM。

### 17.2 Feature 与核心能力分离

```text
academic/citations
- Citation 数据模型
- Operation
- 校验
- 索引

features/citation-picker
- UI 搜索
- 候选列表
- 插入交互
```

关闭 Feature 不得使文档中的核心节点失效。

第一方 Feature：

- find；
- outline；
- comments；
- citation-picker；
- evidence-inspector；
- bibliography-preview；
- proposal-review；
- diagnostics-panel。

`proposal-review` 不命名为 `agent-review`，因为 Proposal 是通用文档能力。

### 17.3 0.x 扩展策略

- Feature API 先保持内部；
- 只公开窄 Provider，如 Storage、Asset、Export、Telemetry；
- 不开放任意 Schema Extension；
- 不开放第三方 Kernel Plugin；
- 不建立插件市场；
- Comet 第一方能力通过私有集成入口和受控 Feature 注入。

### 17.4 Web Component

```html
<nireco-editor
  resource-uri="nireco://workspace-01/document/doc-7QH9V8"
  readonly="false"
></nireco-editor>
```

Web Component 是薄包装，主入口仍为 imperative API。

## 18. Canonical Serialization、Hash、Storage 与文件格式

### 18.1 Canonical Encoding

Nireco 定义 `Nireco Canonical JSON Profile`，采用 RFC 8785 风格规则：

- 对象键按 Unicode code point 排序；
- 数字使用确定性 JSON 表达；
- 不输出无意义空字段；
- Array 顺序保留；
- Mark、属性和 Map 转换有固定顺序；
- 字符串不做隐式 Unicode normalization；
- 禁止 NaN、Infinity 和非 JSON 值。

TS 和未来 Rust 实现必须通过相同 Golden Fixture。

### 18.2 Hash

统一使用 SHA-256：

```text
DocumentHash
TransactionHash
AssetHash
EvidenceExcerptHash
```

Document Content Hash 包含：

- schemaId；
- schemaVersion；
- metadata 中的语义字段；
- root tree；
- academicGraph；
- semantic settings。

明确排除：

- updatedAt；
- UI ViewState；
- telemetry；
- volatile cache；
- model/provider 信息；
- durability 状态。

### 18.3 `.nireco` 包

建议逻辑布局：

```text
manifest.json
snapshots/<revision-id>.json
transactions/<segment>.log
proposals/<proposal-id>.json
review/<proposal-id>.json
assets/<sha256>
indexes/                       # 可删除可重建
attachments/                  # 文稿附件
```

不默认包含完整研究 PDF。Evidence 最小快照可存于 Proposal 或 academic graph。

### 18.4 事实来源

```text
规范事实来源：Snapshot + Transaction Log
可重建派生：indexes、outline、bibliography、diagnostics cache
审计持久化：Proposal、Review result、Provenance summary
```

`document.json` 或 `graph.json` 若存在，只能作为最新 Snapshot 的可读镜像，不能成为与 Transaction Log 并列的第二事实来源。

### 18.5 原子写入与 WAL

- WAL record 使用长度前缀和 checksum；
- append + fsync 成功才进入 `wal` durability；
- Snapshot 使用临时文件写入、校验、原子 rename；
- Snapshot 完成后再更新 manifest head；
- 崩溃恢复不能依赖最后修改时间；
- 多进程写入必须通过 Authority lock；
- 锁失效时必须重新校验 head Revision。

### 18.6 加密与备份

0.x 至少预留：

- Storage Adapter 层的静态加密；
- 密钥不进入文档包；
- 备份包含 Snapshot、必要 WAL、Proposal 和资产；
- 恢复后验证 Document Hash；
- 敏感 Evidence excerpt 可按 Comet Policy 禁止落盘。

## 19. 派生数据、Diagnostics 与一致性

### 19.1 派生数据

以下内容不是规范事实来源：

- Outline；
- Bibliography；
- Figure/Table/Equation numbering；
- Search Index；
- Claim Index；
- Citation Index；
- Diagnostics；
- Character Diff；
- Semantic Diff cache；
- Renderer cache。

### 19.2 Revision-bound Result

所有派生结果必须声明其 Revision：

```ts
export interface RevisionBoundResult<T> {
  document: DocumentRef;
  basedOnRevisionId: RevisionId;
  consistency: "exact" | "eventual";
  status: "current" | "stale" | "computing" | "failed";
  value?: T;
  diagnostics?: Diagnostic[];
}
```

Comet 不得把不同 Revision 的 Outline、Nodes、Diagnostics 和 Evidence Link 拼入同一任务上下文而不显式处理。

### 19.3 Task Snapshot 一致性

Comet Session 默认固定读取 `baseRevisionId`：

- `get_outline`、`read_nodes`、`search` 和 `get_diagnostics` 默认基于同一 Snapshot；
- 需要最新 head 时必须调用 `document.get_changes_since` 或重新建立 Session；
- Cursor 必须绑定 Session、Revision 和 Scope；
- Cursor 过期或 Revision 变化时不得继续使用。

### 19.4 Diagnostic

```ts
export interface Diagnostic {
  id: string;
  source: string;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  target?: SemanticTargetRef;
  basedOnRevisionId: RevisionId;
  stale: boolean;
  related?: DiagnosticRelatedInformation[];
  suggestedFix?: ProposedFix;
}
```

Suggested Fix 只能创建 Proposal 或 Transaction draft，不能直接改文档。

## 20. Nireco Document Services

### 20.1 服务原则

Document Services 是 Nireco 内部确定性应用能力，不是 LLM Tools。它们必须：

- 接受版本化 ResourceRef；
- 返回 typed result 和 typed error；
- 不接受 Prompt；
- 不依赖模型 SDK；
- 不允许任意 HTML、JavaScript 或 Raw DOM；
- 不暴露 Kernel 私有对象；
- 支持取消；
- 对写操作支持 idempotency；
- 可在 in-process、Worker、IPC 或 internal RPC 中传输。

### 20.2 服务清单

#### Model 与读取

```text
workspace.resolve_model
document.get_head
document.get_snapshot
document.get_outline
document.read_nodes
document.read_node_neighborhood
document.search
document.get_changes_since
document.get_diagnostics
```

#### Proposal

```text
proposal.create
proposal.stage_semantic_edits
proposal.validate
proposal.get_diff
proposal.rebase
proposal.submit_for_review
proposal.discard
```

#### Academic

```text
academic.get_reference_snapshots
academic.get_claims
academic.get_evidence_links
academic.validate_citation_support
academic.get_cross_references
academic.generate_bibliography
```

#### Review Controller，仅用户产品层

```text
review.accept_groups
review.reject_proposal
review.commit_all
```

#### 明确不提供给 Comet Agent Session

```text
transaction.apply_raw
storage.write
schema.register
revision.rewrite
history.compact
review.accept_groups
review.commit_all
```

### 20.3 读取分页

```ts
export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
  truncated: boolean;
  basedOnRevisionId: RevisionId;
  approximateBytes: number;
}
```

规则：

- 不能静默截断；
- Cursor 绑定 Session、Revision、Scope 和查询 hash；
- Cursor 不泄露数据库主键；
- Cursor 有到期时间；
- Request/Response 大小上限由 Contract Manifest 声明。

### 20.4 Error 模型

```ts
export interface NirecoError {
  code: NirecoErrorCode;
  category:
    | "validation"
    | "conflict"
    | "permission"
    | "compatibility"
    | "storage"
    | "transport"
    | "internal";
  retryable: boolean;
  safeMessage: string;
  debugId: string;
  currentRevisionId?: RevisionId;
  requiredCapability?: string;
  conflictingTargets?: SemanticTargetRef[];
  suggestedAction?:
    | "retry"
    | "reread"
    | "rebase"
    | "request-permission"
    | "user-review"
    | "abort";
}
```

Comet 不得解析英文错误文本决定恢复策略。

## 21. Nireco–Comet 私有集成契约

### 21.1 产品路径

```text
Comet User / Comet Task API
            ↓
Comet Specialized Agent
            ↓
Comet Private Agent Tools
            ↓
Comet Nireco Adapter
            ↓
Nireco–Comet Integration Contract
            ↓
Nireco Document Services
            ↓
Nireco Model / Kernel
```

不存在：

```text
External Agent → Nireco Tools
External Agent → Nireco MCP
External Agent → Nireco Services
Comet Agent → Nireco Kernel private API
Comet Agent → DOM / Storage / Raw Transaction
```

### 21.2 两层契约

#### Nireco Integration Contract

- 位于 Nireco；
- 面向受信 Comet Adapter；
- 确定性；
- 版本稳定；
- 传输无关；
- 使用完整类型；
- 不为 token 压缩优化；
- 不包含 Tool 描述、Prompt 或模型示例。

#### Comet Private Agent Tool Schema

- 位于 Comet；
- 面向模型调用；
- 高层任务语义；
- 可按模型能力快速演进；
- 包含描述、使用条件、示例和 token 预算；
- 可以组合多个 Nireco Service 和 Comet Provider；
- 不对外发布；
- 不构成 Nireco API。

### 21.3 Contract Bundle

Nireco 在真实服务完成前必须交付：

```text
contract.manifest.json
schemas/*.schema.json
generated-types/*.d.ts
error-codes.json
capability-matrix.json
semantic-edits.json
fixtures/*.json
mock-service/
conformance-runner/
CHANGELOG.md
sample-traces/
```

Comet 必须能够只依赖该 Bundle 完成 Adapter、Tool Registry、Fake Agent Workflow、Task State、Error Recovery 和 Proposal Review 集成。

### 21.4 握手

```ts
export interface CometIntegrationHandshakeRequest {
  requestedContractVersion: string;
  cometBuildId: string;
  adapterVersion: string;
  workflowId: string;
  requiredCapabilities: IntegrationCapability[];
  requiredSemanticEdits: SemanticEditKind[];
}

export interface CometIntegrationHandshakeResult {
  acceptedContractVersion: string;
  nirecoBuildId: string;
  documentFormatVersion: string;
  schemaVersion: string;
  transactionProtocolVersion: string;
  proposalProtocolVersion: string;
  supportedCapabilities: IntegrationCapability[];
  supportedSemanticEdits: SemanticEditKind[];
  limits: ContractLimits;
  featureFlags: Record<string, boolean>;
}
```

Major 不兼容必须拒绝。Comet 必须显式确认每项 required capability；不得以低层危险操作模拟不支持的 Semantic Edit。

### 21.5 Task-bound Session

```ts
export interface OpenCometSessionRequest {
  contractVersion: string;
  target: DocumentRef;
  taskId: string;
  traceId: string;
  actor: {
    type: "comet-agent";
    id: string;
    workflowId: string;
    modelRef?: string;
  };
  requestedCapabilities: IntegrationCapability[];
  scope: CometDocumentScope;
  constraints: CometIntegrationConstraints;
  policySnapshotId: string;
}
```

Session 返回实际授权的 capability、scope、预算、到期时间和 `capabilityGrantId`。Requested 不等于 Granted。

Agent Session 永远不授予：

```text
document.commit
document.raw-transaction
document.storage.write
document.schema.mutate
review.accept
review.commit
```

### 21.6 Capability

```ts
export type IntegrationCapability =
  | "document.outline.read"
  | "document.content.read"
  | "document.search"
  | "document.diagnostics.read"
  | "academic.references.read"
  | "academic.evidence.read"
  | "academic.claims.read"
  | "proposal.create"
  | "proposal.edit"
  | "proposal.validate"
  | "proposal.rebase"
  | "proposal.submit-review"
  | "citation.propose"
  | "evidence.propose";
```

### 21.7 Scope 与约束

```ts
export interface CometDocumentScope {
  allowedSectionIds?: NodeId[];
  allowedNodeIds?: NodeId[];
  allowReadOutsideScopeForContext?: boolean;
  maxContextDistance?: number;
}

export interface CometIntegrationConstraints {
  maxChangedUtf16Units?: number;
  maxOperations?: number;
  maxNewReferences?: number;
  maxDeletedNodes?: number;
  maxMovedNodes?: number;
  requireEvidenceForCitation: boolean;
  requireVerifiedEvidence: boolean;
  allowMetadataOnlyCitation: boolean;
  allowDelete: boolean;
  allowStructureMove: boolean;
}
```

Scope 扩大必须由用户或受信产品策略重新授权，Agent 不能自行申请后立即视为生效。

## 22. Semantic Edit 协议

### 22.1 高层编辑，不暴露 offset-level Tool

Comet Adapter 向 Nireco 提交高层 Semantic Edit；模型不能直接提交 Raw Operation：

```ts
export type SemanticEdit =
  | InsertBlockEdit
  | ReplaceBlockContentEdit
  | MoveBlockEdit
  | DeleteBlockEdit
  | InsertCitationEdit
  | ReplaceCitationEdit
  | CreateClaimEdit
  | LinkClaimEvidenceEdit
  | CreateEvidenceLinkEdit
  | UpdateMetadataEdit;
```

### 22.2 示例：插入段落

```ts
export interface InsertBlockEdit {
  kind: "insert-block";
  clientRef: string;
  target: {
    parentNodeId: NodeId;
    afterNodeId?: NodeId;
    beforeNodeId?: NodeId;
  };
  block: ProposedBlockContent;
  rationale?: string;
  preconditions?: SemanticPrecondition[];
}
```

### 22.3 示例：改写内容

```ts
export interface ReplaceBlockContentEdit {
  kind: "replace-block-content";
  targetNodeId: NodeId;
  expectedContentHash: ContentHash;
  replacement: ProposedInlineContent[];
  preserveCitations: "all" | "none" | "explicit";
  explicitCitationIds?: EntityId[];
  rationale: string;
}
```

### 22.4 示例：插入支持性 Citation

```ts
export interface InsertCitationEdit {
  kind: "insert-citation";
  clientRef: string;
  target: SemanticPosition;
  claimId?: EntityId;
  referenceId: EntityId;
  evidenceIds: EntityId[];
  relation:
    | "supports"
    | "partially-supports"
    | "contradicts"
    | "context-only";
  locator?: CitationLocator;
  prefix?: string;
  suffix?: string;
  rationale: string;
}
```

### 22.5 Semantic Edit 转换

Nireco Proposal Service 负责：

```text
Semantic Edit
→ Scope validation
→ Resolve IDs/clientRefs
→ Schema validation
→ Academic validation
→ Compile to Operations
→ Build Proposal Revision
→ Semantic Diff
```

Comet Adapter 不得重复实现该编译逻辑。

## 23. Comet Private Agent Tools：详细实施规格

本节供 Comet 团队直接实现。Tool 名称和输入输出属于 Comet 私有实现，但其语义必须映射到 Nireco Contract，不得绕过 Proposal。

### 23.1 Tool 分层

```text
Inspection Tools
Writing Proposal Tools
Evidence/Citation Tools
Proposal Control Tools
Comet-only Source Tools
```

所有 mutating Tool 只修改 Proposal，不修改主分支。

### 23.2 `comet.document.inspect`

用途：获取文稿结构、元数据、当前 Scope、Revision 和高层诊断。

```ts
interface DocumentInspectInput {
  includeOutline?: boolean;
  includeMetadata?: boolean;
  includeDiagnostics?: boolean;
  maxOutlineDepth?: number;
}

interface DocumentInspectOutput {
  document: DocumentRef;
  title?: string;
  documentType?: string;
  language?: string;
  outline?: OutlineItem[];
  diagnostics?: ToolDiagnostic[];
  scope: CometDocumentScope;
  limits: SessionLimits;
}
```

Nireco 映射：`document.get_outline`、`document.get_diagnostics`。

### 23.3 `comet.document.read`

用途：读取明确节点、章节片段或邻近内容。

```ts
interface DocumentReadInput {
  nodeIds?: NodeId[];
  sectionId?: NodeId;
  neighborhood?: {
    nodeId: NodeId;
    beforeBlocks: number;
    afterBlocks: number;
  };
  includeAcademicRelations?: boolean;
  cursor?: string;
}

interface DocumentReadOutput {
  basedOnRevisionId: RevisionId;
  nodes: ReadableDocumentNode[];
  academicRelations?: ReadableAcademicRelation[];
  nextCursor?: string;
  truncated: boolean;
}
```

不得提供一个由 Nireco 决定“最适合模型”的 `read_context`。上下文选择策略属于 Comet Context Builder；Nireco 只提供确定性读取原语。

### 23.4 `comet.document.search`

```ts
interface DocumentSearchInput {
  query: string;
  sectionIds?: NodeId[];
  kinds?: Array<"text" | "citation" | "claim" | "heading">;
  maxResults?: number;
  cursor?: string;
}
```

输出必须包含 Revision、稳定 Node/Entity Ref、片段和匹配类型，不返回裸 DOM offset。

### 23.5 `comet.manuscript.propose_insert`

用途：在指定结构位置插入一组结构化 block。

```ts
interface ProposeInsertInput {
  target: {
    parentNodeId: NodeId;
    afterNodeId?: NodeId;
    beforeNodeId?: NodeId;
  };
  blocks: ProposedBlockContent[];
  supportingEvidenceIds?: EntityId[];
  rationale: string;
}

interface ProposeInsertOutput {
  proposalId: ProposalId;
  proposalRevision: number;
  assignedIds: AssignedIdMap;
  diagnostics: ToolDiagnostic[];
}
```

Tool Executor 必须从可信 Task 状态注入 ProposalRef、DocumentRef、Session、Capability Grant 和 Idempotency Key。

### 23.6 `comet.manuscript.propose_rewrite`

```ts
interface ProposeRewriteInput {
  targetNodeId: NodeId;
  expectedContentHash: ContentHash;
  replacement: ProposedInlineContent[];
  citationPolicy:
    | "preserve-existing"
    | "replace-explicitly"
    | "remove-with-justification";
  retainedCitationIds?: EntityId[];
  supportingEvidenceIds?: EntityId[];
  rationale: string;
}
```

要求：

- 不允许只传“查找这句话并替换”；
- 必须使用 NodeId 和 expectedContentHash；
- 删除 Citation 时必须显式列出并说明；
- Claim 发生变化时触发 Evidence relation 重新校验。

### 23.7 `comet.manuscript.propose_restructure`

```ts
interface ProposeRestructureInput {
  moves: Array<{
    nodeId: NodeId;
    newParentNodeId: NodeId;
    afterNodeId?: NodeId;
    beforeNodeId?: NodeId;
  }>;
  rationale: string;
}
```

要求：

- Session 必须授予 `allowStructureMove`；
- 不允许通过 delete + reinsert 模拟 move；
- CrossReference、Claim Anchor 和 Comment Anchor 必须经过映射；
- 大规模重组超过预算时拆成多个 Proposal 或要求用户批准 Scope。

### 23.8 `comet.evidence.propose`

用途：将 Comet 已读取、已定位的来源内容建立为 Nireco Evidence Link。

```ts
interface EvidenceProposeInput {
  sourceUri: ResourceUri;
  sourceContentHash: ContentHash;
  locator: EvidenceLocator;
  excerpt: string;
  relationHint?:
    | "supports"
    | "partially-supports"
    | "contradicts"
    | "context-only"
    | "unclear";
  targetClaimId?: EntityId;
}
```

模型只能提出 locator、excerpt 和 relationHint。Comet Tool Executor 必须：

1. 从受信 Source Provider 重新读取 locator；
2. 校验 sourceContentHash；
3. 校验 excerpt 与来源内容一致；
4. 计算 excerptHash；
5. 注入 verified actor、时间和 extraction version；
6. 调用 Nireco 创建 Evidence Link Proposal。

模型不得自行声明 `verified: true`。

### 23.9 `comet.citations.propose_supported_citation`

```ts
interface ProposeSupportedCitationInput {
  target: SemanticPosition;
  claimId?: EntityId;
  referenceId: EntityId;
  evidenceIds: EntityId[];
  relation:
    | "supports"
    | "partially-supports"
    | "contradicts"
    | "context-only";
  citation: {
    locator?: CitationLocator;
    prefix?: string;
    suffix?: string;
  };
  rationale: string;
}

interface ProposeSupportedCitationOutput {
  proposalId: ProposalId;
  proposalRevision: number;
  citationId: EntityId;
  verificationStatus:
    | "verified"
    | "provisional"
    | "metadata-only"
    | "rejected";
  diagnostics: ToolDiagnostic[];
}
```

规则：

- Citation Tool 只能引用已存在的 Reference Snapshot 和 Evidence Link；
- 模型不得在该 Tool 内临时提交 DOI 元数据、Source hash 或 excerpt hash；
- 新来源先走 Comet Source Import 和 Evidence Workflow；
- Evidence 必须与 Reference 的合法 Source 关系一致；
- `context-only` 不得被描述为支持结论；
- Evidence stale 时拒绝或降级；
- 无 Evidence 时按 Policy 阻止或标记 metadata-only；
- Reference 去重由 Nireco Service 决定。

### 23.10 `comet.citations.audit`

用途：检查 Scope 内 Citation 和 Claim–Evidence 关系。

```ts
interface CitationAuditInput {
  sectionIds?: NodeId[];
  includeMetadataOnly?: boolean;
  includeStaleEvidence?: boolean;
  includeUnsupportedClaims?: boolean;
}

interface CitationAuditOutput {
  findings: Array<{
    code:
      | "missing-evidence"
      | "stale-evidence"
      | "citation-not-linked-to-claim"
      | "claim-changed"
      | "source-unavailable"
      | "context-only-used-as-support"
      | "duplicate-reference";
    target: SemanticTargetRef;
    severity: "info" | "warning" | "error";
    suggestedWorkflow?: string;
  }>;
  basedOnRevisionId: RevisionId;
}
```

Audit 本身只读。自动修复必须另建 Proposal。

### 23.11 `comet.claims.find_unsupported`

输出 Claim、文本快照、现有 Citation、Evidence relation 和缺口类型。不得把所有未带 Citation 的句子都等同为需要引用；Comet Workflow 应结合段落类型和写作政策判断。

### 23.12 `comet.proposal.preview`

```ts
interface ProposalPreviewInput {
  includeCharacterDiff?: boolean;
  includeEvidenceDiff?: boolean;
}

interface ProposalPreviewOutput {
  proposalId: ProposalId;
  proposalRevision: number;
  status: "valid" | "warning" | "invalid" | "conflicted";
  semanticDiff: SemanticDiff;
  diagnostics: ToolDiagnostic[];
  conflicts: ProposalConflict[];
}
```

### 23.13 `comet.proposal.rebase`

```ts
interface ProposalRebaseInput {
  targetHeadRevisionId: RevisionId;
}
```

Comet 不得在 Adapter 中手工修改 Semantic Edit 目标。所有映射由 Nireco Proposal Service 完成。

### 23.14 `comet.proposal.submit_for_review`

```ts
interface SubmitForReviewInput {
  summary: string;
  userVisibleRationale: string;
}
```

成功后 Proposal 进入 `needs-review`，Agent 不得继续修改、接受或提交。

### 23.15 不存在的 Agent Tools

```text
comet.document.commit
comet.document.apply_raw_transaction
comet.document.execute_javascript
comet.document.set_html
comet.proposal.accept
comet.proposal.merge
comet.storage.write
comet.schema.register
```

## 24. Tool Invocation Envelope、权限与幂等

### 24.1 可信 Envelope

```ts
export interface CometToolInvocationEnvelope<TInput> {
  toolName: string;
  toolVersion: string;
  toolInvocationId: string;
  idempotencyKey?: string;

  taskId: string;
  traceId: string;
  sessionId: SessionId;
  target: DocumentRef;
  proposalRef?: ProposalRef;
  policySnapshotId: string;
  capabilityGrantId: string;

  input: TInput;
}
```

只有 `input` 的业务参数可来自模型。以下字段必须由 Comet Host 从可信状态注入：

- taskId；
- traceId；
- sessionId；
- target URI/Revision；
- proposalId/proposalRevision；
- policySnapshotId；
- capabilityGrantId；
- idempotencyKey；
- actor/model/workflow metadata。

### 24.2 结果 Envelope

```ts
export interface CometToolResultEnvelope<TOutput> {
  toolInvocationId: string;
  status: "ok" | "error";
  output?: TOutput;
  error?: CometToolError;
  warnings: ToolWarning[];
  basedOnRevisionId?: RevisionId;
  proposalId?: ProposalId;
  proposalRevision?: number;
  trace: {
    nirecoRequestIds: string[];
    durationMs: number;
  };
}
```

### 24.3 Idempotency

- 所有 mutating Tool 必须有 idempotency key；
- 同一 Session、Tool、Key 和相同 input hash 返回相同结果；
- 同 Key 不同 input 返回 `IDEMPOTENCY_CONFLICT`；
- 断线重试不得重复创建 Proposal、Evidence、Citation 或 Revision；
- 幂等记录保留期限必须长于最大 Task 重试窗口。

### 24.4 Tool Error 映射

至少支持：

```text
CONTRACT_VERSION_UNSUPPORTED
CAPABILITY_UNSUPPORTED
SESSION_EXPIRED
SESSION_REVOKED
SCOPE_VIOLATION
BASE_REVISION_MISMATCH
PROPOSAL_REVISION_MISMATCH
NODE_NOT_FOUND
ANCHOR_ORPHANED
REQUEST_TOO_LARGE
SCHEMA_INVALID
SEMANTIC_EDIT_UNSUPPORTED
PROPOSAL_LOCKED
PROPOSAL_CONFLICT
EVIDENCE_REQUIRED
EVIDENCE_STALE
CITATION_SUPPORT_INVALID
POLICY_VIOLATION
IDEMPOTENCY_CONFLICT
CANCELLED
TEMPORARY_UNAVAILABLE
INTERNAL_ERROR
```

推荐恢复策略：

| 错误 | Comet 行为 |
|---|---|
| `BASE_REVISION_MISMATCH` | 读取 changes_since，尝试 rebase |
| `PROPOSAL_REVISION_MISMATCH` | 重新读取 Proposal，不盲重试 |
| `ANCHOR_ORPHANED` | 重新搜索目标或请求用户选择 |
| `SCOPE_VIOLATION` | 终止 Tool，不自动扩大 Scope |
| `EVIDENCE_REQUIRED` | 执行 Evidence Workflow |
| `EVIDENCE_STALE` | 重新读取 Source 并校验 hash |
| `PROPOSAL_CONFLICT` | 调用 proposal.rebase，失败则用户处理 |
| `POLICY_VIOLATION` | 阻止，不允许 Prompt 绕过 |
| `TEMPORARY_UNAVAILABLE` | 使用同 idempotency key 有界重试 |
| `CONTRACT_VERSION_UNSUPPORTED` | 阻止任务并提示升级 |

## 25. Comet Agent Task、Context 与审计

### 25.1 Task 状态

```text
Created
→ Authorized
→ Contract Handshake
→ Session Opened
→ Context Prepared
→ Planning
→ Tool Execution
→ Proposal Validation
→ Proposal Ready
→ User Review
→ Accepted / Partially Accepted / Rejected / Conflicted
→ Archived
```

### 25.2 Context Builder

Comet 不得默认发送整篇文档和全部来源。Context Builder 按任务构建：

- System Policy；
- User Instruction；
- 固定 Revision 的 Outline；
- Scope 内节点；
- 邻近结构；
- 选定 Evidence；
- Citation Style；
- 当前 Diagnostics；
- Base Revision 与变更摘要；
- 可用 Tool 和版本。

上下文类型必须保持隔离：

```text
SYSTEM_POLICY
USER_INSTRUCTION
DOCUMENT_CONTENT
SOURCE_EVIDENCE
TOOL_RESULT
```

PDF、网页和文档内容中的指令文字只能作为数据，不能改变 Tool 权限。

### 25.3 Audit 与 Provenance

Comet 保存：

- Task、Plan、Model Request、Tool Invocation；
- Tool input/output hash；
- Workflow/Model ref；
- Provider 状态；
- 完整内部评估数据。

Nireco 保存：

- opaque Comet Task ID；
- Tool Invocation ID reference；
- Proposal、Transaction、Revision 关联；
- Actor；
- 用户审阅结果；
- Citation/Evidence provenance。

原始 Prompt、完整模型输出、模型私有推理和 Provider credential 不进入 Nireco 文档包。

## 26. Transport 与部署

### 26.1 支持的私有 Transport

```text
In-process TypeScript
Web Worker RPC
Electron / Tauri IPC
Authenticated local socket
Authenticated internal RPC
```

第一阶段不提供 MCP，不允许公开网络访问 Nireco Integration Contract。

### 26.2 Transport 规则

- Transport 只处理序列化、身份、取消、超时和认证；
- Transport 不重新定义业务语义；
- 同一 Contract Fixture 在各 Transport 下行为一致；
- Request 和 Response 有字节上限；
- 流式读取必须保持 Revision 和 Cursor 绑定；
- 断线重试遵守 idempotency；
- 错误必须保留 typed code，不降级为字符串；
- 敏感内容不得出现在 URL query 或无保护日志。

### 26.3 Web 部署

```text
Comet Browser UI
  ├── Nireco Editor Runtime
  └── Comet Product Client
          ↕ authenticated task transport
Comet Agent Host / Source Services
          ↕ private contract transport
Nireco Document Authority
```

具体 Authority 位于浏览器还是服务端由部署 ADR 决定，但任一时刻必须有唯一主分支 Authority。

### 26.4 Desktop 部署

```text
Nireco Web Editor
    ↓ Desktop IPC
Local Comet Host / Nireco Authority
    ├── Local files
    ├── Local index
    ├── Local or remote model
    └── Optional sync
```

### 26.5 企业部署

```text
Comet Client
→ Enterprise Comet Agent Host
→ Private Model / Search / Sources
→ Nireco Private Contract
→ Enterprise Document Authority
```

允许 BYOM，但不允许外部 Agent 直接控制 Nireco。

## 27. 仓库、源码模块与发布边界

### 27.1 Nireco 仓库

Nireco 0.x 使用单一主包、模块化单体：

```text
nireco/
├── src/
│   ├── base/
│   │   ├── uri/
│   │   ├── event/
│   │   ├── lifecycle/
│   │   ├── cancellation/
│   │   ├── errors/
│   │   ├── hashing/
│   │   └── serialization/
│   ├── workspace/
│   │   ├── workspace.ts
│   │   ├── model-registry.ts
│   │   ├── schema-registry.ts
│   │   ├── resource-provider-registry.ts
│   │   └── authority.ts
│   ├── model/                         # 第一层核心
│   │   ├── model.ts
│   │   ├── resource-ref.ts
│   │   ├── snapshot.ts
│   │   ├── schema/
│   │   ├── node/
│   │   ├── position/
│   │   ├── operation/
│   │   ├── transaction/
│   │   ├── mapping/
│   │   ├── revision/
│   │   ├── history/
│   │   ├── validation/
│   │   └── normalization/
│   ├── proposal/
│   │   ├── proposal.ts
│   │   ├── state-machine.ts
│   │   ├── semantic-edit.ts
│   │   ├── semantic-diff.ts
│   │   ├── review-group.ts
│   │   ├── rebase.ts
│   │   └── review-controller.ts
│   ├── academic/
│   │   ├── manuscript/
│   │   ├── references/
│   │   ├── citations/
│   │   ├── evidence-links/
│   │   ├── claims/
│   │   ├── bibliography/
│   │   ├── equations/
│   │   ├── figures/
│   │   ├── tables/
│   │   └── cross-references/
│   ├── services/
│   │   ├── document-service/
│   │   ├── proposal-service/
│   │   ├── academic-service/
│   │   ├── diagnostic-service/
│   │   └── export-service/
│   ├── editor/
│   │   ├── common/
│   │   └── browser/
│   │       ├── input/
│   │       ├── composition/
│   │       ├── rendering/
│   │       ├── selection/
│   │       ├── clipboard/
│   │       ├── drag-drop/
│   │       ├── decorations/
│   │       ├── widgets/
│   │       └── accessibility/
│   ├── features/                      # 源码 Feature，不是 npm 包
│   │   ├── find/
│   │   ├── outline/
│   │   ├── comments/
│   │   ├── citation-picker/
│   │   ├── evidence-inspector/
│   │   ├── bibliography-preview/
│   │   ├── proposal-review/
│   │   └── diagnostics-panel/
│   ├── storage/
│   ├── codecs/
│   ├── integration/
│   │   └── comet/                     # 私有确定性契约
│   ├── public/
│   └── entrypoints/
├── contracts/
│   └── comet-integration/
├── tests/
│   ├── unit/
│   ├── property/
│   ├── fuzz/
│   ├── browser/
│   ├── conformance/
│   └── comet-contract/
├── apps/
│   ├── playground/
│   ├── integration-reference/
│   └── benchmark/
├── fixtures/
├── benchmarks/
├── docs/
├── adr/
└── package.json
```

### 27.2 Comet 仓库

```text
comet/
├── src/
│   ├── product/
│   │   ├── editor-shell/
│   │   ├── agent-panel/
│   │   ├── proposal-review/
│   │   └── task-api/
│   ├── integrations/
│   │   └── nireco/
│   │       ├── contract-loader/
│   │       ├── client/
│   │       ├── adapter/
│   │       ├── error-mapping/
│   │       ├── retry/
│   │       ├── transport/
│   │       └── conformance/
│   ├── agent/
│   │   ├── host/
│   │   ├── planner/
│   │   ├── executor/
│   │   ├── context/
│   │   ├── task-state/
│   │   ├── policies/
│   │   ├── evaluations/
│   │   └── workflows/
│   ├── agent-tools/
│   │   ├── document/
│   │   ├── manuscript/
│   │   ├── citations/
│   │   ├── evidence/
│   │   ├── sources/
│   │   └── proposals/
│   ├── providers/
│   │   ├── models/
│   │   ├── retrieval/
│   │   ├── sources/
│   │   └── sync/
│   └── security/
├── tests/
│   ├── agent-tools/
│   ├── workflows/
│   ├── nireco-contract/
│   ├── evaluations/
│   └── end-to-end/
└── package.json
```

### 27.3 Package 决策

Nireco 初始只发布一个私有主包：

```text
@comet-internal/nireco-editor
```

通过受控 subpath export 暴露：

```text
.
./web-component
./protocol
./comet-internal
```

`features` 是源码组织，不是多包组合。只有满足独立部署、独立 peer dependency、独立安全周期或跨仓契约等真实条件时，才通过 ADR 拆包。

Contract Bundle 可以作为独立私有制品，因为它有跨仓和独立版本职责。

### 27.4 禁止目录

Nireco 不得包含：

```text
agent-host/
planner/
prompts/
model-adapters/
public-mcp/
external-agent-sdk/
```

Comet Agent 代码不得 import Nireco 私有 Kernel 目录。

## 28. 非功能性要求

### 28.1 性能档位

```text
S：20,000 字，100 段，100 引用
M：100,000 字，800 段，500 引用
L：300,000 字，2,500 段，1,500 引用
```

第一阶段：

- S/M 普通输入到 DOM patch 的 P95 < 16 ms；
- 单局部 Transaction 不默认重建整树；
- Outline、Node read、Search 和 Proposal validation 支持增量索引；
- Comet 不默认读取整篇文档；
- Diff 和 Diagnostics 可异步，但必须标记 Revision 和 stale 状态；
- 大 Evidence 使用分页或资源引用。

### 28.2 正确性优先级

```text
数据不损坏
> Revision/Anchor 正确
> 用户输入正确
> Agent Proposal 可审阅
> 性能优化
> 视觉精细度
```

不得为了低延迟跳过 Schema、Revision、Scope 或 Citation 校验。

### 28.3 可恢复性

- 导入失败不污染原文档；
- Comet 任务失败不影响主分支；
- Transport 重试不重复副作用；
- Proposal 和 Review 状态可恢复；
- Contract 不兼容时 fail closed；
- Storage corruption 进入 recovery mode；
- 所有重要用户操作可 Undo 或通过 Revision 恢复。

### 28.4 可观测性

Trace 必须贯通：

```text
Comet Task
→ Tool Invocation
→ Nireco Contract Request
→ Proposal Revision
→ Semantic Diff
→ Review Decision
→ Transaction
→ Revision
→ Durability
```

日志默认只记录 ID、hash、状态和安全摘要，不记录完整正文、Prompt 或 Evidence excerpt。

## 29. 测试与 Conformance 策略

### 29.1 Kernel 单元测试

覆盖：

- Schema；
- Operation apply/inverse；
- Transaction atomicity；
- PositionMap；
- normalization；
- Revision；
- Undo Group；
- Proposal state machine；
- Semantic Diff；
- partial accept dependency closure；
- Citation/Evidence invariants。

### 29.2 Property-based Testing

必须验证：

```text
apply(tx) + apply(inverse(tx)) = original snapshot
serialize(parse(snapshot)) = canonical snapshot
compose(positionMaps) = sequential mapping
partial accept result satisfies schema
replay(snapshot + log) = head snapshot
same canonical input = same hash
```

### 29.3 Fuzz Testing

Fuzz 输入：

- 随机 Operation；
- 非法 UTF-16 boundary；
- 深层嵌套；
- 恶意 HTML；
- 大量 Citation；
- Proposal rebase；
- Storage log truncation；
- Unknown schema fields；
- Cursor tampering；
- Tool envelope metadata override。

### 29.4 浏览器矩阵

至少：

- Chrome/Chromium；
- Firefox；
- Safari；
- Electron 对应 Chromium；
- macOS/Windows 常见 IME；
- 中文拼音、中文双拼、日文、韩文；
- Emoji、组合字符、RTL；
- 屏幕阅读器基本路径。

### 29.5 Conformance Suites

#### Kernel Conformance

TS 与未来 Rust 实现共享：

- Canonical serialization；
- hash；
- Operation；
- PositionMap；
- normalization；
- Transaction；
- Revision replay。

#### Nireco–Comet Contract Conformance

Nireco 提供：

```text
contract version
+ request
+ policy/session
+ expected result/error
+ expected proposal state
+ expected semantic diff
+ expected provenance
```

Comet 必须对 Mock 和真实 Nireco 运行同一套测试。

#### No-bypass Tests

必须证明：

- Agent 无 Commit capability；
- 模型不能覆盖可信 Envelope；
- Scope 外读取/写入被拒绝；
- Raw Transaction 不可用；
- 无 Evidence 的 Citation 被阻止或降级；
- 外部 Agent 无法建立 Session；
- Comet Adapter 不 import Kernel private types。

### 29.6 Golden Trace

至少维护以下端到端 Golden Trace：

1. 只读检查；
2. 插入段落 Proposal；
3. 改写并保留 Citation；
4. 新 Evidence + Supported Citation；
5. Base Revision 变化后 Rebase；
6. Conflict；
7. Semantic Diff；
8. 部分接受；
9. Undo Proposal commit；
10. Crash recovery 后 Trace 仍可关联。

## 30. 安全、隐私与 Clean-room

### 30.1 不可信输入

以下全部视为不可信：

- PDF 和网页文本；
- 搜索结果；
- 模型生成内容；
- Clipboard HTML；
- 导入文件；
- Provider metadata；
- Comet Tool 的模型业务参数；
- 外部 URI payload。

### 30.2 Prompt Injection 隔离

来源中的“忽略之前指令”“调用工具”等文字只能作为 `SOURCE_EVIDENCE` 数据。Comet Host 必须保持 System Policy、User Instruction、Document Content、Evidence 和 Tool Result 的结构边界。

### 30.3 Capability 与 Scope

- 最小权限；
- Session 到期；
- Capability Grant 不由模型填写；
- Scope 扩大需要用户或产品策略授权；
- Mutating Tool 必须 Proposal-only；
- 所有拒绝决定有 typed error；
- Capability 和 Policy Snapshot 进入审计。

### 30.4 数据最小化

- Nireco 文档包不保存原始 Prompt；
- 不保存模型私有推理；
- 不保存 Provider credential；
- Evidence excerpt 受 Comet Policy 控制；
- Telemetry 默认不包含正文；
- Debug artifact 必须可脱敏。

### 30.5 Clean-room 规则

- 研究文档记录抽象问题和设计取舍，不复制源码；
- 不搬运其他编辑器测试夹具；
- 接口、类型、模块和测试独立命名与实现；
- 依赖必须有 SPDX 标识和 SBOM；
- 核心依赖白名单；
- 定期许可证扫描和代码相似性检查；
- 关键设计通过 ADR 记录独立推导路径。

## 31. 导入、导出与 Rust 边界

### 31.1 导入导出顺序

第一阶段：

1. Nireco JSON；
2. 安全 HTML；
3. Markdown；
4. BibTeX/RIS Reference 导入；
5. LaTeX 受限导出；
6. DOCX 单向导出；
7. JATS 导出。

后续才评估受限 DOCX 导入和更复杂往返。

### 31.2 导入原则

- 导入先进入临时 Snapshot；
- 完成 Schema 和 Academic validation 后原子替换或创建新文档；
- 所有有损转换产生 Diagnostic；
- 不执行宏、脚本或外部链接代码；
- 未知内容保留或明确降级；
- 导入器不直接修改活动 DOM。

### 31.3 Rust 使用边界

TypeScript 首先负责：

- Workspace、Model 和 Transaction；
- Browser input/DOM；
- Selection；
- Proposal；
- Integration Contract；
- 第一版 codecs。

Rust 后续可用于：

- DOCX/JATS/LaTeX codecs；
- 大型文档 diff；
- 索引；
- 压缩；
- PDF/文献解析；
- CLI；
- Storage sidecar；
- 批量 validation。

Rust/WASM 不进入普通键盘输入同步路径。所有 Rust 实现必须通过 Kernel Conformance，并遵守 UTF-16 Position 语义。

## 32. 分仓并行开发计划

### 32.1 总体原则

Nireco 与 Comet 分仓并行开发，但不允许“双方各自先做完，最后再适配”。实施采用 **双轨开发 + Contract Gate**：

```text
Nireco Core Track
URI / Model / Schema / Transaction / Revision / Proposal
                     │
                     ├── Contract Bundle Preview
                     │
Comet Integration Track
Adapter / Read Tools / Proposal Tools / Academic Workflows
                     │
                     └── Cross-repo Conformance Gate
```

每个 Gate 都必须包含：

1. 版本化 Schema；
2. 生成类型；
3. Mock Service；
4. Golden Fixtures；
5. Conformance Runner；
6. Compatibility Matrix；
7. 明确的退出标准。

实现依赖顺序固定为：

```text
URI / Workspace
→ Model Registry
→ Canonical Snapshot / Schema
→ Unicode / Semantic Position
→ Operation / Transaction
→ Revision / Durability
→ Proposal / Semantic Diff
→ Revision-bound Document Services
→ Web Editor Runtime
→ Academic Domain
→ Comet Specialized Writing Agent
```

浏览器 Input/IME 可以提前做隔离技术 Spike，但不得在 Position、Transaction 和 Revision 语义冻结前形成稳定公共 API。

### 32.2 Gate 0：Core Vocabulary 与 Contract Preview 冻结

#### Nireco 交付

- `ResourceUri`、`DocumentRef`、`SemanticTargetRef`；
- Workspace、Model Registry 与 Document Authority 接口；
- Canonical Manuscript Schema 初稿；
- UTF-16 Position 与 Persistent Anchor；
- Operation/Transaction Protocol；
- Linear Revision 与 Hash 规则；
- Proposal 状态机；
- Semantic Diff 与 `ProposalChangeGroup` Schema；
- typed Error Catalog；
- `IdAllocator`、`Clock` 与 Canonical JSON 规则；
- Contract Bundle `0.4-preview.1`；
- 一份最小 Manuscript Golden Fixture；
- 工程规范 v0.1.1 的机器可执行基线：`.editorconfig`、formatter、TypeScript strict 基线、lint/architecture rules、PR/ADR template 与 generated-code check。

#### Comet 交付

- Contract Loader；
- Nireco Adapter Interface；
- Task-bound `RequiredDocumentRef`；
- Trusted Tool Envelope；
- Tool Taxonomy 初稿；
- Fake Task Orchestrator；
- Fake Model/Fake Provider；
- Tool → Service Mapping 初稿；
- 固定工程规范 v0.1.1，并在 Comet 仓库启用相同 formatter、typecheck、lint、Trusted Context boundary 和 generated-contract drift check。

#### 退出标准

- 两仓不再使用裸 `documentId + offset` 作为跨仓地址；
- Snapshot、Transaction、Revision、Proposal 和 Semantic Diff 均通过 Schema；
- Comet 可仅依赖 Mock 完成 Handshake、固定 Revision 读取和创建 Draft Proposal；
- 核心术语不存在 `ChangeSet` 歧义；
- 不存在 Public Tool、MCP 或 BYOA 路线；
- 两个仓库固定同一工程规范版本，`format:check`、lint、typecheck、architecture boundary 和 generated-code consistency 已成为 PR 门禁；
- 不存在第二份并行权威编码规范。

### 32.3 Nireco Track N1：URI、Workspace 与 Model Registry

Nireco 实现：

- URI parser/canonicalizer；
- Workspace；
- Model Registry；
- Resource Provider Registry；
- Model open/get/unload/delete 生命周期；
- Single URI / Single Active Model 不变量；
- In-memory Document Authority；
- In-memory Storage Adapter；
- Core Identity Conformance。

Comet 并行实现：

- Contract Bundle 消费；
- URI/Revision 类型贯穿 Task、Trace 和 Tool Envelope；
- Mock Adapter；
- Session/Scope 数据结构；
- Read-only Tool Skeleton。

退出标准：

- 同 URI 不产生重复 Model；
- Editor 销毁不影响 Model；
- 只有 Authority 可以分配 Revision；
- URI canonicalization 有 Golden Vector；
- Comet 可以按 URI 打开 Mock Session。

### 32.4 Nireco Track N2：Canonical Model、Position 与 Transaction

Nireco 实现：

- Unified Inline Node Model；
- Manuscript Schema Validation；
- Node/Entity ID Allocator；
- UTF-16 `DocumentPoint`；
- Grapheme Boundary Validation；
- Persistent Anchor；
- Operation Algebra；
- Transaction Builder；
- Preconditions；
- Normalize；
- PositionMap；
- Inverse Operation；
- Canonical Serialization/Hash；
- Property/Fuzz Conformance。

Comet 并行实现：

- `document.inspect`；
- `document.read`；
- `document.search`；
- Revision-consistent Context Builder Skeleton；
- typed Error Mapping；
- Pagination/Cursor Client。

退出标准：

- 不存在 `children + TextSpan` 双重正文；
- Emoji、ZWJ 和组合字符不会被拆分；
- Transaction 原子、可逆、可序列化；
- PositionMap 覆盖 split/merge/move/remove；
- Comet 的只读 Tool 不混合不同 Revision 结果。

### 32.5 Gate 1：Revision-bound Read Integration

Nireco 必须发布 Contract Bundle `0.4-preview.2`，增加：

- `workspace.resolve_model`；
- `document.get_head`；
- `document.get_snapshot`；
- `document.get_outline`；
- `document.read_nodes`；
- `document.read_node_neighborhood`；
- `document.search`；
- `document.get_changes_since`；
- `document.get_diagnostics`。

联合退出标准：

- Mock 与真实 Nireco Service 通过同一 Read Conformance；
- 每个结果都包含 `basedOnRevisionId`；
- Cursor 绑定 Session、Revision、Scope 和 Query Hash；
- Scope 外读取 fail closed 且不泄露节点信息；
- Cross-repo CI 开始作为合并门禁。

### 32.6 Nireco Track N3：Revision、Durability 与 Authority

Nireco 实现：

- Linear Main Revision Log；
- Revision Sequence；
- WAL；
- Snapshot + Replay；
- Durability State；
- Undo Group；
- Inverse Transaction Undo/Redo；
- Ordered Event Queue；
- Crash Recovery；
- Compaction；
- Authority Lease/Handoff 接口。

Comet 并行实现：

- `changes_since` 恢复策略；
- Base Revision mismatch 处理；
- Task Resume；
- Adapter Retry/Idempotency；
- Revision Trace。

退出标准：

- Snapshot + Log 重放得到相同 Hash；
- Undo 产生新 Revision，不重写历史；
- Authority 丢失后不能继续分配 Revision；
- 崩溃点测试不产生部分 Transaction；
- Comet 能在 Base mismatch 后重新读取或中止。

### 32.7 Nireco Track N4：Proposal 与 Semantic Diff

Nireco 实现：

- Proposal State Machine；
- `proposalRevision` 乐观并发；
- Semantic Edit Compiler；
- Proposal Validation；
- Rebase 与 Conflict；
- Semantic Diff；
- `ProposalChangeGroup` 依赖图；
- Partial Acceptance；
- User Review Commit Controller；
- Proposal Composite Undo；
- Proposal/Review Audit。

Comet 并行实现：

- `comet.manuscript.propose_insert`；
- `comet.manuscript.propose_rewrite`；
- `comet.manuscript.propose_restructure`；
- `comet.proposal.preview`；
- `comet.proposal.rebase`；
- `comet.proposal.submit_for_review`；
- Fake Writing Workflow；
- Proposal Tool Evaluations。

退出标准：

- Comet 写 Tool 只能修改 Draft Proposal；
- Submit for Review 后 Proposal 锁定；
- 不存在 Commit、Raw Transaction 或 HTML Tool；
- Partial Accept 满足依赖闭包；
- Semantic Diff 对相同输入可重复生成；
- 用户接受后主分支只产生一个原子 Transaction。

### 32.8 Gate 2：Proposal E2E

联合验收：

1. Comet 在固定 Base Revision 上读取文档；
2. 创建 Proposal；
3. 写入两个 Semantic Edit；
4. 生成 Semantic Diff；
5. 用户接受一个 Group、拒绝一个 Group；
6. Nireco 重新校验当前 Head；
7. 提交单一主分支 Transaction；
8. 创建 Revision 与 Review Decision；
9. Undo 产生 inverse Revision；
10. Trace 可从 Revision 追溯到 Proposal、Tool 和 Task。

Gate 2 通过后，Comet 才能把 Proposal Tool 接入真实模型 Workflow。

### 32.9 Nireco Track N5：Web Editor Alpha

Nireco 在已冻结的 Model/Position/Transaction/Revision/Proposal 上实现：

- Editor/View 分离；
- DOM Projector；
- Input State Machine；
- `beforeinput` Mapping；
- Selection Bridge；
- IME/Composition；
- Clipboard/Drag/Drop；
- Command；
- DOM Divergence Recovery；
- Accessibility；
- Block Virtualization；
- Proposal Review View；
- Playground/Web Component。

退出标准：

- 中文和英文基础输入稳定；
- 一次 Composition 对应一个 Transaction 与 Undo Group；
- 多 View Selection 独立；
- DOM 不成为事实来源；
- Proposal Review 可以独立于 Agent Host 使用；
- Comet Agent 离线时编辑器仍可完整人工写作。

### 32.10 Nireco Track N6 与 Comet Track C3：Academic Core

#### Nireco

- Reference Snapshot；
- Source Link；
- Evidence Link；
- Claim/Citation；
- Evidence Relation；
- Citation Validation；
- Bibliography；
- CrossReference；
- Equation/Figure/Table 基础；
- Academic Diagnostics。

#### Comet

- Canonical Source Store；
- Source Import/Retrieval；
- PDF/Web Extraction；
- Canonical Evidence Record；
- Evidence Verification；
- `comet.evidence.propose`；
- `comet.citations.propose_supported_citation`；
- Citation Audit；
- Unsupported Claim Workflow；
- Evidence Context Builder。

退出标准：

- Comet 拥有 Source 全文，Nireco 只持有 Link/Snapshot；
- Metadata-only 不冒充 Verified；
- Verified Citation 有 Source Hash、Locator 和 Evidence Link；
- Source Hash 变化会使 Evidence Link stale；
- Bibliography 可从任意 Revision Snapshot 重建。

### 32.11 Gate 3：Academic Evidence/Citation E2E

- Comet 导入真实来源；
- 提取并验证 Evidence；
- Agent 生成正文 Proposal；
- 插入结构化 Citation；
- Nireco 校验 Reference/Evidence Link；
- Semantic Diff 显示正文、Citation 和 Evidence 变化；
- 用户可独立接受正文与 Citation Group；
- Bibliography 正确更新；
- 用户可从 Citation 跳转到 Source Locator。

### 32.12 Comet Track C4：Specialized Writing Agent MVP

Gate 0–3 通过后，Comet 实现正式特化智能体：

- Task Planner；
- Revision-consistent Context Builder；
- Tool Executor；
- Draft Section Workflow；
- Rewrite Workflow；
- Evidence Acquisition Workflow；
- Supported Citation Workflow；
- Citation/Evidence Audit；
- Proposal Explanation；
- Cancel/Retry/Resume；
- Workflow Evaluations；
- User Feedback Loop。

退出标准：

- 完成真实“读文档 → 读来源 → 建证据 → 写段落 → 插引用 → Semantic Diff → 用户部分接受”闭环；
- 模型不能覆盖 URI、Revision、Session、Capability、Policy 或正式 ID；
- Agent Host 故障不污染主分支；
- 核心 Evaluation 达到双方预设门槛。

### 32.13 Phase 7：Production Hardening

#### Nireco

- L/XL 文档性能；
- Browser Matrix；
- Multi-tab Leader；
- Authority Handoff；
- Storage Encryption；
- Backup/Restore；
- Migration；
- Import/Export MVP；
- Security/License Review。

#### Comet

- Model/Provider Fallback；
- Task SLA；
- Tool Retry Budget；
- Evaluation Gate；
- Prompt/Tool Leakage Defense；
- Data Retention/Privacy；
- Comet Task API；
- BYOM Security Boundary。

#### 联合发布门槛

- Compatibility Matrix；
- Cross-repo CI；
- No-bypass Test；
- Crash/Recovery Drill；
- Authority Chaos Test；
- Performance Budget；
- End-to-end Release Gate；
- SBOM 与许可证审查。

## 33. 初始 Epic 与任务拆分

### Epic A：Core Identity

- URI parser/canonicalizer；
- ResourceRef branded types；
- Workspace；
- Model Registry；
- lifecycle/disposal；
- Authority interface；
- ID Allocator/Clock。

### Epic B：Canonical Model

- Manuscript Schema；
- block/inline nodes；
- Unicode offset rules；
- canonical serialization；
- hash fixtures；
- migrations；
- unknown content policy。

### Epic C：Transaction Kernel

- Operations；
- preconditions；
- reducer；
- normalization；
- PositionMap；
- inverse operations；
- atomic commit；
- property tests。

### Epic D：Revision & Storage

- linear Revision；
- WAL；
- Snapshot；
- replay；
- durability；
- Undo Groups；
- compaction；
- corruption recovery。

### Epic E：Proposal & Review

- Proposal state machine；
- Semantic Edit；
- Proposal Revision；
- Rebase；
- Semantic Diff；
- Group dependency；
- partial accept；
- Review Commit Controller；
- Review UI。

### Epic F：Editor Runtime

- render tree；
- DOM patch；
- Selection；
- beforeinput；
- composition；
- clipboard；
- drag/drop；
- proposal review view；
- accessibility；
- browser test harness。

### Epic G：Academic Domain

- Reference Snapshot；
- Citation；
- Claim；
- Evidence Link；
- bibliography；
- cross-reference；
- academic diagnostics；
- Evidence stale policy。

### Epic H：Nireco–Comet Contract

- manifest；
- schemas；
- handshake；
- session；
- scope/capability；
- pagination/cursors；
- typed errors；
- mock；
- conformance；
- sample traces。

### Epic I：Comet Private Tools

由 Comet 团队执行：

- Tool registry；
- trusted envelope；
- adapter；
- inspect/read/search；
- propose insert/rewrite/restructure；
- evidence propose；
- supported citation；
- audit；
- preview/rebase/submit review；
- evaluation harness。

### Epic J：Production & Release

- Authority deployment；
- encryption；
- metrics；
- fault injection；
- compatibility CI；
- import/export；
- performance benchmark；
- release gate。

## 34. 第一条端到端验收链路

必须完成以下闭环：

1. Workspace 通过 canonical URI 打开 Model；
2. Editor 连接 Model，用户用中文 IME 创建标题、章节和段落；
3. 每次输入生成 Transaction 和线性 Revision；
4. Comet 建立固定 Base Revision 的 Session；
5. Comet 读取 Outline 和目标 Section；
6. Comet 从 Source Provider 读取两篇论文；
7. Comet Tool Executor 验证 locator、source hash 和 excerpt；
8. Comet 通过 `evidence.propose` 创建 Evidence Link Proposal；
9. Comet 通过 `propose_insert` 创建新段落；
10. Comet 通过 `propose_supported_citation` 插入 Citation；
11. Nireco 生成 Semantic Diff，显示正文、Citation 和 Evidence 变化；
12. 用户继续编辑主文档，产生新 Revision；
13. Proposal 检测 Base mismatch 并成功 Rebase，或产生明确 Conflict；
14. 用户接受正文 group 和 Citation group，拒绝另一项改写；
15. Nireco 计算依赖闭包并提交单一主分支 Transaction；
16. Bibliography 自动更新；
17. 用户执行 Undo，产生 inverse Revision；
18. 应用崩溃并恢复，Snapshot + WAL 重放到正确 head；
19. Trace 可以从 Revision 追溯到 Proposal、Tool、Task、Evidence 和用户决定；
20. Comet 没有任何 Raw Transaction 或 Commit 后门。

## 35. 发布验收标准

### 35.0 Gate Completion

- Gate 0–3 均有版本化 Contract Bundle、Mock、Fixture 和 Conformance 结果；
- 任一后续阶段不得绕过未通过的前置 Gate；
- Comet 写作 Agent MVP 只能在 Proposal E2E 与 Academic E2E 通过后进入生产模型评估；
- Browser Runtime 不得重新定义 Position、Transaction 或 Revision 语义；
- Cross-repo CI 是合并门禁，不是发布前补跑。

### 35.1 Core Alpha

- URI/Model/Revision/Position/Transaction 类型冻结；
- Canonical serialization/hash 跨环境一致；
- Transaction atomicity 和 inverse property tests 通过；
- Snapshot/WAL replay 一致；
- 无 DOM 依赖。

### 35.2 Editor Alpha

- S/M 文档输入 P95 达标；
- Chrome/Firefox/Safari 基本路径通过；
- 中文 IME 无高频数据损坏；
- Paste/Undo/Selection 可用；
- Editor dispose 不销毁 Model；
- 同 URI 不产生重复 Model。

### 35.3 Proposal Alpha

- Proposal 状态机完整；
- Semantic Diff 可重复；
- 部分接受依赖闭包正确；
- Rebase 可处理常见用户并行修改；
- Agent 无 Commit capability。

### 35.4 Academic Alpha

- Citation/Reference/Evidence/Claim 关系可校验；
- Evidence stale 可检测；
- Bibliography 可重建；
- 无 Evidence Citation 按 Policy 阻止或降级；
- Source ownership 边界明确。

### 35.5 Comet Integration Alpha

- Comet 仅用 Contract Bundle 可开发；
- Mock 与真实 Nireco Conformance 一致；
- Tool Schema 不因 Transport 替换而修改；
- Scope、Capability、Idempotency 和 Error Mapping 通过；
- Contract Major 不兼容安全失败；
- 外部 Agent 无法建立 Session。

### 35.6 Production Candidate

- Crash recovery 和 multi-tab Leader 通过；
- Security review 完成；
- SBOM/许可证扫描完成；
- 数据迁移演练完成；
- 备份恢复演练完成；
- 性能基准无阻塞回归；
- 跨仓 CI 和兼容矩阵通过；
- 第一条端到端链路连续稳定运行。

## 36. 主要风险与缓解措施

| 风险 | 影响 | 缓解 |
|---|---|---|
| 自研浏览器输入复杂度 | 数据损坏、IME 问题 | 小 Schema 起步、状态机、浏览器矩阵、fallback 保护 |
| 文档模型过早泛化 | 延迟核心交付 | 第一版固定 Manuscript Schema，不开放任意扩展 |
| Position 语义不一致 | Anchor/Agent Rebase 错误 | UTF-16 明确、PositionMap conformance、Rust 转换测试 |
| Revision/Proposal 混淆 | 历史和审阅失控 | 主线线性 Revision、Proposal 独立日志、状态机 |
| Semantic Diff 不稳定 | 无法部分接受、评估困难 | 确定性分组、Group ID 规则、Golden fixtures |
| Nireco/Comet 分仓漂移 | 最后阶段重写 | Contract Bundle、Mock、跨仓 CI、Compatibility matrix |
| Agent Tool 粒度不当 | Token 高、误操作 | Comet 高层 Tool，Nireco Semantic Edit compiler |
| Comet 绕过 Proposal | 数据风险 | no-bypass tests、无 commit capability、ACL |
| Source 所有权模糊 | 重复存储、权限问题 | Comet 拥有全文，Nireco 保存最小 Evidence Link |
| 过早多包化 | API 冻结和构建复杂 | 单一私有主包，Feature 只是源码模块 |
| Rust 过早进入输入路径 | 调试和互操作成本 | TS first，Rust 只做离线/重计算并过 conformance |
| 开源协议风险 | 法务和商业风险 | clean-room、依赖白名单、SBOM、法务评审 |
| Authority 双写 | Revision 分叉 | 单一 Authority、Leader、handoff token、fail closed |
| 派生数据 stale | Agent 读错上下文 | Revision-bound result、Session snapshot consistency |

## 37. 延后决定的事项

以下事项可以延后，但不得绕过当前抽象：

- Browser Authority 还是 Server Authority 作为默认部署；
- 是否使用 Rust 实现 codecs/index；
- 是否公开 Nireco SDK；
- 是否支持 BYOM 的具体 Provider API；
- 是否开放第三方 Extension；
- 是否引入多人 CRDT；
- 是否将主 Revision 升级为 DAG；
- 是否支持 DOCX 受限往返；
- 是否支持原生分页预览；
- 是否发布独立 React/Vue 适配包。

## 38. 第一批 ADR

1. `ADR-001 Models Are at the Heart of Nireco`
2. `ADR-002 Resource URI Canonicalization`
3. `ADR-003 Single Active Model per Workspace URI`
4. `ADR-004 UTF-16 Semantic Position Model`
5. `ADR-005 Unified Inline Node Representation`
6. `ADR-006 Operation and Transaction Algebra`
7. `ADR-007 Linear Mainline Revision for V1`
8. `ADR-008 Proposal Revision State Machine`
9. `ADR-009 Semantic Diff and Partial Acceptance`
10. `ADR-010 Single Document Authority`
11. `ADR-011 Canonical JSON and SHA-256 Hashing`
12. `ADR-012 Trusted ID Allocator and Clock`
13. `ADR-013 Source and Evidence Ownership Boundary`
14. `ADR-014 Nireco Private Services vs Comet Private Tools`
15. `ADR-015 Comet Agent Proposal-only Access`
16. `ADR-016 Single Main Package and Internal Features`
17. `ADR-017 TypeScript-first Browser Runtime`
18. `ADR-018 Clean-room Editor Implementation`
19. `ADR-019 Contract Bundle and Cross-repo Conformance`
20. `ADR-020 No Public Tools, MCP, or BYOA in 0.x`
21. `ADR-021 Gate-driven Cross-repo Delivery Order`
22. `ADR-022 Normative Engineering Standard and Automated Governance`

## 39. 最终定义

Nireco 的核心定义：

```text
Nireco Core
= Resource URI
+ Revision
+ Semantic Position
+ Transaction
```

完整系统关系：

```text
Resource URI
    ↓
Nireco Model
    ├── Canonical Snapshot
    ├── Semantic Tree
    ├── Academic Graph
    ├── Revision History
    └── Transaction Engine
            ↓
        Editor Views
        Proposal Review
        Document Services
            ↓
Nireco–Comet Private Contract
            ↓
Comet Private Agent Tools
            ↓
Comet Specialized Agent
            ↓
Comet Product
```

最终产品原则：

> Nireco 为 Comet 提供独立、确定性、可版本化、可审阅的学术文档基础设施。Comet 是唯一的第一方特化智能体。Nireco 不公开底层 Agent Tools，Comet Agent 也没有写入后门；所有智能体修改只能形成绑定 URI、Revision、Semantic Position 和 Evidence 的 Proposal，经 Semantic Diff 审阅后转换为原子 Transaction。

第一阶段成功的判断标准不是“实现了多少富文本功能”，而是是否建立了以下稳定闭环：

```text
人类和 Comet
→ 在同一 URI-addressed Model 上工作
→ 使用 Revision 保持一致性
→ 使用 Semantic Position 精确定位
→ 使用 Proposal 和 Semantic Diff 审阅智能修改
→ 使用 Transaction 原子提交
→ 使用 Evidence 保证引用可追溯
→ 使用 Revision/Provenance 完整回滚与审计
```
