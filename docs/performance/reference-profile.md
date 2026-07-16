# Gate 0 Reference Performance Profile

- Profile ID: `nireco-g0-r1-2026-07-16`
- Status: Accepted baseline definition; corpus alignment machine-verified; measurements not yet recorded
- Owner role: Performance DRI
- Applies to: Gate 0 calibration and later regression comparisons

## Purpose

本文件冻结可重复的参考设备、运行条件、S/M/L corpus 和测量方法。它只定义 benchmark profile 与预算，不声称当前实现已经达到预算。任何通过结论都必须链接原始结果 artifact。

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

Gate 0 benchmark 名称使用下列规模。数量允许 fixture generator 在 word count 上有 ±2% 误差，node/citation count 必须精确。

| Corpus |   Words | Document nodes | Citations | Tables | Figures |    Inline/display equations | Primary use               |
| ------ | ------: | -------------: | --------: | -----: | ------: | --------------------------: | ------------------------- |
| S      |  15,000 |          1,500 |       100 |      5 |       5 |                          20 | 日常开发与快速 CI         |
| M      |  75,000 |          8,000 |       500 |     20 |      20 |                         100 | Gate budget 与 regression |
| L      | 200,000 |         25,000 |     1,500 |     60 |      60 | Stress/conformance；非每 PR |

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

Development Spec v0.4.3、Roadmap v0.1.2、Contract Manifest 和仓库 metadata
均固定使用本表数值。`pnpm check:performance-profile` 对这些来源执行
fail-closed 比较；关闭证据见
[`g0-b005-closure-evidence.md`](./g0-b005-closure-evidence.md)。

## Workload definitions

### Core local transaction mix

在 M corpus 上执行至少 10,000 个成功的局部 Transaction：

| Share | Operation family                                 |
| ----: | ------------------------------------------------ |
|   45% | short `ReplaceText` insert，覆盖 Latin/CJK/emoji |
|   15% | grapheme-aligned delete                          |
|   10% | paragraph/list node insert or delete             |
|   10% | add/remove mark or node attribute                |
|    5% | structure move                                   |
|   15% | academic entity/relation change                  |

每个 Transaction 包含 base check、preconditions、normalization、PositionMap、inverse 和 document hash。Benchmark 不得关闭正确性步骤来获得更低延迟。

### Editor typing workload

- 1,000 个 `beforeinput`-equivalent actions；
- 20 次中文 IME composition，每次 composition 形成一个 Transaction/Undo Group；
- 20 次 emoji/combining-mark deletion；
- 10 次 paste，payload 大小 1–20 KB；
- 每次动作验证 rendered selection 与 Model Revision。

### Read workload

- open + parse + schema validation + hash verification；
- outline first result；
- exact text search 与 normalized search；
- node read、neighborhood 和 revision-bound cursor page。

### Proposal workload

- 100 个 deterministic Proposal validation runs；
- text rewrite、structure move、Citation/Evidence change；
- full Semantic Diff generation；
- dependency-closure preview for 1、10 和 100 requested groups。

Proposal latency 在 Gate 2 前先记录不设 hard budget；determinism、closure correctness 和 Revision binding 从第一次测量起就是 hard correctness gate。

## Measurement protocol

1. 对每个 benchmark 做至少 5 次 warm-up run。
2. Core micro/transaction workload 至少收集 10,000 samples；browser interaction 至少收集 1,000 samples。
3. 报告 sample count、median、P95、P99、max、standard deviation 和 peak RSS。
4. 每个 suite 独立运行至少 5 次；发布值使用合并 samples，并保留每次 run。
5. Timer 必须使用 monotonic high-resolution clock。
6. Outlier 不得删除；只有明确的 invalid run 可以整体作废并记录原因。
7. Correctness assertion、hash、schema 和 PositionMap 不得在 benchmark build 中关闭。

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

## Required result artifact

每次可引用的结果至少包含：

```json
{
  "profileId": "nireco-g0-r1-2026-07-16",
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

没有该 artifact、correctness summary 和 raw measurements，不得在 Gate Report 中标记 performance “Pass”。
