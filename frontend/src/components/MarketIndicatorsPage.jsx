import React, { useMemo } from "react";
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
} from "../utils/interpretations.js";
import { formatMarketCap } from "../utils/formatters.js";

const styles = {
  container: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
    gap: "20px",
    padding: "20px 0",
  },
  sectorTopRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginBottom: "24px",
  },
  sectorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
    margin: "20px 0",
  },
  sectorCard: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(12px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    color: "var(--text-primary)",
    margin: "20px 0",
  },
  th: {
    textAlign: "left",
    padding: "12px",
    borderBottom: "1px solid var(--glass-border)",
    color: "var(--text-secondary)",
    fontWeight: 600,
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
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
};

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
  } = data;

  const vixValue = vix?.currentValue;
  const { color: vixColor, text: vixInterpretation } = getVixInterpretation(vixValue);

  const fedValue = fedPolicy?.currentValue;
  const fedHistory = fedPolicy?.history || [];
  const { color: fedColor, text: fedInterpretation } = getFedInterpretation(fedValue, fedHistory);

  const marginValue = marginDebt?.currentValue;
  const marginHistory = marginDebt?.history || [];
  const { color: marginColor, text: marginInterpretation } = getMarginDebtInterpretation(marginValue, marginHistory);

  const creditValue = creditSpreads?.currentValue;
  const { color: creditColor, text: creditInterpretation } = getCreditSpreadInterpretation(creditValue);

  const inflationValue = inflation?.currentValue;
  const { color: inflationColor, text: inflationInterpretation } = getInflationInterpretation(inflationValue);

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
          marginBottom: "24px",
        }}
      >
        Market Indicators
      </h2>

      <div style={styles.container}>
        <MetricCard
          title="VIX (Volatility Index)"
          currentValue={vixValue}
          chartData={vix?.history || []}
          chartType="line"
          interpretationText={vixInterpretation}
          valueFormatter={(v) => (v != null ? v.toFixed(2) : "N/A")}
          valueColor={vixColor}
        />

        <MetricCard
          title="Federal Reserve Policy (Fed Funds Rate)"
          currentValue={fedValue}
          chartData={fedPolicy?.history || []}
          chartType="line"
          interpretationText={fedInterpretation}
          valueFormatter={(v) =>
            v != null ? `${v.toFixed(2)}%` : "N/A"
          }
          valueColor={fedColor}
        />

        <MetricCard
          title="FINRA Margin Debt"
          currentValue={marginValue}
          chartData={marginDebt?.history || []}
          chartType="bar"
          interpretationText={marginInterpretation}
          valueFormatter={(v) =>
            v != null ? formatMarketCap(v * 1e6) : "N/A"
          }
          valueColor={marginColor}
          yAxisTickFormatter={(v) => `${(v / 1000).toFixed(0)}B`}
        />

        <MetricCard
          title="Credit Spreads (BofA HY OAS)"
          currentValue={creditValue}
          chartData={creditSpreads?.history || []}
          chartType="line"
          interpretationText={creditInterpretation}
          valueFormatter={(v) =>
            v != null ? `${v.toFixed(0)}\u202Fbps` : "N/A"
          }
          valueColor={creditColor}
        />

        <MetricCard
          title="Inflation (Headline CPI YoY)"
          currentValue={inflationValue}
          chartData={inflation?.history || []}
          chartType="line"
          interpretationText={inflationInterpretation}
          valueFormatter={(v) =>
            v != null ? `${v.toFixed(2)}%` : "N/A"
          }
          valueColor={inflationColor}
        />
      </div>

      {/* Sector Rotation */}
      <h3
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--text-primary)",
          margin: "32px 0 16px",
        }}
      >
        Sector Rotation (Current Market Theme)
      </h3>
      {sectorLoading ? (
        <div style={{ color: "var(--text-secondary)", padding: "20px" }}>
          Loading sector rotation data...
        </div>
      ) : sectorData?.topSector ? (
        <>
          <div style={styles.sectorTopRow}>
            <SectorHero sector={sectorData.topSector} />
            <SectorSignalsGuide />
          </div>
          <SectorLeaderboard sectors={sectorData.rankedSectors} />
        </>
      ) : null}

    </motion.div>
  );
}