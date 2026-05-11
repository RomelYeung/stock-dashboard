import { useRef, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts";
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

// Price History Chart — 3 synced panes (candlestick + volume + RSI)
export function PriceChart({ data, ticker }) {
  const priceRef = useRef(null);
  const volumeRef = useRef(null);
  const rsiRef = useRef(null);

  useEffect(() => {
    if (!priceRef.current || !data?.length) return;

    const commonChartOpts = (height) => ({
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "#5a6a80",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      width: priceRef.current.clientWidth,
      height,
      crosshair: { mode: 0 },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        visible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
      },
    });

    const formattedData = data
      .filter((d) => d?.date && Number.isFinite(d.close))
      .map((d) => ({
        time: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }));

    if (!formattedData.length) return;

    // --- Pane 1: Candlestick + SMA 50 ---
    const priceChart = createChart(priceRef.current, commonChartOpts(320));
    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: "#00E5A0",
      downColor: "#FF4976",
      borderUpColor: "#00E5A0",
      borderDownColor: "#FF4976",
      wickUpColor: "#00E5A0",
      wickDownColor: "#FF4976",
    });
    candleSeries.setData(formattedData.map((d) => ({
      time: d.time, open: d.open, high: d.high, low: d.low, close: d.close,
    })));

    const sma50Data = [];
    for (let i = 49; i < formattedData.length; i++) {
      const slice = formattedData.slice(i - 49, i + 1);
      const avg = slice.reduce((s, d) => s + d.close, 0) / slice.length;
      sma50Data.push({ time: formattedData[i].time, value: avg });
    }
    if (sma50Data.length) {
      const smaSeries = priceChart.addSeries(LineSeries, {
        color: "rgba(255,181,71,0.5)",
        lineWidth: 1,
      });
      smaSeries.setData(sma50Data);
    }
    priceChart.timeScale().fitContent();

    // --- Pane 2: Volume ---
    const volumeChart = createChart(volumeRef.current, commonChartOpts(80));
    volumeChart.timeScale().applyOptions({ visible: false });
    volumeChart.priceScale("right").applyOptions({ visible: false });
    const volumeSeries = volumeChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
    });
    volumeSeries.setData(formattedData.map((d, i) => {
      const prev = formattedData[i - 1];
      const isUp = prev ? d.close >= prev.close : true;
      return {
        time: d.time,
        value: d.volume,
        color: isUp ? "rgba(0,229,160,0.35)" : "rgba(255,73,118,0.35)",
      };
    }));
    volumeChart.timeScale().fitContent();

    // --- Pane 3: RSI ---
    const closes = formattedData.map((d) => d.close);
    const rsiData = calcRSI(closes, formattedData);

    const rsiChart = createChart(rsiRef.current, commonChartOpts(90));
    rsiChart.timeScale().applyOptions({ visible: true });
    rsiChart.priceScale("right").applyOptions({
      visible: true,
      autoScale: true,
    });

    if (rsiData.length) {
      const rsiLine = rsiChart.addSeries(LineSeries, {
        color: "#4f8dff",
        lineWidth: 1.5,
      });
      rsiLine.setData(rsiData);

      const overbought = rsiChart.addSeries(LineSeries, {
        color: "rgba(255,77,109,0.25)",
        lineWidth: 1,
        lineStyle: 2,
      });
      overbought.setData([{ time: rsiData[0].time, value: 70 }, { time: rsiData[rsiData.length - 1].time, value: 70 }]);

      const oversold = rsiChart.addSeries(LineSeries, {
        color: "rgba(0,229,160,0.25)",
        lineWidth: 1,
        lineStyle: 2,
      });
      oversold.setData([{ time: rsiData[0].time, value: 30 }, { time: rsiData[rsiData.length - 1].time, value: 30 }]);

      // Lock RSI range to 0-100
      const rsi50 = rsiChart.addSeries(LineSeries, {
        color: "rgba(255,255,255,0.05)",
        lineWidth: 1,
      });
      rsi50.setData([{ time: rsiData[0].time, value: 50 }, { time: rsiData[rsiData.length - 1].time, value: 50 }]);

      rsiChart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.05 },
      });
    }
    rsiChart.timeScale().fitContent();

    // --- Sync time scales ---
    const charts = [priceChart, volumeChart, rsiChart];
    priceChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (!range) return;
      volumeChart.timeScale().setVisibleRange(range);
      rsiChart.timeScale().setVisibleRange(range);
    });

    // --- Sync crosshair ---
    priceChart.subscribeCrosshairMove((param) => {
      const point = param.point;
      if (!point) {
        volumeChart.clearCrosshairPosition();
        rsiChart.clearCrosshairPosition();
        return;
      }
      volumeChart.setCrosshairPosition(point.x, point.y, true);
      rsiChart.setCrosshairPosition(point.x, point.y, true);
    });

    // --- Resize ---
    const handleResize = () => {
      const w = priceRef.current?.clientWidth || 0;
      if (w > 0) {
        charts.forEach((c) => c.applyOptions({ width: w }));
      }
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(priceRef.current);
    window.addEventListener("resize", handleResize);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", handleResize);
      charts.forEach((c) => {
        try { c.remove(); } catch (e) { /* ignore */ }
      });
    };
  }, [data, ticker]);

  if (!data?.length) return null;

  return (
    <div style={priceChartStyles.wrap}>
      <div ref={priceRef} style={{ width: "100%", height: "320px" }} />
      <div ref={volumeRef} style={{ width: "100%", height: "80px" }} />
      <div ref={rsiRef} style={{ width: "100%", height: "90px" }} />
    </div>
  );
}

function calcRSI(closes, formattedData, period = 14) {
  if (closes.length < period + 1) return [];
  const rsiValues = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change; else losses -= change;
  }
  gains /= period; losses /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi = 100 - (100 / (1 + rs));
    rsiValues.push({ time: formattedData[i]?.time, value: Math.round(rsi * 10) / 10 });
    const change = closes[i] - closes[i - 1];
    gains = (gains * (period - 1) + (change > 0 ? change : 0)) / period;
    losses = (losses * (period - 1) + (change < 0 ? -change : 0)) / period;
  }
  return rsiValues;
}

const priceChartStyles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
};
