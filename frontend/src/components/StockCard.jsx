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
  if (diffDays > 1 && diffDays <= 7) return `Earnings in ${diffDays} days`;

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
    borderBottom: "1px dashed rgba(0, 240, 255, 0.15)",
  },
  rowCompact: {
    padding: "4px 0",
  },
  label: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: 400,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  value: {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    fontWeight: 700,
  },
};

export default function StockCard({ ticker, data, error, loading, onClick, index, variant }) {
  const positive = data ? isPositive(data.changePercent ?? data.change) : null;
  const isSecondary = variant === "secondary";
  const hasEarningsSoon = data && isEarningsSoon(data.earningsDate);
  const low = data?.fiftyTwoWeekLow;
  const high = data?.fiftyTwoWeekHigh;
  const current = data?.currentPrice;
  let pct = 0;
  if (low != null && high != null && current != null && high > low) {
    pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  }
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
      whileHover={!loading && !error ? { y: -4, borderColor: "var(--accent-blue)", boxShadow: "0 0 15px rgba(0,240,255,0.15)" } : {}}
      onClick={() => !loading && !error && onClick(ticker)}
    >
      {/* Card glow on positive/negative */}
      {data && (
        <div
          style={{
            ...styles.glow,
            background: positive
              ? "linear-gradient(135deg, rgba(57,255,20,0.1) 0%, transparent 50%)"
              : "linear-gradient(135deg, rgba(255,0,60,0.1) 0%, transparent 50%)",
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
        <div style={{ ...styles.footer, flexDirection: isSecondary ? "row" : "column", gap: isSecondary ? "0" : "12px", alignItems: isSecondary ? "center" : "stretch" }}>
          {!isSecondary && low != null && high != null && (
            <div
              style={styles.rangeContainer}
              title={`52-Week Range: ${formatPrice(low)} - ${formatPrice(high)} | Current sits at ${pct.toFixed(0)}% of the range`}
            >
              <div style={styles.rangeLabels}>
                <span>L: {formatPrice(low)}</span>
                <span>H: {formatPrice(high)}</span>
              </div>
              <div style={styles.rangeTrack}>
                <div
                  style={{
                    ...styles.rangeCurrentDot,
                    left: `${pct}%`,
                    backgroundColor: positive ? "var(--accent-green)" : "var(--accent-red)",
                    boxShadow: positive ? "0 0 8px var(--accent-green)" : "0 0 8px var(--accent-red)",
                  }}
                />
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            {data.earningsDate ? (
              <span style={isEarningsSoon(data.earningsDate) ? styles.earningsCta : styles.footerText}>
                {formatEarningsDate(data.earningsDate)}
              </span>
            ) : (
              <span style={styles.footerText}>No upcoming earnings</span>
            )}
            <span style={styles.footerCta}>View details →</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

const styles = {
  card: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(5px)",
    WebkitBackdropFilter: "blur(5px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "0",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
    transition: "all 0.2s ease",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    clipPath: "polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)",
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
    borderRadius: "0",
    border: "1px solid currentColor",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    fontWeight: 700,
    padding: "3px 7px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  divider: {
    background: "rgba(0, 240, 255, 0.2)",
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
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  earningsCta: {
    color: "var(--accent-amber)",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: 700,
    textShadow: "0 0 8px rgba(255, 170, 0, 0.5)",
    textTransform: "uppercase",
  },
  skeleton: {
    background: "rgba(0, 240, 255, 0.05)",
    borderRadius: "0",
    height: "40px",
    width: "80px",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  skeletonLine: {
    background: "rgba(0, 240, 255, 0.05)",
    borderRadius: "0",
    height: "10px",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  cardSecondary: {
    padding: "18px",
    background: "var(--bg-surface)",
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
  rangeContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    width: "100%",
    position: "relative",
  },
  rangeLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    color: "var(--text-secondary)",
  },
  rangeTrack: {
    height: "2px",
    background: "rgba(0, 240, 255, 0.2)",
    borderRadius: "0",
    position: "relative",
    width: "100%",
  },
  rangeCurrentDot: {
    position: "absolute",
    top: "-4px",
    width: "4px",
    height: "10px",
    borderRadius: "0",
    border: "none",
    transform: "translateX(-50%)",
    transition: "left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
  },
};
