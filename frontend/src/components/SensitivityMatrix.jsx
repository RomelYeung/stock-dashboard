import React from "react";
import { formatPrice } from "../utils/formatters";

const MATRIX_ADJUSTMENTS = [-0.02, -0.01, 0, 0.01, 0.02];

export default function SensitivityMatrix({ params, sensitivity, currentPrice }) {
  if (!params || !sensitivity) return null;

  const { wacc: baseWacc, projectionGrowth: baseGrowth } = params;
  const growthLabel = params.projectionMethod === "driver-fcff" ? "Revenue Growth" : "FCF Growth";
  const waccIndexes = MATRIX_ADJUSTMENTS.map((adjustment) =>
    sensitivity.waccAdjustments.findIndex((value) => Math.abs(value - adjustment) < 1e-9)
  );
  const growthIndexes = MATRIX_ADJUSTMENTS.map((adjustment) =>
    sensitivity.growthAdjustments.findIndex((value) => Math.abs(value - adjustment) < 1e-9)
  );
  const baselineFairValue = sensitivity.values?.[waccIndexes[2]]?.[growthIndexes[2]] ?? 0;

  return (
    <div style={sxStyles.wrap}>
      <div style={sxStyles.title}>SENSITIVITY MATRIX</div>
      <div style={sxStyles.subtitle}>WACC vs {sensitivity.projectionYears}-Year {growthLabel} Rate (Hover cells to highlight assumptions)</div>
      <div style={sxStyles.grid}>
        <div style={{ ...sxStyles.cell, ...sxStyles.cornerCell }}>WACC \ {growthLabel}</div>
        {MATRIX_ADJUSTMENTS.map((adjustment) => (
          <div key={`h-${adjustment}`} style={{ ...sxStyles.cell, ...sxStyles.headerCell }}>
            {((baseGrowth + adjustment) * 100).toFixed(1)}%
          </div>
        ))}
        {MATRIX_ADJUSTMENTS.map((waccAdjustment, row) => {
          const w = baseWacc + waccAdjustment;
          return (
            <div key={`row-${waccAdjustment}`} style={{ display: "contents" }}>
              <div style={{ ...sxStyles.cell, ...sxStyles.headerCell }}>{(w * 100).toFixed(1)}%</div>
              {MATRIX_ADJUSTMENTS.map((growthAdjustment, column) => {
                const g = baseGrowth + growthAdjustment;
                const fairValue = sensitivity.values?.[waccIndexes[row]]?.[growthIndexes[column]] ?? null;
                if (fairValue == null) {
                  return (
                    <div
                      key={`${waccAdjustment}-${growthAdjustment}`}
                      style={{ ...sxStyles.cell, background: "rgba(255,255,255,0.01)" }}
                      title={`WACC: ${(w * 100).toFixed(1)}% | ${growthLabel}: ${(g * 100).toFixed(1)}% | Unavailable (WACC must exceed terminal growth)`}
                    >
                      N/A
                    </div>
                  );
                }

                const isBaseCell = waccAdjustment === 0 && growthAdjustment === 0;

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
                  `WACC: ${(w * 100).toFixed(1)}% | ${growthLabel}: ${(g * 100).toFixed(1)}%`,
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
                    key={`${waccAdjustment}-${growthAdjustment}`}
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
          );
        })}
      </div>
    </div>
  );
}

const sxStyles = {
  wrap: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "0", padding: "20px",
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
    padding: "10px 8px", textAlign: "center", fontSize: "11px",
    fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderRadius: "0",
    display: "flex", alignItems: "center", justifyContent: "center"
  },
  headerCell: { color: "var(--text-secondary)", fontWeight: 600, fontSize: "11px" },
  cornerCell: {
    color: "var(--text-muted)",
    fontSize: "11px",
    textTransform: "uppercase",
    fontWeight: 500,
  }
};
