import { useState } from "react";
import { BarChart, Bar } from "recharts";
import { formatMarketCap } from "../utils/formatters.js";
import { getVolumeSignal } from "../utils/volumeSignals.js";

function VolumeSignalCell({ obvChange, cmf }) {
  const signal = getVolumeSignal(obvChange, cmf);
  return (
    <div style={styles.colSignal}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "11px",
          fontWeight: 500,
          fontFamily: "var(--font-body)",
          color: signal.color,
          background: signal.bg,
          padding: "3px 10px",
          borderRadius: "6px",
          border: `1px solid ${signal.border}`,
        }}
      >
        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: signal.color }} />
        {signal.label}
      </span>
    </div>
  );
}

export default function SectorLeaderboard({ sectors }) {
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score");

  const filtered = sectors.filter(s => {
    if (filter === "gics") return s.type === "gics";
    if (filter === "thematic") return s.type === "thematic";
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "score") return b.score - a.score;
    if (sortBy === "aum") return (b.aum || 0) - (a.aum || 0);
    if (sortBy === "1m") return (b.indicators.returns1M || 0) - (a.indicators.returns1M || 0);
    if (sortBy === "trend") return (b.scoreTrend || 0) - (a.scoreTrend || 0);
    return 0;
  });

  return (
    <div style={styles.container}>
      <div style={styles.controls}>
        <div style={styles.toggleGroup}>
          {["all", "gics", "thematic"].map(opt => (
            <button
              key={opt}
              style={filter === opt ? styles.toggleActive : styles.toggle}
              onClick={() => setFilter(opt)}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
        <select
          style={styles.select}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="score">Score</option>
          <option value="aum">AUM</option>
          <option value="1m">1M Return</option>
          <option value="trend">Trend</option>
        </select>
      </div>

      <div style={styles.table}>
        <div style={styles.tableHeader}>
          <div style={styles.colRank}>Rank</div>
          <div style={styles.colSector}>Sector</div>
          <div style={styles.colScore}>Score</div>
          <div style={styles.colTrend}>Trend</div>
          <div style={styles.colAum}>AUM</div>
          <div style={styles.colReturn}>1M Return</div>
          <div style={styles.colSignal}>Volume Signal</div>
        </div>

        {sorted.map(sector => (
          <div key={sector.sector} style={styles.row}>
            <div style={styles.colRank}>#{sector.rank}</div>
            <div style={styles.colSector}>
              <div style={styles.sectorName}>{sector.sector}</div>
              <div style={styles.ticker}>{sector.ticker}</div>
            </div>
            <div style={styles.colScore}>
              <div style={styles.scoreBarContainer}>
                <BarChart width={100} height={20} data={[{ value: sector.score }]}>
                  <Bar
                    dataKey="value"
                    fill={sector.score > 70 ? "#10b981" : sector.score > 40 ? "#f59e0b" : "#ef4444"}
                    radius={[4, 4, 4, 4]}
                  />
                </BarChart>
                <span style={styles.scoreValue}>{sector.score}</span>
              </div>
            </div>
            <div style={{
              ...styles.colTrend,
              color: sector.scoreTrend != null
                ? (sector.scoreTrend > 0 ? "#10b981" : sector.scoreTrend < 0 ? "#ef4444" : "var(--text-secondary)")
                : "var(--text-secondary)",
            }}>
              {sector.scoreTrend != null
                ? `${sector.scoreTrend > 0 ? "↑" : sector.scoreTrend < 0 ? "↓" : "→"} ${Math.abs(sector.scoreTrend).toFixed(1)}`
                : "N/A"
              }
            </div>
            <div style={styles.colAum}>{formatMarketCap(sector.aum)}</div>
            <div style={{ ...styles.colReturn, color: sector.indicators.returns1M > 0 ? "#10b981" : "#ef4444" }}>
              {sector.indicators.returns1M?.toFixed(1)}%
            </div>
            <VolumeSignalCell obvChange={sector.indicators.obvChange} cmf={sector.indicators.cmf} />
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    marginTop: "24px",
    background: "var(--card-bg, #1e293b)",
    borderRadius: "12px",
    padding: "16px",
  },
  controls: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "16px",
    flexWrap: "wrap",
    gap: "12px",
  },
  toggleGroup: {
    display: "flex",
    gap: "8px",
  },
  toggle: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border, #334155)",
    background: "transparent",
    color: "var(--text-secondary, #94a3b8)",
    cursor: "pointer",
    fontSize: "14px",
  },
  toggleActive: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid var(--accent, #3b82f6)",
    background: "var(--accent, #3b82f6)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
  },
  select: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border, #334155)",
    background: "var(--card-bg, #1e293b)",
    color: "var(--text-primary, #f8fafc)",
    fontSize: "14px",
  },
  table: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "60px 1fr 120px 80px 100px 100px 120px",
    padding: "8px 12px",
    fontSize: "12px",
    color: "var(--text-secondary, #94a3b8)",
    borderBottom: "1px solid var(--border, #334155)",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "60px 1fr 120px 80px 100px 100px 120px",
    padding: "12px",
    alignItems: "center",
    borderRadius: "8px",
    background: "var(--card-bg-alt, #0f172a)",
    fontSize: "14px",
  },
  colRank: {
    color: "var(--text-secondary, #94a3b8)",
  },
  colSector: {
    display: "flex",
    flexDirection: "column",
  },
  sectorName: {
    color: "var(--text-primary, #f8fafc)",
    fontWeight: "500",
  },
  ticker: {
    fontSize: "12px",
    color: "var(--text-secondary, #94a3b8)",
  },
  colScore: {
    position: "relative",
  },
  scoreBarContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100px",
    height: "20px",
  },
  scoreValue: {
    fontSize: "12px",
    color: "var(--text-primary, #f8fafc)",
    fontWeight: "600",
  },
  colTrend: {
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
  },
  colAum: {
    color: "var(--text-primary, #f8fafc)",
  },
  colReturn: {
    fontWeight: "500",
  },
  colSignal: {
    fontSize: "12px",
    color: "var(--text-secondary, #94a3b8)",
  },
};
