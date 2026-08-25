# Driver-FCFF fixed-roster decision — no promotion

Date: 2026-08-25

## Decision

Do not promote the harness-only driver-FCFF candidate to production selection,
routes, or dashboard output. The production selector and valuation API remain
unchanged.

## Evidence

The fixed ordered roster is `MSFT,NVDA,TSLA,GOOGL,META,AMD,CRM`. Both reported
vintages use pinned SEC FSDS filings, Tiingo EOD prices, and vintage-bounded
FRED DGS10 inputs. The candidate is explicitly marked
`explicit-fixed-roster`, `harness-only`, and `productionSelector:false`.

| Vintage | Baseline median absolute error | Candidate median absolute error | Baseline / candidate directional accuracy |
| --- | ---: | ---: | ---: |
| 2023-11-01 | 71.514% | 71.514% | 28.571% / 28.571% |
| 2024-11-01 | 40.244% | 82.558% | 28.571% / 28.571% |

The candidate is flat in 2023 and materially worse in 2024, so it does not
meet the approved promotion condition of a material error improvement without
worsening directional accuracy.

## Immutable artifacts

- `driver-fcff-2023-11-01.json` — fixture SHA-256 `635fa843c61d3789ed87fa61d0291d229ea88791843c16f023180f7e1f0c836e`
- `driver-fcff-2023-11-01-baseline.json` — SHA-256 `31266a4f8f29845457f92eb540ad5fe84e305f66b1ec687c2ac83a7d98ec6c05`
- `driver-fcff-2023-11-01-fixed-roster-shadow.json` — SHA-256 `d0ea1914841c63b87779f98069f569e2a59ce4d498566249e5ca99c84e229b6d`
- `driver-fcff-2024-11-01-fixed-roster-shadow.json` — SHA-256 `cd4863ce3e868af6aace002d52b5d2821e5355b5374eaaae5635af1e729e156d`

## Follow-up

Keep the harness and its artifacts as reproducible research evidence. Any
future change to driver-FCFF eligibility, targeting, or production behavior
requires a new proposal and independent backtest evidence; do not tune it to
these two vintages.
