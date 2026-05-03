function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((price, i) => price - closes[i]);
  const gains = changes.map(c => Math.max(c, 0));
  const losses = changes.map(c => Math.max(-c, 0));

  let avgGain = gains.slice(0, period).reduce((sum, g) => sum + g, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((sum, l) => sum + l, 0) / period;

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod) return { macdLine: null, signalLine: null, histogram: null };

  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);
  const macdLine = fastEMA - slowEMA;

  const macdValues = [];
  for (let i = closes.length - slowPeriod; i < closes.length; i++) {
    const fast = calculateEMA(closes.slice(0, i + 1), fastPeriod);
    const slow = calculateEMA(closes.slice(0, i + 1), slowPeriod);
    macdValues.push(fast - slow);
  }

  const signalLine = calculateEMA(macdValues, signalPeriod);
  const histogram = macdLine - signalLine;
  return { macdLine, signalLine, histogram };
}

export function calculateOBV(ohlcv) {
  if (ohlcv.length < 2) return null;
  let obv = 0;
  for (let i = 1; i < ohlcv.length; i++) {
    if (ohlcv[i].close > ohlcv[i-1].close) obv += ohlcv[i].volume;
    else if (ohlcv[i].close < ohlcv[i-1].close) obv -= ohlcv[i].volume;
  }
  return obv;
}

export function calculateOBVTrend(ohlcv, window = 22) {
  if (ohlcv.length < window + 2) return null;
  const startOhlcv = ohlcv.slice(0, ohlcv.length - window);
  const endOhlcv = ohlcv;
  const startOBV = calculateOBV(startOhlcv);
  const endOBV = calculateOBV(endOhlcv);
  if (startOBV === null || endOBV === null) return null;
  if (Math.abs(startOBV) < 1) {
    return endOBV > 0 ? 100 : endOBV < 0 ? -100 : 0;
  }
  return ((endOBV - startOBV) / Math.abs(startOBV)) * 100;
}

export function calculateVWAP(ohlcv) {
  if (ohlcv.length === 0) return null;
  let sumTPV = 0;
  let sumVolume = 0;
  for (const bar of ohlcv) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    sumTPV += tp * bar.volume;
    sumVolume += bar.volume;
  }
  return sumTPV / sumVolume;
}

export function calculateCMF(ohlcv, period = 20) {
  if (ohlcv.length < period) return null;
  const recent = ohlcv.slice(-period);
  let sumMFV = 0;
  let sumVolume = 0;
  for (const bar of recent) {
    const range = bar.high - bar.low;
    if (range === 0) continue;
    const mfm = ((bar.close - bar.low) - (bar.high - bar.close)) / range;
    sumMFV += mfm * bar.volume;
    sumVolume += bar.volume;
  }
  if (sumVolume === 0) return 0;
  return sumMFV / sumVolume;
}

export function calculateReturns(closes, periodMonths = 3) {
  if (closes.length < 2) return null;
  const barsPerMonth = 21;
  const periodBars = periodMonths * barsPerMonth;
  if (closes.length <= periodBars) return null;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - periodBars];
  return ((current - past) / past) * 100;
}

export function calculateRelativeStrength(closes, spyCloses, periodBars = 22) {
  if (closes.length < periodBars + 1 || spyCloses.length < periodBars + 1) return null;
  const etfRet = ((closes[closes.length - 1] - closes[closes.length - 1 - periodBars]) / closes[closes.length - 1 - periodBars]) * 100;
  const spyRet = ((spyCloses[spyCloses.length - 1] - spyCloses[spyCloses.length - 1 - periodBars]) / spyCloses[spyCloses.length - 1 - periodBars]) * 100;
  return etfRet - spyRet;
}
