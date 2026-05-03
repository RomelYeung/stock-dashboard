import {
  VIX_FEAR_THRESHOLD,
  FED_RATE_RISING_THRESHOLD,
  FED_RATE_FALLING_THRESHOLD,
  MARGIN_DEBT_DECLINE_THRESHOLD,
  CREDIT_SPREAD_LOW_BPS,
  CREDIT_SPREAD_HIGH_BPS,
  INFLATION_TARGET,
  INFLATION_MODERATE,
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
