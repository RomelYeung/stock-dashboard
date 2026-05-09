import { useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { RevenueChart, MarginsChart, CashFlowChart } from "./Charts";
import { formatPrice, formatMarketCap, formatPercent, formatMultiple, formatRevenue, isPositive } from "../utils/formatters";

// ─── Category constants (matching ComparablesTab) ──────────────────────────
const CATEGORY_ORDER = ["valuation", "growth", "profitability", "health"];
const CATEGORY_LABELS = {
  valuation: "Valuation",
  growth: "Growth",
  profitability: "Profitability",
  health: "Health",
};











// ─── StatBox (matching existing StockAnalysisPage pattern) ───────────────────
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

const sbox = {
  box: {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  label: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "10px",
    fontWeight: 400,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  value: { fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 500 },
  sub: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "10px" },
};

// ─── Section (matching existing StockAnalysisPage pattern) ──────────────────
function Section({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3 style={sec.title}>{title}</h3>
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
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "8px",
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// Peer Comparison Table (adapted from ComparablesTab)
// ══════════════════════════════════════════════════════════════════════════════

const COL_WIDTHS = {
  metric: "28%",
  thisStock: "20%",
  peerAvg: "20%",
  diff: "18%",
  trend: "14%",
};

const tbl = {
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
  row: { borderBottom: "1px solid rgba(255,255,255,0.03)" },
  cellLabel: { padding: "10px 12px", color: "var(--text-secondary)", fontSize: "12px", width: COL_WIDTHS.metric },
  cellValue: { padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, textAlign: "right", width: COL_WIDTHS.thisStock },
  cellPeer: { padding: "10px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px", textAlign: "right", width: COL_WIDTHS.peerAvg },
  cellDiff: { padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, textAlign: "right", width: COL_WIDTHS.diff },
  cellSpark: { padding: "8px 12px", width: COL_WIDTHS.trend, textAlign: "center" },
};

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return <span style={{ color: "var(--text-secondary)", fontSize: "10px" }}>—</span>;
  const chartData = data.map((d, i) => ({ v: d.value, i }));
  return (
    <div style={{ width: "64px", height: "24px" }}>
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
  const [hovered, setHovered] = useState(false);
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
      style={{
        ...tbl.row,
        background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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

function computeDiffColor(metric) {
  const { baseValue, peerAvg, fmt } = metric;
  if (baseValue == null || peerAvg == null || peerAvg === 0) return { diff: null, diffColor: null };
  const diff = ((baseValue - peerAvg) / peerAvg) * 100;

  let isFavorable;
  if (fmt === "x") {
    isFavorable = diff < 0;
  } else {
    isFavorable = diff > 0;
  }

  const diffColor = isFavorable ? "var(--accent-green)" : "var(--accent-red)";
  return { diff, diffColor };
}

function CategoryTable({ category, baseSparklines, ticker }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
      <thead>
        <tr>
          <th style={{ ...tbl.head, width: COL_WIDTHS.metric }}>Metric</th>
          <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.thisStock }}>This Stock</th>
          <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.peerAvg }}>Peer Avg</th>
          <th style={{ ...tbl.head, textAlign: "right", width: COL_WIDTHS.diff }}>Diff</th>
          <th style={{ ...tbl.head, width: COL_WIDTHS.trend }}>Trend</th>
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
  const [activeCategory, setActiveCategory] = useState("valuation");
  const category = comparablesData?.categories?.[activeCategory];

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
      {category && (
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
  loading,
  error,
}) {
  // ── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={states.skeleton}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              height: "20px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "6px",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (error) {
    return <div style={states.error}>{error}</div>;
  }

  // ── Empty / no-data state ───────────────────────────────────────────────
  if (!financialData) {
    return <div style={states.error}>No data available</div>;
  }

  const summary = financialData.summary || {};
  const financials = financialData.financials || {};
  const balanceSheet = financialData.balanceSheet || {};

  const statsGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* ─── 1. FINANCIAL SECTIONS ────────────────────────────────────────── */}

      {/* Valuation */}
      <Section title="Valuation">
        <div style={statsGridStyle}>
          <StatBox label="Market Cap" value={formatMarketCap(summary.marketCap)} />
          <StatBox label="Forward P/E" value={formatMultiple(summary.forwardPE)} />
          <StatBox label="P/B" value={formatMultiple(summary.priceToBook)} />
          <StatBox label="PEG Ratio" value={formatMultiple(summary.pegRatio)} />
        </div>
      </Section>

      {/* Profitability */}
      <Section title="Profitability">
        <div style={statsGridStyle}>
          <StatBox
            label="Operating Margin"
            value={formatPercent(financials.operatingMargins)}
            positive={financials.operatingMargins > 0.1}
          />
          <StatBox
            label="Net Margin"
            value={formatPercent(financials.profitMargins)}
            positive={financials.profitMargins > 0}
          />
          <StatBox
            label="ROA"
            value={formatPercent(financials.returnOnAssets)}
            positive={financials.returnOnAssets > 0.05}
          />
        </div>
        <MarginsChart annualIncome={financials.annualIncome} />
      </Section>

      {/* Revenue & Earnings */}
      <Section title="Revenue & Earnings">
        <div style={statsGridStyle}>
          <StatBox label="Total Revenue" value={formatRevenue(financials.totalRevenue)} />
          <StatBox
            label="Earnings Growth"
            value={formatPercent(financials.earningsGrowth)}
            positive={financials.earningsGrowth > 0}
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
        <div style={statsGridStyle}>
          <StatBox label="Total Cash" value={formatRevenue(balanceSheet.totalCash)} />
          <StatBox label="Total Debt" value={formatRevenue(balanceSheet.totalDebt)} />
          <StatBox
            label="Current Ratio"
            value={formatMultiple(balanceSheet.currentRatio)}
            positive={balanceSheet.currentRatio > 1.5}
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

      {/* ─── 3. PEER COMPARISON TABLE ─────────────────────────────────────── */}
      {comparablesData && (
        <Section title="Peer Comparison">
          <PeerComparisonSection comparablesData={comparablesData} ticker={ticker} />
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
