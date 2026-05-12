# FundamentalsTab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the FundamentalsTab to eliminate duplicated banner metrics, elevate the peer comparison table to the top, and present financial sections in a consistent 2-column grid.

**Architecture:** Modify the single existing component `FundamentalsTab.jsx`. Remove the banner section and its helpers. Redesign the peer comparison table with a glass card wrapper and Diff column. Reorder sections so peer comparison is first, followed by peers grid, then financial sections in a 2-column layout.

**Tech Stack:** React 18, inline styles (no CSS-in-JS library), Recharts for sparklines, Framer Motion (already imported, keep if used by remaining components).

**Base commit:** `a0b0cbab477a778f38d1d45844168bd117cfb840`

**Files:**
- Modify: `frontend/src/components/FundamentalsTab.jsx` (only file touched)

---

### Task 1: Remove KeyMetricsBanner and all banner-related code

**Files:**
- Modify: `frontend/src/components/FundamentalsTab.jsx`

- [ ] **Step 1: Remove banner imports, constants, helpers, and components**

Delete from `FundamentalsTab.jsx`:
- `BANNER_METRICS` constant (lines 19-62)
- `findComparableMetric` helper (lines 67-75)
- `fmtPeer` helper (lines 78-88)
- `computePeerDiff` helper (lines 95-112)
- `isFavorable` helper (lines 121-139)
- `MiniSparkline` component (lines 142-154)
- `BannerMetricCard` component (lines 157-197)
- `KeyMetricsBanner` component (lines 248-280)
- `cardStyles` style object (lines 199-245)
- `bannerStyles` style object (lines 282-288)

Also remove the `motion` import from line 3 if Framer Motion is no longer used anywhere else in the file after the banner removal. Check if `motion` is used elsewhere before removing.

- [ ] **Step 2: Remove the `<KeyMetricsBanner>` JSX usage from the main export**

In the main `FundamentalsTab` export (around line 722), remove:
```jsx
{/* ─── 1. KEY METRICS BANNER ────────────────────────────────────────── */}
<KeyMetricsBanner financialData={financialData} comparablesData={comparablesData} />
```

- [ ] **Step 3: Verify the file still compiles**

Run: `cd frontend && npm run build 2>&1 | head -30`
Expected: Build completes with no errors related to FundamentalsTab.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/FundamentalsTab.jsx
git commit -m "refactor: remove KeyMetricsBanner and duplicated metrics"
```

---

### Task 2: Redesign Peer Comparison Table — glass card wrapper and layout

**Files:**
- Modify: `frontend/src/components/FundamentalsTab.jsx`

- [ ] **Step 1: Update table column widths and header styles**

Change `COL_WIDTHS` (around line 362) to accommodate the new Diff column:
```js
const COL_WIDTHS = {
  metric: "28%",
  thisStock: "20%",
  peerAvg: "20%",
  diff: "18%",
  trend: "14%",
};
```

Update `tbl.head` style (around line 370) to add subtle header background:
```js
head: {
  textAlign: "left",
  padding: "8px 12px",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-display)",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.015)",
},
```

Update `tbl.cellLabel` padding:
```js
cellLabel: { padding: "10px 12px", color: "var(--text-secondary)", fontSize: "12px", width: COL_WIDTHS.metric },
```

Update `tbl.cellValue` padding:
```js
cellValue: { padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, textAlign: "right", width: COL_WIDTHS.thisStock },
```

Update `tbl.cellPeer` padding:
```js
cellPeer: { padding: "10px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px", textAlign: "right", width: COL_WIDTHS.peerAvg },
```

- [ ] **Step 2: Add Diff column styles and cell component**

Add to `tbl` object:
```js
cellDiff: { padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, textAlign: "right", width: COL_WIDTHS.diff },
```

Update `MetricRow` to accept a `diff` prop and render the Diff column:

```jsx
function MetricRow({ metric }) {
  const { label, fmt, baseValue, peerAvg, sparklineData, diff, diffColor } = metric;
  // ... existing isHigher/isLower logic ...

  const fmtVal = (v) => { /* existing */ };

  const fmtDiff = () => {
    if (diff == null) return <span style={{ color: "var(--text-secondary)" }}>—</span>;
    const arrow = diff >= 0 ? "▲" : "▼";
    return (
      <span style={{ color: diffColor || "var(--text-secondary)" }}>
        {arrow} {Math.abs(diff).toFixed(1)}%
      </span>
    );
  };

  return (
    <tr style={{ ...tbl.row, transition: "background 0.15s ease" }}>
      <td style={tbl.cellLabel}>{label}</td>
      <td style={{ ...tbl.cellValue, color }}>{fmtVal(baseValue)}</td>
      <td style={tbl.cellPeer}>{fmtVal(peerAvg)}</td>
      <td style={tbl.cellDiff}>{fmtDiff()}</td>
      <td style={tbl.cellSpark}>
        <Sparkline data={sparklineData} color={color} />
      </td>
    </tr>
  );
}
```

Note: The `tr` style now includes `transition: "background 0.15s ease"` for hover.

- [ ] **Step 3: Compute diff and diffColor in CategoryTable and pass to MetricRow**

In `CategoryTable`, before rendering each `MetricRow`, compute `diff` and `diffColor`:

```js
function computeDiffColor(metric) {
  const { baseValue, peerAvg, fmt } = metric;
  if (baseValue == null || peerAvg == null || peerAvg === 0) return { diff: null, diffColor: null };
  const diff = ((baseValue - peerAvg) / peerAvg) * 100;
  
  // Determine if favorable
  let isFavorable;
  if (fmt === "x") {
    isFavorable = diff < 0; // lower is better for multiples
  } else {
    isFavorable = diff > 0; // higher is better for percentages
  }
  
  const diffColor = isFavorable ? "var(--accent-green)" : "var(--accent-red)";
  return { diff, diffColor };
}
```

Pass these into `MetricRow`:
```jsx
{category.metrics.map((m) => {
  const { diff, diffColor } = computeDiffColor(m);
  return (
    <MetricRow
      key={m.key}
      metric={{ ...m, sparklineData: baseSparklines?.[m.key], diff, diffColor }}
    />
  );
})}
```

- [ ] **Step 4: Update table header to include Diff column**

In `CategoryTable` `<thead>`:
```jsx
<thead>
  <tr>
    <th style={{ ...tbl.head, width: COL_WIDTHS.metric }}>Metric</th>
    <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.thisStock }}>This Stock</th>
    <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.peerAvg }}>Peer Avg</th>
    <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.diff }}>Diff</th>
    <th style={{ ...tbl.head, width: COL_WIDTHS.trend }}>Trend</th>
  </tr>
</thead>
```

- [ ] **Step 5: Add hover state to table rows via inline styles + event handlers**

Since we're using inline styles (not CSS classes), add hover state via React event handlers on the `<tr>`:

Replace the `tr` in `MetricRow` with:
```jsx
const [hovered, setHovered] = useState(false);
// ...
<tr
  style={{
    ...tbl.row,
    background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
    transition: "background 0.15s ease",
  }}
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
>
```

Note: `useState` is already imported at the top of the file.

- [ ] **Step 6: Wrap table in glass card and move category picker inside**

In `PeerComparisonSection`, wrap the entire content in a glass card:

```jsx
function PeerComparisonSection({ comparablesData, ticker }) {
  const [activeCategory, setActiveCategory] = useState("valuation");

  return (
    <div
      style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      {/* Category Picker */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "16px 20px 12px 20px",
        }}
      >
        {CATEGORY_ORDER.map((key) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            style={{
              background: activeCategory === key ? "rgba(255,255,255,0.10)" : "transparent",
              border: "none",
              color: activeCategory === key ? "var(--text-primary)" : "var(--text-secondary)",
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              fontWeight: activeCategory === key ? 600 : 400,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (activeCategory !== key) {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeCategory !== key) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
          >
            {CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Category Table */}
      {comparablesData?.categories?.[activeCategory] && (
        <CategoryTable
          category={comparablesData.categories[activeCategory]}
          baseSparklines={comparablesData.base?.sparklines}
          ticker={ticker}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Move insight box inside the glass card**

Move the insight box from `CategoryTable` into `PeerComparisonSection` so it sits inside the glass card, below the table.

In `CategoryTable`, remove the insight box JSX (lines 506-528 in original).
In `PeerComparisonSection`, after the `CategoryTable`, add:
```jsx
{comparablesData?.categories?.[activeCategory] && (
  <div style={{ padding: "0 20px" }}>
    <CategoryTable
      category={comparablesData.categories[activeCategory]}
      baseSparklines={comparablesData.base?.sparklines}
      ticker={ticker}
    />
    {/* Insight box */}
    {(() => {
      const insight = generateInsight(comparablesData.categories[activeCategory].metrics, ticker);
      if (!insight) return null;
      return (
        <div
          style={{
            padding: "12px 0 16px 0",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(255,255,255,0.015)",
          }}
        >
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "11px",
              fontFamily: "var(--font-body)",
              fontStyle: "italic",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {insight}
          </p>
        </div>
      );
    })()}
  </div>
)}
```

Also remove the outer `div` wrapper with `marginBottom: "24px"` from `CategoryTable` since the glass card now provides the container.

- [ ] **Step 8: Verify build**

Run: `cd frontend && npm run build 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/FundamentalsTab.jsx
git commit -m "feat: redesign peer comparison table with glass card, Diff column, and hover states"
```

---

### Task 3: Enhance StatBox with optional peer indicator

**Files:**
- Modify: `frontend/src/components/FundamentalsTab.jsx`

- [ ] **Step 1: Update StatBox component to accept peerDiff prop**

Change `StatBox` signature (around line 291):
```jsx
function StatBox({ label, value, sub, positive, peerDiff }) {
  const peerColor = peerDiff?.favorable === true
    ? "var(--accent-green)"
    : peerDiff?.favorable === false
      ? "var(--accent-red)"
      : "var(--text-secondary)";
  const peerBg = peerDiff?.favorable === true
    ? "rgba(0, 229, 160, 0.08)"
    : peerDiff?.favorable === false
      ? "rgba(255, 77, 109, 0.08)"
      : "rgba(255,255,255,0.04)";
  const peerArrow = peerDiff != null
    ? (peerDiff.value >= 0 ? "▲" : "▼")
    : null;

  return (
    <div style={sbox.box}>
      <span style={sbox.label}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
        <span
          style={{
            ...sbox.value,
            color:
              positive === true
                ? "var(--accent-green)"
                : positive === false
                  ? "var(--accent-red)"
                  : "var(--text-primary)",
          }}
        >
          {value}
        </span>
        {peerDiff != null && (
          <span
            style={{
              fontSize: "10px",
              fontFamily: "var(--font-body)",
              fontWeight: 400,
              padding: "1px 5px",
              borderRadius: "4px",
              whiteSpace: "nowrap",
              color: peerColor,
              background: peerBg,
            }}
          >
            {peerArrow} vs peers
          </span>
        )}
      </div>
      {sub && <span style={sbox.sub}>{sub}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Add findPeerDiff helper for financial sections**

Add near the other helpers (after `isFavorable` is removed, near line 140):
```js
function findPeerDiff(comparablesData, metricKey) {
  if (!comparablesData?.categories) return null;
  for (const cat of Object.values(comparablesData.categories)) {
    if (!cat?.metrics) continue;
    const found = cat.metrics.find((m) => m.key === metricKey);
    if (found && found.peerAvg != null && found.baseValue != null) {
      const diffPct = ((found.baseValue - found.peerAvg) / found.peerAvg) * 100;
      const favorable = found.fmt === "x" ? diffPct < 0 : diffPct > 0;
      return { value: diffPct, favorable };
    }
  }
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FundamentalsTab.jsx
git commit -m "feat: add peer indicator to StatBox"
```

---

### Task 4: Restructure layout and wire peer indicators

**Files:**
- Modify: `frontend/src/components/FundamentalsTab.jsx`

- [ ] **Step 1: Reorder main JSX sections**

In the main `FundamentalsTab` return statement (around line 720), reorder sections:

```jsx
return (
  <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
    {/* ─── 1. PEER COMPARISON ────────────────────────────────────────── */}
    {comparablesData && (
      <Section title="Peer Comparison">
        <PeerComparisonSection comparablesData={comparablesData} ticker={ticker} />
      </Section>
    )}

    {/* ─── 2. PEERS GRID ─────────────────────────────────────────────── */}
    {/* Peers grid is now rendered inside PeerComparisonSection, not separately */}
    {/* Actually, keep peers grid separate but below peer comparison */}
    {/* ... see Step 2 ... */}

    {/* ─── 3. FINANCIAL SECTIONS ─────────────────────────────────────── */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
      {/* ... sections ... */}
    </div>
  </div>
);
```

Wait — the design spec says the Peers Grid should be between Peer Comparison and Financial Sections. The Peers Grid is currently inside `PeerComparisonSection`. We need to extract it out.

Refactor `PeerComparisonSection` to only contain the glass card with table + insight. Move the Peers Grid rendering out to the main component.

Extract peers grid from `PeerComparisonSection` and render it directly in `FundamentalsTab`:

```jsx
{comparablesData && (
  <>
    <Section title="Peer Comparison">
      <PeerComparisonSection comparablesData={comparablesData} ticker={ticker} />
    </Section>

    {/* Peers Grid */}
    {comparablesData?.peers?.length > 0 && (
      <Section title={`Peers — ${comparablesData.sector || "Unknown"}`}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "8px",
          }}
        >
          {comparablesData.peers.map((peer) => (
            <div
              key={peer.ticker}
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "8px",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {peer.ticker}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {peer.name}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  marginTop: "4px",
                }}
              >
                {peer.marketCap >= 1e12
                  ? "$" + (peer.marketCap / 1e12).toFixed(1) + "T"
                  : "$" + (peer.marketCap / 1e9).toFixed(1) + "B"}
              </span>
            </div>
          ))}
        </div>
      </Section>
    )}
  </>
)}
```

Remove the peers grid from inside `PeerComparisonSection`.

- [ ] **Step 2: Wrap financial sections in 2-column grid**

Replace the existing sequential financial sections with:

```jsx
{/* ─── 3. FINANCIAL SECTIONS ─────────────────────────────────────── */}
<div
  className="financial-sections-grid"
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "24px",
  }}
>
  {/* Valuation */}
  <Section title="Valuation">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
      <StatBox label="Market Cap" value={formatMarketCap(summary.marketCap)} />
      <StatBox
        label="Forward P/E"
        value={formatMultiple(summary.forwardPE)}
        peerDiff={findPeerDiff(comparablesData, "forwardPE")}
      />
      <StatBox
        label="P/B"
        value={formatMultiple(summary.priceToBook)}
        peerDiff={findPeerDiff(comparablesData, "priceToBook")}
      />
      <StatBox
        label="PEG Ratio"
        value={formatMultiple(summary.pegRatio)}
        peerDiff={findPeerDiff(comparablesData, "pegRatio")}
      />
    </div>
  </Section>

  {/* Profitability */}
  <Section title="Profitability">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
      <StatBox
        label="Operating Margin"
        value={formatPercent(financials.operatingMargins)}
        positive={financials.operatingMargins > 0.1}
        peerDiff={findPeerDiff(comparablesData, "operatingMargin")}
      />
      <StatBox
        label="Net Margin"
        value={formatPercent(financials.profitMargins)}
        positive={financials.profitMargins > 0}
        peerDiff={findPeerDiff(comparablesData, "profitMargin")}
      />
      <StatBox
        label="ROA"
        value={formatPercent(financials.returnOnAssets)}
        positive={financials.returnOnAssets > 0.05}
        peerDiff={findPeerDiff(comparablesData, "returnOnAssets")}
      />
    </div>
    <MarginsChart annualIncome={financials.annualIncome} />
  </Section>

  {/* Revenue & Earnings */}
  <Section title="Revenue & Earnings">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
      <StatBox label="Total Revenue" value={formatRevenue(financials.totalRevenue)} />
      <StatBox
        label="Earnings Growth"
        value={formatPercent(financials.earningsGrowth)}
        positive={financials.earningsGrowth > 0}
        peerDiff={findPeerDiff(comparablesData, "earningsGrowth")}
      />
      <StatBox
        label="EPS Est. (This Yr)"
        value={
          financials.estimates?.currentYear != null
            ? `$${financials.estimates.currentYear.toFixed(2)}`
            : "—"
        }
      />
      <StatBox
        label="EPS Est. (Next Yr)"
        value={
          financials.estimates?.nextYear != null
            ? `$${financials.estimates.nextYear.toFixed(2)}`
            : "—"
        }
      />
    </div>
    <RevenueChart annualIncome={financials.annualIncome} />
  </Section>

  {/* Balance Sheet & Cash Flow */}
  <Section title="Balance Sheet & Cash Flow">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
      <StatBox label="Total Cash" value={formatRevenue(balanceSheet.totalCash)} />
      <StatBox label="Total Debt" value={formatRevenue(balanceSheet.totalDebt)} />
      <StatBox
        label="Current Ratio"
        value={formatMultiple(balanceSheet.currentRatio)}
        positive={balanceSheet.currentRatio > 1.5}
        peerDiff={findPeerDiff(comparablesData, "currentRatio")}
      />
      <StatBox
        label="Free Cash Flow"
        value={formatRevenue(balanceSheet.freeCashflow)}
        positive={balanceSheet.freeCashflow > 0}
      />
      <StatBox
        label="Operating CF"
        value={formatRevenue(balanceSheet.operatingCashflow)}
        positive={balanceSheet.operatingCashflow > 0}
      />
    </div>
    <CashFlowChart annualCashFlow={balanceSheet.annualCashFlow} />
  </Section>
</div>
```

- [ ] **Step 3: Remove old unused statsGridStyle variable**

Remove:
```js
const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "8px",
};
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/FundamentalsTab.jsx
git commit -m "feat: restructure layout with 2-column financial sections and peer indicators"
```

---

### Task 5: Add responsive breakpoints

**Files:**
- Modify: `frontend/src/components/FundamentalsTab.jsx`

- [ ] **Step 1: Add responsive hook for window width**

Add a simple responsive hook at the top of the file (after imports):

```jsx
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}
```

Add `useEffect` to the imports from "react":
```jsx
import { useState, useEffect } from "react";
```

- [ ] **Step 2: Make financial sections grid responsive**

In the main `FundamentalsTab` component:
```jsx
const width = useWindowWidth();
const isMobile = width < 768;
const isTablet = width >= 768 && width < 1024;
```

Update the financial sections grid:
```jsx
<div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 1fr",
    gap: isMobile ? "20px" : "24px",
  }}
>
```

- [ ] **Step 3: Make table responsive on mobile**

Pass `isMobile` down to `PeerComparisonSection` or read it there directly. The table should hide Peer Avg and Trend columns on mobile.

In `PeerComparisonSection`:
```jsx
const width = useWindowWidth();
const isMobile = width < 768;
```

Conditionally render columns in the header:
```jsx
<th style={{ ...tbl.head, width: isMobile ? "40%" : COL_WIDTHS.metric }}>Metric</th>
<th style={{ ...tbl.head, textAlign: "right", width: isMobile ? "30%" : COL_WIDTHS.thisStock }}>This Stock</th>
{!isMobile && (
  <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.peerAvg }}>Peer Avg</th>
)}
<th style={{ ...tbl.head, textAlign: "right", width: isMobile ? "30%" : COL_WIDTHS.diff }}>Diff</th>
{!isMobile && (
  <th style={{ ...tbl.head, width: COL_WIDTHS.trend }}>Trend</th>
)}
```

And in `MetricRow`:
```jsx
<td style={tbl.cellLabel}>{label}</td>
<td style={{ ...tbl.cellValue, color }}>{fmtVal(baseValue)}</td>
{!isMobile && <td style={tbl.cellPeer}>{fmtVal(peerAvg)}</td>}
<td style={tbl.cellDiff}>{fmtDiff()}</td>
{!isMobile && (
  <td style={tbl.cellSpark}>
    <Sparkline data={sparklineData} color={color} />
  </td>
)}
```

Note: `MetricRow` needs to receive `isMobile` as a prop, or we can use a context/provider pattern. Since this is a single file, just pass it as a prop:
```jsx
<MetricRow metric={{...}} isMobile={isMobile} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/FundamentalsTab.jsx
git commit -m "feat: add responsive breakpoints for mobile and tablet"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full build check**

Run: `cd frontend && npm run build`
Expected: Clean build, zero errors.

- [ ] **Step 2: Manual test checklist**

Open the app in browser, navigate to a stock's Fundamentals tab, verify:
1. No banner at the top
2. Peer Comparison table is the first section
3. Table has 5 columns: Metric, This Stock, Peer Avg, Diff, Trend
4. Diff column shows ▲/▼ with percentage in correct colors
5. Table rows have hover effect
6. Table is wrapped in a glass card with rounded corners
7. Category picker is inside the card
8. Insight text is inside the card below the table
9. Peers Grid appears below Peer Comparison
10. Financial sections are in a 2-column grid
11. StatBoxes with peer data show "▲ vs peers" or "▼ vs peers" tags
12. On mobile (< 768px), table shows only Metric, This Stock, Diff columns
13. On mobile, financial sections stack in 1 column
14. All existing charts (MarginsChart, RevenueChart, CashFlowChart) still render

- [ ] **Step 3: Final commit**

```bash
git add frontend/src/components/FundamentalsTab.jsx
git commit -m "feat: complete FundamentalsTab redesign"
```
