import { useState } from "react";
import { useStockDetail, useDCF, useComparables } from "../hooks/useStockData";
import DCFAnalysis from "./DCFAnalysis";
import InsiderTradingTab from "./InsiderTradingTab";
import FundamentalsTab from "./FundamentalsTab";
import OptionsScannerTab from "./OptionsScannerTab";
import { formatPrice, isPositive } from "../utils/formatters";

const TABS = ["DCF", "Fundamentals", "Options Scanner", "Insider Activity"];

function TabBar({ active, onChange }) {
  return (
    <div role="tablist" style={tab.bar}>
      {TABS.map((tabName) => (
        <button
          key={tabName}
          role="tab"
          aria-selected={active === tabName}
          tabIndex={active === tabName ? 0 : -1}
          style={{ ...tab.tab, ...(active === tabName ? tab.active : {}) }}
          onClick={() => onChange(tabName)}
          onKeyDown={(e) => {
            const idx = TABS.indexOf(active);
            if (e.key === "ArrowRight") {
              e.preventDefault();
              onChange(TABS[(idx + 1) % TABS.length]);
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              onChange(TABS[(idx - 1 + TABS.length) % TABS.length]);
            }
          }}
        >
          {tabName}
        </button>
      ))}
    </div>
  );
}

const tab = {
  bar: { display: "flex", gap: "4px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "24px" },
  tab: {
    background: "transparent", border: "none", cursor: "pointer",
    fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 600,
    letterSpacing: "0.06em", padding: "10px 16px", textTransform: "uppercase",
    color: "var(--text-secondary)", borderBottom: "2px solid transparent",
  },
  active: { color: "var(--accent-blue)", borderBottom: "2px solid var(--accent-blue)" },
};

export default function StockAnalysisPage({ ticker, currentPrice, onBack }) {
  const [activeTab, setActiveTab] = useState("DCF");
  const { data, loading, error, refetch: refetchDetail } = useStockDetail(ticker);
  const { data: dcfData, loading: dcfLoading, refetch: dcfRefetch } = useDCF(ticker);
  const { data: comparablesData, loading: comparablesLoading, error: comparablesError, refetch: refetchComparables } = useComparables(ticker);

  const summary = data?.summary;

  return (
    <div style={page.wrap}>
      {/* Header */}
      <div style={page.header}>
        <button style={page.backBtn} onClick={onBack}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Portfolio
        </button>
        <div style={page.tickerInfo}>
          <span style={page.ticker}>{ticker}</span>
          {summary && (
            <>
              <span style={page.name}>{summary.name}</span>
              <span style={page.price}>{formatPrice(summary.currentPrice)}</span>
              {summary.changePercent != null && (
                <span style={{
                  ...page.change,
                  color: isPositive(summary.changePercent) ? "var(--accent-green)" : "var(--accent-red)",
                }}>
                  {isPositive(summary.changePercent) ? "▲" : "▼"} {(summary.changePercent * 100).toFixed(2)}%
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      <div style={page.content}>
        {loading && !data && (
          <div style={page.skeleton}>
            <div style={page.skelBar} />
            <div style={page.skelBar} />
            <div style={page.skelBar} />
          </div>
        )}

        {error && (
          <div style={page.error}>{error}</div>
        )}

        {activeTab === "DCF" && (
          <DCFAnalysis
            dcfData={dcfData}
            currentPrice={currentPrice}
            loading={dcfLoading}
            onRefetch={dcfRefetch}
          />
        )}

        {activeTab === "Fundamentals" && (
          <FundamentalsTab
            ticker={ticker}
            financialData={data}
            comparablesData={comparablesData}
            financialLoading={loading}
            comparablesLoading={comparablesLoading}
            error={error || comparablesError}
            onRetry={() => {
              refetchDetail();
              refetchComparables();
            }}
          />
        )}

        {activeTab === "Options Scanner" && (
          <OptionsScannerTab ticker={ticker} />
        )}

        {activeTab === "Insider Activity" && (
          <InsiderTradingTab ticker={ticker} />
        )}
      </div>
    </div>
  );
}

const page = {
  wrap: { display: "flex", flexDirection: "column" },
  header: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" },
  backBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer",
    fontFamily: "var(--font-body)", fontSize: "12px", padding: "6px 12px", width: "fit-content",
    transition: "all 0.15s ease",
  },
  tickerInfo: { display: "flex", alignItems: "baseline", gap: "12px" },
  ticker: {
    color: "var(--text-primary)", fontFamily: "var(--font-display)",
    fontSize: "30px", fontWeight: 800, letterSpacing: "-0.02em",
  },
  name: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 300 },
  price: { color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 500, marginLeft: "auto" },
  change: { fontFamily: "var(--font-mono)", fontSize: "12px", padding: "3px 8px", borderRadius: "6px" },
  content: { display: "flex", flexDirection: "column" },
  skeleton: { display: "flex", flexDirection: "column", gap: "12px", padding: "40px 0" },
  skelBar: {
    height: "20px", background: "rgba(255,255,255,0.04)",
    borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite",
  },
  error: {
    color: "var(--accent-red)", fontFamily: "var(--font-body)",
    fontSize: "13px", padding: "40px 0", textAlign: "center",
  },
};
