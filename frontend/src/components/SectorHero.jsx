import { motion } from "framer-motion";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import { formatMarketCap, formatChange, formatPrice } from "../utils/formatters.js";
import { getVolumeSignal } from "../utils/volumeSignals.js";

function VolumeSignalBadge({ obvChange, cmf }) {
  const signal = getVolumeSignal(obvChange, cmf);
  return (
    <div style={metricStyles.row}>
      <span style={metricStyles.label}>Volume Signal</span>
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

function MetricRow({ label, value, highlight }) {
  return (
    <div style={metricStyles.row}>
      <span style={metricStyles.label}>{label}</span>
      <span
        style={{
          ...metricStyles.value,
          color: highlight === "positive"
            ? "var(--accent-green)"
            : highlight === "negative"
            ? "var(--accent-red)"
            : "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

const metricStyles = {
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  label: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: 400,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  value: {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    fontWeight: 400,
  },
};

export default function SectorHero({ sector }) {
  if (!sector) return null;

  const { rank, sector: name, ticker, score, aum, price, changePercent, indicators } = sector;
  const scoreColor = score > 70 ? "var(--accent-green)" : score > 40 ? "var(--accent-amber)" : "var(--accent-red)";
  const scoreColorDim = score > 70 ? "var(--accent-green-dim)" : score > 40 ? "var(--accent-amber-dim)" : "var(--accent-red-dim)";
  const positive = changePercent > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={styles.card}
    >
      {/* Card glow based on score */}
      <div
        style={{
          ...styles.glow,
          background: `radial-gradient(ellipse at top right, ${scoreColorDim} 0%, transparent 60%)`,
        }}
      />

      {/* Header: sector identity | price */}
      <div style={styles.header}>
        <div>
          <div style={styles.ticker}>{name}</div>
          <div style={styles.name}>{ticker} · {formatMarketCap(aum)} AUM · #{rank} Sector</div>
        </div>

        <div style={styles.priceBlock}>
          <div style={styles.price}>{formatPrice(price)}</div>
          <div style={{
            ...styles.change,
            color: positive ? "var(--accent-green)" : "var(--accent-red)",
            background: positive ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
          }}>
            {positive ? "▲" : "▼"} {formatChange(changePercent)}
          </div>
        </div>
      </div>

      {/* Score gauge */}
      <div style={styles.gaugeSection}>
        <div style={styles.gaugeContainer}>
          <ResponsiveContainer width={80} height={80}>
            <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="90%" data={[{ value: score }]} startAngle={90} endAngle={-270}>
              <RadialBar
                minPointSize={5}
                dataKey="value"
                fill={scoreColor}
                background={{ fill: "rgba(255,255,255,0.06)" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div style={{ ...styles.scoreText, color: scoreColor }}>{score}</div>
        </div>
        <div>
          <div style={styles.gaugeLabel}>Composite Score (0–100)</div>
          {sector.scoreTrend != null && (
            <div style={{
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              color: sector.scoreTrend > 0 ? "var(--accent-green)" : sector.scoreTrend < 0 ? "var(--accent-red)" : "var(--text-secondary)",
              marginTop: "4px",
            }}>
              {sector.scoreTrend > 0 ? "↑" : sector.scoreTrend < 0 ? "↓" : "→"} {Math.abs(sector.scoreTrend).toFixed(1)} pts vs 20d ago
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Metrics */}
      <div style={styles.metrics}>
        <MetricRow
          label="1M Return"
          value={`${indicators.returns1M?.toFixed(1)}%`}
          highlight={indicators.returns1M > 0 ? "positive" : "negative"}
        />
        <MetricRow
          label="Momentum"
          value={`RSI ${indicators.rsi?.toFixed(0)} ${indicators.macdHistogram > 0 ? "↑" : "↓"}`}
        />
        <VolumeSignalBadge obvChange={indicators.obvChange} cmf={indicators.cmf} />
      </div>
    </motion.div>
  );
}

const styles = {
  card: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius-lg)",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    width: "100%",
    boxSizing: "border-box",
  },
  glow: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    position: "relative",
    zIndex: 1,
  },
  ticker: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    lineHeight: 1,
    marginBottom: "4px",
  },
  name: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: 400,
  },
  priceBlock: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  price: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "16px",
    fontWeight: 500,
  },
  change: {
    borderRadius: "6px",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: 400,
    padding: "3px 7px",
  },
  gaugeSection: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    position: "relative",
    zIndex: 1,
  },
  gaugeContainer: {
    position: "relative",
    width: "80px",
    height: "80px",
    flexShrink: 0,
  },
  scoreText: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "20px",
    fontWeight: "700",
    fontFamily: "var(--font-mono)",
  },
  gaugeLabel: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: 400,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  divider: {
    background: "rgba(255,255,255,0.05)",
    height: "1px",
    position: "relative",
    zIndex: 1,
  },
  metrics: {
    display: "flex",
    flexDirection: "column",
    position: "relative",
    zIndex: 1,
  },
};
