import { useInsiderTrading } from "../hooks/useStockData";

const ROLE_COLORS = {
  CEO: "var(--accent-blue)",
  CFO: "var(--accent-blue)",
  COO: "var(--accent-blue)",
  Chairman: "var(--accent-blue)",
  Director: "#a78bfa",
  Officer: "#94a3b8",
  "10% Owner": "#f59e0b",
  Other: "var(--text-secondary)",
};

function SignalGauge({ score, label }) {
  const clamped = Math.max(-100, Math.min(100, score));
  const percent = ((clamped + 100) / 200) * 100;
  let color = "var(--accent-green)";
  if (score < -10) color = "var(--accent-red)";
  else if (score < 10) color = "#f59e0b";

  return (
    <div style={gauge.wrap}>
      <div style={gauge.barBg}>
        <div style={{ ...gauge.barFill, width: `${percent}%`, background: color }} />
      </div>
      <div style={gauge.labels}>
        <span style={gauge.label}>Bearish</span>
        <span style={{ ...gauge.score, color }}>{score > 0 ? `+${score}` : score}</span>
        <span style={gauge.label}>Bullish</span>
      </div>
      <span style={{ ...gauge.signalLabel, color }}>{label}</span>
    </div>
  );
}

const gauge = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "20px 0" },
  barBg: { width: "100%", maxWidth: "400px", height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: "4px", transition: "width 0.6s ease" },
  labels: { display: "flex", justifyContent: "space-between", width: "100%", maxWidth: "400px" },
  label: { color: "var(--text-secondary)", fontSize: "10px", fontFamily: "var(--font-body)" },
  score: { fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600 },
  signalLabel: { fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600, letterSpacing: "0.04em" },
};

function TransactionTable({ insiders }) {
  const rows = [];
  for (const insider of insiders.slice(0, 20)) {
    for (const tx of insider.transactions) {
      rows.push({
        name: insider.name,
        role: insider.role,
        title: insider.title,
        type: tx.type,
        shares: tx.shares,
        price: tx.pricePerShare,
        value: tx.value,
        date: insider.filingDate,
      });
    }
  }
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={table.table}>
        <thead>
          <tr>
            <th style={table.th}>Date</th>
            <th style={table.th}>Insider</th>
            <th style={table.th}>Role</th>
            <th style={table.th}>Type</th>
            <th style={table.th}>Shares</th>
            <th style={table.th}>Price</th>
            <th style={table.th}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={table.tr}>
              <td style={table.td}>{row.date}</td>
              <td style={table.td}>{row.name}</td>
              <td style={table.td}>
                <span style={{ ...table.roleBadge, background: ROLE_COLORS[row.role] || ROLE_COLORS.Other }}>
                  {row.role}
                </span>
              </td>
              <td style={{ ...table.td, color: row.type === "Buy" ? "var(--accent-green)" : "var(--accent-red)" }}>
                {row.type === "Buy" ? "▲ Buy" : "▼ Sell"}
              </td>
              <td style={{ ...table.td, fontFamily: "var(--font-mono)" }}>{row.shares.toLocaleString()}</td>
              <td style={{ ...table.td, fontFamily: "var(--font-mono)" }}>${row.price.toFixed(2)}</td>
              <td style={{ ...table.td, fontFamily: "var(--font-mono)" }}>
                {row.value >= 1_000_000 ? `$${(row.value / 1_000_000).toFixed(1)}M` : `$${(row.value / 1_000).toFixed(0)}K`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div style={table.empty}>No recent transactions found.</div>
      )}
    </div>
  );
}

const table = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12px" },
  th: { textAlign: "left", padding: "10px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-display)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  tr: { borderBottom: "1px solid rgba(255,255,255,0.03)" },
  td: { padding: "10px 8px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px" },
  roleBadge: { display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, color: "white", textTransform: "uppercase", letterSpacing: "0.04em" },
  empty: { color: "var(--text-secondary)", padding: "40px 0", textAlign: "center", fontSize: "13px" },
};

function SummaryCard({ summary }) {
  return (
    <div style={summaryCard.wrap}>
      <span style={summaryCard.icon}>📊</span>
      <span style={summaryCard.text}>{summary}</span>
    </div>
  );
}

const summaryCard = {
  wrap: { display: "flex", alignItems: "flex-start", gap: "10px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "14px 16px" },
  icon: { fontSize: "16px", lineHeight: 1 },
  text: { color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "13px", lineHeight: 1.5 },
};

export default function InsiderTradingTab({ ticker }) {
  const { data, loading, error } = useInsiderTrading(ticker);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "40px 0" }}>
        <div style={{ height: "20px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: "20px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.1s" }} />
        <div style={{ height: "20px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.2s" }} />
      </div>
    );
  }

  if (error) {
    return <div style={{ color: "var(--accent-red)", padding: "40px 0", textAlign: "center", fontSize: "13px" }}>{error}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <SignalGauge score={data.score} label={data.label} />
      <SummaryCard summary={data.summary} />
      <div>
        <h3 style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", marginBottom: "12px" }}>
          Recent Transactions
        </h3>
        <TransactionTable insiders={data.insiders} />
      </div>
    </div>
  );
}
