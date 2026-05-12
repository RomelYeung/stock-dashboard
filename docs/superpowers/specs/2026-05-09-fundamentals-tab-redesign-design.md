# FundamentalsTab Redesign — Detailed UI/UX Design Spec

**Date:** 2026-05-09
**Status:** Design Phase
**Predecessor:** [consolidate-fundamentals-design.md](./2026-05-09-consolidate-fundamentals-design.md)

---

## 1. Overview

### 1.1 Problem

The current `FundamentalsTab` has two issues:

1. **Inconsistent UI** — mixes three visual styles:
   - `BannerMetricCard` — gradient backgrounds, top-border color accents, DM Mono large values, mini sparklines
   - `StatBox` — flat `rgba(255,255,255,0.025)` cards, small DM Mono values, no sparklines
   - `PeerComparisonTable` — tabular `<table>` rows with raw `rgba(255,255,255,0.025)` wrapper

2. **Duplicated metrics** — 6 banner metrics (P/E TTM, Revenue Growth, Gross Margin, ROE, EV/EBITDA, Debt/Equity) also appear in the Peer Comparison Table below. This means the same data is displayed twice at different levels of prominence, wasting vertical space and confusing the user about which view is authoritative.

### 1.2 Decision

**Remove `KeyMetricsBanner` entirely.** The banner's 6 metrics already exist (more comprehensively) in the Peer Comparison Table. Elevate the Peer Comparison Table to the top of the tab with improved visual design. This eliminates duplication and creates a unified visual language.

### 1.3 Design Principles

- **Single source of truth**: Each metric appears exactly once
- **Consistent visual language**: All cards/tables share the glass-morphism design system
- **Progressive disclosure**: Most important interactive element (comparison table) first, followed by supporting sections
- **Match existing design language**: Dark theme, glass cards, subtle borders, Syne/Inter/DM Mono fonts, green/red accent semantics

---

## 2. Layout Structure (Top to Bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  [Tab bar from StockAnalysisPage]                            │
│  DCF  |  FUNDAMENTALS  |  INSIDER ACTIVITY                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. PEER COMPARISON TABLE                            │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │ Category Picker: [Valuation][Growth][Profit][He]│ │   │
│  │  ├──────┬────────────┬──────────┬────────┬─────────┤ │   │
│  │  │Metric│This Stock  │Peer Avg  │Diff    │Trend    │ │   │
│  │  ├──────┼────────────┼──────────┼────────┼─────────┤ │   │
│  │  │P/E   │  22.5x     │  18.2x   │▲+23.6% │ [spark]│ │   │
│  │  │EV/EB │  15.8x     │  12.1x   │▲+30.6% │ [spark]│ │   │
│  │  │P/B   │  8.2x      │  5.4x    │▲+51.9% │ [spark]│ │   │
│  │  └──────┴────────────┴──────────┴────────┴─────────┘ │   │
│  │  ┌──────────────────────────────────────────────────┐│   │
│  │  │ Insight: AAPL trades at a premium on P/E (+23%), ││   │
│  │  │ EV/EBITDA (+30%), and P/B (+51%).                ││   │
│  │  └──────────────────────────────────────────────────┘│   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  2. PEERS GRID                                       │   │
│  │  Peers — Technology                                  │   │
│  │  ┌────────┐┌────────┐┌────────┐┌────────┐           │   │
│  │  │ MSFT   ││ GOOGL  ││ AMZN   ││ META   │           │   │
│  │  │ Microsoft│ Alphabet│ Amazon │ Meta    │           │   │
│  │  │ $3.1T  ││ $2.2T  ││ $2.1T  ││ $1.5T  │           │   │
│  │  └────────┘└────────┘└────────┘└────────┘           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────┬───────────────────────────────┐   │
│  │  3a. VALUATION       │  3b. PROFITABILITY            │   │
│  │  ┌────────────────┐  │  ┌─────────────────────────┐  │   │
│  │  │ Market Cap     │  │  │ Operating Margin  24.5% │  │   │
│  │  │   $3.5T        │  │  │  vs peers ▲          ▲   │  │   │
│  │  ├────────────────┤  │  ├─────────────────────────┤  │   │
│  │  │ Forward P/E    │  │  │ Net Margin        21.3% │  │   │
│  │  │   28.5x        │  │  │  vs peers ▲          ▲   │  │   │
│  │  ├────────────────┤  │  ├─────────────────────────┤  │   │
│  │  │ P/B            │  │  │ ROA               18.2% │  │   │
│  │  │   42.3x        │  │  │  vs peers •          —   │  │   │
│  │  ├────────────────┤  │  └─────────────────────────┘  │   │
│  │  │ PEG Ratio      │  │  ┌─────────────────────────┐  │   │
│  │  │   2.8x         │  │  │   MarginsChart             │   │
│  │  └────────────────┘  │  └─────────────────────────┘  │   │
│  ├──────────────────────┼───────────────────────────────┤   │
│  │  3c. REVENUE & EARN  │  3d. BALANCE SHEET & CASH     │   │
│  │  ┌────────────────┐  │  ┌─────────────────────────┐  │   │
│  │  │ Total Revenue  │  │  │ Total Cash      $65.2B  │  │   │
│  │  │   $385.7B      │  │  ├─────────────────────────┤  │   │
│  │  ├────────────────┤  │  │ Total Debt     $120.1B  │  │   │
│  │  │ Earnings Growth│  │  ├─────────────────────────┤  │   │
│  │  │   12.5%       ▲  │  │ Current Ratio     1.3x  │  │   │
│  │  ├────────────────┤  │  ├─────────────────────────┤  │   │
│  │  │ EPS Est (TY)  │  │  │ Free Cash Flow  $105B ▲  │  │   │
│  │  │   $6.85       │  │  ├─────────────────────────┤  │   │
│  │  ├────────────────┤  │  │ Operating CF    $122B ▲  │  │   │
│  │  │ EPS Est (NY)  │  │  └─────────────────────────┘  │   │
│  │  │   $7.40       │  │  ┌─────────────────────────┐  │   │
│  │  └────────────────┘  │  │   CashFlowChart           │   │
│  │  ┌─────────────────┐ │  └─────────────────────────┘  │   │
│  │  │  RevenueChart   │ │                               │   │
│  │  └─────────────────┘ │                               │   │
│  └──────────────────────┴───────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Vertical spacing between sections:** `gap: 32px` (matching current)

---

## 3. Component Specifications

### 3.1 PeerComparisonTable (Redesigned — Top Position)

The table moves from section 3 to section 1. It gets a glass card wrapper, a new **Diff** column, and improved row hover states.

#### 3.1.1 Outer Wrapper

```
┌─────────────────────────────────────────────────────────┐
│  Card: background: var(--glass-bg)                       │
│        border: 1px solid var(--glass-border)              │
│        borderRadius: 14px                                 │
│        overflow: hidden                                   │
│        padding: 0  (internal padding only)                │
│  │                                                      │
│  │  [Category Picker]                                    │
│  │  [Table]                                              │
│  │  [Insight Box]                                        │
└─────────────────────────────────────────────────────────┘
```

**Wrapper styles:**
```css
.peer-table-card {
  background: var(--glass-bg);          /* rgba(255,255,255,0.035) */
  border: 1px solid var(--glass-border); /* rgba(255,255,255,0.07) */
  border-radius: 14px;                  /* var(--radius-md) */
  overflow: hidden;
}
```

**Rationale**: Glass card gives visual weight befitting the top position. A more prominent container signals this is the primary interactive element.

#### 3.1.2 Category Picker

Positioned inside the card at the top, above the table. Same button style as current but no longer floating in open space — it sits inside the card with consistent padding.

```
┌─────────────────────────────────────────────────────────┐
│  [Valuation]  [Growth]  [Profitability]  [Health]        │
│   padding: 16px 20px 12px 20px                           │
│   border-bottom: 1px solid rgba(255,255,255,0.06)        │
└─────────────────────────────────────────────────────────┘
```

**Button states:**

| State | Background | Text Color | Font Weight | Cursor |
|-------|-----------|------------|-------------|--------|
| Active | `rgba(255,255,255,0.10)` | `var(--text-primary)` | 600 | default |
| Inactive | transparent | `var(--text-secondary)` | 400 | pointer |
| Hover (inactive) | `rgba(255,255,255,0.05)` | `var(--text-primary)` | 400 | pointer |

**Transition:** `all 0.2s ease`

```
Button styling:
  background: active ? rgba(255,255,255,0.10) : transparent
  border: none
  color: active ? var(--text-primary) : var(--text-secondary)
  padding: 6px 14px
  borderRadius: 6px
  fontSize: 12px
  fontFamily: var(--font-body)
  cursor: pointer
  fontWeight: active ? 600 : 400
  transition: all 0.2s ease
```

**Change from current**: Background of active state darkens from `rgba(255,255,255,0.08)` to `rgba(255,255,255,0.10)` for more contrast. Added hover state on inactive buttons.

#### 3.1.3 Table Structure

**New column layout:**

| Column | Width | Alignment | Description |
|--------|-------|-----------|-------------|
| Metric | `28%` | left | Metric label name |
| This Stock | `20%` | right | Formatted stock value |
| Peer Avg | `20%` | right | Formatted peer average |
| Diff | `18%` | right | Percentage difference with arrow |
| Trend | `14%` | center | Mini sparkline |

**Old column widths (for reference):** Metric `35%`, This Stock `25%`, Peer Avg `25%`, Trend `15%` — the new layout reclaims space from Metric and redistributes to accommodate Diff.

#### 3.1.4 Table Header Row

```
  Metric          This Stock     Peer Avg       Diff        Trend
  ─────────────────────────────────────────────────────────────────
  (headers: 10px, font-display, uppercase, letter-spacing 0.06em)
```

**Header styling:**
```
th {
  textAlign: left (/ right / center per column)
  padding: 8px 12px;
  color: var(--text-secondary);
  fontFamily: var(--font-display);
  fontSize: 10px;
  fontWeight: 600;
  letterSpacing: 0.06em;
  textTransform: uppercase;
  borderBottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.015);
}
```

**Change from current**: Added a subtle background tint to header row to visually separate it from data. Reduced padding from `10px 8px` to `8px 12px` — slightly more horizontal breathing room.

#### 3.1.5 Table Body Row

```
  P/E (TTM)           22.5x       18.2x    ▲ +23.6%  [~sparkline~]
  ─────────────────────────────────────────────────────────────────
  row: border-bottom: 1px solid rgba(255,255,255,0.03)
```

**Row default state:**
```
tr {
  borderBottom: 1px solid rgba(255,255,255,0.03);
  transition: background 0.15s ease;
}
```

**Row hover state (NEW):**
```
tr:hover {
  background: rgba(255,255,255,0.03);
}
```

This creates a subtle highlighting effect when the user mouses over a row, improving scannability. The transition should be quick (`0.15s`) for snappy feel.

#### 3.1.6 Column Cell Specifications

**Metric column (left-aligned):**
```
td.metric {
  padding: 10px 12px;
  color: var(--text-secondary);
  fontSize: 12px;
  fontFamily: var(--font-body);
  width: 28%;
}
```

**This Stock column (right-aligned):**
```
td.thisStock {
  padding: 10px 12px;
  fontFamily: var(--font-mono);
  fontSize: 13px;
  fontWeight: 600;
  textAlign: right;
  width: 20%;
  color: [colorized by metric type — see §3.1.7]
}
```

**Peer Avg column (right-aligned):**
```
td.peerAvg {
  padding: 10px 12px;
  color: var(--text-secondary);
  fontFamily: var(--font-mono);
  fontSize: 12px;
  textAlign: right;
  width: 20%;
}
```

**Diff column (right-aligned, NEW):**
```
td.diff {
  padding: 10px 12px;
  fontFamily: var(--font-mono);
  fontSize: 12px;
  fontWeight: 500;
  textAlign: right;
  width: 18%;
}
```

The Diff column shows the percentage difference between This Stock and Peer Avg. It is colored green or red based on whether the difference is favorable (see §3.1.7).

**Format:** `▲ +12.5%` or `▼ -8.3%`, monospaced. When data is missing, show `—` in `var(--text-secondary)`.

**Trend column (center-aligned):**
```
td.trend {
  padding: 8px 12px;
  width: 14%;
  textAlign: center;
}
```

#### 3.1.7 Color Logic (This Stock + Diff columns)

The color of both the "This Stock" value and the "Diff" percentage is determined by the metric category and the comparison against peer average:

**Valuation multiples (P/E, EV/EBITDA, P/B, etc.) — "lower is better":**
| Condition | This Stock color | Diff color | Diff text |
|-----------|-----------------|------------|-----------|
| Stock > Peer Avg | `var(--accent-red)` | `var(--accent-red)` | `▲ +23.6%` (red) |
| Stock < Peer Avg | `var(--accent-green)` | `var(--accent-green)` | `▼ -15.2%` (green) |
| Stock ≈ Peer Avg | `var(--text-primary)` | `var(--text-secondary)` | `—` |

**Growth / Profitability percentages (Revenue Growth, Gross Margin, ROE, etc.) — "higher is better":**
| Condition | This Stock color | Diff color | Diff text |
|-----------|-----------------|------------|-----------|
| Stock > Peer Avg | `var(--accent-green)` | `var(--accent-green)` | `▲ +12.5%` (green) |
| Stock < Peer Avg | `var(--accent-red)` | `var(--accent-red)` | `▼ -8.3%` (red) |
| Stock ≈ Peer Avg | `var(--text-primary)` | `var(--text-secondary)` | `—` |

**Health metrics (Debt/Equity) — "lower is better":**
| Condition | This Stock color | Diff color | Diff text |
|-----------|-----------------|------------|-----------|
| Stock > Peer Avg | `var(--accent-red)` | `var(--accent-red)` | `▲ +15.0%` (red) |
| Stock < Peer Avg | `var(--accent-green)` | `var(--accent-green)` | `▼ -10.0%` (green) |
| Stock ≈ Peer Avg | `var(--text-primary)` | `var(--text-secondary)` | `—` |

**Arrow convention for Diff cells:**
- `▲` when the stock value is **above** the peer average (regardless of whether that's favorable)
- `▼` when the stock value is **below** the peer average
- Arrow is always shown alongside the raw percentage. The color of the cell (green/red) communicates whether the deviation is favorable.

**Special case — metrics without peer data:**
- "This Stock" column: use `var(--text-primary)` (neutral)
- "Diff" column: show `—` in `var(--text-secondary)`
- "Trend" column: show `—` in `var(--text-secondary)`

#### 3.1.8 Sparklines (Trend Column)

Unchanged from current implementation. Uses `MiniSparkline` / `Sparkline` component:

```
const Sparkline = ({ data, color }) => {
  if (!data || data.length < 2)
    return <span style={{ color: "var(--text-secondary)", fontSize: "10px" }}>—</span>;
  return (
    <div style={{ width: "64px", height: "24px", margin: "0 auto" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map((d, i) => ({ v: d.value, i }))}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
```

Sparkline color matches the "This Stock" column color (so a favorable metric gets a green sparkline, unfavorable gets red, neutral gets `var(--text-primary)`).

#### 3.1.9 Insight Box

Displayed below the table, inside the card wrapper. Same design as current but now inside the glass card for visual cohesion.

```
┌─────────────────────────────────────────────────────────┐
│  [Table rows]                                            │
├─────────────────────────────────────────────────────────┤
│  padding: 12px 20px 16px 20px                            │
│  border-top: 1px solid rgba(255,255,255,0.05)            │
│                                                          │
│  💡 AAPL trades at a premium on P/E (+23.6%),            │
│     EV/EBITDA (+30.6%), and P/B (+51.9%).                │
│     AAPL is strong on Revenue Growth (+18.2%).            │
└─────────────────────────────────────────────────────────┘
```

**Insight styling:**
```
.insight-box {
  padding: 12px 20px 16px 20px;
  border-top: 1px solid rgba(255,255,255,0.05);
  background: rgba(255,255,255,0.015);
}

.insight-text {
  color: var(--text-secondary);
  fontSize: 11px;
  fontFamily: var(--font-body);
  fontStyle: italic;
  lineHeight: 1.6;
  margin: 0;
}
```

**Change from current**: Removed the separate bordered container — the insight sits inside the card with a subtle top separator line. Reduced font size from 12px to 11px to match overall refinement. Lighter italic style.

#### 3.1.10 State: No Category Data

When a category has no metrics (e.g., Health category is empty for some stocks):

```
  ┌─────────────────────────────────────────────────┐
  │  No data available for this category             │
  │  color: var(--text-secondary), centered, 12px    │
  │  padding: 24px 0                                 │
  └─────────────────────────────────────────────────┘
```

### 3.2 Peers Grid (Unchanged, Repositioned)

The Peers Grid remains between the Peer Comparison Table and the Financial Sections. Design is identical to current implementation but benefits from the new tab layout — it's now visually grouped with the table since they share a "peer context" relationship.

```
┌─────────────────────────────────────────────────────────┐
│  Peers — Technology                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │  MSFT    │ │  GOOGL   │ │  AMZN    │ │  META    │   │
│  │ Microsoft │ │ Alphabet │ │ Amazon   │ │ Meta     │   │
│  │  $3.1T   │ │  $2.2T   │ │  $2.1T   │ │  $1.5T   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  grid: repeat(auto-fill, minmax(140px, 1fr))            │
└─────────────────────────────────────────────────────────┘
```

**Peer card styling (unchanged):**
```
.peer-card {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  borderRadius: 8px;
  padding: 10px 12px;
  display: flex;
  flexDirection: column;
  gap: 2px;
}
```

**Section title (unchanged):**
```
Section title:
  color: var(--text-secondary)
  fontFamily: var(--font-display)
  fontSize: 11px
  fontWeight: 600
  letterSpacing: 0.12em
  textTransform: uppercase
  borderBottom: 1px solid rgba(255,255,255,0.05)
  paddingBottom: 8px
  marginBottom: 12px
```

### 3.3 StatBox with Peer Indicator (Enhanced)

The existing `StatBox` component gets an optional **peer indicator** — a small inline element showing how the metric compares against peers. This only appears when peer comparison data is available for that metric.

#### 3.3.1 StatBox Component Interface (Updated)

```jsx
function StatBox({
  label,       // string — metric label (e.g., "Operating Margin")
  value,       // string — formatted value (e.g., "24.5%")
  sub,         // string? — optional subtitle (e.g., "QoQ +2.1%")
  positive,    // boolean? — is the metric value favorable on its own?
  peerDiff,    // { value: number, favorable: boolean }? — peer comparison indicator
})
```

#### 3.3.2 Visual Design

```
┌──────────────────────────────────┐
│  OPERATING MARGIN                │  ← label: 10px, uppercase, text-secondary
│                                   │
│  24.5%  ▲ vs peers               │  ← value: 15px, DM Mono, 500 weight
│                                   │     peer indicator inline
│                                   │
│  (subtitle text here if present)  │  ← sub: 10px, text-secondary
└──────────────────────────────────┘
```

**Peer indicator format:**
- **Above peer avg (favorable for pct):** `▲ vs peers` in green — compact inline tag
- **Below peer avg (unfavorable for pct):** `▼ vs peers` in red
- **No peer data or neutral:** nothing shown (indicator absent)

The indicator is a compact inline element, not a full second line. It sits after the value on the same row when space permits:

```
.layout-with-peer {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.peer-indicator {
  fontSize: 10px;
  fontFamily: var(--font-body);
  fontWeight: 400;
  padding: 1px 5px;
  borderRadius: 4px;
  whiteSpace: nowrap;
}
```

**Peer indicator colors:**
```
favorable (green):
  color: var(--accent-green);
  background: rgba(0, 229, 160, 0.08);
  // Shows "▲ vs peers"

unfavorable (red):
  color: var(--accent-red);
  background: rgba(255, 77, 109, 0.08);
  // Shows "▼ vs peers"
```

**When to show the peer indicator:**

The indicator appears when `peerDiff` is provided (non-null). This is determined by checking if the metric exists in `comparablesData.categories`:

| StatBox Metric | Peer Data Source | Key to match |
|---------------|-----------------|--------------|
| Operating Margin | Profitability category | `operatingMargin` |
| Net Margin | Profitability category | `profitMargin` or `netMargin` |
| ROA | Profitability category | `returnOnAssets` |
| Market Cap | (no peer context) | — |
| Forward P/E | Valuation category | `forwardPE` |
| P/B | Valuation category | `priceToBook` |
| PEG Ratio | Valuation category | `pegRatio` |
| Total Revenue | (no peer context) | — |
| Earnings Growth | Growth category | `earningsGrowth` |
| EPS Est. (This Yr) | (no peer context) | — |
| EPS Est. (Next Yr) | (no peer context) | — |
| Total Cash | (no peer context) | — |
| Total Debt | Health category | `totalDebt` |
| Current Ratio | Health category | `currentRatio` |
| Free Cash Flow | (no peer context) | — |
| Operating CF | (no peer context) | — |

**Metrics without peer data** simply render as standard StatBox with no indicator. This is the majority case and keeps the design clean.

**Visual distinction**: When peer data exists but the metric is neutral (near peer average, within a small threshold like 5%), show a subdued `•` indicator:
```
20.1%  • vs peers
color: var(--text-secondary)
background: rgba(255,255,255,0.04)
```

#### 3.3.3 StatBox Card Styles (Unchanged Base)

```
.stat-box {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  borderRadius: 10px;
  padding: 14px 16px;
  display: flex;
  flexDirection: column;
  gap: 4px;
}

.label {
  color: var(--text-secondary);
  fontFamily: var(--font-body);
  fontSize: 10px;
  fontWeight: 400;
  letterSpacing: 0.06em;
  textTransform: uppercase;
}

.value {
  fontFamily: var(--font-mono);
  fontSize: 15px;
  fontWeight: 500;
}

.sub {
  color: var(--text-secondary);
  fontFamily: var(--font-body);
  fontSize: 10px;
}
```

### 3.4 Financial Sections (2-Column Grid)

The 4 financial sections (Valuation, Profitability, Revenue & Earnings, Balance Sheet & Cash Flow) are arranged in a **2-column grid**. Each section maintains its own internal grid for StatBox children.

#### 3.4.1 Section Wrapper

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌──────────────────────┐  ┌───────────────────────────────┐     │
│  │  VALUATION           │  │  PROFITABILITY                │     │
│  │  ┌────────┐┌────────┐│  │  ┌────────┐┌────────┐┌──────┐│     │
│  │  │Market  ││Forward ││  │  │Op Marg││Net Marg││ ROA  ││     │
│  │  │Cap     ││P/E     ││  │  │24.5% ▲││21.3%  ││18.2% ││     │
│  │  ├────────┤├────────┤│  │  └────────┘└────────┘└──────┘│     │
│  │  │P/B     ││PEG     ││  │  ┌─────────────────────────┐ │     │
│  │  │42.3x   ││2.8x    ││  │  │   MarginsChart           │ │     │
│  │  └────────┘└────────┘│  │  └─────────────────────────┘ │     │
│  └──────────────────────┘  └───────────────────────────────┘     │
│                                                                   │
│  ┌──────────────────────┐  ┌───────────────────────────────┐     │
│  │  REVENUE & EARNINGS  │  │  BALANCE SHEET & CASH FLOW    │     │
│  │  ┌────────┐┌────────┐│  │  ┌────────┐┌────────┐┌──────┐│     │
│  │  │Revenue ││Earnings││  │  │Cash    ││Debt    ││Cur   ││     │
│  │  │$385.7B ││Growth  ││  │  │$65.2B  ││$120.1B ││Ratio ││     │
│  │  ├────────┤├────────┤│  │  ├────────┤├────────┤├──────┤│     │
│  │  │EPS TY  ││EPS NY  ││  │  │FCF ▲  ││Op CF ▲││      ││     │
│  │  │$6.85   ││$7.40   ││  │  │$105B   ││$122B   ││      ││     │
│  │  └────────┘└────────┘│  │  └────────┘└────────┘└──────┘│     │
│  │  ┌─────────────────┐ │  │  ┌─────────────────────────┐ │     │
│  │  │  RevenueChart   │ │  │  │   CashFlowChart          │ │     │
│  │  └─────────────────┘ │  │  └─────────────────────────┘ │     │
│  └──────────────────────┘  └───────────────────────────────┘     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

#### 3.4.2 Two-Column Outer Grid

```css
.financial-sections-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  /* On tablet/mobile: stacks to single column — see §6 */
}
```

Each column is a `Section` component with its own title, StatBox grid, and chart.

#### 3.4.3 Internal StatBox Grids

Within each section, StatBoxes are arranged in their own responsive grid:

```css
.statbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}
```

This allows StatBoxes to flow naturally within the section column width. At the full two-column desktop width, each half is approximately `~50% - 12px` of the viewport, so `minmax(140px, 1fr)` usually yields 2 StatBoxes per row within each section.

**Valuation section:** 4 stat boxes → 2×2 grid
**Profitability section:** 3 stat boxes → 2+1 grid (second row has 1)
**Revenue & Earnings:** 4 stat boxes → 2×2 grid
**Balance Sheet & Cash Flow:** 5 stat boxes → 3+2 grid

### 3.5 Section Component (Unchanged)

```jsx
function Section({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3 style={{
        color: "var(--text-secondary)",
        fontFamily: "var(--font-display)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        paddingBottom: "8px",
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}
```

---

## 4. Styling Reference

### 4.1 Design Tokens (from `:root`)

```css
/* Backgrounds */
--glass-bg: rgba(255, 255, 255, 0.035);
--glass-bg-hover: rgba(255, 255, 255, 0.06);
--glass-border: rgba(255, 255, 255, 0.07);
--glass-border-hover: rgba(255, 255, 255, 0.14);

/* Accents */
--accent-green: #00e5a0;
--accent-green-dim: rgba(0, 229, 160, 0.12);
--accent-red: #ff4d6d;
--accent-red-dim: rgba(255, 77, 109, 0.12);
--accent-blue: #4f8dff;
--accent-amber: #ffb547;

/* Text */
--text-primary: #e8edf5;
--text-secondary: #5a6a80;
--text-muted: #2e3d50;

/* Typography */
--font-display: "Syne", sans-serif;    /* Section titles, tab labels */
--font-mono: "DM Mono", monospace;     /* Metric values, numbers */
--font-body: "Inter", sans-serif;      /* Descriptive text, insight, labels */

/* Radii */
--radius-sm: 8px;   /* Peer cards, StatBox */
--radius-md: 14px;  /* Glass cards, table wrappers */
```

### 4.2 Typography Scale

| Role | Font | Size | Weight | Letter Spacing | Transform |
|------|------|------|--------|---------------|-----------|
| Section title | Syne | `11px` | 600 | `0.12em` | uppercase |
| Category button | Inter | `12px` | 400/600 | — | — |
| Metric label (table) | Inter | `12px` | 400 | — | — |
| Table header | Syne | `10px` | 600 | `0.06em` | uppercase |
| StatBox label | Inter | `10px` | 400 | `0.06em` | uppercase |
| StatBox value | DM Mono | `15px` | 500 | — | — |
| Table value (This Stock) | DM Mono | `13px` | 600 | — | — |
| Table peer avg | DM Mono | `12px` | 400 | — | — |
| Table diff | DM Mono | `12px` | 500 | — | — |
| Insight text | Inter | `11px` | 300 | — | — |
| Peer card ticker | DM Mono | `13px` | 600 | — | — |
| Peer card name | Inter | `10px` | 300 | — | — |
| Peer indicator tag | Inter | `10px` | 400 | — | — |

### 4.3 Spacing Scale

| Context | Value |
|---------|-------|
| Tab content gap (between major sections) | `32px` |
| Two-column section grid gap | `24px` |
| Within-section content gap | `12px` |
| StatBox grid gap | `8px` |
| Section title bottom padding | `8px` |
| Table cell padding | `10px 12px` |
| Card padding (StatBox) | `14px 16px` |
| Insight box padding | `12px 20px 16px 20px` |
| Category picker padding | `16px 20px 12px 20px` |
| Peer card padding | `10px 12px` |
| Peer grid gap | `8px` |

### 4.4 Borders

| Context | Style |
|---------|-------|
| Glass card outer | `1px solid rgba(255,255,255,0.07)` |
| StatBox / Peer card | `1px solid rgba(255,255,255,0.06)` |
| Table row divider | `1px solid rgba(255,255,255,0.03)` |
| Table header divider | `1px solid rgba(255,255,255,0.06)` |
| Section title underline | `1px solid rgba(255,255,255,0.05)` |
| Insight box top separator | `1px solid rgba(255,255,255,0.05)` |

### 4.5 Color Semantics (Global Rules)

| Meaning | Color | Usage |
|---------|-------|-------|
| Favorable (green) | `var(--accent-green)` | This Stock value when better than peer; Diff when favorable; positive metrics |
| Unfavorable (red) | `var(--accent-red)` | This Stock value when worse than peer; Diff when unfavorable; negative metrics |
| Neutral / Primary | `var(--text-primary)` | Values without peer context; non-comparative numbers |
| Secondary / Label | `var(--text-secondary)` | Labels, peer averages, subtitles, metadata |
| Muted | `var(--text-muted)` | Disabled, skeleton elements |

### 4.6 Animations & Transitions

| Element | Property | Duration | Easing |
|---------|----------|----------|--------|
| Category button | `all` | `0.2s` | `ease` |
| Table row hover | `background` | `0.15s` | `ease` |
| Skeleton pulse | `opacity` | `1.5s` | `ease-in-out infinite` |

**No animation on StatBox or peer card hover** — these are static readouts, not interactive elements. The table rows get hover because they are densely packed and benefit from visual tracking assistance.

---

## 5. Interaction Design

### 5.1 Category Picker

- **Click**: Switches the table to show metrics for that category (Valuation → Growth → Profitability → Health)
- **State management**: `useState("valuation")` within `PeerComparisonSection`
- **Transition**: Table contents swap immediately (no fade animation — avoids layout jank since row counts differ per category)
- **Keyboard**: Not required at this stage (no keyboard navigation spec)

### 5.2 Table Row Hover

- **Behavior**: Entire row background shifts to `rgba(255,255,255,0.03)` on mouseover
- **Duration**: `0.15s` — quick enough to not feel sluggish
- **Purpose**: Improves scannability across wide columns, especially for the Trend sparkline which sits at the far right

### 5.3 StatBox Peer Indicator

- **Static display**: No interaction — this is a passive indicator
- **Tooltip (future enhancement)**: Could show exact peer value on hover, but not in this iteration

### 5.4 Loading States

**Full tab loading** (when both `financialData` and `comparablesData` are loading):

```
┌───────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  ← 6 skeleton bars
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │     height: 20px
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │     background: rgba(255,255,255,0.04)
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │     borderRadius: 6px
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │     animation: pulse 1.5s ease-in-out infinite
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │     staggered delay: i * 0.1s
└───────────────────────────────────────────────────┘
```

**Partial loading** (financial data ready, comparables still loading):
- Show the first two sections (Peer Comparison Table and Financial Sections) with available data
- Show a compact inline spinner or skeleton in the Peers Grid area

**Category table loading** (within Peer Comparison Table):
- When switching categories, if data is already cached, switch immediately
- If data needs to fetch, show 4–6 skeleton rows matching the table structure inside the card

### 5.5 Error States

**Full error**: Red error message centered, matching current pattern:
```
Error text:
  color: var(--accent-red)
  fontFamily: var(--font-body)
  fontSize: 13px
  padding: 40px 0
  textAlign: center
```

**Partial error** (comparables failed but financial data ok):
- Show Financial Sections normally
- Show a subdued message in the Peer Comparison card area: "Peer data unavailable" in `var(--text-secondary)`

### 5.6 Empty / No Data States

**No financial data**: Centered message — "No data available" matching current pattern.

**No comparables data**: Financial Sections render as normal. Peer Comparison section is hidden entirely (conditional render: `{comparablesData && <PeerComparisonSection ... />}`).

**Empty category**: When a category (e.g., "Health") has no metrics, the table body shows:
```
  ┌─────────────────────────────────────────────────┐
  │  No data available for this category             │
  └─────────────────────────────────────────────────┘
```

---

## 6. Responsive Behavior

### 6.1 Breakpoints

| Breakpoint | Width | Layout |
|-----------|-------|--------|
| Desktop | `≥ 1024px` | Full 2-column financial sections, table with 5 columns |
| Tablet | `768px – 1023px` | Table columns compress, 2-column sections become 1-column |
| Mobile | `< 768px` | Single column, table reduces columns, horizontal scroll |

### 6.2 Desktop (`≥ 1024px`)

Full layout as described in §2:

```
┌──────────────────────────────────────┐
│  1. Peer Comparison Table (full)     │
│  2. Peers Grid (auto-fill)           │
│  ┌──────────────┬──────────────────┐ │
│  │ Valuation    │ Profitability    │ │
│  ├──────────────┼──────────────────┤ │
│  │ Rev & Earn   │ Balance Sheet    │ │
│  └──────────────┴──────────────────┘ │
└──────────────────────────────────────┘
```

**Table:** All 5 columns visible (Metric | This Stock | Peer Avg | Diff | Trend)

**Financial sections:** 2-column grid (`grid-template-columns: 1fr 1fr; gap: 24px`)

**Peers grid:** `grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`

### 6.3 Tablet (`768px – 1023px`)

```
┌───────────────────────────────┐
│  1. Peer Comparison Table     │
│  2. Peers Grid (3-4 across)   │
│  ┌──────────────────────────┐ │
│  │ Valuation                │ │
│  ├──────────────────────────┤ │
│  │ Profitability            │ │
│  ├──────────────────────────┤ │
│  │ Revenue & Earnings       │ │
│  ├──────────────────────────┤ │
│  │ Balance Sheet & Cash     │ │
│  └──────────────────────────┘ │
└───────────────────────────────┘
```

**Table:** All 5 columns visible but compressed. Metric column at `30%`, Diff at `16%`.

**Financial sections:** 1-column grid (`grid-template-columns: 1fr`) — sections stack vertically in order: Valuation, Profitability, Revenue & Earnings, Balance Sheet & Cash Flow.

**Peers grid:** Same auto-fill, narrower cards appear (3–4 across).

**Gap between stacked sections:** `28px`.

### 6.4 Mobile (`< 768px`)

```
┌──────────────────┐
│  1. Comparison   │
│     (scrollable) │
│  2. Peers (2-3)  │
│  ┌──────────────┐│
│  │ Valuation    ││
│  ├──────────────┤│
│  │ Profitability││
│  ├──────────────┤│
│  │ Revenue...   ││
│  ├──────────────┤│
│  │ Balance...   ││
│  └──────────────┘│
└──────────────────┘
```

**Table:** Reduces to essential columns — Metric | This Stock | Diff. Trend column hidden. Horizontal scroll on the table card if needed (`overflow-x: auto`).

**Financial sections:** Single column. StatBox grid: `minmax(120px, 1fr)` — typically 1–2 per row.

**Peers grid:** `minmax(130px, 1fr)` — 2 per row.

**Section title font size:** Reduced to `10px`.

### 6.5 Table Column Breakpoint Rules

```
/* Desktop (≥ 1024px) */
.col-metric  { width: 28%; display: table-cell; }
.col-stock   { width: 20%; display: table-cell; }
.col-peer    { width: 20%; display: table-cell; }
.col-diff    { width: 18%; display: table-cell; }
.col-trend   { width: 14%; display: table-cell; }

/* Tablet (768-1023px) */
.col-metric  { width: 30%; }
.col-stock   { width: 22%; }
.col-peer    { width: 20%; }
.col-diff    { width: 16%; }
.col-trend   { width: 12%; }

/* Mobile (< 768px) */
.col-metric  { width: 40%; }
.col-stock   { width: 30%; }
.col-diff    { width: 30%; }
.col-peer    { display: none; }   /* Hidden */
.col-trend   { display: none; }   /* Hidden */
```

---

## 7. Data Flow & Props Interface

### 7.1 Component Tree

```
StockAnalysisPage
  └── FundamentalsTab
        ├── PeerComparisonSection
        │     ├── CategoryPicker (internal)
        │     ├── CategoryTable (per category)
        │     │     ├── MetricRow (per metric)
        │     │     ├── Sparkline (per metric, Trend column)
        │     │     └── InsightBox (per category)
        │     └── PeersGrid
        │           └── PeerCard (per peer)
        └── FinancialSections (2-col grid)
              ├── Section "Valuation"
              │     └── StatBox[] (4 stat boxes)
              ├── Section "Profitability"
              │     ├── StatBox[] (3 stat boxes)
              │     └── MarginsChart
              ├── Section "Revenue & Earnings"
              │     ├── StatBox[] (4 stat boxes)
              │     └── RevenueChart
              └── Section "Balance Sheet & Cash Flow"
                    ├── StatBox[] (5 stat boxes)
                    └── CashFlowChart
```

### 7.2 FundamentalsTab Props (Unchanged)

```jsx
export default function FundamentalsTab({
  ticker,           // string — stock ticker symbol (e.g., "AAPL")
  financialData,    // object — from useStockDetail(), contains { summary, financials, balanceSheet }
  comparablesData,  // object — from useComparables(), contains { categories, peers, base, sector }
  loading,          // boolean — combined loading state from both hooks
  error,            // string? — combined error from both hooks
})
```

### 7.3 Financial Data Shape (unchanged from current)

```
financialData = {
  summary: {
    marketCap, currentPrice, forwardPE, priceToBook,
    trailingPE, enterpriseToEbitda, pegRatio,
    ...
  },
  financials: {
    totalRevenue, revenueGrowth, grossMargins,
    operatingMargins, profitMargins, returnOnAssets,
    returnOnEquity, earningsGrowth, annualIncome,
    estimates: { currentYear, nextYear },
    ...
  },
  balanceSheet: {
    totalCash, totalDebt, currentRatio,
    freeCashflow, operatingCashflow, debtToEquity,
    annualCashFlow,
    ...
  },
}
```

### 7.4 Comparables Data Shape (unchanged from current)

```
comparablesData = {
  categories: {
    valuation: {
      metrics: [
        { key: "trailingPE", label: "P/E (TTM)", fmt: "x",
          baseValue: 25.3, peerAvg: 21.2, verdict: "27.5% above peer" },
        ...
      ],
    },
    growth: { metrics: [...] },
    profitability: { metrics: [...] },
    health: { metrics: [...] },
  },
  base: {
    sparklines: { trailingPE: [...], revenueGrowth: [...], ... },
  },
  peers: [
    { ticker: "MSFT", name: "Microsoft Corp", marketCap: 3100000000000 },
    ...
  ],
  sector: "Technology",
}
```

### 7.5 StatBox Peer Diff Mapping

For StatBox components that need peer comparison data, the mapping logic walks `comparablesData.categories` to find matching metrics:

```js
function findPeerDiff(comparablesData, metricKey) {
  if (!comparablesData?.categories) return null;
  for (const cat of Object.values(comparablesData.categories)) {
    if (!cat?.metrics) continue;
    const found = cat.metrics.find((m) => m.key === metricKey);
    if (found && found.peerAvg != null && found.baseValue != null) {
      const diffPct = ((found.baseValue - found.peerAvg) / found.peerAvg) * 100;
      const favorable = (found.fmt === "x")
        ? diffPct < 0   // multiples: lower is better
        : diffPct > 0;  // percentages: higher is better
      return { value: diffPct, favorable };
    }
  }
  return null;
}
```

### 7.6 Removed Components

The following components are removed from `FundamentalsTab.jsx`:
- `BANNER_METRICS` (constant definition)
- `findComparableMetric` (helper)
- `fmtPeer` (helper)
- `computePeerDiff` (helper)
- `isFavorable` (helper)
- `MiniSparkline` (component)
- `BannerMetricCard` (component)
- `KeyMetricsBanner` (component)
- `bannerStyles` (style object)
- `cardStyles` (style object)

The `Sparkline` component remains (used by `MetricRow` in the table).

---

## 8. Implementation Notes

### 8.1 What Changes

| File | Action | Details |
|------|--------|---------|
| `FundamentalsTab.jsx` | Rewrite | Remove banner section. Restructure layout. Add Diff column. Add peer indicators to StatBox. Convert financial sections to 2-column grid. |
| `StockAnalysisPage.jsx` | No changes | Props interface unchanged. |
| `Charts.jsx` | No changes | Charts remain in same position, unchanged. |
| `formatters.js` | No changes | Reuse existing formatters. |
| `index.css` | No changes | All new styles use existing CSS custom properties. |

### 8.2 What's Removed

| Removed | Was | Replaced By |
|---------|-----|-------------|
| `BannerMetricCard` | Gradient card with sparkline, 6 metrics | Peer Comparison Table (now at top) |
| `KeyMetricsBanner` | 3-column grid of 6 banner cards | (Nothing — eliminated) |
| Duplicated P/E | Appeared in banner AND table | Appears only in table |
| Duplicated Revenue Growth | Appeared in banner AND table | Appears only in table |
| Duplicated Gross Margin | Appeared in banner AND table | Appears only in table |
| Duplicated ROE | Appeared in banner AND table | Appears only in table |
| Duplicated EV/EBITDA | Appeared in banner AND table | Appears only in table |
| Duplicated Debt/Equity | Appeared in banner AND table | Appears only in table |

### 8.3 What's New

| New | Where | Details |
|-----|-------|---------|
| Diff column | Peer Comparison Table | `▲ +23.6%` or `▼ -8.3%`, colorized |
| Table row hover | Peer Comparison Table | `rgba(255,255,255,0.03)` on hover, `0.15s` transition |
| Glass card wrapper | Peer Comparison Table | Border-radius `14px`, `var(--glass-bg)`, `var(--glass-border)` |
| Table header background | Peer Comparison Table | `rgba(255,255,255,0.015)` tint on header row |
| Peer indicator tag | StatBox (select metrics) | Inline `▲ vs peers` (green) or `▼ vs peers` (red) |
| Neutral peer indicator | StatBox (near-average) | `• vs peers` in subdued `var(--text-secondary)` |
| 2-column sections grid | Financial Sections | `grid-template-columns: 1fr 1fr; gap: 24px` |
| Responsive breakpoints | Whole tab | Tablet: 1-col sections; Mobile: reduced table columns |

### 8.4 Edge Cases

1. **Stock has no peers**: Peer Comparison section is hidden. Financial sections render normally at full width.
2. **Category has no metrics**: Show "No data available for this category" in the table body.
3. **Individual metric missing from stock data**: Show `—` in "This Stock" column.
4. **Individual metric missing from peer data**: Show `—` in "Peer Avg" and "Diff" columns. No sparkline.
5. **Scale mismatch** (e.g., debtToEquity as percentage vs decimal): Apply normalization before comparison — existing `computePeerDiff` logic is adapted into the new `findPeerDiff` for StatBox.
6. **Very long metric labels**: Truncate with ellipsis. The Metric column has enough width (`28%`) for labels like "EPS Est. (Next Yr)".
7. **All 4 categories empty**: Show "No peer comparison data available" in the card instead of the category picker.

### 8.5 Performance Considerations

- **Category switching**: Table data is already in memory (all categories loaded). Switching is instant.
- **Sparklines**: Already loaded via `comparablesData.base.sparklines`. No additional fetches.
- **StatBox peer lookup**: `O(n)` walk through comparables categories on initial render. Negligible overhead (categories typically have 5–10 metrics each).

---

## 9. Visual Reference

### 9.1 Current State (Before)

```
┌─────────────────────────────────────────────┐
│  🔴 KEY METRICS BANNER (gradient cards)      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ...    │
│  │P/E   │ │RevGr │ │GrMar │ │ROE  │          │
│  │22.5x │ │12.5% │ │45%  │ │35%  │          │
│  │[spk] │ │[spk] │ │[spk] │ │[spk] │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ ...    │
│                                              │
│  📊 FINANCIAL SECTIONS (3-col StatBox)       │
│  Valuation   (4 boxes)                       │
│  Profitability (3 boxes + chart)             │
│  Revenue     (4 boxes + chart)               │
│  Balance     (5 boxes + chart)               │
│                                              │
│  📋 PEER COMPARISON (below everything)        │
│  ┌──────┬──────┬──────┬──────┐              │
│  │Metric│Stock │Peer  │Trend │              │
│  ├──────┼──────┼──────┼──────┤              │
│  │P/E   │22.5x │18.2x │[spk] │  ← DUPE!     │
│  └──────┴──────┴──────┴──────┘              │
│  Peers Grid                                  │
└─────────────────────────────────────────────┘
```

### 9.2 After (Redesigned)

```
┌─────────────────────────────────────────────┐
│  📋 PEER COMPARISON (top, glass card)        │
│  ┌─────────────────────────────────────────┐│
│  │[Valuation][Growth][Profitability][Health]││
│  ├──────┬──────┬──────┬──────────┬─────────┤│
│  │Metric│Stock │Peer  │Diff      │Trend    ││
│  ├──────┼──────┼──────┼──────────┼─────────┤│
│  │P/E   │22.5x │18.2x │▲ +23.6%  │[spk]    ││  ← NO DUPE
│  │EV/EB │15.8x │12.1x │▲ +30.6%  │[spk]    ││
│  │P/B   │8.2x  │5.4x  │▲ +51.9%  │[spk]    ││
│  ├──────┴──────┴──────┴──────────┴─────────┤│
│  │💡 AAPL trades at a premium on P/E,       ││
│  │   EV/EBITDA, and P/B.                    ││
│  └─────────────────────────────────────────┘│
│                                              │
│  👥 PEERS GRID                               │
│  [MSFT] [GOOGL] [AMZN] [META]               │
│                                              │
│  📊 FINANCIAL SECTIONS (2-col grid)           │
│  ┌──────────────┬──────────────────────────┐ │
│  │ Valuation    │ Profitability            │ │
│  │ (4 stat boxes)│ (3 boxes + MarginsChart) │ │
│  ├──────────────┼──────────────────────────┤ │
│  │ Rev & Earn   │ Balance Sheet & Cash     │ │
│  │ (4 boxes +  │ (5 boxes + CashFlowChart) │ │
│  │  RevChart)   │                          │ │
│  └──────────────┴──────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 10. Checklist for Implementation

- [ ] Remove `KeyMetricsBanner`, `BannerMetricCard`, `MiniSparkline`, and all banner-related helpers
- [ ] Restructure layout: Peer Comparison → Peers Grid → Financial Sections (2-col)
- [ ] Wrap Peer Comparison Table in glass card (`borderRadius: 14px`, `var(--glass-bg)`)
- [ ] Add Diff column to table with colorized `▲/▼ +XX.X%`
- [ ] Add table row hover state (`rgba(255,255,255,0.03)`)
- [ ] Add table header background tint
- [ ] Move insight box inside the glass card with top separator
- [ ] Enhance `StatBox` with optional `peerDiff` prop → inline peer indicator tag
- [ ] Add `findPeerDiff` helper for StatBox peer lookups
- [ ] Wrap financial sections in 2-column CSS grid
- [ ] Adjust internal StatBox grids to `repeat(auto-fill, minmax(140px, 1fr))`
- [ ] Implement responsive breakpoints (tablet: 1-col sections; mobile: reduced table columns)
- [ ] Handle edge cases: empty categories, missing metrics, no peer data
- [ ] Verify no regressions in loading/error/empty states
- [ ] Verify all formatters still work with the new column
