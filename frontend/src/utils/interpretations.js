import {
  VIX_FEAR_THRESHOLD,
  FED_RATE_RISING_THRESHOLD,
  FED_RATE_FALLING_THRESHOLD,
  MARGIN_DEBT_DECLINE_THRESHOLD,
  CREDIT_SPREAD_LOW_BPS,
  CREDIT_SPREAD_HIGH_BPS,
  INFLATION_TARGET,
  INFLATION_MODERATE,
  YIELD_CURVE_INVERSION_THRESHOLD,
  YIELD_CURVE_FLAT_THRESHOLD,
  TREASURY_YIELD_HIGH,
  TREASURY_YIELD_MODERATE,
  CONSUMER_SENTIMENT_LOW,
  CONSUMER_SENTIMENT_NEUTRAL,
  UNEMPLOYMENT_LOW,
  UNEMPLOYMENT_HIGH,
} from "../constants.js";
import { formatMarketCap } from "./formatters.js";

export function getVixInterpretation(currentValue) {
  const color = currentValue > VIX_FEAR_THRESHOLD ? "var(--accent-red)" : "var(--accent-green)";
  const text =
    currentValue > VIX_FEAR_THRESHOLD
      ? `VIX > ${VIX_FEAR_THRESHOLD}: Significant market fear, potential buying opportunity`
      : `VIX ≤ ${VIX_FEAR_THRESHOLD}: Normal market volatility, no extreme fear signals`;
  return { color, text };
}

export function getFedInterpretation(currentValue, history = []) {
  const trend =
    history.length >= 3
      ? history[history.length - 1]?.value - history[history.length - 3]?.value
      : 0;
  const color =
    trend > FED_RATE_RISING_THRESHOLD ? "var(--accent-red)" : "var(--accent-green)";
  const trendText =
    trend > FED_RATE_RISING_THRESHOLD
      ? "Rising rates (negative for valuations)"
      : trend < FED_RATE_FALLING_THRESHOLD
        ? "Falling rates (positive for valuations)"
        : "Stable rates (neutral for valuations)";
  const text = `Fed Funds Rate: ${currentValue?.toFixed(2) || "N/A"}%. ${trendText}`;
  return { color, text };
}

export function getMarginDebtInterpretation(currentValue, history = []) {
  const recentChange =
    history.length >= 3
      ? (history[history.length - 1]?.value - history[history.length - 3]?.value) /
        history[history.length - 3]?.value
      : 0;
  const color =
    recentChange < MARGIN_DEBT_DECLINE_THRESHOLD
      ? "var(--accent-green)"
      : "var(--accent-red)";
  const trendText =
    recentChange < MARGIN_DEBT_DECLINE_THRESHOLD
      ? "Downward trend (deleveraging, market bottoming)"
      : "Upward trend (leveraging, potential overheating)";
  const text = `Margin Debt: ${formatMarketCap(currentValue * 1e6)}. ${trendText}`;
  return { color, text };
}

export function getCreditSpreadInterpretation(currentValue) {
  const color =
    currentValue < CREDIT_SPREAD_LOW_BPS
      ? "var(--accent-green)"
      : currentValue < CREDIT_SPREAD_HIGH_BPS
        ? "var(--accent-yellow)"
        : "var(--accent-red)";
  const stressText =
    currentValue < CREDIT_SPREAD_LOW_BPS
      ? "Low credit stress (healthy market)"
      : currentValue < CREDIT_SPREAD_HIGH_BPS
        ? "Moderate credit stress (elevated risk)"
        : "High credit stress (market distress)";
  const text = `Credit Spreads: ${currentValue?.toFixed(0) || "N/A"} bps. ${stressText}`;
  return { color, text };
}

export function getInflationInterpretation(currentValue) {
  const color =
    currentValue <= INFLATION_TARGET
      ? "var(--accent-green)"
      : currentValue <= INFLATION_MODERATE
        ? "var(--accent-yellow)"
        : "var(--accent-red)";
  const pressureText =
    currentValue <= INFLATION_TARGET
      ? "At Fed target (healthy for markets)"
      : currentValue <= INFLATION_MODERATE
        ? "Above Fed target (moderate pressure)"
        : "Well above Fed target (high pressure on rates)";
  const text = `Headline CPI YoY: ${currentValue?.toFixed(2) || "N/A"}%. ${pressureText}`;
  return { color, text };
}

export function getAAIIInterpretation(currentValue) {
  // currentValue is the spread (Bullish - Bearish)
  const isExtremeBullish = currentValue > 20; // Example threshold
  const isExtremeBearish = currentValue < -20; // Example threshold
  
  // Contrarian indicator: Extreme bullishness is bearish for market, extreme bearishness is bullish
  const color = 
    isExtremeBullish ? "var(--accent-red)" : 
    isExtremeBearish ? "var(--accent-green)" : 
    "var(--accent-yellow)";
    
  const text = 
    isExtremeBullish ? "Extreme Bullishness (Contrarian Bearish Signal)" :
    isExtremeBearish ? "Extreme Bearishness (Contrarian Bullish Signal)" :
    "Neutral Sentiment (No clear contrarian signal)";
    
  return { color, text };
}

export function getBalanceSheetInterpretation(currentValue, history = []) {
  const recentChange =
    history.length >= 6
      ? (history[history.length - 1]?.value - history[history.length - 6]?.value) /
        history[history.length - 6]?.value
      : 0;
  const expanding = recentChange > 0.005;
  const contracting = recentChange < -0.005;
  const color = contracting ? "var(--accent-red)" : expanding ? "var(--accent-green)" : "var(--accent-yellow)";
  const text = contracting
    ? "QT in progress — Fed shrinking balance sheet (tighter liquidity)"
    : expanding
      ? "QE / expanding — Fed growing balance sheet (more liquidity)"
      : "Balance sheet roughly stable (neutral liquidity)";
  return { color, text };
}

export function getTreasuryYieldInterpretation(currentValue) {
  const color =
    currentValue >= TREASURY_YIELD_HIGH
      ? "var(--accent-red)"
      : currentValue >= TREASURY_YIELD_MODERATE
        ? "var(--accent-yellow)"
        : "var(--accent-green)";
  const text =
    currentValue >= TREASURY_YIELD_HIGH
      ? `10Y at ${currentValue?.toFixed(2)}% — High yields pressure equity valuations`
      : currentValue >= TREASURY_YIELD_MODERATE
        ? `10Y at ${currentValue?.toFixed(2)}% — Moderate level, watch for further rises`
        : `10Y at ${currentValue?.toFixed(2)}% — Low yields supportive of equity valuations`;
  return { color, text };
}

export function getYieldCurveInterpretation(currentValue) {
  const color =
    currentValue < YIELD_CURVE_INVERSION_THRESHOLD
      ? "var(--accent-red)"
      : currentValue < YIELD_CURVE_FLAT_THRESHOLD
        ? "var(--accent-yellow)"
        : "var(--accent-green)";
  const text =
    currentValue < YIELD_CURVE_INVERSION_THRESHOLD
      ? `Yield curve inverted (${currentValue?.toFixed(2)}%) — Historically precedes recessions`
      : currentValue < YIELD_CURVE_FLAT_THRESHOLD
        ? `Yield curve flat (${currentValue?.toFixed(2)}%) — Caution, potential slowdown`
        : `Yield curve normal (${currentValue?.toFixed(2)}%) — Healthy economic signal`;
  return { color, text };
}

export function getConsumerSentimentInterpretation(currentValue) {
  const color =
    currentValue < CONSUMER_SENTIMENT_LOW
      ? "var(--accent-red)"
      : currentValue < CONSUMER_SENTIMENT_NEUTRAL
        ? "var(--accent-yellow)"
        : "var(--accent-green)";
  const text =
    currentValue < CONSUMER_SENTIMENT_LOW
      ? `Sentiment at ${currentValue?.toFixed(1)} — Consumers very pessimistic (potential contrarian buy)`
      : currentValue < CONSUMER_SENTIMENT_NEUTRAL
        ? `Sentiment at ${currentValue?.toFixed(1)} — Below average consumer confidence`
        : `Sentiment at ${currentValue?.toFixed(1)} — Consumers optimistic, healthy spending outlook`;
  return { color, text };
}

export function getUnemploymentInterpretation(currentValue, history = []) {
  const trend =
    history.length >= 3
      ? currentValue - history[history.length - 3]?.value
      : 0;
  const rising = trend > 0.3;
  const color =
    currentValue >= UNEMPLOYMENT_HIGH
      ? "var(--accent-red)"
      : currentValue >= UNEMPLOYMENT_LOW
        ? "var(--accent-yellow)"
        : "var(--accent-green)";
  const trendNote = rising ? " (rising — watch closely)" : "";
  const text =
    currentValue >= UNEMPLOYMENT_HIGH
      ? `Unemployment at ${currentValue?.toFixed(1)}%${trendNote} — Elevated, recessionary signal`
      : currentValue >= UNEMPLOYMENT_LOW
        ? `Unemployment at ${currentValue?.toFixed(1)}%${trendNote} — Moderate level`
        : `Unemployment at ${currentValue?.toFixed(1)}%${trendNote} — Low, healthy labor market`;
  return { color, text };
}
