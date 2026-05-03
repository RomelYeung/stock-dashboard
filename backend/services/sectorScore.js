import * as indicators from "./indicators.js";

const BASE_WEIGHTS = {
  rsi: 0.10,
  macdHist: 0.10,
  obvChange: 0.075,
  cmf: 0.075,
  ret1M: 0.10,
  ret3M: 0.15,
  ret6M: 0.10,
  rel1M: 0.10,
  rel3M: 0.10,
  scoreTrend: 0.10,
};

function getPercentileRank(value, values) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const valid = values
    .filter(v => v !== null && v !== undefined && !isNaN(v))
    .sort((a, b) => a - b);
  const n = valid.length;
  if (n === 0) return null;
  if (n === 1) return 50;

  const eps = 1e-9;
  const indices = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(valid[i] - value) < eps) indices.push(i);
  }
  if (indices.length === 0) {
    let lower = -1;
    for (let i = 0; i < n; i++) {
      if (valid[i] < value) lower = i;
    }
    if (lower === -1) return 0;
    if (lower === n - 1) return 100;
    const t = (value - valid[lower]) / (valid[lower + 1] - valid[lower]);
    return ((lower + t) / (n - 1)) * 100;
  }
  const avgIndex = indices.reduce((a, b) => a + b, 0) / indices.length;
  return (avgIndex / (n - 1)) * 100;
}

function calculateWeightedScore(percentiles, weights) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const p = percentiles[key];
    if (p !== null && p !== undefined && !isNaN(p)) {
      weightedSum += p * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

function computeRawMetrics(etfs, spyOhlcv) {
  return etfs.map(etf => {
    const { ohlcv, summary } = etf;
    if (!ohlcv || ohlcv.length < 30 || !summary) {
      return { etf, valid: false };
    }
    const closes = ohlcv.map(b => b.close);
    const spyCloses = spyOhlcv ? spyOhlcv.map(b => b.close) : null;

    const rsi = indicators.calculateRSI(closes);
    const macd = indicators.calculateMACD(closes);
    const obvChange = indicators.calculateOBVTrend(ohlcv, 22);
    const cmf = indicators.calculateCMF(ohlcv, 20);
    const ret1M = indicators.calculateReturns(closes, 1);
    const ret3M = indicators.calculateReturns(closes, 3);
    const ret6M = indicators.calculateReturns(closes, 6);
    const rel1M = spyCloses
      ? indicators.calculateRelativeStrength(closes, spyCloses, 22)
      : null;
    const rel3M = spyCloses
      ? indicators.calculateRelativeStrength(closes, spyCloses, 63)
      : null;

    return {
      etf,
      valid: true,
      metrics: {
        rsi,
        macdHist: macd.histogram,
        obvChange,
        cmf,
        ret1M,
        ret3M,
        ret6M,
        rel1M,
        rel3M,
      },
    };
  });
}

function scoreSlice(metricsList, weights) {
  const keys = Object.keys(weights);
  const allValues = {};
  for (const key of keys) {
    allValues[key] = metricsList.filter(m => m.valid).map(m => m.metrics[key]);
  }

  return metricsList.map(m => {
    if (!m.valid) return { ...m, percentiles: {}, score: 0 };
    const percentiles = {};
    for (const key of keys) {
      const vals = allValues[key];
      const hasAnyValid = vals.some(
        v => v !== null && v !== undefined && !isNaN(v)
      );
      if (hasAnyValid) {
        percentiles[key] = getPercentileRank(m.metrics[key], vals);
      } else {
        percentiles[key] = null;
      }
    }
    const score = calculateWeightedScore(percentiles, weights);
    return { ...m, percentiles, score };
  });
}

export function calculateEtfsScores(etfs, spyOhlcv) {
  const currentMetrics = computeRawMetrics(etfs, spyOhlcv);

  const HISTORICAL_OFFSET = 20;
  const historicalEtfs = etfs.map(etf => {
    if (!etf.ohlcv || etf.ohlcv.length <= HISTORICAL_OFFSET + 30) {
      return { ...etf, ohlcv: null };
    }
    return { ...etf, ohlcv: etf.ohlcv.slice(0, -HISTORICAL_OFFSET) };
  });
  const historicalSpyOhlcv = spyOhlcv
    ? spyOhlcv.slice(0, -HISTORICAL_OFFSET)
    : null;
  const historicalMetrics = computeRawMetrics(historicalEtfs, historicalSpyOhlcv);

  const baseWeights = { ...BASE_WEIGHTS };
  delete baseWeights.scoreTrend;
  const baseWeightSum = Object.values(baseWeights).reduce((a, b) => a + b, 0);
  const normalizedBaseWeights = Object.fromEntries(
    Object.entries(baseWeights).map(([k, v]) => [k, v / baseWeightSum])
  );

  const currentScored = scoreSlice(currentMetrics, normalizedBaseWeights);
  const historicalScored = scoreSlice(
    historicalMetrics,
    normalizedBaseWeights
  );

  const scoreTrends = currentScored.map((curr, i) => {
    if (!curr.valid || !historicalScored[i].valid) return null;
    return curr.score - historicalScored[i].score;
  });
  const trendValues = scoreTrends.filter(v => v !== null);

  return currentScored.map((curr, i) => {
    if (!curr.valid) {
      return { ...curr.etf, score: 0, indicators: {} };
    }

    const trendRaw = scoreTrends[i];
    const trendPercentile =
      trendRaw !== null ? getPercentileRank(trendRaw, trendValues) : null;

    const allPercentiles = { ...curr.percentiles, scoreTrend: trendPercentile };
    const finalScore = Math.round(
      calculateWeightedScore(allPercentiles, BASE_WEIGHTS)
    );

    return {
      ...curr.etf,
      score: finalScore,
      scoreTrend: trendRaw !== null ? Math.round(trendRaw * 100) / 100 : null,
      scoreTrendPercentile:
        trendPercentile !== null ? Math.round(trendPercentile) : null,
      indicators: {
        rsi: curr.metrics.rsi != null ? Math.round(curr.metrics.rsi * 100) / 100 : null,
        macdHistogram: curr.metrics.macdHist != null
          ? Math.round(curr.metrics.macdHist * 100) / 100
          : null,
        obvChange: curr.metrics.obvChange != null
          ? Math.round(curr.metrics.obvChange * 100) / 100
          : null,
        cmf: curr.metrics.cmf != null ? Math.round(curr.metrics.cmf * 100) / 100 : null,
        returns1M: curr.metrics.ret1M != null
          ? Math.round(curr.metrics.ret1M * 100) / 100
          : null,
        returns3M: curr.metrics.ret3M != null
          ? Math.round(curr.metrics.ret3M * 100) / 100
          : null,
        returns6M: curr.metrics.ret6M != null
          ? Math.round(curr.metrics.ret6M * 100) / 100
          : null,
        relStrength1M: curr.metrics.rel1M != null
          ? Math.round(curr.metrics.rel1M * 100) / 100
          : null,
        relStrength3M: curr.metrics.rel3M != null
          ? Math.round(curr.metrics.rel3M * 100) / 100
          : null,
      },
    };
  });
}

export function rankSectors(etfsWithScores) {
  const sectorMap = {};

  for (const etf of etfsWithScores) {
    const sector = etf.sector;
    if (!sectorMap[sector]) {
      sectorMap[sector] = {
        sector: sector,
        type: etf.type,
        highestScore: etf.score,
        topEtf: etf,
        allEtfs: [],
      };
    }
    sectorMap[sector].allEtfs.push(etf);
    if (etf.score > sectorMap[sector].highestScore) {
      sectorMap[sector].highestScore = etf.score;
      sectorMap[sector].topEtf = etf;
    }
  }

  return Object.values(sectorMap)
    .sort((a, b) => b.highestScore - a.highestScore)
    .map((sector, index) => ({
      rank: index + 1,
      ...sector,
      score: sector.highestScore,
      ticker: sector.topEtf.ticker,
      name: sector.topEtf.name,
      aum: sector.topEtf.summary?.netAssets || sector.topEtf.summary?.marketCap || null,
      price: sector.topEtf.summary?.currentPrice || null,
      changePercent: sector.topEtf.summary?.changePercent || null,
      indicators: sector.topEtf.indicators,
      scoreTrend: sector.topEtf.scoreTrend,
      scoreTrendPercentile: sector.topEtf.scoreTrendPercentile,
    }));
}
