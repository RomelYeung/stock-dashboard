import React, { useMemo } from "react";
import {
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import { formatPercent, formatPrice, formatMultiple } from "../utils/formatters.js";

const styles = {
  card: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(12px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    boxShadow: "none",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
    lineHeight: 1.4,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  value: {
    fontFamily: "var(--font-mono)",
    fontSize: "20px",
    fontWeight: 700,
    margin: 0,
    flexShrink: 0,
    lineHeight: 1.2,
  },
  interpretation: {
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    color: "var(--text-secondary)",
    lineHeight: 1.4,
    margin: 0,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "6px",
  },
  chartContainer: {
    height: "250px",
    width: "100%",
    overflow: "hidden",
  },
};

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        style={{
          background: "rgba(9,13,23,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          padding: "8px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: "var(--text-primary)",
        }}
      >
        <p style={{ margin: 0 }}>{label}</p>
        <p style={{ margin: 0, color: "#4f8dff" }}>
          {payload[0].value.toFixed(2)}
        </p>
      </div>
    );
  };

export default function MetricCard({
  title,
  currentValue,
  chartData = [],
  chartType = "line",
  interpretationText,
  valueFormatter = (v) => (v != null ? v.toFixed(2) : "N/A"),
  valueColor,
  yAxisTickFormatter,
}) {
  const chart = useMemo(() => {
    if (!chartData.length) return null;

    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 5, left: 5, bottom: 5 },
    };

    const axisStyle = {
      tick: { fill: "#5a6a80", fontSize: 10 },
      axisLine: { stroke: "rgba(255,255,255,0.06)" },
      tickLine: { stroke: "rgba(255,255,255,0.06)" },
    };

    if (chartType === "line") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => d.slice(5)}
              {...axisStyle}
            />
            <YAxis {...axisStyle} tickFormatter={yAxisTickFormatter} width={45} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#4f8dff"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#4f8dff" }}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => d.slice(5)}
              {...axisStyle}
            />
              <YAxis {...axisStyle} tickFormatter={yAxisTickFormatter} width={45} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill="#4f8dff" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }, [chartData, chartType]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}
      transition={{ duration: 0.3 }}
      style={styles.card}
    >
      <div style={styles.header}>
        <h3 style={styles.title}>{title}</h3>
        <p
          style={{
            ...styles.value,
            color: valueColor || "var(--text-primary)",
          }}
        >
          {valueFormatter(currentValue)}
        </p>
      </div>

      {chartData.length > 0 && (
        <div style={styles.chartContainer}>{chart}</div>
      )}

      {interpretationText && (
        <p style={styles.interpretation}>{interpretationText}</p>
      )}
    </motion.div>
  );
}