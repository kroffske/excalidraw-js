# T-124 grouped planGraph decision

Decision: **retain-current-layouts**.

This is a placement-policy experiment. Arm A deliberately differs from the shipped semantic-redraw renderer by using title-only measured cards and the shared obstacle-aware router. It does not establish pixel equivalence, typography quality, or router superiority.

| Fixture | A crossings | B crossings | A area | B area | A p95 ms | B p95 ms | B structural |
|---|---:|---:|---:|---:|---:|---:|---:|
| course-schedule-kahn | 3 | 2 | 2.257 | 5.859 | 2.063 | 0.194 | 3 |
| locus-skill-chain-grouped | 9 | 6 | 2.668 | 9.542 | 1.602 | 2.464 | 2 |
| ml-train-serve-c4 | 1 | 1 | 2.528 | 11.511 | 0.641 | 1.418 | 0 |
| reaper-supervised-loop | 0 | 0 | 1.877 | 4.479 | 0.160 | 0.058 | 0 |
| semantic-redraw-control | 0 | 0 | 2.244 | 7.361 | 0.030 | 0.415 | 0 |

## Gate findings

- course-schedule-kahn: B has structural errors
- course-schedule-kahn: B normalized area regression
- locus-skill-chain-grouped: B has structural errors
- locus-skill-chain-grouped: B normalized length regression
- locus-skill-chain-grouped: B normalized area regression
- locus-skill-chain-grouped: B route-overlap regression
- ml-train-serve-c4: B normalized length regression
- ml-train-serve-c4: B normalized area regression
- ml-train-serve-c4: B route-overlap regression
- reaper-supervised-loop: B normalized length regression
- reaper-supervised-loop: B normalized area regression
- semantic-redraw-control: B normalized length regression
- semantic-redraw-control: B normalized area regression
- course-schedule-kahn: B has failed visual dimension
- locus-skill-chain-grouped: B has failed visual dimension
- ml-train-serve-c4: B has failed visual dimension
- semantic-redraw-control: B has failed visual dimension
- semantic-redraw-control: B control visual regression
- B lacks visual preference on two dense fixtures

The five fixtures are bounded evidence, not a universal layout-quality claim. Canonical hash equality is per-host; cross-platform checks compare metrics and decisions.
