import { useState } from "react";
import { useStockDetail, useDCF } from "../hooks/useStockData";
import DCFAnalysis from "./DCFAnalysis";
import InsiderTradingTab from "./InsiderTradingTab";
import ComparablesTab from "./ComparablesTab";
import { RevenueChart, MarginsChart, CashFlowChart } from "./Charts";
import { formatPrice, formatMarketCap, formatPercent, formatMultiple, formatRevenue, isPositive } from "../utils/formatters";

const TABS = ["DCF", "Financials", "Insider Activity", "Comparables"];

function StatBox({ label, value, sub, positive }) {
  return (
    <div style={sbox.box}>
      <span style={sbox.label}>{label}</span>
      <span style={{
        ...sbox.value,
        color: positive === true ? "var(--accent-green)" : positive === false ? "var(--accent-red)" : "var(--text-primary)",
      }}>
        {value}
      </span>
      {sub && <span style={sbox.sub}>{sub}</span>}
    </div>
  );
}

const sbox = {
  box: {
    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "4px",
  },
  label: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "10px", fontWeight: 400, letterSpacing: "0.06em", textTransform: "uppercase",
  },
  value: { fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 500 },
  sub: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "10px" },
};

function TabBar({ active, onChange }) {
  return (
    <div style={tab.bar}>
      {TABS.map((tabName) => (
        <button
          key={tabName}
          style={{ ...tab.tab, ...(active === tabName ? tab.active : {}) }}
          onClick={() => onChange(tabName)}
        >
          {tabName}
        </button>
      ))}
    </div>
  );
}

const tab = {
  bar: { display: "flex", gap: "0", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "24px" },
  tab: {
    background: "transparent", border: "none", cursor: "pointer",
    fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 600,
    letterSpacing: "0.06em", padding: "10px 16px", textTransform: "uppercase",
    color: "var(--text-secondary)", borderBottom: "2px solid transparent",
  },
  active: { color: "var(--accent-blue)", borderBottom: "2px solid var(--accent-blue)" },
};

function Section({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3 style={sec.title}>{title}</h3>
      {children}
    </div>
  );
}

const sec = {
  title: {
    color: "var(--text-secondary)", fontFamily: "var(--font-display)",
    fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em",
    textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px",
  },
};

export default function StockAnalysisPage({ ticker, currentPrice, onBack }) {
  const [activeTab, setActiveTab] = useState("DCF");
  const { data, loading, error } = useStockDetail(ticker);
  const { data: dcfData, loading: dcfLoading, refetch: dcfRefetch } = useDCF(ticker);

  const summary = data?.summary;
  const financials = data?.financials;
  const balance = data?.balanceSheet;

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

        {activeTab === "Financials" && data && (
          <div style={page.sections}>
            <Section title="Valuation">
              <div style={page.statsGrid}>
                <StatBox label="Market Cap" value={formatMarketCap(summary?.marketCap)} />
                <StatBox label="P/E (TTM)" value={formatMultiple(summary?.trailingPE)} />
                <StatBox label="Forward P/E" value={formatMultiple(summary?.forwardPE)} />
                <StatBox label="EV/EBITDA" value={formatMultiple(summary?.enterpriseToEbitda)} />
                <StatBox label="P/B" value={formatMultiple(summary?.priceToBook)} />
                <StatBox label="PEG Ratio" value={formatMultiple(summary?.pegRatio)} />
              </div>
            </Section>

            <Section title="Profitability">
              <div style={page.statsGrid}>
                <StatBox label="Gross Margin" value={formatPercent(financials?.grossMargins)} positive={financials?.grossMargins > 0.3} />
                <StatBox label="Operating Margin" value={formatPercent(financials?.operatingMargins)} positive={financials?.operatingMargins > 0.1} />
                <StatBox label="Net Margin" value={formatPercent(financials?.profitMargins)} positive={financials?.profitMargins > 0} />
                <StatBox label="ROE" value={formatPercent(financials?.returnOnEquity)} positive={financials?.returnOnEquity > 0.15} />
                <StatBox label="ROA" value={formatPercent(financials?.returnOnAssets)} positive={financials?.returnOnAssets > 0.05} />
                <StatBox label="Revenue Growth" value={formatPercent(financials?.revenueGrowth)} positive={financials?.revenueGrowth > 0} />
              </div>
              <MarginsChart annualIncome={financials?.annualIncome} />
            </Section>

            <Section title="Revenue & Earnings">
              <div style={page.statsGrid}>
                <StatBox label="Total Revenue" value={formatRevenue(financials?.totalRevenue)} />
                <StatBox label="Earnings Growth" value={formatPercent(financials?.earningsGrowth)} positive={financials?.earningsGrowth > 0} />
                <StatBox label="EPS Est. (This Yr)" value={financials?.estimates?.currentYear != null ? `$${financials.estimates.currentYear.toFixed(2)}` : "—"} />
                <StatBox label="EPS Est. (Next Yr)" value={financials?.estimates?.nextYear != null ? `$${financials.estimates.nextYear.toFixed(2)}` : "—"} />
              </div>
              <RevenueChart annualIncome={financials?.annualIncome} />
            </Section>

            <Section title="Balance Sheet & Cash Flow">
              <div style={page.statsGrid}>
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

        {activeTab === "Insider Activity" && (
          <InsiderTradingTab ticker={ticker} />
        )}

        {activeTab === "Comparables" && (
          <ComparablesTab ticker={ticker} />
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
  sections: { display: "flex", flexDirection: "column", gap: "32px" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" },
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
