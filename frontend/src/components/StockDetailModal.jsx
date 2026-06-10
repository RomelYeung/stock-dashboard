import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStockDetail, useDCF } from "../hooks/useStockData";
import TradingViewChart from "./TradingViewChart";
import { formatPrice, isPositive } from "../utils/formatters";


function StockDetailModal({ ticker, onClose, period, setPeriod, onOpenAnalysis, livePriceData }) {
  const { data, loading, error } = useStockDetail(ticker);
  const { data: dcfData, loading: dcfLoading } = useDCF(ticker);

  const summary = data?.summary;
  const displayPrice = livePriceData?.currentPrice ?? summary?.currentPrice;
  const displayChangePercent = livePriceData?.changePercent ?? summary?.changePercent;
  const isUp = displayChangePercent != null ? isPositive(displayChangePercent) : true;

  const dcf = dcfData?.dcf;
  const mc = dcfData?.monteCarlo;
  const hasData = dcf && dcf.fairValue > 0 && mc;
  const hasUpside = dcf ? dcf.upsidePercent >= 0 : false;
  const statusText = hasUpside ? "UNDERVALUED" : "OVERVALUED";

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
                {onOpenAnalysis && (
                  <motion.button
                    style={{
                      ...styles.teaserBtn,
                      ...(dcfLoading ? styles.teaserLoading : {}),
                      ...(hasData ? (hasUpside ? styles.teaserUndervalued : styles.teaserOvervalued) : styles.teaserDefault)
                    }}
                    onClick={onOpenAnalysis}
                    whileHover={{
                      scale: 1.02,
                      y: -1,
                      boxShadow: hasData
                        ? (hasUpside ? "0 4px 20px rgba(0, 229, 160, 0.15)" : "0 4px 20px rgba(255, 73, 118, 0.15)")
                        : "0 4px 20px rgba(79, 141, 255, 0.15)",
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {dcfLoading ? (
                      <>
                        <span style={styles.spinnerMini} />
                        <span style={{ color: "var(--text-secondary)" }}>Valuation: Loading...</span>
                      </>
                    ) : hasData ? (
                      <>
                        <span style={{
                          ...styles.statusBadge,
                          background: hasUpside ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
                          color: hasUpside ? "var(--accent-green)" : "var(--accent-red)",
                        }}>
                          {statusText}
                        </span>
                        <span style={styles.teaserDivider} />
                        <span style={styles.teaserAction}>
                          Open Full Analysis <span style={styles.arrow}>→</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{
                          ...styles.statusBadge,
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "var(--text-secondary)",
                        }}>
                          N/A
                        </span>
                        <span style={styles.teaserDivider} />
                        <span style={styles.teaserAction}>
                          Open Full Analysis <span style={styles.arrow}>→</span>
                        </span>
                      </>
                    )}
                  </motion.button>
                )}
              </div>
              {summary && <div style={styles.companyName}>{summary.name}</div>}
            </div>
            <div style={styles.headerRight}>
              {(displayPrice != null || displayChangePercent != null) && (
                <div style={styles.priceContainer}>
                  <div style={styles.currentPrice}>{displayPrice != null ? formatPrice(displayPrice) : "—"}</div>
                  <span style={{
                    ...styles.changeBadge,
                    color: isUp ? "var(--accent-green)" : "var(--accent-red)",
                    background: isUp ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
                    alignSelf: "flex-end",
                  }}>
                    {isUp ? "▲" : "▼"} {displayChangePercent != null ? `${(displayChangePercent * 100).toFixed(2)}%` : "—"}
                  </span>
                </div>
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
              <div style={{ width: "100%", display: "flex", flexDirection: "column", minWidth: 0 }}>
                <TradingViewChart ticker={ticker} period={period} setPeriod={setPeriod} livePrice={livePriceData?.currentPrice} />
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
    gap: "16px",
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
    gap: "20px",
  },
  priceContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "6px",
  },
  currentPrice: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "28px",
    fontWeight: 800,
    lineHeight: 1,
  },
  teaserBtn: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    padding: "4px 12px 4px 6px",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    fontWeight: 500,
    transition: "all 0.2s ease-in-out",
    whiteSpace: "nowrap",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },
  teaserUndervalued: {
    borderColor: "rgba(0, 229, 160, 0.15)",
    background: "rgba(0, 229, 160, 0.03)",
  },
  teaserOvervalued: {
    borderColor: "rgba(255, 73, 118, 0.15)",
    background: "rgba(255, 73, 118, 0.03)",
  },
  teaserDefault: {
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  teaserLoading: {
    borderColor: "rgba(255, 255, 255, 0.05)",
    opacity: 0.8,
  },
  statusBadge: {
    fontFamily: "var(--font-display)",
    fontSize: "9px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    padding: "4px 8px",
    borderRadius: "8px",
    textTransform: "uppercase",
  },
  teaserDivider: {
    width: "1px",
    height: "12px",
    background: "rgba(255, 255, 255, 0.12)",
  },
  teaserAction: {
    color: "var(--text-secondary)",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  arrow: {
    transition: "transform 0.2s ease",
  },
  spinnerMini: {
    width: "12px",
    height: "12px",
    border: "1.5px solid rgba(255,255,255,0.1)",
    borderTop: "1.5px solid var(--text-secondary)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
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
