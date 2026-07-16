# G0-B005 Closure Evidence

- Blocker: `G0-B005 — Normative performance corpus drift`
- Status: Closed
- Closure evidence version: 1
- Closed on: 2026-07-16
- Reference profile: `nireco-g0-r1-2026-07-16`
- Benchmark calibration: Pending
- Development Spec: `0.4.3`
- Roadmap: `0.1.2`
- Engineering Standard: `0.1.1`

## Frozen corpus

| Corpus |   Words | Document nodes | Citations |
| ------ | ------: | -------------: | --------: |
| S      |  15,000 |          1,500 |       100 |
| M      |  75,000 |          8,000 |       500 |
| L      | 200,000 |         25,000 |     1,500 |

## Evidence

- `NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md` §28.1 and
  `NIRECO_COMET_ROADMAP.md` §15.1 use the same S/M/L values.
- [`reference-profile.md`](./reference-profile.md) remains the full normative
  benchmark definition for device, fixture composition, workload and budgets.
- `contracts/comet-integration/contract.manifest.json` records the profile,
  corpus and verification command.
- `package.json` pins the document versions and reference profile metadata.
- `pnpm check:performance-profile` parses every machine-checked source and
  fails on value, version, profile ID or evidence-path drift.

This closes only the normative corpus-drift blocker. It does not claim that
performance measurements or budget calibration have passed; raw measurement
artifacts remain required by the Reference Profile before Gate 0 can claim a
calibrated benchmark baseline.
