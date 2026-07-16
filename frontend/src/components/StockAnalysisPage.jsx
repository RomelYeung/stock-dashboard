import { useState } from "react";
import { useStockDetail, useDCF, useAIValuation, useComparables } from "../hooks/useStockData";
import DCFAnalysis from "./DCFAnalysis";
import InsiderTradingTab from "./InsiderTradingTab";
import FundamentalsTab from "./FundamentalsTab";
import OptionsScannerTab from "./OptionsScannerTab";
import EarningsTab from "./EarningsTab";
import NewsTab from "./NewsTab";
import AIFinancialAdviserChat from "./AIFinancialAdviserChat";
import { formatPrice, isPositive, formatPercent } from "../utils/formatters";
import { useGuruReverseLookup } from "../hooks/useGuruData";

const TABS = ["Valuation & AI", "Fundamentals", "Earnings", "News", "Options Scanner", "Insider Activity", "Guru Ownership"];

function GuruOwnershipTab({ ticker }) {
  const { data: owners, isLoading, error } = useGuruReverseLookup(ticker);

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "40px 0" }}>
        <div style={{ height: "20px", background: "rgba(0,240,255,0.05)", borderRadius: "0", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: "20px", background: "rgba(0,240,255,0.05)", borderRadius: "0", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.1s" }} />
      </div>
    );
  }

  if (error) {
    return <div style={{ color: "var(--accent-red)", padding: "40px 0", textAlign: "center", fontSize: "13px" }}>{error.message || error}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <h3 style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", marginBottom: "12px" }}>
        Institutional Guru Holders
      </h3>
      {owners && owners.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {owners.map((owner) => (
            <div key={owner.guruId} style={{ background: "rgba(0,240,255,0.02)", border: "1px solid var(--accent-blue)", borderRadius: "0", padding: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{owner.guruName}</div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{owner.fundName}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Quarter: {owner.quarter}</span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                  Weight: {owner.weight != null ? formatPercent(owner.weight, 2) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "var(--text-secondary)", padding: "40px 0", textAlign: "center", fontSize: "13px" }}>
          Not currently held by any tracked gurus.
        </div>
      )}
    </div>
  );
}

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

export default function StockAnalysisPage({ ticker, livePriceData, onBack }) {
  const [activeTab, setActiveTab] = useState("Valuation & AI");
  const { data, loading, error, refetch: refetchDetail } = useStockDetail(ticker);
  const { data: dcfData, loading: dcfLoading, refetch: dcfRefetch } = useDCF(ticker);
  const { data: aiValuationData, loading: aiLoading } = useAIValuation(ticker);
  const { data: comparablesData, loading: comparablesLoading, error: comparablesError, refetch: refetchComparables } = useComparables(ticker);

  const summary = data?.summary;
  const displayPrice = livePriceData?.currentPrice ?? summary?.currentPrice;
  const displayChangePercent = livePriceData?.changePercent ?? summary?.changePercent;

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
              <span style={page.price}>{displayPrice != null ? formatPrice(displayPrice) : "—"}</span>
              {displayChangePercent != null && (
                <span style={{
                  ...page.change,
                  color: isPositive(displayChangePercent) ? "var(--accent-green)" : "var(--accent-red)",
                }}>
                  {isPositive(displayChangePercent) ? "▲" : "▼"} {formatPercent(Math.abs(displayChangePercent), 2)}
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

        {activeTab === "Valuation & AI" && (
          <DCFAnalysis
            ticker={ticker}
            dcfData={dcfData}
            aiValuationData={aiValuationData}
            currentPrice={displayPrice}
            loading={dcfLoading || aiLoading}
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

        {activeTab === "Earnings" && (
          <EarningsTab ticker={ticker} />
        )}

        {activeTab === "News" && (
          <NewsTab ticker={ticker} />
        )}

        {activeTab === "Options Scanner" && (
          <OptionsScannerTab ticker={ticker} />
        )}

        {activeTab === "Insider Activity" && (
          <InsiderTradingTab ticker={ticker} />
        )}

        {activeTab === "Guru Ownership" && (
          <GuruOwnershipTab ticker={ticker} />
        )}
      </div>

      <AIFinancialAdviserChat ticker={ticker} />
    </div>
  );
}

const page = {
  wrap: { display: "flex", flexDirection: "column" },
  header: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" },
  backBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    background: "rgba(0,240,255,0.05)", border: "1px solid var(--accent-blue)",
    borderRadius: "0", color: "var(--accent-blue)", cursor: "pointer",
    fontFamily: "var(--font-mono)", fontSize: "12px", padding: "6px 12px", width: "fit-content",
    transition: "all 0.15s ease",
    textTransform: "uppercase",
  },
  tickerInfo: { display: "flex", alignItems: "baseline", gap: "12px" },
  ticker: {
    color: "var(--text-primary)", fontFamily: "var(--font-display)",
    fontSize: "30px", fontWeight: 800, letterSpacing: "-0.02em",
  },
  name: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 300 },
  price: { color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 500, marginLeft: "auto" },
  change: { fontFamily: "var(--font-mono)", fontSize: "12px", padding: "3px 8px", borderRadius: "0", border: "1px solid currentColor" },
  content: { display: "flex", flexDirection: "column" },
  skeleton: { display: "flex", flexDirection: "column", gap: "12px", padding: "40px 0" },
  skelBar: {
    height: "20px", background: "rgba(0,240,255,0.05)",
    borderRadius: "0", animation: "pulse 1.5s ease-in-out infinite",
  },
  error: {
    color: "var(--accent-red)", fontFamily: "var(--font-body)",
    fontSize: "13px", padding: "40px 0", textAlign: "center",
  },
};
