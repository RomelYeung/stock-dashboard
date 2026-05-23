import { memo, useRef, useEffect, useState, useCallback } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries } from "lightweight-charts";
import { usePriceHistory } from "../hooks/useStockData";
import { formatPrice } from "../utils/formatters";

const PERIODS = ["1M", "3M", "6M", "1Y", "2Y", "5Y"];
const PERIOD_MAP = { "1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y", "2Y": "2y", "5Y": "5y" };

function formatVolume(val) {
  if (val == null) return "—";
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toString();
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

function TradingViewChart({ ticker, period = "5y", setPeriod, livePrice }) {
  const { data: priceData, loading } = usePriceHistory(ticker, period);
  const priceContainerRef = useRef(null);
  const volumeContainerRef = useRef(null);
  const rsiContainerRef = useRef(null);
  const chartRef = useRef(null);
  const liveSeriesRef = useRef(null);

  const [showVolume, setShowVolume] = useState(() => {
    const saved = localStorage.getItem("chart_show_volume");
    return saved !== null ? saved === "true" : true;
  });
  const [showSMA, setShowSMA] = useState(() => {
    const saved = localStorage.getItem("chart_show_sma");
    return saved !== null ? saved === "true" : true;
  });
  const [showRSI, setShowRSI] = useState(() => {
    const saved = localStorage.getItem("chart_show_rsi");
    return saved !== null ? saved === "true" : false;
  });
  const [hudData, setHudData] = useState(null);

  // Main chart creation — runs once when data loads
  useEffect(() => {
    if (!priceContainerRef.current || !volumeContainerRef.current || !rsiContainerRef.current) return;

    // Always clean up old chart before deciding whether to create a new one
    if (chartRef.current) {
      chartRef.current.priceChart.remove();
      chartRef.current.volumeChart.remove();
      chartRef.current.rsiChart.remove();
      chartRef.current = null;
      liveSeriesRef.current = null;
    }

    if (!priceData?.length || loading) return;

    const priceContainer = priceContainerRef.current;
    const volumeContainer = volumeContainerRef.current;
    const rsiContainer = rsiContainerRef.current;
    const width = priceContainer.clientWidth;

    // ─── Price chart ───
    const priceChart = createChart(priceContainer, {
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "#5a6a80",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      width,
      height: 400,
      crosshair: { mode: 0 },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        visible: !showRSI,
        rightMargin: 10,
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        minimumWidth: 80,
      },
    });

    const formattedData = priceData
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

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: "#00E5A0",
      downColor: "#FF4976",
      borderUpColor: "#00E5A0",
      borderDownColor: "#FF4976",
      wickUpColor: "#00E5A0",
      wickDownColor: "#FF4976",
    });
    candleSeries.setData(formattedData.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    })));

    let smaSeries = null;
    const sma200Data = [];
    for (let i = 199; i < formattedData.length; i++) {
      const slice = formattedData.slice(i - 199, i + 1);
      const avg = slice.reduce((s, d) => s + d.close, 0) / slice.length;
      sma200Data.push({ time: formattedData[i].time, value: avg });
    }
    if (sma200Data.length) {
      smaSeries = priceChart.addSeries(LineSeries, {
        color: "rgba(255,181,71,0.6)",
        lineWidth: 2,
      });
      smaSeries.setData(sma200Data);
    }

    const livePriceSeries = priceChart.addSeries(LineSeries, {
      color: '#00d4ff',
      lineWidth: 2,
      lastValueVisible: true,
      title: 'Live',
    });
    liveSeriesRef.current = livePriceSeries;
    if (livePrice) {
      livePriceSeries.setData([{ time: Math.floor(Date.now() / 1000), value: livePrice }]);
    }

    priceChart.timeScale().fitContent();

    // ─── Volume chart ───
    const volumeChart = createChart(volumeContainer, {
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "#5a6a80",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      width,
      height: 80,
      crosshair: { mode: 0 },
      timeScale: {
        timeVisible: false,
        secondsVisible: false,
        rightMargin: 10,
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        visible: true,
        minimumWidth: 80,
        textColor: "transparent",
      },
    });

    volumeChart.timeScale().applyOptions({ visible: false });
    volumeChart.priceScale("right").applyOptions({
      visible: true,
      textColor: "transparent",
      borderColor: "rgba(255,255,255,0.06)",
      minimumWidth: 80,
    });

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

    // ─── RSI chart ───
    const closes = formattedData.map((d) => d.close);
    const rsiData = calcRSI(closes, formattedData);

    const rsiChart = createChart(rsiContainer, {
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "#5a6a80",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      width,
      height: 90,
      crosshair: { mode: 0 },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        visible: showRSI,
        rightMargin: 10,
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        minimumWidth: 80,
      },
    });

    let rsiSeries = null;
    if (rsiData.length) {
      rsiSeries = rsiChart.addSeries(AreaSeries, {
        lineColor: "#a855f7",
        topColor: "rgba(168, 85, 247, 0.25)",
        bottomColor: "rgba(168, 85, 247, 0.0)",
        lineWidth: 2,
        crosshairMarkerVisible: true,
        priceFormat: {
          type: "custom",
          formatter: (price) => Math.round(price),
        },
      });
      rsiSeries.setData(rsiData);

      rsiSeries.createPriceLine({
        price: 70,
        color: "rgba(255, 73, 118, 0.35)",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "OB 70",
      });

      rsiSeries.createPriceLine({
        price: 30,
        color: "rgba(0, 229, 160, 0.35)",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "OS 30",
      });

      rsiSeries.createPriceLine({
        price: 50,
        color: "rgba(255, 255, 255, 0.08)",
        lineWidth: 1,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: "50",
      });

      rsiChart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.15, bottom: 0.15 },
      });
    }

    rsiChart.timeScale().fitContent();

    // ─── Sync visible ranges ───
    priceChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (!range) return;
      volumeChart.timeScale().setVisibleRange(range);
      rsiChart.timeScale().setVisibleRange(range);
    });
    volumeChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (!range) return;
      priceChart.timeScale().setVisibleRange(range);
      rsiChart.timeScale().setVisibleRange(range);
    });
    rsiChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (!range) return;
      priceChart.timeScale().setVisibleRange(range);
      volumeChart.timeScale().setVisibleRange(range);
    });

    const visibleRange = priceChart.timeScale().getVisibleRange();
    if (visibleRange) {
      volumeChart.timeScale().setVisibleRange(visibleRange);
      rsiChart.timeScale().setVisibleRange(visibleRange);
    }

    // ─── Sync crosshairs & Update HUD ───
    priceChart.subscribeCrosshairMove((param) => {
      const point = param.point;
      if (!point) {
        volumeChart.clearCrosshairPosition();
        rsiChart.clearCrosshairPosition();
      } else {
        volumeChart.setCrosshairPosition(point.x, point.y, true);
        rsiChart.setCrosshairPosition(point.x, point.y, true);
      }

      if (!param.time || !point) {
        const lastBar = formattedData[formattedData.length - 1];
        setHudData({
          open: lastBar.open,
          high: lastBar.high,
          low: lastBar.low,
          close: lastBar.close,
          volume: lastBar.volume,
          isUp: lastBar.close >= lastBar.open,
        });
        return;
      }

      const candle = param.seriesData.get(candleSeries);
      const vol = param.seriesData.get(volumeSeries);
      if (candle) {
        setHudData({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: vol ? (vol.value ?? vol.close ?? 0) : 0,
          isUp: candle.close >= candle.open,
        });
      }
    });

    // Populate initial HUD state
    const lastBar = formattedData[formattedData.length - 1];
    setHudData({
      open: lastBar.open,
      high: lastBar.high,
      low: lastBar.low,
      close: lastBar.close,
      volume: lastBar.volume,
      isUp: lastBar.close >= lastBar.open,
    });

    // Apply current SMA visibility
    if (smaSeries) {
      smaSeries.applyOptions({ visible: showSMA });
    }

    chartRef.current = { priceChart, volumeChart, rsiChart, smaSeries };

    // ─── Resize ───
    const handleResize = () => {
      const w = priceContainer.clientWidth;
      priceChart.applyOptions({ width: w });
      volumeChart.applyOptions({ width: w });
      rsiChart.applyOptions({ width: w });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      priceChart.remove();
      volumeChart.remove();
      rsiChart.remove();
      chartRef.current = null;
      liveSeriesRef.current = null;
    };
  }, [priceData, loading]);

  // Sync SMA visibility without recreating the chart
  useEffect(() => {
    if (chartRef.current?.smaSeries) {
      chartRef.current.smaSeries.applyOptions({ visible: showSMA });
    }
  }, [showSMA]);

  // Sync timescales when showRSI toggles without recreating the chart
  useEffect(() => {
    if (chartRef.current?.priceChart && chartRef.current?.rsiChart) {
      chartRef.current.rsiChart.timeScale().applyOptions({ visible: showRSI });
      chartRef.current.priceChart.timeScale().applyOptions({ visible: !showRSI });
    }
  }, [showRSI]);

  useEffect(() => {
    if (liveSeriesRef.current && livePrice) {
      const now = Math.floor(Date.now() / 1000);
      liveSeriesRef.current.setData([{ time: now, value: livePrice }]);
    }
  }, [livePrice]);

  const toggleSMA = useCallback(() => {
    setShowSMA((v) => {
      const next = !v;
      localStorage.setItem("chart_show_sma", String(next));
      return next;
    });
  }, []);
  const toggleVolume = useCallback(() => {
    setShowVolume((v) => {
      const next = !v;
      localStorage.setItem("chart_show_volume", String(next));
      return next;
    });
  }, []);
  const toggleRSI = useCallback(() => {
    setShowRSI((v) => {
      const next = !v;
      localStorage.setItem("chart_show_rsi", String(next));
      return next;
    });
  }, []);

  return (
    <div>
      <div style={styles.controls}>
        <div style={styles.periodRow}>
          <div
            style={{
              ...styles.periodPill,
              width: `calc((100% - 6px) / ${PERIODS.length})`,
              transform: `translateX(calc(${PERIODS.indexOf(PERIODS.find((p) => PERIOD_MAP[p] === period))} * 100%))`,
            }}
          />
          {PERIODS.map((p) => (
            <button
              key={p}
              style={{
                ...styles.periodBtn,
                zIndex: 2,
                color: period === PERIOD_MAP[p] ? "var(--text-primary)" : "var(--text-secondary)",
              }}
              onClick={() => setPeriod(PERIOD_MAP[p])}
            >
              {p}
            </button>
          ))}
        </div>
        <div style={styles.toggleRow}>
          <button
            style={{
              ...styles.btn,
              ...(showSMA ? styles.btnActive : {}),
            }}
            onClick={toggleSMA}
          >
            SMA 200
          </button>
          <button
            style={{
              ...styles.btn,
              ...(showVolume ? styles.btnActive : {}),
            }}
            onClick={toggleVolume}
          >
            Volume
          </button>
          <button
            style={{
              ...styles.btn,
              ...(showRSI ? styles.btnActive : {}),
            }}
            onClick={toggleRSI}
          >
            RSI
          </button>
        </div>
      </div>
      <div style={styles.chartsWrapper}>
        {hudData && (
          <div style={styles.hud}>
            <span style={styles.hudTicker}>{ticker}</span>
            <span style={styles.hudLabel}>O</span>
            <span style={{ ...styles.hudValue, color: hudData.isUp ? "var(--accent-green)" : "var(--accent-red)" }}>
              {formatPrice(hudData.open)}
            </span>
            <span style={styles.hudLabel}>H</span>
            <span style={{ ...styles.hudValue, color: hudData.isUp ? "var(--accent-green)" : "var(--accent-red)" }}>
              {formatPrice(hudData.high)}
            </span>
            <span style={styles.hudLabel}>L</span>
            <span style={{ ...styles.hudValue, color: hudData.isUp ? "var(--accent-green)" : "var(--accent-red)" }}>
              {formatPrice(hudData.low)}
            </span>
            <span style={styles.hudLabel}>C</span>
            <span style={{ ...styles.hudValue, color: hudData.isUp ? "var(--accent-green)" : "var(--accent-red)" }}>
              {formatPrice(hudData.close)}
            </span>
            <span style={styles.hudLabel}>Vol</span>
            <span style={styles.hudValue}>
              {formatVolume(hudData.volume)}
            </span>
          </div>
        )}
        <div ref={priceContainerRef} style={styles.priceChart} />
        <div
          style={{
            display: showVolume ? "block" : "none",
            width: "100%",
          }}
        >
          <div ref={volumeContainerRef} style={styles.volumeChart} />
        </div>
        <div
          style={{
            display: showRSI ? "block" : "none",
            width: "100%",
          }}
        >
          <div ref={rsiContainerRef} style={styles.rsiChart} />
        </div>
      </div>
    </div>
  );
}

const styles = {
  controls: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  periodRow: {
    display: "flex",
    gap: "0",
    padding: "3px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    position: "relative",
    width: "280px",
  },
  periodPill: {
    position: "absolute",
    top: "3px",
    bottom: "3px",
    left: "3px",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "6px",
    transition: "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
    zIndex: 1,
    pointerEvents: "none",
  },
  periodBtn: {
    background: "transparent",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    padding: "4px 0",
    transition: "color 0.15s",
    flex: 1,
    textAlign: "center",
  },
  toggleRow: {
    display: "flex",
    gap: "8px",
  },
  btn: {
    padding: "6px 12px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    color: "var(--text-secondary)",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  btnActive: {
    background: "rgba(0,229,160,0.15)",
    borderColor: "rgba(0,229,160,0.3)",
    color: "var(--accent-green)",
  },
  chartsWrapper: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "0",
    position: "relative",
  },
  priceChart: {
    width: "100%",
    height: "360px",
    borderRadius: "10px 10px 0 0",
    overflow: "hidden",
  },
  volumeChart: {
    width: "100%",
    height: "80px",
    overflow: "hidden",
  },
  rsiChart: {
    width: "100%",
    height: "90px",
    overflow: "hidden",
  },
  hud: {
    position: "absolute",
    top: "12px",
    left: "12px",
    zIndex: 10,
    background: "rgba(9, 13, 23, 0.75)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "6px",
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    pointerEvents: "none",
  },
  hudTicker: {
    fontWeight: 700,
    color: "var(--text-primary)",
    marginRight: "4px",
  },
  hudLabel: {
    color: "var(--text-secondary)",
    fontSize: "10px",
  },
  hudValue: {
    fontWeight: 500,
    marginRight: "6px",
  },
};

export default memo(TradingViewChart);
