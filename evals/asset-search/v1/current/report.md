# Asset search benchmark v1

Acceptance: **PASS**

This report covers the frozen 48 accepted intents only. It does not establish general semantic-search, weak-model, or visual-quality performance.

## Retrieval

| Slice | Queries | Rank 1 | Rank 3 | MRR@5 units |
|---|---:|---:|---:|---:|
| Overall | 48 | 41/48 | 45/48 | 2580/2880 |
| Language en | 24 | 20/24 | 24/24 | 1320/1440 |
| Language ru | 24 | 21/24 | 21/24 | 1260/1440 |
| Pack core | 24 | 22/24 | 24/24 | 1380/1440 |
| Pack trading | 24 | 19/24 | 21/24 | 1200/1440 |

Rank 1 = accepted pack-qualified id is first. Rank 3 = accepted id appears in first three. MRR@5 units use exact contributions 60/30/20/15/12/0 for rank 1/2/3/4/5/miss; overall acceptance requires at least 2304/2880.

## Determinism and integrity

- Ten-call ranking replay: byte-identical.
- Candidate integrity: passed.
- Corpus SHA-256: `c721577bdffc3062ac4f120409d1fbfabb4cb3374e37e56081aa182f76c01fd6`.
- Catalog SHA-256: `6c58c5596011442e2089cd77b97ebcf0549ba1a5395533ebaab4ddb72daa76e2`.
- Scorer SHA-256: `54338f1e6cf6656583a5b9bf8f52b0353fb51be2958956bff338555203f9562f`.
- Package SHA-256: `aef47180dfcf7da3dcf097344d9eab9cdbd046e7cd9fe47778256eebe6822cc5`.
- Environment SHA-256: `d2f295d5071c20bae424d0923faf3cffa971e5bad1fdbe6efbbca86424d2fd59`.

## Latency

Three warm-up passes preceded 20 deterministically shuffled passes (960 raw query samples). Nearest-rank p95: 4.743083000000297 ms; p99: 5.345666000000165 ms.

Latency is evidence for the recorded environment only. Raw unrounded samples remain in `report.json`.

## Catalog changes

No descriptor fields changed from the previous scored catalog.
