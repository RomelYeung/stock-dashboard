import { useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { RevenueChart, MarginsChart, CashFlowChart } from "./Charts";
import PeriodToggle from "./PeriodToggle";
import { formatMarketCap, formatPercent, formatMultiple, formatRevenue } from "../utils/formatters";

// ─── Category constants (matching ComparablesTab) ──────────────────────────
const CATEGORY_ORDER = ["valuation", "growth", "profitability", "health"];
const CATEGORY_LABELS = {
  valuation: "Valuation",
  growth: "Growth",
  profitability: "Profitability",
  health: "Health",
};


// ─── StatBox (matching existing StockAnalysisPage pattern) ───────────────────
function StatBox({ label, value, sub, positive, historicalData, higherIsBetter = true }) {
  let trendBadge = null;

  if (historicalData && historicalData.length >= 2) {
    const pastIdx = Math.max(0, historicalData.length - 5);
    const pastVal = historicalData[pastIdx].value;
    const currentVal = historicalData[historicalData.length - 1].value;
    
    const diff = currentVal - pastVal;
    const pctChange = pastVal !== 0 ? ((diff / Math.abs(pastVal)) * 100).toFixed(1) : 0;
    const isPositiveChange = diff > 0;
    const isNegativeChange = diff < 0;
    
    let favorable = null;
    if (higherIsBetter) {
      favorable = isPositiveChange ? true : isNegativeChange ? false : null;
    } else {
      favorable = isNegativeChange ? true : isPositiveChange ? false : null;
    }

    const badgeColor = favorable === true ? "var(--accent-green)" : favorable === false ? "var(--accent-red)" : "var(--text-secondary)";
    const badgeBg = favorable === true ? "rgba(0, 229, 160, 0.1)" : favorable === false ? "rgba(255, 0, 60, 0.1)" : "rgba(255, 255, 255, 0.05)";
    const arrow = isPositiveChange ? "▲" : isNegativeChange ? "▼" : "•";

    trendBadge = (
      <span
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          padding: "2px 6px",
          borderRadius: "0",
          whiteSpace: "nowrap",
          color: badgeColor,
          background: badgeBg,
        }}
      >
        {arrow} {Math.abs(pctChange)}%
      </span>
    );
  }

  return (
    <div className="stat-box-modern">
      <span style={sbox.label}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap", width: "100%" }}>
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
        {trendBadge}
      </div>
      {sub && <span style={sbox.sub}>{sub}</span>}
    </div>
  );
}

const sbox = {
  label: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: 400,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  value: { fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 500 },
  sub: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px" },
};

// ─── Section (matching existing StockAnalysisPage pattern) ──────────────────
function Section({ title, children, rightAction = null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "30px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px" }}>
        <h3 style={{ ...sec.title, borderBottom: "none", paddingBottom: 0, margin: 0 }}>{title}</h3>
        {rightAction}
      </div>
      {children}
    </div>
  );
}

const sec = {
  title: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-display)",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// Peer Comparison Table (adapted from ComparablesTab)
// ══════════════════════════════════════════════════════════════════════════════

const COL_WIDTHS = {
  metric: "28%",
  thisStock: "20%",
  peerAvg: "20%",
  diff: "16%",
  trend: "16%",
};

const tbl = {
  head: {
    textAlign: "left",
    padding: "8px 12px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-display)",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.015)",
  },
  row: { borderBottom: "1px solid rgba(255,255,255,0.03)" },
  cellLabel: { padding: "10px 12px", color: "var(--text-secondary)", fontSize: "12px", width: COL_WIDTHS.metric },
  cellValue: { padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, textAlign: "right", width: COL_WIDTHS.thisStock },
  cellPeer: { padding: "10px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px", textAlign: "right", width: COL_WIDTHS.peerAvg },
  cellDiff: { padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, textAlign: "right", width: COL_WIDTHS.diff },
  cellSpark: { padding: "8px 12px", width: COL_WIDTHS.trend, textAlign: "center" },
};

function Sparkline({ data, color, label }) {
  if (!data || data.length < 2) return <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>—</span>;
  const chartData = data.map((d, i) => ({ v: d.value, i }));
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const direction = last >= first ? "rising" : "falling";
  const pctChange = first !== 0 ? (((last - first) / Math.abs(first)) * 100).toFixed(0) : 0;
  return (
    <div
      style={{ width: "80px", height: "32px", margin: "0 auto" }}
      role="img"
      aria-label={`${label || "Metric"} trend: ${direction} ${Math.abs(pctChange)}% over period`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricRow({ metric }) {
  const { label, fmt, baseValue, peerAvg, sparklineData, diff, diffColor } = metric;
  const isHigher = baseValue != null && peerAvg != null && baseValue > peerAvg;
  const isLower = baseValue != null && peerAvg != null && baseValue < peerAvg;

  let color = "var(--text-primary)";
  if (fmt === "x" && isHigher) color = "var(--accent-red)";
  if (fmt === "x" && isLower) color = "var(--accent-green)";
  if (fmt === "pct" && isHigher) color = "var(--accent-green)";
  if (fmt === "pct" && isLower) color = "var(--accent-red)";

  const fmtVal = (v) => {
    if (v == null) return "—";
    if (fmt === "x") return v.toFixed(2) + "x";
    if (fmt === "pct") return (v * 100).toFixed(1) + "%";
    if (fmt === "abbr") {
      if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
      if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
      return "$" + v.toFixed(0);
    }
    return String(v);
  };

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
    <tr
      className="peer-row-modern"
      style={{
        ...tbl.row,
        background: "transparent",
      }}
    >
      <td style={{ ...tbl.cellLabel, width: COL_WIDTHS.metric }}>{label}</td>
      <td style={{ ...tbl.cellValue, color, width: COL_WIDTHS.thisStock }}>{fmtVal(baseValue)}</td>
      <td className="peer-col-tablet-only" style={{ ...tbl.cellPeer, width: COL_WIDTHS.peerAvg }}>{fmtVal(peerAvg)}</td>
      <td style={{ ...tbl.cellDiff, width: COL_WIDTHS.diff }}>{fmtDiff()}</td>
      <td className="peer-col-desktop-only" style={{ ...tbl.cellSpark, width: COL_WIDTHS.trend }}>
        <Sparkline data={sparklineData} color={color} />
      </td>
    </tr>
  );
}

function generateInsight(metrics, ticker) {
  const significant = metrics.filter(
    (m) => m.verdict && !m.verdict.includes("near") && !m.verdict.includes("in line")
  );
  if (significant.length === 0) return null;

  const above = significant.filter((m) => m.verdict.includes("above"));
  const below = significant.filter((m) => m.verdict.includes("below"));

  const fmtPct = (m) => {
    const match = m.verdict.match(/([\d.]+)%/);
    return match ? ` (+${match[1]}%)` : "";
  };

  const formatList = (items) => {
    if (items.length === 1) return items[0];
    if (items.length === 2) return items.join(" and ");
    return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
  };

  let sentences = [];

  if (above.length > 0) {
    const labels = formatList(above.map((m) => m.label + fmtPct(m)));
    const isValuation = above[0].fmt === "x";
    sentences.push(`${ticker} ${isValuation ? "trades at a premium on" : "is strong on"} ${labels}.`);
  }

  if (below.length > 0) {
    const labels = formatList(below.map((m) => m.label + fmtPct(m)));
    const isValuation = below[0].fmt === "x";
    sentences.push(`${ticker} ${isValuation ? "is cheap on" : "lags peers on"} ${labels}.`);
  }

  return sentences.join(" ");
}

function computeDiffColor(metric) {
  const { baseValue, peerAvg, fmt } = metric;
  if (baseValue == null || peerAvg == null || peerAvg === 0) return { diff: null, diffColor: null };
  const diff = ((baseValue - peerAvg) / peerAvg) * 100;

  if (fmt === "x") {
    const isFavorable = diff < 0;
    return { diff, diffColor: isFavorable ? "var(--accent-green)" : "var(--accent-red)" };
  }
  if (fmt === "pct") {
    const isFavorable = diff > 0;
    return { diff, diffColor: isFavorable ? "var(--accent-green)" : "var(--accent-red)" };
  }
  // For abbr and other formats, return neutral colors
  return { diff, diffColor: "var(--text-secondary)" };
}

function CategoryTable({ category, baseSparklines, ticker }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th style={{ ...tbl.head, width: COL_WIDTHS.metric }}>Metric</th>
          <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.thisStock }}>This Stock</th>
          <th className="peer-col-tablet-only" style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.peerAvg }}>Peer Avg</th>
          <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.diff }}>Diff</th>
          <th className="peer-col-desktop-only" style={{ ...tbl.head, width: COL_WIDTHS.trend, textAlign: "center" }}>Trend</th>
        </tr>
      </thead>
      <tbody>
        {category.metrics.map((m) => {
          const { diff, diffColor } = computeDiffColor(m);
          return (
            <MetricRow
              key={m.key}
              metric={{ ...m, sparklineData: baseSparklines?.[m.key], diff, diffColor }}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function PeerComparisonSection({ comparablesData, ticker }) {
  const defaultCategory = (() => {
    for (const key of CATEGORY_ORDER) {
      const cat = comparablesData?.categories?.[key];
      if (cat?.metrics?.length > 0) return key;
    }
    return "valuation";
  })();
  const [activeCategory, setActiveCategory] = useState(defaultCategory);
  const category = comparablesData?.categories?.[activeCategory];

  return (
    <div
      style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        borderRadius: "0",
        overflow: "hidden",
      }}
    >
      {/* Category Picker */}
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "16px 20px 12px 20px",
          overflowX: "auto"
        }}
      >
        {CATEGORY_ORDER.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeCategory === key}
            tabIndex={activeCategory === key ? 0 : -1}
            onClick={() => setActiveCategory(key)}
            onKeyDown={(e) => {
              const idx = CATEGORY_ORDER.indexOf(activeCategory);
              if (e.key === "ArrowRight") {
                e.preventDefault();
                setActiveCategory(CATEGORY_ORDER[(idx + 1) % CATEGORY_ORDER.length]);
              }
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setActiveCategory(CATEGORY_ORDER[(idx - 1 + CATEGORY_ORDER.length) % CATEGORY_ORDER.length]);
              }
            }}
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
              whiteSpace: "nowrap"
            }}
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
          >
            {CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Empty category */}
      {category && (!category.metrics || category.metrics.length === 0) && (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: "12px" }}>
          No data available for this category
        </div>
      )}

      {/* Category Table */}
      {category && category.metrics?.length > 0 && (
        <div style={{ overflowX: "visible" }}>
          <div style={{ padding: "0 20px" }}>
            <CategoryTable
              category={category}
              baseSparklines={comparablesData.base?.sparklines}
              ticker={ticker}
            />
            {/* Insight box */}
            {(() => {
              const insight = generateInsight(category.metrics, ticker);
              if (!insight) return null;
              return (
                <div
                  style={{
                    padding: "16px 20px",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    background: "rgba(79, 141, 255, 0.04)",
                    borderLeft: "3px solid var(--accent-blue)",
                  }}
                >
                  <p
                    style={{
                      color: "rgba(255,255,255,0.70)",
                      fontSize: "13px",
                      fontFamily: "var(--font-body)",
                      fontWeight: 400,
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
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Export
// ══════════════════════════════════════════════════════════════════════════════

export default function FundamentalsTab({
  ticker,
  financialData,
  comparablesData,
  financialLoading,
  comparablesLoading,
  error,
  onRetry,
}) {
  const [periodMode, setPeriodMode] = useState("annual");

  // ── Loading state ───────────────────────────────────────────────────────
  if ((financialLoading && !financialData) || (comparablesLoading && !comparablesData)) {
    return (
      <div style={states.skeleton}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              height: "20px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "0",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (error && !financialData) {
    return (
      <div style={{ ...states.error, display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
        <p>{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: "12px",
              padding: "8px 16px",
            }}
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  // ── Empty / no-data state ───────────────────────────────────────────────
  if (!financialData) {
    return <div style={states.error}>No data available</div>;
  }

  const summary = financialData.summary || {};
  const financials = financialData.financials || {};
  const balanceSheet = financialData.balanceSheet || {};

  const incomeData = periodMode === "quarterly" && financials.quarterlyIncome?.length
    ? financials.quarterlyIncome
    : financials.annualIncome;

  const cashFlowData = periodMode === "quarterly" && balanceSheet.quarterlyCashFlow?.length
    ? balanceSheet.quarterlyCashFlow
    : balanceSheet.annualCashFlow;

  // Helper to extract historical data for StatBox
  const getHistory = (source, key) => {
    if (!source || !Array.isArray(source)) return null;
    const sorted = [...source].sort((a, b) => new Date(a.date) - new Date(b.date));
    const vals = sorted.map(item => ({ value: item[key] })).filter(d => d.value != null);
    return vals.length >= 2 ? vals : null;
  };

  const getComputedHistory = (source, computeFn) => {
    if (!source || !Array.isArray(source)) return null;
    const sorted = [...source].sort((a, b) => new Date(a.date) - new Date(b.date));
    const vals = sorted.map(item => ({ value: computeFn(item) })).filter(d => d.value != null && isFinite(d.value));
    return vals.length >= 2 ? vals : null;
  };

  return (
    <div className="fundamentals-container" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* ─── 1. KEY METRICS ────────────────────────────────────────────────── */}
      <Section title="Key Metrics">
        <div className="fundamentals-grid">
          {/* Valuation */}
          <Section title="Valuation">
            <div className="stat-group-grid-2">
              <StatBox label="Market Cap" value={formatMarketCap(summary.marketCap)} />
              <StatBox
                label="Forward P/E"
                value={formatMultiple(summary.forwardPE)}
                higherIsBetter={false}
              />
              <StatBox
                label="P/B"
                value={formatMultiple(summary.priceToBook)}
                higherIsBetter={false}
              />
              <StatBox
                label="PEG Ratio"
                value={formatMultiple(summary.pegRatio)}
                higherIsBetter={false}
              />
            </div>
          </Section>

          {/* Profitability */}
          <Section
            title="Profitability"
            rightAction={<PeriodToggle value={periodMode} onChange={setPeriodMode} size="sm" />}
          >
            <div className="stat-group-grid-3">
              <StatBox
                label="Operating Margin"
                value={formatPercent(financials.operatingMargins)}
                historicalData={getComputedHistory(incomeData, item => item.totalRevenue ? item.operatingIncome / item.totalRevenue : null)}
              />
              <StatBox
                label="Net Margin"
                value={formatPercent(financials.profitMargins)}
                historicalData={getComputedHistory(incomeData, item => item.totalRevenue ? item.netIncome / item.totalRevenue : null)}
              />
              <StatBox
                label="ROA"
                value={formatPercent(financials.returnOnAssets)}
              />
            </div>
            <MarginsChart incomeData={incomeData} annualIncome={financials.annualIncome} period={periodMode} />
          </Section>

          {/* Revenue & Earnings */}
          <Section
            title="Revenue & Earnings"
            rightAction={<PeriodToggle value={periodMode} onChange={setPeriodMode} size="sm" />}
          >
            <div className="stat-group-grid-2">
              <StatBox
                label="Total Revenue"
                value={formatRevenue(financials.totalRevenue)}
                historicalData={getHistory(incomeData, 'totalRevenue')}
              />
              <StatBox
                label="Earnings Growth"
                value={formatPercent(financials.earningsGrowth)}
                historicalData={comparablesData?.base?.sparklines?.earningsGrowth}
              />
              <StatBox
                label="EPS Est. (This Yr)"
                value={
                  financials.estimates?.currentYear != null
                    ? (typeof financials.estimates.currentYear === "object"
                        ? (financials.estimates.currentYear.avg != null ? `$${financials.estimates.currentYear.avg.toFixed(2)}` : "—")
                        : `$${financials.estimates.currentYear.toFixed(2)}`)
                    : "—"
                }
              />
              <StatBox
                label="EPS Est. (Next Yr)"
                value={
                  financials.estimates?.nextYear != null
                    ? (typeof financials.estimates.nextYear === "object"
                        ? (financials.estimates.nextYear.avg != null ? `$${financials.estimates.nextYear.avg.toFixed(2)}` : "—")
                        : `$${financials.estimates.nextYear.toFixed(2)}`)
                    : "—"
                }
              />
            </div>
            <RevenueChart incomeData={incomeData} annualIncome={financials.annualIncome} period={periodMode} />
          </Section>

          {/* Balance Sheet & Cash Flow */}
          <Section
            title="Balance Sheet & Cash Flow"
            rightAction={<PeriodToggle value={periodMode} onChange={setPeriodMode} size="sm" />}
          >
            <div className="stat-group-grid-3">
              <StatBox
                label="Total Cash"
                value={formatRevenue(balanceSheet.totalCash)}
                historicalData={getHistory(balanceSheet.annualBalanceSheet, 'cash')}
              />
              <StatBox
                label="Total Debt"
                value={formatRevenue(balanceSheet.totalDebt)}
                historicalData={getHistory(balanceSheet.annualBalanceSheet, 'totalDebt')}
                higherIsBetter={false}
              />
              <StatBox
                label="Current Ratio"
                value={formatMultiple(balanceSheet.currentRatio)}
                historicalData={getHistory(balanceSheet.annualBalanceSheet, 'currentRatio')}
              />
              <StatBox
                label="Free Cash Flow"
                value={formatRevenue(balanceSheet.freeCashflow)}
                historicalData={getHistory(cashFlowData, 'freeCashFlow')}
              />
              <StatBox
                label="Operating CF"
                value={formatRevenue(balanceSheet.operatingCashflow)}
                historicalData={getHistory(cashFlowData, 'operatingCashFlow')}
              />
            </div>
            <CashFlowChart cashFlowData={cashFlowData} annualCashFlow={balanceSheet.annualCashFlow} period={periodMode} />
          </Section>
        </div>
      </Section>

      {/* ─── 2. PEER COMPARISON ───────────────────────────────────────────── */}
      {comparablesLoading && !comparablesData ? (
        <Section title="Peer Comparison">
          <div style={{ ...states.skeleton, padding: "24px" }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: "16px", background: "rgba(255,255,255,0.04)", borderRadius: "0", animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </Section>
      ) : comparablesData ? (
        <Section title="Peer Comparison">
          <PeerComparisonSection comparablesData={comparablesData} ticker={ticker} />
        </Section>
      ) : (
        <Section title="Peer Comparison">
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)" }}>
            Peer comparison data is not available for {ticker}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Shared state styles ─────────────────────────────────────────────────
const states = {
  skeleton: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "40px 0",
  },
  error: {
    color: "var(--accent-red)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    padding: "40px 0",
    textAlign: "center",
  },
};
