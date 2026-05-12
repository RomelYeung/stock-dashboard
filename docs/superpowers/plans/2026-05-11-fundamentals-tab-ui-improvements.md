# FundamentalsTab UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the FundamentalsTab for better spatial balance, visual hierarchy, and consistency with the dashboard's glassmorphism design system.

**Architecture:** This is a pure frontend refactor — no data fetching changes, no new components, only layout and styling modifications to the existing `FundamentalsTab.jsx` file. All changes are inline style objects.

**Tech Stack:** React, inline CSS (JS objects), recharts (sparklines)

---

## File Structure

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/components/FundamentalsTab.jsx` | Modify | Main component — layout, spacing, borders, colors, tab styling, section ordering |

---

## Context for the Implementer

The FundamentalsTab is a ~768-line React component. It contains:

- `useWindowWidth()` hook for responsive breakpoints
- `StatBox` — small card with label, value, optional subtext, and optional "vs peers" badge
- `Section` — titled group with uppercase label and bottom border
- `PeerComparisonSection` — glass-panel with category tabs (Valuation/Growth/Profitability/Health) and comparison table
- `CategoryTable` / `MetricRow` — responsive comparison table with sparklines
- `Sparkline` — mini line chart via recharts (`64px × 24px` currently)
- Main export with loading/error states and the full layout

Current section order (TOP to BOTTOM):
1. Peer Comparison (full-width, very tall)
2. Valuation (2-col grid, short)
3. Profitability (2-col grid, tall — has MarginsChart)
4. Revenue & Earnings (2-col grid, tall — has RevenueChart)
5. Balance Sheet & Cash Flow (2-col grid, tall — has CashFlowChart)

Design system tokens (from `styles/index.css`):
- `--glass-bg`: `rgba(255, 255, 255, 0.035)`
- `--glass-border`: `rgba(255, 255, 255, 0.07)`
- `--accent-green`: `#00e5a0`
- `--accent-red`: `#ff4d6d`
- `--accent-blue`: `#4f8dff`
- `--text-primary`: `#e8edf5`
- `--text-secondary`: `#5a6a80`
- `--text-muted`: `#2e3d50`
- `--font-display`: `"Syne", sans-serif`
- `--font-mono`: `"DM Mono", monospace`
- `--font-body`: `"Inter", sans-serif`

---

## Task 1: Swap Section Order — Company Financials First

**Why:** Users want to see the subject company's data before comparative data.

**Files:**
- Modify: `frontend/src/components/FundamentalsTab.jsx`

**Current layout (simplified):**
```jsx
<div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
  {/* 1. PEER COMPARISON */}
  <Section title="Peer Comparison">...</Section>
  {/* Peers Grid */}
  <Section title={`Peers — ${comparablesData.sector || "Unknown"}`}>...</Section>

  {/* 2. FINANCIAL SECTIONS (2-col grid) */}
  <div style={{ gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 1fr", ... }}>
    {/* Valuation, Profitability, Revenue, Balance Sheet */}
  </div>
</div>
```

**Change:** Move the `/* FINANCIAL SECTIONS */` block (the grid with Valuation, Profitability, Revenue & Earnings, Balance Sheet & Cash Flow) to appear **before** the Peer Comparison section and Peers Grid.

**Also:** Remove the standalone Peers Grid section (the grid of peer ticker cards). It's redundant — the Peer Comparison table already shows which peers are being compared. This reduces visual clutter.

**New order:**
1. Valuation, Profitability, Revenue & Earnings, Balance Sheet (2-col grid)
2. Peer Comparison (full-width, with its category tabs and table)

**Result:** Company data is above the fold; peer data is supplementary context below.

---

## Task 2: Standardize Stat Box Grid Columns

**Why:** `auto-fill` creates ragged, unpredictable layouts.

**Current pattern (4 occurrences):**
```jsx
display: "grid",
gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
gap: "8px",
```

**New pattern:** Use fixed column counts per section:

| Section | Item Count | Grid Columns |
|---------|-----------|--------------|
| Valuation | 4 | `repeat(2, 1fr)` |
| Profitability | 3 | `repeat(3, 1fr)` |
| Revenue & Earnings | 4 | `repeat(2, 1fr)` |
| Balance Sheet & Cash Flow | 5 | `repeat(3, 1fr)` |

**Change all 4 occurrences** from `auto-fill` to the fixed counts above. Keep `gap: "8px"`.

---

## Task 3: Reduce Border Usage

**Why:** Too many borders create a "caged" feeling; the design system relies on subtle background differentiation.

**Changes:**

### 3a. StatBox borders
**Current `sbox.box`:**
```js
box: {
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "10px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
},
```

**Change to:**
```js
box: {
  background: "rgba(255,255,255,0.035)",  // slightly stronger bg to compensate for removed border
  border: "none",
  borderRadius: "10px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
},
```

### 3b. Peer cards (in the Peers Grid — if keeping it)
Same change: remove border, bump background from `0.025` to `0.035`. (But if you removed the Peers Grid in Task 1, skip this.)

### 3c. Insight box border-left
**Current:**
```jsx
borderLeft: "2px solid var(--accent-blue)",
```

**Change to:**
```jsx
borderLeft: "3px solid var(--accent-blue)",
```

Slightly thicker to compensate for overall reduced borders and give it more presence.

---

## Task 4: Unify Category Tab Styling

**Why:** Two different tab styles (underline vs pill) in the same view feel uncoordinated.

**Current category tabs (in `PeerComparisonSection`):**
```jsx
style={{
  background: activeCategory === key ? "rgba(255,255,255,0.10)" : "transparent",
  border: "none",
  color: activeCategory === key ? "var(--text-primary)" : "var(--text-secondary)",
  padding: "6px 14px",
  borderRadius: "6px",
  fontSize: "12px",
  // ... hover effects
}}
```

**Change to underline style** (matching the main tab bar in `StockAnalysisPage.jsx`):

```jsx
style={{
  background: "transparent",
  border: "none",
  borderBottom: activeCategory === key ? "2px solid var(--accent-blue)" : "2px solid transparent",
  color: activeCategory === key ? "var(--accent-blue)" : "var(--text-secondary)",
  padding: "6px 14px",
  borderRadius: "0",
  fontSize: "12px",
  fontFamily: "var(--font-body)",
  cursor: "pointer",
  fontWeight: activeCategory === key ? 600 : 400,
  transition: "all 0.2s ease",
  outline: "none",
}}
```

**Remove hover enter/leave handlers** that set background color — instead, rely on color transition:
```jsx
onMouseEnter={(e) => {
  if (activeCategory !== key) {
    e.currentTarget.style.color = "var(--text-primary)";
  }
}}
onMouseLeave={(e) => {
  if (activeCategory !== key) {
    e.currentTarget.style.color = "var(--text-secondary)";
  }
}}
```

---

## Task 5: Remove Arbitrary Color Thresholds

**Why:** Inconsistent thresholds confuse users.

**Current pattern:** `positive` prop on StatBox with hardcoded thresholds:
- `positive={financials.operatingMargins > 0.1}`
- `positive={financials.profitMargins > 0}`
- `positive={financials.returnOnAssets > 0.05}`
- `positive={balanceSheet.currentRatio > 1.5}`
- `positive={financials.earningsGrowth > 0}`
- `positive={balanceSheet.freeCashflow > 0}`
- `positive={balanceSheet.operatingCashflow > 0}`

**Change:** Remove ALL `positive` props from StatBox calls. Let values render in `var(--text-primary)` (white) by default. The `positive` prop should remain on the StatBox component itself for backward compatibility, but simply don't pass it.

**Rationale:** Color coding should be reserved for peer comparison diffs (already present via `peerDiff`) and explicit buy/sell signals. Financial values should be neutral by default — users can interpret them in context.

---

## Task 6: Enlarge Sparklines

**Why:** `64px × 24px` is too small to be useful.

**Current Sparkline container:**
```jsx
<div style={{ width: "64px", height: "24px" }}>
```

**Change to:**
```jsx
<div style={{ width: "80px", height: "32px" }}>
```

Also update `COL_WIDTHS.trend` from `"14%"` to `"16%"` to accommodate the wider sparklines:
```js
const COL_WIDTHS = {
  metric: "28%",
  thisStock: "20%",
  peerAvg: "20%",
  diff: "16%",
  trend: "16%",
};
```

---

## Task 7: Improve Insight Box Styling

**Why:** The insight box is valuable content but visually weak.

**Current insight box:**
```jsx
<div style={{
  padding: "12px 20px 16px 20px",
  borderTop: "1px solid rgba(255,255,255,0.05)",
  background: "rgba(255,255,255,0.025)",
  borderLeft: "2px solid var(--accent-blue)",
}}>
```

**Change to:**
```jsx
<div style={{
  padding: "16px 20px",
  borderTop: "1px solid rgba(255,255,255,0.05)",
  background: "rgba(79, 141, 255, 0.04)",  // subtle blue tint
  borderLeft: "3px solid var(--accent-blue)",
}}>
```

**Also change the text style** inside the insight box:
```jsx
<p style={{
  color: "rgba(255,255,255,0.70)",  // slightly brighter than current 0.65
  fontSize: "13px",  // was 12px
  fontFamily: "var(--font-body)",
  fontWeight: 400,  // was 300
  margin: 0,
  lineHeight: 1.6,
}}>
```

---

## Task 8: Enlarge "vs peers" Badge

**Why:** `10px` font with `1px` padding is illegible.

**Current badge style (inside StatBox):**
```jsx
<span style={{
  fontSize: "10px",
  fontFamily: "var(--font-body)",
  fontWeight: 400,
  padding: "1px 5px",
  borderRadius: "4px",
  whiteSpace: "nowrap",
  color: peerColor,
  background: peerBg,
}}>
```

**Change to:**
```jsx
<span style={{
  fontSize: "11px",
  fontFamily: "var(--font-body)",
  fontWeight: 500,
  padding: "2px 6px",
  borderRadius: "4px",
  whiteSpace: "nowrap",
  color: peerColor,
  background: peerBg,
}}>
```

---

## Task 9: Standardize Spacing Scale

**Why:** Too many arbitrary gap values create visual inconsistency.

**Adopt this spacing convention:**
- **Major section gaps** (between top-level sections): `32px`
- **Section internal gaps** (title → content): `16px`
- **Related element gaps** (stat boxes, grid items): `8px`
- **Tight gaps** (label → value): `4px`

**Changes:**

1. **Main container gap:** Currently `gap: "32px"` — keep it.
2. **Section title → content gap:** Currently `gap: "12px"` in `Section` component — change to `gap: "16px"`.
3. **Financial grid gap:** Currently `gap: isMobile ? "20px" : isTablet ? "24px" : "28px"` — simplify to `gap: "24px"` for all breakpoints.
4. **StatBox internal gap:** Currently `gap: "4px"` — keep it (tight is correct for label-value pairs).
5. **StatBox grid gap:** Currently `gap: "8px"` — keep it.

---

## Task 10: Add Top-Level Section Title for Financial Grid

**Why:** The four financial sections (Valuation, Profitability, Revenue, Balance Sheet) need a grouping header to establish hierarchy.

**Add a `<Section title="Key Metrics">`** wrapper around the 2-column financial grid. This creates a clear grouping:

```jsx
<Section title="Key Metrics">
  <div style={{
    display: "grid",
    gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 1fr",
    gap: "24px",
  }}>
    {/* Valuation, Profitability, Revenue & Earnings, Balance Sheet & Cash Flow */}
  </div>
</Section>
```

This also helps with the height imbalance — by grouping them under a single header, the uneven heights feel more intentional.

---

## Task 11: Verify Build

**Files:** `frontend/src/components/FundamentalsTab.jsx`

**Command:**
```bash
cd /Users/yanchimyeung/Projects/stock-dashboard/frontend && npm run build 2>&1
```

**Expected:** Zero errors, zero warnings.

**If build fails:** Fix any JSX syntax errors, missing closing tags, or variable references.

---

## Task 12: Commit

```bash
cd /Users/yanchimyeung/Projects/stock-dashboard
git add frontend/src/components/FundamentalsTab.jsx
git commit -m "refactor(FundamentalsTab): improve spatial balance and visual hierarchy

- Swap section order: company financials first, peer comparison second
- Standardize stat box grids with fixed column counts
- Reduce border usage on stat boxes; rely on background differentiation
- Unify category tab styling to underline (matches main tab bar)
- Remove arbitrary color thresholds on financial values
- Enlarge sparklines from 64x24 to 80x32
- Improve insight box with blue tint, larger text, stronger border
- Enlarge 'vs peers' badges for readability
- Standardize spacing scale (8/16/32)
- Add 'Key Metrics' grouping header for financial sections"
```

---

## Self-Review Checklist

| Requirement | Task | Status |
|------------|------|--------|
| Section order swapped | Task 1 | ✅ |
| Stat box grids standardized | Task 2 | ✅ |
| Borders reduced | Task 3 | ✅ |
| Category tabs unified | Task 4 | ✅ |
| Arbitrary color thresholds removed | Task 5 | ✅ |
| Sparklines enlarged | Task 6 | ✅ |
| Insight box improved | Task 7 | ✅ |
| "vs peers" badges enlarged | Task 8 | ✅ |
| Spacing standardized | Task 9 | ✅ |
| Grouping header added | Task 10 | ✅ |
| Build verified | Task 11 | ✅ |
