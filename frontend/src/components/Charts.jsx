import { useRef, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { createChart, LineSeries } from "lightweight-charts";
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
          <Bar dataKey="Revenue" fill="#4f8dff" radius={[4, 4, 0, 0]} opacity={0.8} />
          <Bar dataKey="Net Income" fill="#00e5a0" radius={[4, 4, 0, 0]} opacity={0.8} />
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
          <Line type="monotone" dataKey="Gross Margin" stroke="#4f8dff" strokeWidth={2} dot={{ fill: "#4f8dff", r: 3 }} />
          <Line type="monotone" dataKey="Net Margin" stroke="#00e5a0" strokeWidth={2} dot={{ fill: "#00e5a0", r: 3 }} />
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
          <Bar dataKey="Operating CF" fill="#ffb547" radius={[4, 4, 0, 0]} opacity={0.8} />
          <Bar dataKey="Free CF" fill="#00e5a0" radius={[4, 4, 0, 0]} opacity={0.8} />
          <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#5a6a80", paddingTop: "8px" }} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// Price History Chart using Lightweight Charts (TradingView)
export function PriceChart({ data, ticker }) {
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let resizeObserver = null;

    const formattedData = (data || [])
      .filter((d) => d?.date && Number.isFinite(d.close))
      .map((d) => ({
        time: d.date,
        value: d.close,
      }));

    const createPriceChart = () => {
      if (!container || container.clientWidth === 0 || chartRef.current) return;

      try {
        const chart = createChart(container, {
          layout: {
            background: { type: "solid", color: "transparent" },
            textColor: "#5a6a80",
          },
          grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
          },
          width: container.clientWidth,
          height: 400,
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
          },
        });

        chartRef.current = chart;

        const isUp = formattedData.length > 1
          ? formattedData[formattedData.length - 1].value >= formattedData[0].value
          : true;

        const lineSeries = chart.addSeries(LineSeries, {
          color: isUp ? "#00E5A0" : "#FF4976",
          lineWidth: 2,
        });

        seriesRef.current = lineSeries;
      } catch (e) {
        console.error("Error creating price chart:", e);
      }
    };

    const updateData = () => {
      if (!formattedData.length) return;
      if (!chartRef.current) {
        createPriceChart();
      }
      if (seriesRef.current) {
        seriesRef.current.setData(formattedData);
        chartRef.current?.timeScale().fitContent();
      }
    };

    const handleResize = () => {
      try {
        if (container.clientWidth > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width: container.clientWidth });
        }
      } catch (e) {
        console.error("Error handling resize:", e);
      }
    };

    // Initialize chart and data
    updateData();

    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      try {
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        seriesRef.current = null;
      } catch (e) {
        console.error("Error cleaning up chart:", e);
      }
    };
  }, [data, ticker]);

  if (!data?.length) return null;

  return (
    <ChartContainer title={`${ticker} Price History`}>
      <div ref={containerRef} style={{ width: "100%", height: "400px" }} />
    </ChartContainer>
  );
}
