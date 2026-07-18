# Bounded grouped planGraph experiment

Repository-only A/B evidence surface based on `main@91c4087d58970dad48c0abc0b400e85570e0a036`.
It compares the current compact grouped placement policy with one bounded
grouped layered candidate. It does not change package defaults, public APIs,
production dependencies, or shipped layout behavior.

## Frozen v1 fixtures

The tracked mirror in `fixtures/` is the authoritative runtime input. The
loader rejects a missing or extra fixture, byte drift, unknown schema keys,
coordinates, route points, engine options, arm hints, duplicate semantic ids,
and broken references.

| Fixture | SHA-256 |
|---|---|
| `course-schedule-kahn.json` | `36ac2869eb47bfd318f7e744f98bdffd15e82fed10a85443a6b4421cfd354493` |
| `locus-skill-chain-grouped.json` | `60646db1d3bdda202bde8b6e76c985639f806e7c7b8ff5eec3166cec2bf2de7a` |
| `ml-train-serve-c4.json` | `84173f045bd489ecfc9f4fcaf0057971d3a2a6aa7c458eebdba3f13705fe31a4` |
| `reaper-supervised-loop.json` | `20ff8f5d8f839291a51f31ec9b50f98201a75607bd81a78b2967ba6f3116839f` |
| `semantic-redraw-control.json` | `2b4758c2a5c3d904dd71e1cf2514334b15a84e7d37dbb3f91d208facfb02c954` |

## Clean-checkout reproduction

Install dependencies, then prepare the pinned local renderer:

```sh
npm ci
npm run render:setup
```

Run focused type checking/tests, then the exact experiment verification:

```sh
npx tsc -p experiments/plan-graph-v1/tsconfig.json --noEmit
npx vitest run tests/plan-graph-experiment.test.ts
npx tsx experiments/plan-graph-v1/run.ts --generate --warmups 10 --iterations 30 --fresh-processes 5
# After direct PNG scoring is recorded and identity-bound in current/visual-review.json:
npx tsx experiments/plan-graph-v1/run.ts --verify --warmups 10 --iterations 30 --fresh-processes 5
```

Verification accepts only the exact `10/30/5` protocol. Each fixture is
measured once before either arm. Timed samples include ranking, placement,
group expansion, and shared routing only; canonicalization, structural checks,
metrics, rendering, I/O, and report generation run after timing.

The renderer is a required evidence dependency. Verification fails closed when
the renderer, PNGs, provenance, or completed direct-review ledger is absent or
stale. The strict v1 ledger has five fixture records. Each binds A/B canonical
results, A/B/plate scenes, A/B/plate PNGs, the source, and the exact renderer
identity. Invalid, incomplete, stale, or unreconciled disputed review writes
only `decision: "pending"` with `final: false`; automated geometry never
substitutes for direct PNG scoring.

Arm A deliberately reuses only the shipped compact placement constants under
shared title-only measurement and shared obstacle routing. Therefore the report
may claim a placement-policy comparison, not pixel equivalence with shipped
semantic redraw output.
