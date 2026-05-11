import { useState, useEffect } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { RevenueChart, MarginsChart, CashFlowChart } from "./Charts";
import { formatMarketCap, formatPercent, formatMultiple, formatRevenue } from "../utils/formatters";

// ─── Category constants (matching ComparablesTab) ──────────────────────────
const CATEGORY_ORDER = ["valuation", "growth", "profitability", "health"];
const CATEGORY_LABELS = {
  valuation: "Valuation",
  growth: "Growth",
  profitability: "Profitability",
  health: "Health",
};

// ─── Responsive hook ───────────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    let timeout;
    const handleResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setWidth(window.innerWidth), 150);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeout);
    };
  }, []);
  return width;
}


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
    ? (peerDiff.favorable === true ? "▲" : peerDiff.favorable === false ? "▼" : "•")
    : null;

  return (
    <div style={sbox.box}>
      <span style={sbox.label}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "nowrap" }}>
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

function Sparkline({ data, color, label }) {
  if (!data || data.length < 2) return <span style={{ color: "var(--text-secondary)", fontSize: "10px" }}>—</span>;
  const chartData = data.map((d, i) => ({ v: d.value, i }));
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const direction = last >= first ? "rising" : "falling";
  const pctChange = first !== 0 ? (((last - first) / Math.abs(first)) * 100).toFixed(0) : 0;
  return (
    <div
      style={{ width: "64px", height: "24px" }}
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

function MetricRow({ metric, isMobile, isTablet }) {
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

  const wLabel = isMobile ? "40%" : isTablet ? "30%" : COL_WIDTHS.metric;
  const wValue = isMobile ? "30%" : isTablet ? "22%" : COL_WIDTHS.thisStock;
  const wPeer = isTablet ? "20%" : COL_WIDTHS.peerAvg;
  const wDiff = isMobile ? "30%" : isTablet ? "16%" : COL_WIDTHS.diff;
  const wSpark = isTablet ? "12%" : COL_WIDTHS.trend;

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
      <td style={{ ...tbl.cellLabel, width: wLabel }}>{label}</td>
      <td style={{ ...tbl.cellValue, color, width: wValue }}>{fmtVal(baseValue)}</td>
      {!isMobile && <td style={{ ...tbl.cellPeer, width: wPeer }}>{fmtVal(peerAvg)}</td>}
      <td style={{ ...tbl.cellDiff, width: wDiff }}>{fmtDiff()}</td>
      {!isMobile && <td style={{ ...tbl.cellSpark, width: wSpark }}>
        <Sparkline data={sparklineData} color={color} />
      </td>}
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
      const favorable = Math.abs(diffPct) <= 5 ? null : (found.fmt === "x" ? diffPct < 0 : diffPct > 0);
      return { value: diffPct, favorable };
    }
  }
  return null;
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

function CategoryTable({ category, baseSparklines, ticker, isMobile, isTablet }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
      <thead>
        <tr>
          <th style={{ ...tbl.head, width: isMobile ? "40%" : isTablet ? "30%" : COL_WIDTHS.metric }}>Metric</th>
          <th style={{ ...tbl.head, textAlign: "right", width: isMobile ? "30%" : isTablet ? "22%" : COL_WIDTHS.thisStock }}>This Stock</th>
          {!isMobile && <th style={{ ...tbl.head, textAlign: "right", width: isTablet ? "20%" : COL_WIDTHS.peerAvg }}>Peer Avg</th>}
          <th style={{ ...tbl.head, textAlign: "right", width: isMobile ? "30%" : isTablet ? "16%" : COL_WIDTHS.diff }}>Diff</th>
          {!isMobile && <th style={{ ...tbl.head, width: isTablet ? "12%" : COL_WIDTHS.trend }}>Trend</th>}
        </tr>
      </thead>
      <tbody>
        {category.metrics.map((m) => {
          const { diff, diffColor } = computeDiffColor(m);
          return (
            <MetricRow
              key={m.key}
              metric={{ ...m, sparklineData: baseSparklines?.[m.key], diff, diffColor }}
              isMobile={isMobile}
              isTablet={isTablet}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function PeerComparisonSection({ comparablesData, ticker, isMobile, isTablet }) {
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
        borderRadius: "14px",
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
              outline: "none",
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

      {/* Empty category */}
      {category && (!category.metrics || category.metrics.length === 0) && (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: "12px" }}>
          No data available for this category
        </div>
      )}

      {/* Category Table */}
      {category && category.metrics?.length > 0 && (
        <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
          <div style={{ padding: "0 20px" }}>
            <CategoryTable
              category={category}
              baseSparklines={comparablesData.base?.sparklines}
              ticker={ticker}
              isMobile={isMobile}
              isTablet={isTablet}
            />
            {/* Insight box */}
            {(() => {
              const insight = generateInsight(category.metrics, ticker);
              if (!insight) return null;
              return (
                <div
                  style={{
                    padding: "12px 20px 16px 20px",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    background: "rgba(255,255,255,0.025)",
                    borderLeft: "2px solid var(--accent-blue)",
                  }}
                >
                  <p
                    style={{
                      color: "rgba(255,255,255,0.65)",
                      fontSize: "12px",
                      fontFamily: "var(--font-body)",
                      fontWeight: 300,
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
  // ── Loading state ───────────────────────────────────────────────────────
  if (financialLoading && !financialData && comparablesLoading && !comparablesData) {
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
              borderRadius: "8px",
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

  const width = useWindowWidth();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;

  const summary = financialData.summary || {};
  const financials = financialData.financials || {};
  const balanceSheet = financialData.balanceSheet || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* ─── 1. PEER COMPARISON ───────────────────────────────────────────── */}
      {comparablesLoading && !comparablesData ? (
        <Section title="Peer Comparison">
          <div style={{ ...states.skeleton, padding: "24px" }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: "16px", background: "rgba(255,255,255,0.04)", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </Section>
      ) : comparablesData ? (
        <>
          <Section title="Peer Comparison">
            <PeerComparisonSection comparablesData={comparablesData} ticker={ticker} isMobile={isMobile} isTablet={isTablet} />
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
                    <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Peer</span>
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
                      title={peer.name}
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
                      {formatMarketCap(peer.marketCap)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      ) : (
        <Section title="Peer Comparison">
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)" }}>
            Peer comparison data is not available for {ticker}
          </div>
        </Section>
      )}

      {/* ─── 2. FINANCIAL SECTIONS ────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 1fr",
          gap: isMobile ? "20px" : isTablet ? "24px" : "28px",
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
