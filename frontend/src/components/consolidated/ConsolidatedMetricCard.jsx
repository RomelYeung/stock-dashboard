import React, { useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

function getVerdictColor(isFavorable) {
  if (isFavorable == null) return "var(--text-secondary)";
  return isFavorable ? "var(--accent-green)" : "var(--accent-red)";
}

export default function ConsolidatedMetricCard({
  label,
  value,
  valueColor,
  peerValue,
  peerDelta,
  peerVerdict,
  isFavorable,
  sparklineData,
  sparklineColor,
  isHighlighted,
  onClick,
}) {
  const [isHovered, setIsHovered] = useState(false);

  const hasPeer = peerValue != null;
  const hasSparkline = sparklineData && sparklineData.length >= 2;
  const hasVerdict = peerVerdict != null;

  const verdictColor = getVerdictColor(isFavorable);

  // Parse numeric values for bar positioning
  const stockNum = parseFloat(value);
  const peerNum = peerValue != null ? parseFloat(peerValue) : null;
  const canPosition = !isNaN(stockNum) && peerNum != null && !isNaN(peerNum);

  let stockPercent = 50;
  let peerPercent = 50;
  if (canPosition) {
    const maxVal = Math.max(stockNum, peerNum) * 1.4;
    stockPercent = Math.min((stockNum / maxVal) * 100, 92);
    peerPercent = Math.min((peerNum / maxVal) * 100, 92);
  } else if (peerDelta != null) {
    // Fallback: position using delta when values aren't parseable
    peerPercent = 40;
    stockPercent = Math.min(peerPercent * (1 + Math.abs(peerDelta)) + 5, 92);
    if (peerDelta < 0) {
      const tmp = stockPercent;
      stockPercent = peerPercent;
      peerPercent = tmp;
    }
  }

  const barColor =
    isFavorable == null
      ? "var(--accent-blue)"
      : isFavorable
        ? "var(--accent-green)"
        : "var(--accent-red)";

  // Sparkline data
  const chartData = hasSparkline ? sparklineData.map((d, i) => ({ v: d, i })) : [];

  return (
    <div
      style={{
        background: isHighlighted
          ? "rgba(79,141,255,0.05)"
          : isHovered
            ? "rgba(255,255,255,0.04)"
            : "rgba(255,255,255,0.025)",
        border: isHovered
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid rgba(255,255,255,0.06)",
        borderLeft: isHighlighted ? "3px solid var(--accent-blue)" : undefined,
        borderRadius: "12px",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        transition:
          "border-color 0.2s ease, background 0.2s ease, transform 0.15s ease",
        transform: isHovered ? "translateY(-1px)" : "translateY(0)",
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Row 1: Label + Verdict pill */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "10px",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
        {hasVerdict && (
          <span
            style={{
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "9px",
              fontFamily: "var(--font-body)",
              background:
                isFavorable == null
                  ? "rgba(255,255,255,0.06)"
                  : isFavorable
                    ? "rgba(0,229,160,0.12)"
                    : "rgba(255,77,109,0.12)",
              color: verdictColor,
            }}
          >
            {peerVerdict}
          </span>
        )}
      </div>

      {/* Row 2: "This Stock" label + main value */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "9px",
            color: "var(--text-secondary)",
          }}
        >
          This Stock
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "16px",
            fontWeight: 700,
            color: valueColor || "var(--text-primary)",
          }}
        >
          {value}
        </span>
      </div>

      {/* Row 3: Peer comparison bar */}
      {hasPeer && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              flex: 1,
              height: "4px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "2px",
              position: "relative",
            }}
          >
            {/* Peer average marker */}
            <div
              style={{
                position: "absolute",
                left: `${peerPercent}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "2px",
                height: "10px",
                background: "var(--text-secondary)",
                opacity: 0.5,
              }}
            />
            {/* Stock value marker */}
            <div
              style={{
                position: "absolute",
                left: `${stockPercent}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: barColor,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            {peerValue}
          </span>
        </div>
      )}

      {/* Row 4: Sparkline trend */}
      {hasSparkline && (
        <div
          style={{
            height: "24px",
            width: "100%",
            opacity: isHovered ? 1 : 0.8,
            transition: "opacity 0.2s ease",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={sparklineColor || "var(--accent-blue)"}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Row 5: Verdict text */}
      {hasVerdict && (
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "10px",
            color: verdictColor,
            fontStyle: "italic",
          }}
        >
          {peerVerdict}
        </span>
      )}
    </div>
  );
}
