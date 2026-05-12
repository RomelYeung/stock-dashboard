# Consolidate Financials + Comparables Tabs — Design Spec

## Problem
The Stock Analysis page has separate "Financials" and "Comparables" tabs with significant metric overlap (Valuation metrics like P/E, EV/EBITDA; Profitability metrics like Gross Margin, ROE). Users must switch tabs to see absolute values vs. peer context. This is fragmented and confusing.

## Goal
Merge both tabs into a single coherent **"Fundamentals"** tab that presents:
- Absolute financial metrics
- Peer comparison context
- Historical charts
- Peer listings

All in one scrollable view with no nested tab switchers.

## Design Principles
- **Single source of truth**: Each metric appears once, in its richest form
- **Visual hierarchy**: Most important metrics get the most prominent treatment
- **Match existing design language**: Dark theme, glass cards, subtle borders, Syne/Inter/DM Mono fonts, green/red accent semantics
- **No nested tabs**: One continuous scrollable page within the tab

## Layout — Single Page, Top to Bottom

### 1. Key Metrics Banner (NEW)
- **Position**: Top of the Fundamentals tab
- **Content**: 6 metric cards in a responsive grid (3 columns on desktop, 2 on tablet, 1 on mobile)
- **Metrics shown** (the most important + most overlapping):
  1. P/E (TTM)
  2. Revenue Growth
  3. Gross Margin
  4. ROE
  5. EV/EBITDA
  6. Debt/Equity
- **Card design**:
  - Glass background (`--glass-bg`, border `--glass-border`)
  - Border radius: `10px`
  - Padding: `14px 16px`
  - Label: uppercase, `10px`, `--text-secondary`, letter-spacing `0.06em`
  - Current value: large (`18px`), bold, colored green/red based on whether it's "good"
  - Peer context: small row below value showing "Peer Avg X.Xx · +15%" or similar
  - Mini sparkline: `64px × 24px` on the right side of the card (from comparables sparkline data)
  - Hover: subtle lift (`y: -2px`, shadow)
- **Data source**: Merges `summary` / `financials` / `balanceSheet` (for current values) with `comparablesData.categories` (for peer avg and sparklines)
- **Color logic** (same as ComparablesTab):
  - For multiples (x): lower is better → green if below peer, red if above
  - For percentages: higher is better → green if above peer, red if below
  - Debt/Equity: lower is better → green if below peer

### 2. Financial Sections (Reorganized + Deduplicated)
The existing 4 sections from the Financials tab, with the 6 banner metrics REMOVED to avoid duplication.

**Valuation Section** (4 stat boxes):
- Market Cap
- Forward P/E
- P/B
- PEG Ratio

**Profitability Section** (3 stat boxes + MarginsChart):
- Operating Margin
- Net Margin
- ROA
- MarginsChart (unchanged)

**Revenue & Earnings Section** (4 stat boxes + RevenueChart):
- Total Revenue
- Earnings Growth
- EPS Est. (This Yr)
- EPS Est. (Next Yr)
- RevenueChart (unchanged)

**Balance Sheet & Cash Flow Section** (5 stat boxes + CashFlowChart):
- Total Cash
- Total Debt
- Current Ratio
- Free Cash Flow
- Operating CF
- CashFlowChart (unchanged)

*Note: Debt/Equity moved to banner. ROE and Gross Margin moved to banner. Revenue Growth moved to banner. P/E and EV/EBITDA moved to banner.*

Section styling: identical to current Financials tab (StatBox component, section titles with uppercase letter-spacing).

### 3. Peer Comparison Table (from ComparablesTab)
- Category picker buttons: Valuation | Growth | Profitability | Health
- Active category gets highlighted button (`rgba(255,255,255,0.08)` bg)
- Table with columns: Metric | This Stock | Peer Avg | Trend
- Same sparkline rendering as current ComparablesTab
- AI insight text box below each category table
- **All metrics shown here** (including the 6 banner metrics) — the table serves as a comprehensive reference, while the banner is a curated highlight

### 4. Peers Grid (from ComparablesTab)
- Same grid of peer cards: ticker, name, market cap
- Same styling as current

## Component Interface

```jsx
// FundamentalsTab.jsx
export default function FundamentalsTab({
  ticker,
  financialData,      // from useStockDetail — { summary, financials, balanceSheet }
  comparablesData,    // from useComparables — { categories, peers, base, sector }
  loading,
  error,
})
```

## StockAnalysisPage Changes
- `TABS` array: `["DCF", "Fundamentals", "Insider Activity"]`
- Fetch both `useStockDetail` AND `useComparables` at the page level
- Render `<FundamentalsTab ... />` when `activeTab === "Fundamentals"`
- Remove old `"Financials"` and `"Comparables"` tab branches

## Files
- **Create**: `frontend/src/components/FundamentalsTab.jsx`
- **Modify**: `frontend/src/components/StockAnalysisPage.jsx`
- **Delete** (optional, after verification): `frontend/src/components/ComparablesTab.jsx` — but keep for now as backup

## Data Mapping Reference

### Banner metrics → data sources
| Metric | Current Value Source | Peer Avg Source | Sparkline Key |
|--------|---------------------|-----------------|---------------|
| P/E (TTM) | `summary.trailingPE` | `comparablesData.categories.valuation.metrics[].key === "trailingPE"` | `"trailingPE"` |
| Revenue Growth | `financials.revenueGrowth` | `comparablesData.categories.growth.metrics[].key === "revenueGrowth"` | `"revenueGrowth"` |
| Gross Margin | `financials.grossMargins` | `comparablesData.categories.profitability.metrics[].key === "grossMargin"` | `"grossMargin"` |
| ROE | `financials.returnOnEquity` | `comparablesData.categories.profitability.metrics[].key === "roe"` | `"roe"` |
| EV/EBITDA | `summary.enterpriseToEbitda` | `comparablesData.categories.valuation.metrics[].key === "evEbitda"` | `"evEbitda"` |
| Debt/Equity | `balanceSheet.debtToEquity` | `comparablesData.categories.health.metrics[].key === "debtEquity"` | `"debtEquity"` |

*Note: The exact keys in comparables data may vary. Use defensive lookups (`find()` with fallback to `—`).*

## Styling Reference
- Cards: `background: rgba(255,255,255,0.025)`, `border: 1px solid rgba(255,255,255,0.06)`, `borderRadius: 10px`
- Banner cards: same but with `padding: 14px 16px`, `display: flex`, `justifyContent: space-between`, `alignItems: center`
- Section titles: `color: var(--text-secondary)`, `fontFamily: var(--font-display)`, `fontSize: 11px`, `fontWeight: 600`, `letterSpacing: 0.12em`, `textTransform: uppercase`, `borderBottom: 1px solid rgba(255,255,255,0.05)`, `paddingBottom: 8px`
- StatBox: same as current Financials tab
- Peer table: same as current ComparablesTab
- Green accent: `var(--accent-green)` for favorable
- Red accent: `var(--accent-red)` for unfavorable
