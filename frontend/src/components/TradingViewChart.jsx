import { memo, useRef, useEffect, useState, useCallback } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts";
import { usePriceHistory } from "../hooks/useStockData";

const PERIODS = ["1M", "3M", "6M", "1Y", "2Y", "5Y"];
const PERIOD_MAP = { "1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y", "2Y": "2y", "5Y": "5y" };

function TradingViewChart({ ticker, period = "5y", setPeriod }) {
  const { data: priceData, loading } = usePriceHistory(ticker, period);
  const priceContainerRef = useRef(null);
  const volumeContainerRef = useRef(null);
  const volumeWrapperRef = useRef(null);
  const chartRef = useRef(null);
  const [showVolume, setShowVolume] = useState(true);
  const [showSMA, setShowSMA] = useState(true);

  // Main chart creation — runs once when data loads
  useEffect(() => {
    if (!priceContainerRef.current || !priceData?.length || loading) return;

    if (chartRef.current) {
      chartRef.current.priceChart.remove();
      chartRef.current.volumeChart.remove();
      chartRef.current = null;
    }

    const priceContainer = priceContainerRef.current;
    const volumeContainer = volumeContainerRef.current;
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
        rightMargin: 10,
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
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
      },
    });

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

    // ─── Sync time scales ───
    priceChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      volumeChart.timeScale().setVisibleRange(range);
    });
    volumeChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      priceChart.timeScale().setVisibleRange(range);
    });

    const visibleRange = priceChart.timeScale().getVisibleRange();
    if (visibleRange) {
      volumeChart.timeScale().setVisibleRange(visibleRange);
    }

    // ─── Align volume bars to price candles ───
    requestAnimationFrame(() => {
      const plotWidth = priceChart.paneSize(0).width;
      if (volumeWrapperRef.current && plotWidth > 0) {
        volumeWrapperRef.current.style.width = `${plotWidth}px`;
      }
    });

    // Apply current SMA visibility (in case toggled before chart was created)
    if (smaSeries) {
      smaSeries.applyOptions({ visible: showSMA });
    }

    chartRef.current = { priceChart, volumeChart, smaSeries };

    // ─── Resize ───
    const handleResize = () => {
      const w = priceContainer.clientWidth;
      priceChart.applyOptions({ width: w });
      volumeChart.applyOptions({ width: w });

      requestAnimationFrame(() => {
        const plotWidth = priceChart.paneSize(0).width;
        if (volumeWrapperRef.current && plotWidth > 0) {
          volumeWrapperRef.current.style.width = `${plotWidth}px`;
        }
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      priceChart.remove();
      volumeChart.remove();
      chartRef.current = null;
    };
  }, [priceData, loading]);

  // Sync SMA visibility without recreating the chart
  useEffect(() => {
    if (chartRef.current?.smaSeries) {
      chartRef.current.smaSeries.applyOptions({ visible: showSMA });
    }
  }, [showSMA]);

  const toggleSMA = useCallback(() => setShowSMA((v) => !v), []);
  const toggleVolume = useCallback(() => setShowVolume((v) => !v), []);

  return (
    <div>
      <div style={styles.controls}>
        <div style={styles.periodRow}>
          {PERIODS.map((p) => (
            <button
              key={p}
              style={{
                ...styles.periodBtn,
                ...(period === PERIOD_MAP[p] ? styles.periodBtnActive : {}),
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
        </div>
      </div>
      <div style={styles.chartsWrapper}>
        <div ref={priceContainerRef} style={styles.priceChart} />
        <div
          ref={volumeWrapperRef}
          style={{
            overflow: "hidden",
            display: showVolume ? "block" : "none",
          }}
        >
          <div ref={volumeContainerRef} style={styles.volumeChart} />
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
    gap: "2px",
    padding: "3px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
  },
  periodBtn: {
    background: "transparent",
    border: "none",
    borderRadius: "6px",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    padding: "4px 10px",
    transition: "all 0.15s",
  },
  periodBtnActive: {
    background: "rgba(255,255,255,0.08)",
    color: "var(--text-primary)",
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
  },
  priceChart: {
    width: "100%",
    height: "400px",
    borderRadius: "10px 10px 0 0",
    overflow: "hidden",
  },
  volumeChart: {
    width: "100%",
    height: "80px",
    overflow: "hidden",
  },
};

export default memo(TradingViewChart);
