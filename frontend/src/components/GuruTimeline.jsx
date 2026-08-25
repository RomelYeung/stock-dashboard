import React, { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export default function GuruTimeline({ history, userRole }) {
  const [selectedTicker, setSelectedTicker] = useState("");

  if (userRole === "GUEST") {
    return (
      <div style={styles.upgradeWall}>
        <div style={styles.lockIcon}>🔒</div>
        <h3>Premium Feature: Position Timeline</h3>
        <p>Analyze how this investor adjusted their positions over the last 8 quarters.</p>
        <a href="/login" style={styles.upgradeBtn}>
          Sign in to Unlock History
        </a>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return <div style={styles.placeholder}>No history data available.</div>;
  }

  // Reverse history to display chronologically (past -> present)
  const chronologicalHistory = [...history].reverse();

  // Extract all tickers held at any point in history
  const allTickersSet = new Set();
  chronologicalHistory.forEach((filing) => {
    (filing.holdings || []).forEach((h) => {
      if (h.ticker) allTickersSet.add(h.ticker.toUpperCase());
    });
  });
  const allTickers = Array.from(allTickersSet).sort();

  // Set default selected ticker if not set
  const latestFiling = history[0];
  const defaultTicker =
    latestFiling && latestFiling.holdings && latestFiling.holdings.length > 0
      ? latestFiling.holdings[0].ticker.toUpperCase()
      : allTickers[0] || "";

  const activeTicker = selectedTicker || defaultTicker;

  // Map filings to chart data points
  const chartData = chronologicalHistory.map((filing) => {
    const date = new Date(filing.periodOfReport);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const quarter = `${year}-Q${Math.floor(month / 3) + 1}`;
    const holding = (filing.holdings || []).find(
      (h) => h.ticker.toUpperCase() === activeTicker.toUpperCase()
    );

    return {
      quarter,
      shareCount: holding ? holding.shares : 0,
      value: holding ? holding.value : 0,
      weight: holding ? (holding.portfolioWeight !== undefined ? holding.portfolioWeight * 100 : (holding.weight || 0) * 100) : 0,
    };
  });

  const formatLargeNumber = (num) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>POSITION TIMELINE</div>
          <div style={styles.subtitle}>
            Historical position size and weight over the last 8 filings.
          </div>
        </div>
        {allTickers.length > 0 && (
          <select
            value={activeTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            style={styles.select}
          >
            {allTickers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {activeTicker ? (
        <div style={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorShares" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="quarter"
                stroke="var(--text-secondary)"
                tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
              />
              <YAxis
                yAxisId="left"
                stroke="var(--accent-blue)"
                tickFormatter={formatLargeNumber}
                tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--accent-green)"
                tickFormatter={(v) => `${v.toFixed(1)}%`}
                tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(20, 20, 20, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "0",
                }}
                labelStyle={{ color: "var(--text-primary)", fontWeight: "bold" }}
                formatter={(value, name) => {
                  if (name === "Shares") return [formatLargeNumber(value), "Shares"];
                  if (name === "Weight") return [`${value.toFixed(2)}%`, "Portfolio Weight"];
                  if (name === "Value") return [`$${formatLargeNumber(value)}`, "Value"];
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="shareCount"
                name="Shares"
                stroke="var(--accent-blue)"
                fillOpacity={1}
                fill="url(#colorShares)"
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="weight"
                name="Weight"
                stroke="var(--accent-green)"
                fillOpacity={1}
                fill="url(#colorWeight)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={styles.placeholder}>No positions found to track.</div>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "0",
    padding: "20px",
    marginTop: "20px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  title: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  subtitle: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    marginTop: "4px",
  },
  select: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "0",
    color: "var(--text-primary)",
    padding: "6px 12px",
    fontSize: "12px",
    outline: "none",
    cursor: "pointer",
  },
  chartWrapper: {
    width: "100%",
  },
  placeholder: {
    padding: "40px",
    color: "var(--text-muted)",
    textAlign: "center",
    fontSize: "12px",
  },
  upgradeWall: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px dashed rgba(255, 255, 255, 0.15)",
    borderRadius: "0",
    padding: "40px 20px",
    textAlign: "center",
    marginTop: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  lockIcon: {
    fontSize: "28px",
    marginBottom: "12px",
  },
  upgradeBtn: {
    display: "inline-block",
    marginTop: "16px",
    padding: "8px 16px",
    background: "var(--accent-blue)",
    color: "white",
    borderRadius: "0",
    textDecoration: "none",
    fontSize: "12px",
    fontWeight: 600,
    transition: "background 0.2s",
  },
};
