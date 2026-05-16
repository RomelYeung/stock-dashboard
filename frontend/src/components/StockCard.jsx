import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  formatPrice,
  formatMarketCap,
  formatPercent,
  formatMultiple,
  formatPriceChange,
  isPositive,
} from "../utils/formatters";

// Check if earnings date is within the next N days
function isEarningsSoon(earningsDate, days = 7) {
  if (!earningsDate) return false;
  const now = new Date();
  const earnings = new Date(earningsDate);
  const diffTime = earnings - now;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

// Format earnings date for display
function formatEarningsDate(earningsDate) {
  if (!earningsDate) return null;
  const date = new Date(earningsDate);
  const now = new Date();
  const diffTime = date - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Earnings today";
  if (diffDays === 1) return "Earnings tomorrow";
  if (diffDays <= 7) return `Earnings in ${diffDays} days`;

  return `Earnings ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function MetricRow({ label, value, highlight, compact }) {
  return (
    <div style={{ ...metricStyles.row, ...(compact ? metricStyles.rowCompact : {}) }}>
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
  rowCompact: {
    padding: "4px 0",
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

export default function StockCard({ ticker, data, error, loading, onClick, index, variant }) {
  const positive = data ? isPositive(data.changePercent ?? data.change) : null;
  const isSecondary = variant === "secondary";
  const hasEarningsSoon = data && isEarningsSoon(data.earningsDate);
  const [flash, setFlash] = useState(null);
  const prevPriceRef = useRef(data?.currentPrice);

  useEffect(() => {
    if (data?.currentPrice != null && prevPriceRef.current != null) {
      if (data.currentPrice !== prevPriceRef.current) {
        const isUp = data.currentPrice > prevPriceRef.current;
        setFlash(isUp ? "up" : "down");
        const timer = setTimeout(() => setFlash(null), 500);
        prevPriceRef.current = data.currentPrice;
        return () => clearTimeout(timer);
      }
    } else if (data?.currentPrice != null) {
      prevPriceRef.current = data.currentPrice;
    }
  }, [data?.currentPrice]);

  return (
    <motion.div
      style={{
        ...styles.card,
        cursor: loading || error ? "default" : "pointer",
        ...(isSecondary ? styles.cardSecondary : {}),
        ...(flash === "up" ? { background: "rgba(0, 229, 160, 0.06)" } : {}),
        ...(flash === "down" ? { background: "rgba(255, 77, 109, 0.05)" } : {}),
        ...(error ? { border: "1px solid var(--accent-red)" } : {}),
        ...(!error && hasEarningsSoon ? { border: "1px solid rgba(255, 215, 0, 0.3)" } : {}),
      }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.23, 1, 0.32, 1] }}
      whileHover={!loading && !error ? { y: -4, borderColor: "rgba(255,255,255,0.14)" } : {}}
      onClick={() => !loading && !error && onClick(ticker)}
    >
      {/* Card glow on positive/negative */}
      {data && (
        <div
          style={{
            ...styles.glow,
            background: positive
              ? "radial-gradient(ellipse at top right, rgba(0,229,160,0.06) 0%, transparent 60%)"
              : "radial-gradient(ellipse at top right, rgba(255,77,109,0.05) 0%, transparent 60%)",
          }}
        />
      )}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={{ ...styles.ticker, ...(isSecondary ? styles.tickerSecondary : {}) }}>{ticker}</div>
          {data && <div style={styles.name}>{data.name}</div>}
          {loading && <div style={styles.name}>Loading…</div>}
          {error && <div style={{ ...styles.name, color: "var(--accent-red)" }}>⚠ Failed to load</div>}
        </div>

          {data && (
            <div style={styles.priceBlock}>
              <div style={{ ...styles.price, ...(isSecondary ? styles.priceSecondary : {}) }}>{formatPrice(data.currentPrice)}</div>
              {data.change != null || data.changePercent != null ? (
                <div style={{
                  ...styles.change,
                  ...(isSecondary ? styles.changeSecondary : {}),
                  color: positive ? "var(--accent-green)" : "var(--accent-red)",
                  background: positive ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
                }}>
                  {positive ? "▲" : "▼"} {formatPriceChange(data.change)}{" "}
                  {data.changePercent != null ? `(${formatPercent(data.changePercent)})` : ""}
                </div>
              ) : (
                <div style={{
                  ...styles.change,
                  color: "var(--text-secondary)",
                  background: "rgba(255,255,255,0.04)",
                }}>
                  —
                </div>
              )}
            </div>
          )}

        {loading && (
          <div style={styles.skeleton} />
        )}
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Metrics */}
      {data && (
        <div style={styles.metrics}>
          <MetricRow label="Market Cap" value={formatMarketCap(data.marketCap)} compact={isSecondary} />
          <MetricRow
            label="P/E (TTM)"
            value={formatMultiple(data.trailingPE)}
            highlight={data.trailingPE != null && data.trailingPE < 15 ? "positive" : data.trailingPE > 40 ? "negative" : null}
            compact={isSecondary}
          />
          <MetricRow label="Fwd P/E" value={formatMultiple(data.forwardPE)} compact={isSecondary} />
          <MetricRow label="EV/EBITDA" value={formatMultiple(data.enterpriseToEbitda)} compact={isSecondary} />
          <MetricRow label="P/B" value={formatMultiple(data.priceToBook)} compact={isSecondary} />
        </div>
      )}

      {loading && (
        <div style={styles.metrics}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ ...metricStyles.row }}>
              <div style={{ ...styles.skeletonLine, width: "60px" }} />
              <div style={{ ...styles.skeletonLine, width: "40px" }} />
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {data && (
        <div style={styles.footer}>
          {!isSecondary && (
            <span style={styles.footerText}>
              52W: {formatPrice(data.fiftyTwoWeekLow)} – {formatPrice(data.fiftyTwoWeekHigh)}
            </span>
          )}
          {data.earningsDate ? (
            <span style={isEarningsSoon(data.earningsDate) ? styles.earningsCta : styles.footerText}>
              {formatEarningsDate(data.earningsDate)}
            </span>
          ) : (
            <span style={styles.footerCta}>View details →</span>
          )}
        </div>
      )}
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
    transition: "border-color 0.25s, transform 0.25s",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
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
    maxWidth: "120px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
    marginTop: "auto",
    paddingTop: "4px",
  },
  footerText: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    fontWeight: 300,
  },
  footerCta: {
    color: "var(--accent-blue)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: 500,
    opacity: 1,
  },
  earningsCta: {
    color: "#FFD700",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: 600,
    textShadow: "0 0 8px rgba(255, 215, 0, 0.5)",
  },
  skeleton: {
    background: "rgba(255,255,255,0.06)",
    borderRadius: "8px",
    height: "40px",
    width: "80px",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  skeletonLine: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: "4px",
    height: "10px",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  cardSecondary: {
    padding: "18px",
    background: "rgba(255,255,255,0.02)",
  },
  tickerSecondary: {
    fontSize: "18px",
  },
  priceSecondary: {
    fontSize: "14px",
  },
  changeSecondary: {
    fontSize: "10px",
  },
};
