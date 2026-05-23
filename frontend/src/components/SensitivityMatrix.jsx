import React from "react";
import { formatPrice } from "../utils/formatters";

export default function SensitivityMatrix({ params, currentPrice }) {
  if (!params) return null;

  const {
    fcf,
    wacc: baseWacc,
    projectionGrowth: baseGrowth,
    terminalGrowth = 0.025,
    sharesOutstanding: shares,
    cash,
    debt
  } = params;

  // Centered WACC values (-2%, -1%, base, +1%, +2%)
  const waccValues = [
    baseWacc - 0.02,
    baseWacc - 0.01,
    baseWacc,
    baseWacc + 0.01,
    baseWacc + 0.02,
  ];

  // Centered FCF growth rates (-2%, -1%, base, +1%, +2%)
  const growthValues = [
    baseGrowth - 0.02,
    baseGrowth - 0.01,
    baseGrowth,
    baseGrowth + 0.01,
    baseGrowth + 0.02,
  ];

  // Projects FCF and returns calculated fair value or null if invalid inputs
  const calculateFairValue = (w, g) => {
    if (w <= terminalGrowth) return null; // Avoid division by zero
    let f = Math.max(fcf || 0, 0);
    let pvFCF = 0;
    const years = 5;
    for (let t = 1; t <= years; t++) {
      f = f * (1 + g);
      pvFCF += f / Math.pow(1 + w, t);
    }
    const terminalValue = (f * (1 + terminalGrowth)) / (w - terminalGrowth);
    const pvTerminal = terminalValue / Math.pow(1 + w, years);
    const enterpriseValue = pvFCF + pvTerminal;
    const equityValue = enterpriseValue + (cash || 0) - (debt || 0);
    return shares > 0 ? equityValue / shares : 0;
  };

  const baselineFairValue = calculateFairValue(baseWacc, baseGrowth) || 0;

  return (
    <div style={sxStyles.wrap}>
      <div style={sxStyles.title}>SENSITIVITY MATRIX</div>
      <div style={sxStyles.subtitle}>WACC vs FCF Growth Rate (Hover cells to highlight assumptions)</div>
      <div style={sxStyles.grid}>
        <div style={{ ...sxStyles.cell, ...sxStyles.cornerCell }}>WACC \ Growth</div>
        {growthValues.map((g) => (
          <div key={`h-${g}`} style={{ ...sxStyles.cell, ...sxStyles.headerCell }}>
            {(g * 100).toFixed(1)}%
          </div>
        ))}
        {waccValues.map((w) => (
          <div key={`row-${w}`} style={{ display: "contents" }}>
            <div style={{ ...sxStyles.cell, ...sxStyles.headerCell }}>{(w * 100).toFixed(1)}%</div>
            {growthValues.map((g) => {
              const fairValue = calculateFairValue(w, g);
              if (fairValue === null) {
                return (
                  <div
                    key={`${w}-${g}`}
                    style={{ ...sxStyles.cell, background: "rgba(255,255,255,0.01)" }}
                    title={`WACC: ${(w * 100).toFixed(1)}% | Growth: ${(g * 100).toFixed(1)}% | Invalid configuration (WACC <= Terminal Growth)`}
                  >
                    N/A
                  </div>
                );
              }

              const isBaseCell = w.toFixed(4) === baseWacc.toFixed(4) && g.toFixed(4) === baseGrowth.toFixed(4);

              // Calculate deviations:
              // 1. Relative to baseline model output (for visual heatmap gradient)
              const baseDeviation = baselineFairValue > 0 ? (fairValue - baselineFairValue) / baselineFairValue : 0;
              // 2. Relative to actual market price (for investor information)
              const marketDeviation = currentPrice > 0 ? (fairValue - currentPrice) / currentPrice : 0;

              // Color cell depending on deviation from baseline assumptions
              let cellBg = "rgba(255,255,255,0.03)";
              if (baseDeviation > 0.0001) {
                cellBg = `rgba(0, 229, 160, ${Math.min(0.05 + baseDeviation * 0.5, 0.45)})`;
              } else if (baseDeviation < -0.0001) {
                cellBg = `rgba(255, 77, 109, ${Math.min(0.05 + Math.abs(baseDeviation) * 0.5, 0.45)})`;
              } else {
                cellBg = "rgba(255, 255, 255, 0.08)"; // Distinct background for baseline cell
              }

              // Create informative hover tooltip
              const basePct = (baseDeviation * 100).toFixed(1);
              const marketPct = (marketDeviation * 100).toFixed(1);
              const tooltip = [
                `WACC: ${(w * 100).toFixed(1)}% | Growth: ${(g * 100).toFixed(1)}%`,
                `Fair Value: ${formatPrice(fairValue)}`,
                isBaseCell 
                  ? `[BASELINE ASSUMPTIONS]` 
                  : `${baseDeviation >= 0 ? "+" : ""}${basePct}% vs Baseline`,
                currentPrice > 0 
                  ? `${marketDeviation >= 0 ? "+" : ""}${marketPct}% vs Market ($${currentPrice.toFixed(2)})` 
                  : null
              ].filter(Boolean).join(" \n");

              return (
                <div
                  key={`${w}-${g}`}
                  style={{
                    ...sxStyles.cell,
                    background: cellBg,
                    border: isBaseCell ? "1px dashed var(--accent-blue)" : "1px solid transparent",
                    cursor: "help",
                    transition: "transform 0.1s ease, z-index 0.1s, border-color 0.1s",
                    color: isBaseCell ? "var(--accent-blue)" : "var(--text-primary)",
                    fontWeight: isBaseCell ? 700 : 500,
                    position: "relative"
                  }}
                  title={tooltip}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)";
                    e.currentTarget.style.zIndex = "2";
                    e.currentTarget.style.borderColor = "var(--accent-blue)";
                    e.currentTarget.style.borderStyle = "solid";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.zIndex = "auto";
                    e.currentTarget.style.borderColor = isBaseCell ? "var(--accent-blue)" : "transparent";
                    e.currentTarget.style.borderStyle = isBaseCell ? "dashed" : "solid";
                  }}
                >
                  {formatPrice(fairValue)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const sxStyles = {
  wrap: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "14px", padding: "20px",
  },
  title: {
    color: "var(--text-primary)", fontFamily: "var(--font-display)",
    fontSize: "13px", fontWeight: 600, letterSpacing: "0.02em", textTransform: "uppercase",
  },
  subtitle: {
    color: "var(--text-secondary)", fontFamily: "var(--font-body)",
    fontSize: "11px", marginTop: "4px", marginBottom: "12px",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "2px" },
  cell: {
    padding: "10px 8px", textAlign: "center", fontSize: "10px",
    fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderRadius: "4px",
    display: "flex", alignItems: "center", justifyContent: "center"
  },
  headerCell: { color: "var(--text-secondary)", fontWeight: 600, fontSize: "10px" },
  cornerCell: {
    color: "var(--text-muted)",
    fontSize: "9px",
    textTransform: "uppercase",
    fontWeight: 500,
  }
};
