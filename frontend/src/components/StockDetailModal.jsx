import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStockDetail, useDCF } from "../hooks/useStockData";
import DCFSummary from "./DCFSummary";
import TradingViewChart from "./TradingViewChart";
import { formatPrice, isPositive } from "../utils/formatters";


function StockDetailModal({ ticker, onClose, period, setPeriod, onOpenAnalysis }) {
  const { data, loading, error } = useStockDetail(ticker);
  const { data: dcfData, loading: dcfLoading } = useDCF(ticker);

  const summary = data?.summary;
  const isUp = summary ? isPositive(summary.changePercent) : true;

  return (
    <AnimatePresence>
      <motion.div
        style={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          style={styles.modal}
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={styles.header}>
            <div>
              <div style={styles.tickerRow}>
                <span style={styles.ticker}>{ticker}</span>
                {summary && (
                  <span style={{
                    ...styles.changeBadge,
                    color: isUp ? "var(--accent-green)" : "var(--accent-red)",
                    background: isUp ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
                  }}>
                    {isUp ? "▲" : "▼"} {summary.changePercent != null ? `${(summary.changePercent * 100).toFixed(2)}%` : "—"}
                  </span>
                )}
              </div>
              {summary && <div style={styles.companyName}>{summary.name}</div>}
            </div>
            <div style={styles.headerRight}>
              {summary && (
                <div style={styles.currentPrice}>{formatPrice(summary.currentPrice)}</div>
              )}
              <button style={styles.closeBtn} onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div style={styles.body}>
            {loading && (
              <div style={styles.loadingState}>
                <div style={styles.spinner} />
                <span>Fetching data…</span>
              </div>
            )}

            {error && (
              <div style={styles.errorState}>Failed to load: {error}</div>
            )}

            {data && (
              <div style={{ display: "flex", gap: "16px" }}>
                {/* Chart Panel */}
                <div style={{ flex: 4, display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <TradingViewChart ticker={ticker} period={period} setPeriod={setPeriod} />
                </div>

                {/* DCF Summary Sidebar */}
                <div style={{ flex: 0.9, minWidth: "180px", alignSelf: "stretch" }}>
                  <DCFSummary
                    dcfData={dcfData}
                    currentPrice={summary?.currentPrice}
                    loading={dcfLoading}
                    onOpenAnalysis={onOpenAnalysis}
                  />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(5, 8, 15, 0.8)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  modal: {
    background: "rgba(9, 13, 23, 0.97)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "24px",
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 48px)",
    maxHeight: "95vh",
    maxWidth: "1200px",
    overflow: "hidden",
    width: "100%",
    boxShadow: "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
  },
  header: {
    alignItems: "flex-start",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    justifyContent: "space-between",
    padding: "28px 32px 24px",
    flexShrink: 0,
  },
  tickerRow: {
    alignItems: "center",
    display: "flex",
    gap: "12px",
    marginBottom: "4px",
  },
  ticker: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "30px",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    lineHeight: 1,
  },
  changeBadge: {
    borderRadius: "8px",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    padding: "4px 9px",
  },
  companyName: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: 300,
  },
  headerRight: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    gap: "12px",
  },
  currentPrice: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "28px",
    fontWeight: 800,
    lineHeight: 1,
  },
  closeBtn: {
    alignItems: "center",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    padding: "6px",
    transition: "all 0.15s",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "28px 32px",
  },
  loadingState: {
    alignItems: "center",
    color: "var(--text-secondary)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    gap: "16px",
    justifyContent: "center",
    minHeight: "300px",
  },
  spinner: {
    width: "28px",
    height: "28px",
    border: "2px solid rgba(255,255,255,0.06)",
    borderTop: "2px solid var(--accent-green)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorState: {
    color: "var(--accent-red)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    padding: "40px",
    textAlign: "center",
  },
};

export default memo(StockDetailModal);
