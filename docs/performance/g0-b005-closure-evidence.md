# G0-B005 Closure Evidence

- Blocker: `G0-B005 — Normative performance corpus drift`
- Status: Closed
- Closure evidence version: 1
- Closed on: 2026-07-16
- Reference profile: `nireco-g0-r1-2026-07-16`
- Calibration policy: Staged by capability
- Gate 0 baseline: Active — corpus/hash/evidence infrastructure and implemented correctness baselines only
- Current latency claim: No latency suite has passed
- Development Spec: `0.4.3`
- Roadmap: `0.1.2`
- Engineering Standard: `0.1.1`

## Frozen corpus

| Corpus |   Words | Document nodes | Citations | Tables | Figures | Equations |
| ------ | ------: | -------------: | --------: | -----: | ------: | --------: |
| S      |  15,000 |          1,500 |       100 |      5 |       5 |        20 |
| M      |  75,000 |          8,000 |       500 |     20 |      20 |       100 |
| L      | 200,000 |         25,000 |     1,500 |     60 |      60 |       500 |

## Capability activation

| Milestone | Capability                                                              | Activated suites                                                        | Current state            |
| --------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| Gate 0    | Corpus/hash/evidence infrastructure + implemented correctness baselines | Corpus identity; canonical serialize/hash; evidence validation          | Active — no latency pass |
| Gate 1    | Transaction/read                                                        | Transaction apply; atomicity/inverse/replay; Snapshot open; read/search | Pending by design        |
| Gate 2    | Proposal                                                                | Proposal validation; Semantic Diff; dependency closure                  | Pending by design        |
| N5        | Editor                                                                  | DOM patch; key-to-paint; IME/Composition; Paste/Undo corruption         | Pending by design        |

Gate 0 只关闭 profile/corpus/hash/evidence contract 与已实现 correctness baseline 的
定义和自动化漂移风险。Gate 1、Gate 2 与 N5 suite 尚未激活，因此其状态必须为
`Pending by design`，不能写为 Pass，也不能反向阻塞 Gate 0。

## Evidence

- `NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md` §28.1 and
  `NIRECO_COMET_ROADMAP.md` §15.1 use the same S/M/L values.
- [`reference-profile.md`](./reference-profile.md) remains the full normative
  benchmark definition for device, fixture composition, workload and budgets.
- [`reference-corpus-lock.json`](./reference-corpus-lock.json) freezes each
  generator version, seed, exact structural count, raw checksum and canonical
  Document Hash. The Contract Bundle includes an identical
  [`performance/reference-corpus-lock.json`](../../contracts/comet-integration/performance/reference-corpus-lock.json)
  so packed consumers can resolve the identity without repository `docs/**`;
  `pnpm check:reference-corpora` regenerates S/M/L and fails on either-copy drift.
  Superseded identities are append-only under the Bundle `performance/history/`;
  `pnpm check:reference-corpus-history` rejects in-place rewrites and history deletion
  relative to the PR/push base.
- `contracts/comet-integration/contract.manifest.json` records the profile,
  corpus、bundle-local identity path/generator version，以及 profile/corpus 两条
  verification command and append-only history command；`pnpm contract:consumer` verifies the artifact from an
  isolated packed install。
- `package.json` pins the document versions and reference profile metadata.
- `pnpm check:performance-profile` parses every machine-checked source and
  fails on value, version, profile ID, evidence-path, activation-matrix or
  claim-status drift.

This closes only the normative corpus-drift blocker. It does not claim that
latency measurements or any future capability budget has passed. Raw
measurements and result artifacts remain mandatory when each suite activates;
the current repository must not claim an aggregate performance or Editor pass.
