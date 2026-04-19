import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { formatRevenue, formatPercent, formatYear } from "../utils/formatters";

const TOOLTIP_STYLE = {
  background: "rgba(9,13,23,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  padding: "10px 14px",
};

function ChartContainer({ title, subtitle, children }) {
  return (
    <div style={containerStyles.wrap}>
      <div style={containerStyles.header}>
        <span style={containerStyles.title}>{title}</span>
        {subtitle && <span style={containerStyles.subtitle}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

const containerStyles = {
  wrap: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "14px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  title: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  subtitle: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
  },
};

// Annual Revenue & Net Income Bar Chart
export function RevenueChart({ annualIncome }) {
  const data = [...(annualIncome || [])]
    .reverse()
    .map((y) => ({
      year: formatYear(y.date),
      Revenue: y.totalRevenue,
      "Net Income": y.netIncome,
    }));

  if (!data.length) return null;

  return (
    <ChartContainer title="Revenue & Net Income" subtitle="Annual">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barGap={4} barSize={18}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="year" tick={{ fill: "#5a6a80", fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatRevenue(v)} tick={{ fill: "#5a6a80", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => formatRevenue(v)}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Bar dataKey="Revenue" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} opacity={0.8} />
          <Bar dataKey="Net Income" fill="var(--accent-green)" radius={[4, 4, 0, 0]} opacity={0.8} />
          <Legend
            wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#5a6a80", paddingTop: "8px" }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// Margin Trend Line Chart
export function MarginsChart({ annualIncome }) {
  const data = [...(annualIncome || [])]
    .reverse()
    .map((y) => ({
      year: formatYear(y.date),
      "Gross Margin": y.grossMargin != null ? +(y.grossMargin * 100).toFixed(1) : null,
      "Net Margin": y.netMargin != null ? +(y.netMargin * 100).toFixed(1) : null,
    }));

  if (!data.length) return null;

  return (
    <ChartContainer title="Profit Margins" subtitle="% of revenue">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="year" tick={{ fill: "#5a6a80", fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: "#5a6a80", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => `${v}%`}
          />
          <Line type="monotone" dataKey="Gross Margin" stroke="var(--accent-blue)" strokeWidth={2} dot={{ fill: "var(--accent-blue)", r: 3 }} />
          <Line type="monotone" dataKey="Net Margin" stroke="var(--accent-green)" strokeWidth={2} dot={{ fill: "var(--accent-green)", r: 3 }} />
          <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#5a6a80", paddingTop: "8px" }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// Free Cash Flow Bar Chart
export function CashFlowChart({ annualCashFlow }) {
  const data = [...(annualCashFlow || [])]
    .reverse()
    .map((y) => ({
      year: formatYear(y.date),
      "Operating CF": y.operatingCashFlow,
      "Free CF": y.freeCashFlow,
    }));

  if (!data.length) return null;

  return (
    <ChartContainer title="Cash Flow" subtitle="Annual">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barGap={4} barSize={18}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="year" tick={{ fill: "#5a6a80", fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatRevenue(v)} tick={{ fill: "#5a6a80", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => formatRevenue(v)}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Bar dataKey="Operating CF" fill="var(--accent-amber)" radius={[4, 4, 0, 0]} opacity={0.8} />
          <Bar dataKey="Free CF" fill="var(--accent-green)" radius={[4, 4, 0, 0]} opacity={0.8} />
          <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#5a6a80", paddingTop: "8px" }} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// Price History Line Chart
export function PriceChart({ data, ticker }) {
  if (!data?.length) return null;

  const min = Math.min(...data.map((d) => d.close)) * 0.98;
  const max = Math.max(...data.map((d) => d.close)) * 1.02;
  const isUp = data[data.length - 1]?.close >= data[0]?.close;

  return (
    <ChartContainer title={`${ticker} Price History`}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#5a6a80", fontSize: 10, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            interval={Math.floor(data.length / 5)}
            tickFormatter={(v) => v?.slice(0, 7)}
          />
          <YAxis
            domain={[min, max]}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
            tick={{ fill: "#5a6a80", fontSize: 10, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [`$${v.toFixed(2)}`, "Close"]}
            labelStyle={{ color: "#5a6a80", marginBottom: "4px" }}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke={isUp ? "var(--accent-green)" : "var(--accent-red)"}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
