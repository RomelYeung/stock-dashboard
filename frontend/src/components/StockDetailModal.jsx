import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStockDetail, usePriceHistory } from "../hooks/useStockData";
import { RevenueChart, MarginsChart, CashFlowChart, PriceChart } from "./Charts";
import {
  formatPrice, formatMarketCap, formatPercent,
  formatMultiple, formatRevenue, isPositive,
} from "../utils/formatters";

const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y"];

function StatBox({ label, value, sub, positive }) {
  return (
    <div style={statStyles.box}>
      <span style={statStyles.label}>{label}</span>
      <span style={{
        ...statStyles.value,
        color: positive === true
          ? "var(--accent-green)"
          : positive === false
          ? "var(--accent-red)"
          : "var(--text-primary)",
      }}>
        {value}
      </span>
      {sub && <span style={statStyles.sub}>{sub}</span>}
    </div>
  );
}

const statStyles = {
  box: {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  label: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "10px",
    fontWeight: 400,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  value: {
    fontFamily: "var(--font-mono)",
    fontSize: "15px",
    fontWeight: 500,
  },
  sub: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "10px",
  },
};

function Section({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3 style={sectionStyles.title}>{title}</h3>
      {children}
    </div>
  );
}

const sectionStyles = {
  title: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-display)",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "8px",
  },
};

export default function StockDetailModal({ ticker, onClose }) {
  const { data, loading, error } = useStockDetail(ticker);
  const [period, setPeriod] = useState("1y");
  const { data: priceData, loading: priceLoading } = usePriceHistory(ticker, period);

  const summary = data?.summary;
  const financials = data?.financials;
  const balance = data?.balanceSheet;
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
                <span>Fetching fundamentals…</span>
              </div>
            )}

            {error && (
              <div style={styles.errorState}>Failed to load: {error}</div>
            )}

            {data && (
              <div style={styles.sections}>
                {/* Price Chart */}
                <Section title="Price History">
                  <div style={styles.periodRow}>
                    {PERIODS.map((p) => (
                      <button
                        key={p}
                        style={{
                          ...styles.periodBtn,
                          ...(period === p ? styles.periodBtnActive : {}),
                        }}
                        onClick={() => setPeriod(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  {priceLoading
                    ? <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: 13 }}>Loading…</div>
                    : <PriceChart data={priceData} ticker={ticker} />
                  }
                </Section>

                {/* Valuation */}
                <Section title="Valuation">
                  <div style={styles.statsGrid}>
                    <StatBox label="Market Cap" value={formatMarketCap(summary?.marketCap)} />
                    <StatBox label="P/E (TTM)" value={formatMultiple(summary?.trailingPE)} />
                    <StatBox label="Forward P/E" value={formatMultiple(summary?.forwardPE)} />
                    <StatBox label="EV/EBITDA" value={formatMultiple(summary?.enterpriseToEbitda)} />
                    <StatBox label="P/B" value={formatMultiple(summary?.priceToBook)} />
                    <StatBox label="PEG Ratio" value={formatMultiple(summary?.pegRatio)} />
                  </div>
                </Section>

                {/* Profitability */}
                <Section title="Profitability">
                  <div style={styles.statsGrid}>
                    <StatBox label="Gross Margin" value={formatPercent(financials?.grossMargins)} positive={financials?.grossMargins > 0.3} />
                    <StatBox label="Operating Margin" value={formatPercent(financials?.operatingMargins)} positive={financials?.operatingMargins > 0.1} />
                    <StatBox label="Net Margin" value={formatPercent(financials?.profitMargins)} positive={financials?.profitMargins > 0} />
                    <StatBox label="ROE" value={formatPercent(financials?.returnOnEquity)} positive={financials?.returnOnEquity > 0.15} />
                    <StatBox label="ROA" value={formatPercent(financials?.returnOnAssets)} positive={financials?.returnOnAssets > 0.05} />
                    <StatBox label="Revenue Growth" value={formatPercent(financials?.revenueGrowth)} positive={financials?.revenueGrowth > 0} />
                  </div>
                  <MarginsChart annualIncome={financials?.annualIncome} />
                </Section>

                {/* Growth */}
                <Section title="Revenue & Earnings">
                  <div style={styles.statsGrid}>
                    <StatBox label="Total Revenue" value={formatRevenue(financials?.totalRevenue)} />
                    <StatBox label="Earnings Growth" value={formatPercent(financials?.earningsGrowth)} positive={financials?.earningsGrowth > 0} />
                    <StatBox label="EPS Est. (This Yr)" value={financials?.estimates?.currentYear != null ? `$${financials.estimates.currentYear.toFixed(2)}` : "—"} />
                    <StatBox label="EPS Est. (Next Yr)" value={financials?.estimates?.nextYear != null ? `$${financials.estimates.nextYear.toFixed(2)}` : "—"} />
                  </div>
                  <RevenueChart annualIncome={financials?.annualIncome} />
                </Section>

                {/* Balance Sheet */}
                <Section title="Balance Sheet & Cash Flow">
                  <div style={styles.statsGrid}>
                    <StatBox label="Total Cash" value={formatRevenue(balance?.totalCash)} />
                    <StatBox label="Total Debt" value={formatRevenue(balance?.totalDebt)} />
                    <StatBox label="Debt/Equity" value={balance?.debtToEquity != null ? `${balance.debtToEquity.toFixed(1)}%` : "—"} positive={balance?.debtToEquity < 100} />
                    <StatBox label="Current Ratio" value={formatMultiple(balance?.currentRatio)} positive={balance?.currentRatio > 1.5} />
                    <StatBox label="Free Cash Flow" value={formatRevenue(balance?.freeCashflow)} positive={balance?.freeCashflow > 0} />
                    <StatBox label="Operating CF" value={formatRevenue(balance?.operatingCashflow)} positive={balance?.operatingCashflow > 0} />
                  </div>
                  <CashFlowChart annualCashFlow={balance?.annualCashFlow} />
                </Section>
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
    maxHeight: "860px",
    maxWidth: "720px",
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
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  currentPrice: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "22px",
    fontWeight: 500,
  },
  closeBtn: {
    alignItems: "center",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    padding: "8px",
    transition: "all 0.15s",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "28px 32px",
  },
  sections: {
    display: "flex",
    flexDirection: "column",
    gap: "32px",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
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
  periodRow: {
    display: "flex",
    gap: "6px",
  },
  periodBtn: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "6px",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    padding: "5px 10px",
    transition: "all 0.15s",
  },
  periodBtnActive: {
    background: "rgba(0,229,160,0.1)",
    border: "1px solid rgba(0,229,160,0.2)",
    color: "var(--accent-green)",
  },
};
