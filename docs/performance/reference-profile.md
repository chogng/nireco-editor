# Gate 0 Reference Performance Profile

- Profile ID: `nireco-g0-r1-2026-07-16`
- Status: Accepted staged baseline definition; activation matrix machine-verified; no latency suite has passed
- Owner role: Performance DRI
- Applies to: Gate 0 corpus/hash/evidence baseline and capability-activated regression comparisons
- Current latency claim: No latency suite has passed

## Purpose

本文件冻结可重复的参考设备、运行条件、S/M/L corpus、能力激活顺序和测量方法。
它只定义 benchmark profile 与预算，不声称当前实现已经达到预算。任何 suite
通过结论都必须链接该已激活能力的原始结果 artifact；未激活能力必须保持
`Pending by design`，不得为了 Gate 0 制造占位测量或把未实现路径标为失败。

## Reference device R1

| Component | Frozen value                                          |
| --------- | ----------------------------------------------------- |
| Device    | Mac Studio, model identifier `Mac14,13`               |
| CPU       | Apple M2 Max, 12 cores (8 performance + 4 efficiency) |
| Memory    | 32 GB unified memory                                  |
| Storage   | Internal SSD，运行时至少保留 20% free space           |
| OS        | macOS 26.4.1 (`25E253`)                               |
| Node.js   | 25.2.1                                                |
| pnpm      | 11.9.0（repository pin）                              |
| Chrome    | 150.0.7871.126                                        |
| Safari    | 26.4 (`21624.1.16.11.4`)                              |

Profile 的精确版本不可原地更新。OS、runtime、browser 或硬件变化必须创建新的 profile ID，并分别保存结果；不得把不同 profile 的 P95 直接合并。

## Controlled run conditions

- AC power connected；Low Power Mode 关闭。
- 重启后等待后台登录任务稳定；benchmark 期间不运行构建、索引、视频会议或大型同步任务。
- 设备温度稳定，出现 thermal throttling 的 run 作废。
- 使用 release/production build；source map 和 debug assertion 状态必须写入结果。
- Core benchmark 固定单进程、单 Authority；worker 数和 GC flags 必须记录。
- Browser benchmark 使用独立 profile，关闭 extension；viewport、device scale factor 和 font set 必须固定。
- 每个结果记录 commit SHA、dirty state、Contract version、fixture identity、runtime flags、开始时间和 profile ID。

## Canonical corpora

Gate 0 benchmark 名称使用下列固定规模。六项 count 均为 exact identity 字段；
任何 count 变化都必须创建新的 profile/generator version，不能使用容差冒充同一
corpus。

| Corpus |   Words | Document nodes | Citations | Tables | Figures | Inline/display equations | Primary use                 |
| ------ | ------: | -------------: | --------: | -----: | ------: | -----------------------: | --------------------------- |
| S      |  15,000 |          1,500 |       100 |      5 |       5 |                       20 | 日常开发与快速 CI           |
| M      |  75,000 |          8,000 |       500 |     20 |      20 |                      100 | Gate budget 与 regression   |
| L      | 200,000 |         25,000 |     1,500 |     60 |      60 |                      500 | Stress/conformance；非每 PR |

Fixture 内容必须包含：

- ASCII、CJK、combining marks、surrogate pairs 和 ZWJ emoji；
- paragraph、heading、list、table、figure、footnote 和 academic graph；
- Citation、Evidence、Claim relation；
- 长短 paragraph 与跨 section move；
- 固定 pseudo-random seed 和 generator version。

Fixture 使用 `generator-version + seed + raw file checksum + canonical Document
Hash` 标识。Canonical Document Hash 必须遵循 ADR-011 的
`nireco.document-content.v1` exact preimage；不得以 raw checksum 替代，也不得
重写旧结果。

生产 generator 位于
[`src/platform/node/performance/reference-corpus.ts`](../../src/platform/node/performance/reference-corpus.ts)；
[`reference-corpus-lock.json`](./reference-corpus-lock.json) 固定 S/M/L 的 version、
seed、六项 exact count、raw checksum 和 canonical Document Hash。
Contract Bundle 同时携带完全相同的
[`performance/reference-corpus-lock.json`](../../contracts/comet-integration/performance/reference-corpus-lock.json)，
manifest 的 `corpusIdentityPath` 使用 bundle-local 相对路径，因此 packed consumer
不依赖 repository-only `docs/**` 路径即可解析 identity。
`pnpm check:reference-corpora` 从 production build 重新生成全部 corpus 并
fail closed 比较 generator、文档 lock 与 packed artifact；`pnpm contract:consumer`
还会在隔离安装中解析并验证 packed artifact。两条命令只提供 corpus/hash
correctness evidence，不产生 latency claim。
更新 profile/generator 时，旧的 packed lock 必须原字节保存到
`contracts/comet-integration/performance/history/`；CI 以 PR/push base 为准运行
`pnpm check:reference-corpus-history`，拒绝原地改写或删除历史 identity。

Development Spec v0.4.3、Roadmap v0.1.2、Contract Manifest 和仓库 metadata
均固定使用本表数值。`pnpm check:performance-profile` 对这些来源执行
fail-closed 比较；关闭证据见
[`g0-b005-closure-evidence.md`](./g0-b005-closure-evidence.md)。

## Capability activation and staged calibration policy

Performance profile 在 Gate 0 冻结，但 workload 按生产能力的实际交付阶段激活。
一个 Gate 只对该行已经激活的 suite 负责；后续行的 `Pending by design` 不是当前
Gate blocker，也不是 Pass。预算数值从 Gate 0 起不可漂移，但只有能力实现、正确性
oracle 可运行且 result artifact 可复现后，才允许作出该 suite 的 latency 或
correctness 结论。

| Milestone | Capability                                                              | Activated suites                                                        | Current state            |
| --------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| Gate 0    | Corpus/hash/evidence infrastructure + implemented correctness baselines | Corpus identity; canonical serialize/hash; evidence validation          | Active — no latency pass |
| Gate 1    | Transaction/read                                                        | Transaction apply; atomicity/inverse/replay; Snapshot open; read/search | Pending by design        |
| Gate 2    | Proposal                                                                | Proposal validation; Semantic Diff; dependency closure                  | Pending by design        |
| N5        | Editor                                                                  | DOM patch; key-to-paint; IME/Composition; Paste/Undo corruption         | Pending by design        |

Gate 0 的 calibration 产物是固定 corpus identity 规则、exact hash oracle、
result-artifact contract、机器检查和已经实现的 correctness baseline。它不要求
提前实现 Gate 1 Transaction/Read、Gate 2 Proposal 或 N5 Editor，也不允许据此
宣称 Transaction、open/search、Proposal 或 Editor latency 已通过。

## Workload definitions

### Gate 1: Core local transaction mix

该 suite 在 Gate 1 Transaction Kernel 可执行后激活。在 M corpus 上执行至少
10,000 个成功的局部 Transaction：

| Share | Operation family                                 |
| ----: | ------------------------------------------------ |
|   45% | short `ReplaceText` insert，覆盖 Latin/CJK/emoji |
|   15% | grapheme-aligned delete                          |
|   10% | paragraph/list node insert or delete             |
|   10% | add/remove mark or node attribute                |
|    5% | structure move                                   |
|   15% | academic entity/relation change                  |

每个 Transaction 包含 base check、preconditions、normalization、PositionMap、inverse 和 document hash。Benchmark 不得关闭正确性步骤来获得更低延迟。

### N5: Editor typing workload

该 suite 在 N5 Web Editor Runtime 可执行后激活：

- 1,000 个 `beforeinput`-equivalent actions；
- 20 次中文 IME composition，每次 composition 形成一个 Transaction/Undo Group；
- 20 次 emoji/combining-mark deletion；
- 10 次 paste，payload 大小 1–20 KB；
- 每次动作验证 rendered selection 与 Model Revision。

### Gate 1: Read workload

该 suite 在 Gate 1 Revision-bound Read 可执行后激活：

- open + parse + schema validation + hash verification；
- outline first result；
- exact text search 与 normalized search；
- node read、neighborhood 和 revision-bound cursor page。

### Gate 2: Proposal workload

该 suite 在 Gate 2 Proposal/Semantic Diff 可执行后激活：

- 100 个 deterministic Proposal validation runs；
- text rewrite、structure move、Citation/Evidence change；
- full Semantic Diff generation；
- dependency-closure preview for 1、10 和 100 requested groups。

Proposal latency 在 Gate 2 激活后先记录不设 hard budget；determinism、closure
correctness 和 Revision binding 从第一次测量起就是 hard correctness gate。

## Measurement protocol

1. 只运行 activation matrix 中已激活且具有真实 production path 与 correctness
   oracle 的 suite；不得用 Mock latency 代替未来 production capability。
2. 对每个已激活 benchmark 做至少 5 次 warm-up run。
3. Gate 1 Core micro/transaction workload 至少收集 10,000 samples；N5 browser
   interaction 至少收集 1,000 samples。
4. 报告 sample count、median、P95、P99、max、standard deviation 和 peak RSS。
5. 每个已激活 suite 独立运行至少 5 次；发布值使用合并 samples，并保留每次 run。
6. Timer 必须使用 monotonic high-resolution clock。
7. Outlier 不得删除；只有明确的 invalid run 可以整体作废并记录原因。
8. Correctness assertion、hash、schema 和 PositionMap 不得在 benchmark build 中关闭。

## Frozen budgets

| Metric                                 | Corpus              | Budget           |
| -------------------------------------- | ------------------- | ---------------- |
| Ordinary Transaction apply             | M                   | P95 ≤ 10 ms      |
| Model-to-DOM patch segment             | S and M             | P95 < 16 ms      |
| End-to-end key-to-paint                | M                   | P95 ≤ 50 ms      |
| Local Snapshot open                    | M                   | ≤ 2 s            |
| Ordinary search first results          | M                   | ≤ 250 ms         |
| Canonical serialize/hash agreement     | S/M/L, Browser/Node | 100% identical   |
| Transaction atomicity/inverse/replay   | S/M/L               | 100% conformance |
| Partial-accept dependency closure      | Proposal workload   | 100% correct     |
| Composition/Paste/Undo data corruption | Editor workload     | 0 events         |

L corpus 的延迟先记录趋势，不作为 Gate 0 hard latency gate；任何 corruption、hash drift 或 partial Transaction 在任何规模都是 hard failure。

预算冻结不等于预算已经验证。当前没有 latency suite 具备 `Pass` artifact；
Gate 1、Gate 2 和 N5 对应项在激活前必须保持 `Pending by design`。

## Required result artifact

每次可引用的结果至少包含：

```json
{
  "profileId": "nireco-g0-r1-2026-07-16",
  "activationMilestone": "Gate 1",
  "suite": "transaction-apply",
  "claimStatus": "pass",
  "commit": "<git-sha>",
  "dirty": false,
  "contractVersion": "<version>",
  "fixture": {
    "name": "M",
    "generatorVersion": "<version>",
    "seed": "<seed>",
    "rawChecksum": "<checksum>",
    "documentHash": "sha256:<64-lowercase-hex>"
  },
  "samples": 10000,
  "metrics": {}
}
```

示例中的 `claimStatus: "pass"` 仅说明已激活 suite 的 artifact 形状，不表示当前
Transaction suite 已通过。没有该 artifact、correctness summary 和 raw
measurements，不得在 Gate Report 中把对应 suite 标记为 performance `Pass`；
也不得使用一个 suite 的 artifact 推导整个 Editor 或完整 profile 已通过。

当前的
[`M ReplaceText Kernel measurement`](./m-replace-text-kernel-measurement-2026-07-16.json)
只是一份 dirty、30-sample、`measurement-only` 校准记录。它在每个样本后执行完整
canonical Document SHA-256 oracle，但没有达到本节的 10,000-sample、5-run 或 clean
commit 要求，因此既不是 Gate 1 latency artifact，也不得标记为 `Pass`。
`pnpm check:performance-profile` 会把它与冻结的 M corpus identity 对齐，并从 raw
samples 重新计算 median、P95、P99、max、mean 和 standard deviation，防止摘要与原始
数据漂移。
