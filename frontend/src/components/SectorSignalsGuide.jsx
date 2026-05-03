import { motion } from "framer-motion";

const STATUS_COLORS = {
  strong: { bg: "rgba(16, 185, 129, 0.10)", border: "rgba(16, 185, 129, 0.25)", text: "#10b981", dot: "#10b981" },
  weak: { bg: "rgba(239, 68, 68, 0.10)", border: "rgba(239, 68, 68, 0.25)", text: "#ef4444", dot: "#ef4444" },
  mixed: { bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.25)", text: "#f59e0b", dot: "#f59e0b" },
  neutral: { bg: "rgba(255, 255, 255, 0.04)", border: "rgba(255, 255, 255, 0.08)", text: "var(--text-secondary)", dot: "var(--text-secondary)" },
};

function SignalRow({ obvRange, cmfRange, label, description, status }) {
  const c = STATUS_COLORS[status];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "70px 60px 1fr",
      gap: "10px",
      alignItems: "center",
      padding: "8px 10px",
      borderRadius: "8px",
      background: c.bg,
      border: `1px solid ${c.border}`,
    }}>
      <div style={{ textAlign: "center", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{obvRange}</div>
      <div style={{ textAlign: "center", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{cmfRange}</div>
      <div>
        <div style={{ fontSize: "12px", fontWeight: 500, color: c.text, marginBottom: "2px" }}>
          <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: c.dot, marginRight: "6px", verticalAlign: "middle" }} />
          {label}
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3 }}>{description}</div>
      </div>
    </div>
  );
}

export default function SectorSignalsGuide() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      style={styles.card}
    >
      <div style={styles.header}>
        <div style={styles.title}>Reading Volume Signals</div>
        <div style={styles.subtitle}>How OBV + CMF work together</div>
      </div>

      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <span style={styles.legendDot} />
          <span style={styles.legendLabel}>OBV</span>
          <span style={styles.legendDesc}>22d change</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: "var(--accent-amber)" }} />
          <span style={styles.legendLabel}>CMF</span>
          <span style={styles.legendDesc}>20d avg (-1 to +1)</span>
        </div>
      </div>

      <div style={styles.tableHeader}>
        <div style={{ textAlign: "center" }}>OBV</div>
        <div style={{ textAlign: "center" }}>CMF</div>
        <div>What it means</div>
      </div>

      <div style={styles.rows}>
        <SignalRow
          obvRange="> +5%"
          cmfRange="> +0.05"
          label="Accumulating"
          description="Volume and buying pressure both confirm the trend. Sector is likely entering a durable rotation."
          status="strong"
        />
        <SignalRow
          obvRange="> +5%"
          cmfRange="≤ +0.05"
          label="Churn"
          description="Plenty of volume but price isn't closing well — possible distribution in disguise."
          status="mixed"
        />
        <SignalRow
          obvRange="≤ +5%"
          cmfRange="> +0.05"
          label="Building"
          description="Low turnover but what is trading is well-bid. Often precedes a volume surge."
          status="mixed"
        />
        <SignalRow
          obvRange="< -5%"
          cmfRange="< -0.05"
          label="Distribution"
          description="Money is leaving. More shares trade on down-days with weak closes. Avoid or trim."
          status="weak"
        />
        <SignalRow
          obvRange="any"
          cmfRange="any"
          label="Mixed"
          description="Conflicting or weak signals. Wait for a clearer volume pattern before acting."
          status="neutral"
        />
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
    gap: "14px",
    width: "100%",
    boxSizing: "border-box",
  },
  header: {
    position: "relative",
    zIndex: 1,
  },
  title: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    lineHeight: 1,
    marginBottom: "4px",
  },
  subtitle: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: 400,
  },
  legend: {
    display: "flex",
    gap: "16px",
    position: "relative",
    zIndex: 1,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
  },
  legendDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "var(--accent-green)",
    display: "inline-block",
  },
  legendLabel: {
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  legendDesc: {
    color: "var(--text-secondary)",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "70px 60px 1fr",
    gap: "10px",
    padding: "0 10px 4px",
    fontSize: "10px",
    color: "var(--text-secondary)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 1,
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    position: "relative",
    zIndex: 1,
  },
};
