import React from "react";
import { motion } from "framer-motion";
import MetricCard from "./MetricCard.jsx";
import { useMarketIndicators, useSectorRotation } from "../hooks/useStockData.js";
import SectorHero from "./SectorHero.jsx";
import SectorSignalsGuide from "./SectorSignalsGuide.jsx";
import SectorLeaderboard from "./SectorLeaderboard.jsx";
import {
  getVixInterpretation,
  getFedInterpretation,
  getMarginDebtInterpretation,
  getCreditSpreadInterpretation,
  getInflationInterpretation,
  getAAIIInterpretation,
  getBalanceSheetInterpretation,
  getTreasuryYieldInterpretation,
  getYieldCurveInterpretation,
  getConsumerSentimentInterpretation,
  getUnemploymentInterpretation,
} from "../utils/interpretations.js";
import { formatMarketCap } from "../utils/formatters.js";

const styles = {
  categorySection: {
    marginBottom: "32px",
  },
  categoryHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "16px",
    paddingBottom: "10px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  categoryIcon: {
    fontSize: "18px",
    lineHeight: 1,
  },
  categoryTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
    letterSpacing: "0.02em",
  },
  categoryDescription: {
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    color: "var(--text-secondary)",
    margin: 0,
    marginLeft: "auto",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
    gap: "16px",
  },
  sectorTopRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginBottom: "24px",
  },
  loadingCard: {
    background: "var(--glass-bg)",
    borderRadius: "12px",
    padding: "20px",
    height: "200px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-secondary)",
  },
  errorCard: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(12px)",
    border: "1px solid var(--accent-red)",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    justifyContent: "center",
  },
};

function CategorySection({ icon, title, description, children }) {
  return (
    <div style={styles.categorySection}>
      <div style={styles.categoryHeader}>
        <span style={styles.categoryIcon}>{icon}</span>
        <h3 style={styles.categoryTitle}>{title}</h3>
        {description && <span style={styles.categoryDescription}>{description}</span>}
      </div>
      <div style={styles.cardGrid}>{children}</div>
    </div>
  );
}

const LoadingSkeleton = () => (
  <div style={styles.loadingCard}>
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      Loading market indicators...
    </motion.div>
  </div>
);

export default function MarketIndicatorsPage() {
  const { data, loading, error } = useMarketIndicators();
  const { data: sectorData, loading: sectorLoading } = useSectorRotation();

  if (loading) return <LoadingSkeleton />;
  if (error)
    return (
      <div style={{ color: "var(--accent-red)", padding: "20px" }}>
        Error loading indicators: {error}
      </div>
    );
  if (!data) return null;

  const {
    vix,
    fedPolicy,
    marginDebt,
    creditSpreads,
    inflation,
    aaiiSentiment,
    fedBalanceSheet,
    treasuryYield,
    yieldCurve,
    consumerSentiment,
    unemployment,
  } = data;

  // Monetary Policy
  const fedValue = fedPolicy?.currentValue;
  const fedHistory = fedPolicy?.history || [];
  const { color: fedColor, text: fedText } = getFedInterpretation(fedValue, fedHistory);

  const bsValue = fedBalanceSheet?.currentValue;
  const bsHistory = fedBalanceSheet?.history || [];
  const { color: bsColor, text: bsText } = getBalanceSheetInterpretation(bsValue, bsHistory);

  const inflationValue = inflation?.currentValue;
  const { color: inflationColor, text: inflationText } = getInflationInterpretation(inflationValue);

  // Bond Market
  const tyValue = treasuryYield?.currentValue;
  const { color: tyColor, text: tyText } = getTreasuryYieldInterpretation(tyValue);

  const ycValue = yieldCurve?.currentValue;
  const { color: ycColor, text: ycText } = getYieldCurveInterpretation(ycValue);

  const creditValue = creditSpreads?.currentValue;
  const { color: creditColor, text: creditText } = getCreditSpreadInterpretation(creditValue);

  // Market Risk
  const vixValue = vix?.currentValue;
  const { color: vixColor, text: vixText } = getVixInterpretation(vixValue);

  const marginValue = marginDebt?.currentValue;
  const marginHistory = marginDebt?.history || [];
  const { color: marginColor, text: marginText } = getMarginDebtInterpretation(marginValue, marginHistory);

  // Sentiment & Economy
  const aaiiValue = aaiiSentiment?.currentValue;
  const { color: aaiiColor, text: aaiiText } = getAAIIInterpretation(aaiiValue);

  const csValue = consumerSentiment?.currentValue;
  const { color: csColor, text: csText } = getConsumerSentimentInterpretation(csValue);

  const unempValue = unemployment?.currentValue;
  const unempHistory = unemployment?.history || [];
  const { color: unempColor, text: unempText } = getUnemploymentInterpretation(unempValue, unempHistory);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--text-primary)",
          marginBottom: "28px",
        }}
      >
        Market Indicators
      </h2>

      {/* ── Monetary Policy ──────────────────────────────────── */}
      <CategorySection
        icon="🏛️"
        title="Monetary Policy"
        description="Federal Reserve actions driving liquidity and rates"
      >
        <MetricCard
          title="Fed Funds Rate"
          currentValue={fedValue}
          chartData={fedPolicy?.history || []}
          chartType="line"
          interpretationText={fedText}
          valueFormatter={(v) => v != null ? `${v.toFixed(2)}%` : "N/A"}
          valueColor={fedColor}
        />
        <MetricCard
          title="Fed Balance Sheet (Total Assets)"
          currentValue={bsValue}
          chartData={bsHistory}
          chartType="line"
          interpretationText={bsText}
          valueFormatter={(v) => v != null ? `$${(v / 1e6).toFixed(2)}T` : "N/A"}
          valueColor={bsColor}
          yAxisTickFormatter={(v) => `${(v / 1e6).toFixed(1)}T`}
        />
        <MetricCard
          title="Inflation (Headline CPI YoY)"
          currentValue={inflationValue}
          chartData={inflation?.history || []}
          chartType="line"
          interpretationText={inflationText}
          valueFormatter={(v) => v != null ? `${v.toFixed(2)}%` : "N/A"}
          valueColor={inflationColor}
        />
      </CategorySection>

      {/* ── Bond Market ──────────────────────────────────────── */}
      <CategorySection
        icon="📈"
        title="Bond Market"
        description="Yields, curve shape, and credit conditions"
      >
        <MetricCard
          title="10-Year Treasury Yield"
          currentValue={tyValue}
          chartData={treasuryYield?.history || []}
          chartType="line"
          interpretationText={tyText}
          valueFormatter={(v) => v != null ? `${v.toFixed(2)}%` : "N/A"}
          valueColor={tyColor}
        />
        <MetricCard
          title="Yield Curve (10Y – 2Y Spread)"
          currentValue={ycValue}
          chartData={yieldCurve?.history || []}
          chartType="line"
          interpretationText={ycText}
          valueFormatter={(v) => v != null ? `${v.toFixed(2)}%` : "N/A"}
          valueColor={ycColor}
        />
        <MetricCard
          title="Credit Spreads (BofA HY OAS)"
          currentValue={creditValue}
          chartData={creditSpreads?.history || []}
          chartType="line"
          interpretationText={creditText}
          valueFormatter={(v) => v != null ? `${v.toFixed(0)}\u202Fbps` : "N/A"}
          valueColor={creditColor}
        />
      </CategorySection>

      {/* ── Market Risk & Leverage ───────────────────────────── */}
      <CategorySection
        icon="⚡"
        title="Market Risk & Leverage"
        description="Volatility and speculative positioning"
      >
        <MetricCard
          title="VIX (Volatility Index)"
          currentValue={vixValue}
          chartData={vix?.history || []}
          chartType="line"
          interpretationText={vixText}
          valueFormatter={(v) => v != null ? v.toFixed(2) : "N/A"}
          valueColor={vixColor}
        />
        <MetricCard
          title="FINRA Margin Debt"
          currentValue={marginValue}
          chartData={marginDebt?.history || []}
          chartType="bar"
          interpretationText={marginText}
          valueFormatter={(v) => v != null ? formatMarketCap(v * 1e6) : "N/A"}
          valueColor={marginColor}
          yAxisTickFormatter={(v) => `${(v / 1000).toFixed(0)}B`}
        />
      </CategorySection>

      {/* ── Sentiment & Economy ──────────────────────────────── */}
      <CategorySection
        icon="🧠"
        title="Sentiment & Economy"
        description="Consumer and investor confidence, employment"
      >
        {aaiiSentiment && aaiiSentiment.error ? (
          <div style={styles.errorCard}>
            <h4 style={{ margin: 0, color: "var(--accent-red)" }}>AAII Sentiment Error</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: "1.5" }}>
              {aaiiSentiment.error}
            </p>
          </div>
        ) : aaiiSentiment ? (
          <MetricCard
            title="AAII Sentiment (Bull-Bear Spread)"
            currentValue={aaiiValue}
            chartData={aaiiSentiment.history?.map(h => ({ date: h.date, value: h.spread })) || []}
            chartType="line"
            interpretationText={aaiiText}
            valueFormatter={(v) => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : "N/A"}
            valueColor={aaiiColor}
          />
        ) : null}
        <MetricCard
          title="Consumer Sentiment (UMich)"
          currentValue={csValue}
          chartData={consumerSentiment?.history || []}
          chartType="line"
          interpretationText={csText}
          valueFormatter={(v) => v != null ? v.toFixed(1) : "N/A"}
          valueColor={csColor}
        />
        <MetricCard
          title="Unemployment Rate"
          currentValue={unempValue}
          chartData={unempHistory}
          chartType="line"
          interpretationText={unempText}
          valueFormatter={(v) => v != null ? `${v.toFixed(1)}%` : "N/A"}
          valueColor={unempColor}
        />
      </CategorySection>

      {/* ── Sector Rotation ──────────────────────────────────── */}
      <CategorySection
        icon="🔄"
        title="Sector Rotation"
        description="Current market theme and sector momentum"
      >
        {sectorLoading ? (
          <div style={{ color: "var(--text-secondary)", padding: "20px" }}>
            Loading sector rotation data...
          </div>
        ) : sectorData?.topSector ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={styles.sectorTopRow}>
              <SectorHero sector={sectorData.topSector} />
              <SectorSignalsGuide />
            </div>
            <SectorLeaderboard sectors={sectorData.rankedSectors} />
          </div>
        ) : null}
      </CategorySection>
    </motion.div>
  );
}