import { useState } from "react";
import { useComparables } from "../hooks/useStockData";
import { LineChart, Line, ResponsiveContainer } from "recharts";

const CATEGORY_ORDER = ["valuation", "growth", "profitability", "health"];

const CATEGORY_LABELS = {
  valuation: "Valuation",
  growth: "Growth",
  profitability: "Profitability",
  health: "Health",
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
  const { label, fmt, baseValue, peerAvg, sparklineData } = metric;
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

  return (
    <tr style={table.row}>
      <td style={table.cellLabel}>{label}</td>
      <td style={{ ...table.cellValue, color }}>{fmtVal(baseValue)}</td>
      <td style={table.cellPeer}>{fmtVal(peerAvg)}</td>
      <td style={table.cellSpark}>
        <Sparkline data={sparklineData} color={color} />
      </td>
    </tr>
  );
}

const table = {
  head: { textAlign: "left", padding: "10px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-display)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  row: { borderBottom: "1px solid rgba(255,255,255,0.03)" },
  cellLabel: { padding: "10px 8px", color: "var(--text-secondary)", fontSize: "12px" },
  cellValue: { padding: "10px 8px", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 },
  cellPeer: { padding: "10px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px" },
  cellSpark: { padding: "10px 8px" },
};

function CategoryTable({ category, baseSparklines }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr>
              <th style={table.head}>Metric</th>
              <th style={{ ...table.head, textAlign: "right" }}>This Stock</th>
              <th style={{ ...table.head, textAlign: "right" }}>Peer Avg</th>
              <th style={table.head}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {category.metrics.map((m) => (
              <MetricRow
                key={m.key}
                metric={{ ...m, sparklineData: baseSparklines?.[m.key] }}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {category.metrics.map((m) =>
          m.verdict ? (
            <p key={m.key} style={{ color: "var(--text-secondary)", fontSize: "12px", fontStyle: "italic", margin: 0 }}>
              {m.verdict}
            </p>
          ) : null
        )}
      </div>
    </div>
  );
}

export default function ComparablesTab({ ticker }) {
  const { data, loading, error } = useComparables(ticker);
  const [activeCategory, setActiveCategory] = useState("valuation");

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "40px 0" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: "20px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    );
  }

  if (error) {
    return <div style={{ color: "var(--accent-red)", padding: "40px 0", textAlign: "center", fontSize: "13px" }}>{error}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "12px" }}>
        {CATEGORY_ORDER.map((key) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            style={{
              background: activeCategory === key ? "rgba(255,255,255,0.08)" : "transparent",
              border: "none",
              color: activeCategory === key ? "var(--text-primary)" : "var(--text-secondary)",
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              fontWeight: activeCategory === key ? 600 : 400,
            }}
          >
            {CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      {data?.categories?.[activeCategory] && (
        <CategoryTable
          category={data.categories[activeCategory]}
          baseSparklines={data.base?.sparklines}
        />
      )}

      <div>
        <h3 style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", marginBottom: "12px" }}>
          Peers —
          <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", fontWeight: 400, textTransform: "none", marginLeft: "6px" }}>{data.sector}</span>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
          {data?.peers?.map((peer) => (
            <div key={peer.ticker} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{peer.ticker}</span>
              <span style={{ fontSize: "10px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{peer.name}</span>
              <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", marginTop: "4px" }}>
                {peer.marketCap >= 1e12 ? "$" + (peer.marketCap / 1e12).toFixed(1) + "T" : "$" + (peer.marketCap / 1e9).toFixed(1) + "B"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
