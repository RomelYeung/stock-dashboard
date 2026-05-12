# Stock Fundamental Analysis — Design Spec

**Date:** 2026-05-04
**Status:** Approved

---

## Overview

Add DCF-based fundamental analysis with Monte Carlo simulations to the stock portfolio. Reorganize the UI: modal becomes chart + DCF summary, with a new dedicated stock page for full analysis.

---

## Backend Changes

### 1. `backend/services/yahoofinance.js` — Add Beta Extraction

In `getSummary()`, extract `beta` from `defaultKeyStatistics`:

```js
beta: defaultKeyStatistics.beta,  // added to returned data
```

### 2. `backend/services/dcf.js` — New DCF Service

**Functions:**

- `calculateWACC(params)` — CAPM + debt cost
  ```
  Ke = Rf + Beta * ERP      (Rf = 10Y treasury, ERP = 5.0%)
  Kd = InterestExpense / TotalDebt  (decimal, 0 if no debt)
  WACC = (E/V * Ke) + (D/V * Kd * (1 - TaxRate))
  ```

- `projectFCF(currentFCF, growthRate, terminalGrowth, wacc, cash, debt, shares, years=5)` — Full DCF projection
  ```
  Year 1..5: FCF_t = FCF_t-1 * (1 + growth)
  Terminal Value: TV = FCF_5 * (1 + terminalGrowth) / (wacc - terminalGrowth)
  Enterprise Value: EV = Σ(FCF_t / (1+wacc)^t) + TV/(1+wacc)^5
  Fair Value: = (EV + cash - debt) / sharesOutstanding
  ```

- `monteCarlo(params, iterations=1000)` — Randomized simulations
  - Parameters with distributions:
    - FCF growth: Normal(μ=revenueGrowth, σ=5%)
    - WACC: Normal(μ=calcWACC, σ=1.5%)
    - Terminal growth: Triangular(min=1.5%, mode=2.5%, max=3.5%)
  - Each iteration: sample params → projectFCF → record fair value
  - Returns: histogram bins + percentile targets (5th, 50th, 95th)

- `fetchDCFInputs(ticker)` — Aggregate data from cached yahoo-finance calls
  - Uses existing `getSummary()`, `getFinancials()`, `getBalanceSheet()` (already cached)
  - Calculates: shares, beta, FCF, growth, interest expense, tax rate, WACC inputs

### 3. `backend/routes/stocks.js` — New Endpoint

**`GET /api/stocks/:ticker/dcf?simulations=1000`**

```json
{
  "success": true,
  "data": {
    "ticker": "AAPL",
    "params": {
      "fcf": 99500000000,
      "revenueGrowth": 0.084,
      "wacc": 0.092,
      "terminalGrowth": 0.025,
      "sharesOutstanding": 15500000000,
      "cash": 62000000000,
      "debt": 110000000000,
      "beta": 1.24
    },
    "dcf": {
      "fairValue": 204.50,
      "upsidePercent": 9.2,
      "projectedFCFs": [107, 116, 125, 135, 146],
      "terminalValue": 3100
    },
    "monteCarlo": {
      "iterations": 1000,
      "bear": 172.40,
      "base": 195.00,
      "bull": 228.10,
      "histogram": [
        {"bin": 150, "count": 12}, ...
      ]
    }
  }
}
```

Error handling: negative FCF → cap at 0 with flag. No beta → fallback 1.0. Missing data → 502 with explanation.

Cache: 7 days (same cache tier as fundamentals).

---

## Frontend Changes

### 4. Enhanced PriceChart (`components/Charts.jsx`)

Upgrade `PriceChart` from single-line to multi-pane:

| Pane | Content | Data Source |
|---|---|---|
| 1 (main) | `CandlestickSeries` + SMA 20/50/200 overlays | OHLCV from `usePriceHistory` |
| 2 (below) | `HistogramSeries` (volume, green/red bars) | OHLCV |
| 3 (below) | `LineSeries` (RSI) + 70/30 lines | Calculated from closes on frontend or pre-computed |

New props: `indicators` object with toggles (showSMA, showRSI, showVolume, showMACD, showVWAP).
Crosshair enabled. Period selector unchanged.

### 5. Slimmed StockDetailModal (`components/StockDetailModal.jsx`)

Layout changes:
- Left side (flex: 3): Enhanced PriceChart + period selector (keeping only this from the old modal)
- Right side (flex: 1): DCFSummary sidebar card + "Open Full Analysis →" button
- Move out: Valuation, Profitability, Growth, Balance Sheet sections → go to dedicated page
- Keep: Loading/error states, header with ticker/price

### 6. DCFSummary (`components/DCFSummary.jsx`) — New

Compact card showing:
- DCF Fair Value (large, accent-blue)
- Upside/downside % vs current price (green/red)
- Monte Carlo entry zones × 3 (bear/base/bull with colored dots)
- "Open Full Analysis →" button

States: loading skeleton (3 lines), error ("Analysis unavailable"), populated.

### 7. StockAnalysisPage (`components/StockAnalysisPage.jsx`) — New

Container with:
- Back button (header: "← Back to Portfolio")
- Tab bar: [DCF] [Financials] [Technicals] [Comparables]
- Tab content renders the appropriate component

Uses `useStockDetail(ticker)` (reuses cache), `useDCF(ticker)`.

### 8. DCFAnalysis (`components/DCFAnalysis.jsx`) — New

Full DCF view:
- Model parameters display (FCF, growth, WACC, terminal, shares)
- MonteCarloChart (distribution histogram)
- Entry price zones (bear P5, base P50, bull P95)
- SensitivityMatrix (heatmap grid)
- "Re-run Simulation" button (triggers API refetch with invalidate)

Editable sliders for key params (recalculate on change, client-side using same DCF formula).

### 9. MonteCarloChart (`components/MonteCarloChart.jsx`) — New

Recharts `BarChart` of histogram bins with:
- Vertical reference lines at P5 (red), P50 (amber), P95 (green)
- Current price marker (dashed line)
- Annotation labels for bear/base/bull

### 10. SensitivityMatrix (`components/SensitivityMatrix.jsx`) — New

Grid: rows = FCF growth (7-9%), cols = WACC (7-10%).
Cell color: green→amber→red gradient based on fair value vs current price.
Used as inline component in DCFAnalysis.

### 11. Tab Contents

**Financials tab:** Valuation grid, Profitability grid, Revenue & Earnings, Balance Sheet & Cash Flow, RevenueChart, MarginsChart, CashFlowChart (all moved from modal).

**Technicals tab:** RSI, MACD signal, VWAP, OBV/CMF classification — already calculated in `indicators.js`. Display as metric cards with interpretation.

**Comparables tab:** Simple peer table (ticker, P/E, EV/EBITDA, P/B) vs sector averages. Fetch sector peers from Yahoo Finance.

### 12. Navigation (`App.jsx`)

Page state becomes: `"portfolio" | "indicators" | "stock"`.
When `"stock"`: render `StockAnalysisPage` with `selectedTicker`.
Header shows both "Portfolio" and "Back" when on stock page.

### 13. Hooks (`hooks/useStockData.js`)

New:
```js
export function useDCF(ticker) {
  // queryFn: GET /api/stocks/:ticker/dcf
  // staleTime: 7 days
}
```

---

## Data Flow

```
User clicks stock card
  → app sets selectedTicker, opens modal
  → useStockDetail(ticker)      [parallel, existing cache]
  → useDCF(ticker)               [parallel, 7-day cache]
  → usePriceHistory(ticker)     [parallel, 24h cache]

Modal renders:
  ← Chart (enhanced) + DCFSummary sidebar

User clicks "Open Full Analysis"
  → app sets currentPage = "stock"
  → StockAnalysisPage renders (all data in react-query cache, no refetch)
  → "Re-run" button calls refetch() on useDCF

User clicks "← Back to Portfolio"
  → app sets currentPage = "portfolio"
```

---

## Error Handling

| Case | Behavior |
|---|---|
| Negative FCF | Cap at 0, show "Negative FCF" warning |
| No Beta | Fallback 1.0, label "(default)" |
| Yahoo API error | Reuse cached data if available; show error card otherwise |
| Simulation timeout (>30s) | Return partial results with warning |
| Empty/loading state | Skeleton placeholders matching glass theme |
| Missing sector data (comparables) | "No peers available" message |

---

## File Manifest

**New files (6):**
- `backend/services/dcf.js`
- `frontend/src/components/DCFSummary.jsx`
- `frontend/src/components/DCFAnalysis.jsx`
- `frontend/src/components/MonteCarloChart.jsx`
- `frontend/src/components/SensitivityMatrix.jsx`
- `frontend/src/components/StockAnalysisPage.jsx`

**Modified files (6):**
- `backend/routes/stocks.js` — add DCF endpoint
- `backend/services/yahoofinance.js` — add beta extraction
- `frontend/src/components/Charts.jsx` — multi-pane PriceChart
- `frontend/src/components/StockDetailModal.jsx` — slim to chart + DCF sidebar
- `frontend/src/App.jsx` — add stock page state/routing
- `frontend/src/hooks/useStockData.js` — add useDCF hook
