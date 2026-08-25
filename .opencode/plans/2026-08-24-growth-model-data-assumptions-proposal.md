# Growth Model Data and Assumptions Proposal

## Decision requested

Approve a **shadow-only driver-FCFF v2 calibration** for corporate growth
companies. It will compare candidate growth assumptions against the frozen
point-in-time baseline before any production-route or dashboard change.

## Current production contract

The existing `driver-fcff` path already projects ten years of revenue,
operating margin, tax, and reinvestment. It is selected for eligible corporate
companies with non-positive FCFF or annual revenue growth above 15%.

Its inputs are sourced from dated annual Yahoo income and balance-sheet
records:

- Initial growth: the most recent year-over-year revenue change, clamped to
  -15% through 25%.
- Starting margin: latest EBIT/revenue.
- Target margin: median positive historical EBIT/revenue.
- Reinvestment: median incremental revenue/invested-capital, with bounded
  fallbacks.
- Tax: current normalized tax rate, zero while projected EBIT is negative.

The immutable 2022-11-01 baseline contains eight growth-FCFF names. The
current replay is exact and produces 8/8 valued coverage, 64.9% median absolute
percentage error, and 100% directional accuracy. It is useful evidence, but
one historical snapshot is insufficient to promote a revised assumption set
directly.

## Options

1. **Keep the existing driver model unchanged.** Lowest implementation risk,
   but leaves the high baseline error unexplored.
2. **Shadow-calibrate a recency-aware v2 (recommended).** Compare a small,
   explicit alternative against the same frozen inputs before any route change.
3. **Replace production assumptions now.** Not recommended without additional
   point-in-time evidence and cohort comparison.

## Recommended v2 candidate

Keep WACC, terminal-growth, capital, share, and valuation-kernel inputs
unchanged. Vary only the three operating drivers, preserving dated annual data
and the existing guardrails:

| Driver | Current | Shadow candidate |
| --- | --- | --- |
| Initial revenue growth | Latest year-over-year change | Median of the latest up to three annual year-over-year changes, then the existing -15%/25% clamp |
| Target EBIT margin | Median of all positive annual margins | Median of the latest up to three positive annual margins |
| Sales-to-capital | Historical median of valid matched deltas | Unchanged |

The explicit horizon remains ten years for parity, but the projection helper
should honor its supplied `years` argument so a harness cannot silently use a
different horizon.

## Safety and acceptance criteria

- Run only in the valuation backtest/harness; do not alter `/api/stocks/:ticker/dcf`,
  sensitivity, Monte Carlo, or dashboard responses.
- Preserve the frozen fixture hash, provenance checks, and exact replay of the
  current production model.
- Use the same point-in-time source records for both candidates; no current or
  future data may enter the historical replay.
- Report coverage, median absolute percentage error, directional accuracy, and
  per-company differences for the eight growth-FCFF names.
- Promote no candidate unless it preserves or improves coverage and provides a
  material error improvement without worsening directional accuracy. The
  promotion threshold itself should be selected after reviewing the first
  shadow report, rather than assumed in advance.

## Expected change surface after approval

- `backend/services/dcf.js` — candidate-only driver calculation and horizon
  correctness.
- `backend/scripts/valuation-backtest.js` plus focused tests — explicit
  side-by-side candidate reporting.
- No production route or frontend file in this phase.
