import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Cell, Tooltip,
} from "recharts";
import { formatPrice } from "../utils/formatters";

const TOOLTIP_STYLE = {
  background: "rgba(9,13,23,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  padding: "10px 14px",
};

export default function MonteCarloChart({ histogram, bear, base, bull, currentPrice }) {
  if (!histogram?.length) return null;

  const colorScale = (val) => {
    if (val <= bear) return "var(--accent-red)";
    if (val <= base) return "var(--accent-amber)";
    return "var(--accent-green)";
  };

  return (
    <div style={mcStyles.wrap}>
      <div style={mcStyles.header}>
        <span style={mcStyles.title}>MONTE CARLO DISTRIBUTION</span>
        <span style={mcStyles.subtitle}>
          {histogram.reduce((s, d) => s + d.count, 0)} simulations
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={histogram} barGap={0} barCategoryGap={1}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" />
          <XAxis
            dataKey="bin"
            tickFormatter={(v) => formatPrice(v)}
            tick={{ fill: "#5a6a80", fontSize: 10, fontFamily: "var(--font-mono)" }}
            axisLine={false} tickLine={false} interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(count, _, entry) => [count, `${formatPrice(entry.payload.bin)}`]}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={30}>
            {histogram.map((entry, index) => (
              <Cell key={index} fill={colorScale(entry.bin)} opacity={0.6} />
            ))}
          </Bar>
          {bear != null && (
            <ReferenceLine x={bear} stroke="var(--accent-red)" strokeWidth={1.5} strokeDasharray="4 4"
              label={{ value: `Bear $${bear}`, fill: "var(--accent-red)", fontSize: 9, position: "top" }} />
          )}
          {base != null && (
            <ReferenceLine x={base} stroke="var(--accent-amber)" strokeWidth={1.5} strokeDasharray="4 4"
              label={{ value: `Base $${base}`, fill: "var(--accent-amber)", fontSize: 9, position: "top" }} />
          )}
          {bull != null && (
            <ReferenceLine x={bull} stroke="var(--accent-green)" strokeWidth={1.5} strokeDasharray="4 4"
              label={{ value: `Bull $${bull}`, fill: "var(--accent-green)", fontSize: 9, position: "top" }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const mcStyles = {
  wrap: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "14px", padding: "20px",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" },
  title: {
    color: "var(--text-primary)", fontFamily: "var(--font-display)",
    fontSize: "13px", fontWeight: 600, letterSpacing: "0.02em", textTransform: "uppercase",
  },
  subtitle: { color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px" },
};
