# ADR-022: Normative Engineering Standard and Automated Governance

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco and Comet Technical Leads
- Gate: Gate 0
- Related specifications: Engineering Coding Standard §§0, 24, 31, 34; Roadmap §§5, 20
- Supersedes: None
- Superseded by: None

## Context

Nireco 与 Comet 分仓开发同一 Contract。仅靠文档约定无法防止 formatter、类型严格度、架构边界、generated Contract 和规范版本逐步漂移；维护第二份相似编码规范会制造不可判定的优先级。

## Decision

`NIRECO_COMET_ENGINEERING_CODING_STANDARD.md` 是双方唯一权威工程与编码规范。开发规格定义系统事实和 Contract 语义，Roadmap 定义 Gate/顺序，工程规范定义实现、测试、评审和发布要求，ADR 记录长期决策。派生配置必须机器校验，不能成为独立规范。

## Normative rules

- 两仓 MUST 固定工程规范 version 和 approved configuration-set checksum。
- `.editorconfig`、formatter、strict TypeScript、lint、architecture boundaries、generated-code drift、PR/ADR template 和 required CI checks MUST 可追溯到该规范。
- 派生配置与规范冲突时 MUST fail closed；不得通过降低规则让 CI 变绿。
- Gate 0 required checks 至少包含 `format:check`、lint、typecheck、architecture boundary、generated/contract consistency 和 documentation/version consistency。
- Core/Schema/Transaction/Revision/Proposal 语义变化 MUST 同步 Development Spec、ADR、Schema/fixture；影响 Gate 或跨仓 Contract 时同步 Roadmap、Bundle 和 Changelog。
- 不得维护第二份平行权威编码规范。README/onboarding 摘录必须标明 non-normative 并固定来源版本。
- Generated files MUST 有 source marker 和 deterministic regeneration command；手改 generated output 必须被 CI 检测。
- Protected branch MUST 要求适用 checks 全部通过；管理员 bypass 也必须留审计记录。
- 规范例外 MUST 有 Issue、Owner、理由、影响范围、补偿控制、到期日期和移除条件。过期例外 MUST 自动使 Gate 失败。
- Accepted ADR 的语义变更 MUST 通过 superseding ADR 或明确 amendment；不得在普通 PR 中静默改写。
- Core/Contract、Authority/Storage、安全边界和规范规则必须有 CODEOWNERS review。

## Automated governance manifest

每仓必须维护一个 machine-readable governance manifest，至少声明：

- engineering standard version；
- configuration-set checksum；
- Contract Bundle version；
- required check names；
- generated sources and outputs；
- active exceptions with expiry；
- compatible peer-repository Contract range。

Manifest checksum 的 exact preimage/encoding 必须与通用 canonical hashing 决策一起冻结；在此之前 CI 仍必须比较 version、文件清单和原始 content checksums，不能跳过 drift detection。

## Contract and implementation impact

所有 PR 和 release pipeline 都受影响。Contract change 必须生成 Bundle、fixture、compatibility evidence 和 changelog。两个仓库的同名规则若暂时复制，CI 必须比较来源版本和 checksum，直到共享 baseline 可用。

## Verification

- CI 必须从 clean checkout 执行所有 required checks。
- Drift test 修改 generated output、规范 version 或 architecture boundary 时必须失败。
- Exception expiry test 使用固定 Clock 验证到期阻断。
- Docs link/version test 验证 ADR、spec、roadmap、standard 和 Contract 依赖引用。
- Cross-repo conformance 在 Gate 1 前成为 required check。

## Consequences

### Positive

- 规范、Contract 和实现漂移能在 PR 阶段被发现。
- 审计可以确定每次合并采用的规则和例外。

### Costs and constraints

- 配置升级需要双仓协调和版本迁移。
- 临时例外有显式维护成本，不能无限续期。

## Alternatives considered

- **每仓独立编码规范**：拒绝，因为跨仓 Contract 无法保持一致。
- **仅靠 code review**：拒绝，因为重复机械检查且无法阻止 drift。
- **复制配置但不比较版本/hash**：拒绝，因为会形成隐形 fork。

## Deferred decisions and blockers

- **G0-B001 — Hash preimages** 也阻止 governance manifest 获得跨 runtime 的 canonical checksum；关闭前必须使用明确列出的 raw file checksums 作为补偿控制。
- 共享配置以 package、生成文件或仓库模板分发可后续决定，但不得降低本 ADR 的 version/checksum 和 fail-closed 要求。
