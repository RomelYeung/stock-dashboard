/**
 * Basic quantitative math utilities.
 */

/**
 * Compute log-strike for a given strike price and forward price.
 * @param {number} strike
 * @param {number} forward
 * @returns {number} log(K / F)
 */
export function logStrike(strike, forward) {
  return Math.log(strike / forward);
}

/**
 * Linear interpolation between two points.
 * @param {number} x
 * @param {number} x0
 * @param {number} x1
 * @param {number} y0
 * @param {number} y1
 * @returns {number}
 */
export function lerp(x, x0, x1, y0, y1) {
  if (x1 === x0) return (y0 + y1) / 2;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

/**
 * Calculate spread-adjusted tradable edge.
 *
 * Converts the bid-ask spread into an IV penalty and subtracts it from the raw edge.
 *
 *   iv_spread_penalty = (ask - bid) / 2 / (safe_vega * 100)
 *   adjusted_edge = raw_edge - iv_spread_penalty  (respecting sign, floored at 0)
 *
 * @param {number} rawEdge - Raw edge (signed, e.g. in IV percentage points)
 * @param {number} ask - Option ask price
 * @param {number} bid - Option bid price
 * @param {number} vega - Option vega
 * @param {number} [minVega=0.001] - Minimum vega floor for safe division
 * @returns {number} Adjusted edge (same sign as raw edge, or 0 if penalty exceeds edge)
 */
export function calcSpreadAdjustedEdge(rawEdge, ask, bid, vega, minVega = 0.001) {
  const safeVega = Math.max(vega, minVega);
  const ivSpreadPenalty = (ask - bid) / 2 / (safeVega * 100);

  const absEdge = Math.abs(rawEdge);
  if (ivSpreadPenalty >= absEdge) return 0;

  const sign = rawEdge >= 0 ? 1 : -1;
  return sign * (absEdge - ivSpreadPenalty);
}

/**
 * Calculate Gamma Exposure (GEX) for an array of option contracts.
 *
 * Filters to contracts with DTE <= 30.
 *   GEX = gamma * openInterest * 100 * underlyingPrice
 *   Calls → positive contribution; Puts → negative contribution.
 *
 * @param {Array<{ strike: number, gamma: number, openInterest: number, type: 'call'|'put', dte: number }>} options
 * @param {number} underlyingPrice - Current underlying price
 * @returns {{ total: number, callGex: number, putGex: number, contractCount: number }}
 *   total: net GEX (calls - puts), callGex: sum of call GEX, putGex: sum of put GEX,
 *   contractCount: number of contracts that passed the DTE filter
 */
export function calcGEX(options, underlyingPrice) {
  let total = 0;
  let callGex = 0;
  let putGex = 0;
  let count = 0;

  for (const opt of options) {
    if (opt.dte > 30) continue;

    const gex = opt.gamma * opt.openInterest * 100 * underlyingPrice;

    if (opt.type === 'call') {
      total += gex;
      callGex += gex;
    } else {
      total -= gex;
      putGex += gex;
    }
    count++;
  }

  return { total, callGex, putGex, contractCount: count };
}
