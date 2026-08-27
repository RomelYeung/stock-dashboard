# Valuation Engine Correctness and Contract Milestone

## Goal

Make the existing valuation output internally consistent and reproducible without changing the public `/api/stocks/:ticker/dcf` route or introducing a new framework. This is the first milestone of the approved phased rearchitecture; bank residual-income valuation and driver-based growth forecasting remain later milestones.

## Constraints

- Preserve all unrelated working-tree changes, especially cache wrapping, quarterly financial data, Schwab authentication, and existing August release notes.
- Keep the backend response backward-compatible: existing `params`, `dcf`, and `monteCarlo` fields remain.
- Do not make the current market price a calibration target.
- Do not add dependencies.
- Frontend valuation math must have one authoritative source; no duplicate DCF formulas.

## Implementation

### 1. Normalize the valuation contract

Extend `backend/services/dcf.js` so aggregation returns explicit metadata. The route must serialize the following additive, backward-compatible shape rather than relying on aggregation fields being exposed implicitly:

```text
params: {
  ...existing fields,
  modelType, eligible, cashFlowType, cashFlowSource,
  riskFreeRateSource, marketRiskPremiumSource, diagnostics
}
dcf: {
  ...existing fields,
  pvExplicitCashFlows, pvTerminalValue, terminalValueShare
}
sensitivity: {
  projectionYears,
  waccAdjustments: [-0.05 ... 0.05 in 0.005 steps],
  growthAdjustments: [-0.05 ... 0.05 in 0.005 steps],
  values: (number | null)[][]
}
```

Sensitivity `growth` always means explicit-period FCF projection growth, not terminal growth. Cells where WACC is not greater than terminal growth must be `null`; both the slider output and 5x5 matrix render them as unavailable. The zero/zero cell must equal `dcf.fairValue`. The existing 5x5 matrix is a view over adjustments `[-0.02, -0.01, 0, 0.01, 0.02]` from the same returned axes.

- `modelType`: `corporate-fcff` or `financial-residual-income`
- `eligible`: whether the current milestone can calculate the selected model
- `cashFlowType`: `FCFF`
- `cashFlowSource`: reported FCF normalized to FCFF by adding after-tax interest
- risk-free rate and source
- market risk premium and source
- diagnostics/warnings for fallbacks and terminal-value concentration

Classify banks and insurers deterministically from Yahoo sector/industry. Do not run the corporate FCFF model for them; return `params` with `eligible: false`, `dcf: null`, `monteCarlo: null`, `sensitivity: null`, and an explicit unsupported warning until the residual-income milestone is implemented. The route must gate on eligibility before checking FCF or WACC.

Add only reported/diluted shares from Yahoo where currently available. Dividend, book-value, R&D, and SBC fields remain deferred because this milestone has no consumer for them.

### 2. Correct corporate cash flow and discount-rate handling

- First select the normalized/smoothed levered FCF, then convert once: `FCFF = levered FCF + abs(interest expense) × (1 − tax rate)`. The absolute value handles Yahoo expense-sign differences.
- Discount FCFF at WACC and retain the existing enterprise-to-equity bridge (`+ cash - debt`).
- Accept a current risk-free rate as an input. The route should reuse the existing FRED `DGS10` service, convert its percentage-point value (for example `4.74`) to a decimal (`0.0474`) exactly once, validate it as finite and between 0 and 0.20, and isolate FRED failure with `.catch()` so `/dcf` still succeeds. Fall back to `0.0425` with a diagnostic and source `fallback-static`.
- Use a single U.S. market risk premium of `0.0423`, sourced from Damodaran's January 2026 implied ERP dataset, rather than broad sector-specific ERPs. Keep sector terminal-growth priors for this milestone, but expose their source and treat them as assumptions.
- If debt exists and interest expense is missing, use the risk-free rate as a transparent lower-bound proxy for pretax cost of debt and emit diagnostic `cost-of-debt-risk-free-proxy`; never silently use zero.

### 3. Make simulation and sensitivity numerically valid

- Monte Carlo must reject/resample draws where WACC is not greater than terminal growth or any result is non-finite. Stop after `iterations × 20` draw attempts. Percentiles use accepted-result count. If fewer than the requested count are accepted, return the valid subset with `requestedIterations`, actual `iterations`, and a warning; if none are accepted, return null statistics and an empty histogram rather than hanging or emitting invalid numbers.
- Allow deterministic random injection for unit tests without changing production callers.
- Return present value of explicit cash flows, present value of terminal value, and terminal-value share.
- Build the interactive WACC/explicit-growth sensitivity values with the backend calculator and include them in the API response using the contract above.
- The base sensitivity cell must equal the backend DCF fair value.

### 4. Remove duplicate and synthetic frontend valuation math

- `DCFAnalysis.jsx` should select backend-provided sensitivity values for its sliders rather than recomputing DCF.
- Do not scale the baseline Monte Carlo distribution when sliders move; label it as the baseline distribution.
- `SensitivityMatrix.jsx` should render backend-provided cells and respect the backend projection horizon.
- Remove the current-price-derived mock DDM and RIM figures.
- Correct the UI label from `Cost of Equity (WACC)` to `WACC`.

### 5. Validation and release note

Add one focused backend service Jest file covering:

- FCFF conversion and WACC/cash-flow consistency
- cash/debt equity bridge
- bank/insurer eligibility classification
- invalid Monte Carlo draw rejection with deterministic randomness
- base sensitivity parity with the DCF result
- finite outputs and terminal-value diagnostics

Add a route-level test using an ephemeral Express server and mocked Yahoo/FRED responses to prove financial-company eligibility is gated before corporate DCF execution and that FRED percentage points are converted/fallback failures remain non-fatal.

Add one focused frontend Vitest test using `react-dom/server` (already installed) and no new DOM dependency. It must prove the default displayed fair value is selected from backend sensitivity data and that the synthetic DDM/RIM labels are absent.

Run the focused backend tests, full backend tests if practical, frontend tests, and frontend production build. Add an August 23 fix entry at the top of the existing August 2026 release-note section.

## Acceptance Criteria

- Default frontend and backend fair values are identical.
- No invalid or non-finite Monte Carlo valuation is included.
- A bank is never valued using the corporate FCFF model.
- Existing API consumers continue to receive the old fields.
- The UI no longer displays valuation numbers constructed from the current share price.
- Tests fail if the cash/debt bridge, invalid-draw guard, model eligibility, FRED unit conversion/fallback, frontend source-of-truth, or base sensitivity parity regresses.

## Deferred

- Bank residual-income implementation using book equity, ROE, payout, and regulatory capital.
- Revenue/margin/reinvestment driver model for high-growth and negative-FCF companies.
- R&D capitalization and SBC-adjusted owner-FCF scenarios.
- Historical as-of backtest harness and reverse DCF.
