/**
 * Options context calculations: Realized Volatility, IV Rank, IV Percentile.
 * All functions are pure — they operate on provided data arrays.
 */

/**
 * Calculate 20-day Realized Volatility (annualized) from an array of close prices.
 * Computes daily log returns, then annualizes the standard deviation.
 * @param {number[]} closePrices - Array of daily close prices (oldest first).
 * @param {number} [window=20] - Number of trading days for the lookback window.
 * @returns {{ rv: number|null, annualized: boolean, window: number }}
 *   rv as a decimal (e.g. 0.25 = 25% vol). null if insufficient data.
 */
export function calcRealizedVolatility(closePrices, window = 20) {
  if (!closePrices || closePrices.length < window + 1) {
    return { rv: null, annualized: true, window };
  }

  // Use only the most recent `window + 1` prices to get `window` returns
  const relevant = closePrices.slice(-(window + 1));
  const logReturns = [];
  for (let i = 1; i < relevant.length; i++) {
    const prev = relevant[i - 1];
    if (prev > 0) {
      logReturns.push(Math.log(relevant[i] / prev));
    }
  }

  if (logReturns.length < 2) {
    return { rv: null, annualized: true, window };
  }

  // Sample standard deviation of log returns
  const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
  const variance =
    logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
  const dailyVol = Math.sqrt(variance);

  // Annualize: there are 252 trading days per year
  const rv = dailyVol * Math.sqrt(252);

  return { rv, annualized: true, window };
}

/**
 * Calculate IV Rank (IVR) over a lookback period.
 * IVR = (currentIV - minIV) / (maxIV - minIV)
 * @param {number} currentIV - Current implied volatility (decimal, e.g. 0.30).
 * @param {number[]} ivHistory - Historical IV values array.
 * @returns {{ ivr: number|null, minIV: number|null, maxIV: number|null, count: number }}
 */
export function calcIVRank(currentIV, ivHistory) {
  if (!ivHistory || ivHistory.length === 0 || currentIV == null) {
    return { ivr: null, minIV: null, maxIV: null, count: 0 };
  }

  const valid = ivHistory.filter((v) => v != null && Number.isFinite(v));
  if (valid.length === 0) {
    return { ivr: null, minIV: null, maxIV: null, count: 0 };
  }

  const minIV = Math.min(...valid);
  const maxIV = Math.max(...valid);

  let ivr = null;
  if (maxIV !== minIV) {
    ivr = (currentIV - minIV) / (maxIV - minIV);
    // Clamp to [0, 1]
    ivr = Math.max(0, Math.min(1, ivr));
  } else {
    // All values identical; rank is 0.5 if current equals that value, else boundary
    ivr = currentIV >= maxIV ? 1 : currentIV <= minIV ? 0 : 0.5;
  }

  return { ivr, minIV, maxIV, count: valid.length };
}

/**
 * Calculate IV Percentile (IVP) over a lookback period.
 * IVP = (number of days where IV was below currentIV) / total days * 100
 * @param {number} currentIV - Current implied volatility (decimal, e.g. 0.30).
 * @param {number[]} ivHistory - Historical IV values array.
 * @returns {number|null} Percentile value (0-100), null if insufficient data.
 */
export function calcIVPercentile(currentIV, ivHistory) {
  if (!ivHistory || ivHistory.length === 0 || currentIV == null) {
    return null;
  }

  const valid = ivHistory.filter((v) => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;

  const below = valid.filter((v) => v < currentIV).length;
  return (below / valid.length) * 100;
}
