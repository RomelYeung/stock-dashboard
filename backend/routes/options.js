import express from "express";
import * as yf from "../services/yahoofinance.js";
import { getOptionChainParsed } from "../services/schwab-client.js";
import { getHistoricalIV } from "../services/historical-iv.js";
import { calcRealizedVolatility, calcIVRank, calcIVPercentile } from "../src/quant/context.js";
import { fitSVI, sviTotalVariance } from "../src/quant/svi.js";
import { logStrike, calcSpreadAdjustedEdge, calcGEX } from "../src/quant/mathUtils.js";
import { TICKER_REGEX } from "../constants.js";

const router = express.Router();

/**
 * GET /api/options/scan/:ticker
 *
 * Full-featured options scanner endpoint. Orchestrates:
 *   - Schwab option chain (parsed)
 *   - Yahoo Finance historical daily closes
 *   - Realized volatility (RV), IV Rank (IVR), IV Percentile (IVP)
 *   - Gamma Exposure (GEX)
 *   - SVI volatility surface fit per expiration
 *   - Spread-adjusted edge for each option contract (actual IV vs SVI fair IV)
 */
router.get("/scan/:ticker", async (req, res) => {
  const ticker = (req.params.ticker || "").toUpperCase();

  if (!TICKER_REGEX.test(ticker)) {
    return res.status(400).json({ success: false, error: `Invalid ticker: ${ticker}` });
  }

  try {
    // ─── 1. Fetch data in parallel ───────────────────────────────────────
    const [chain, historicalDaily, historicalIV] = await Promise.all([
      getOptionChainParsed(ticker),
      yf.getHistoricalDailyData(ticker).catch(() => []),
      getHistoricalIV(ticker).catch(() => []),
    ]);

    const underlyingPrice = chain.underlyingPrice || 0;
    const allOptions = [...chain.calls, ...chain.puts];

    // ─── 2. Context calculations ─────────────────────────────────────────
    // Realized Volatility (20-day, annualized)
    const closePrices = historicalDaily.map((d) => d.close);
    const rv = calcRealizedVolatility(closePrices, 20);

    // ATM IV
    const atmIV = getAtmIV(allOptions, underlyingPrice);

    // IV Rank (IVR) and IV Percentile (IVP) — prefer historical IV from DB,
    // fall back to current chain-wide IV distribution if not enough data
    const ivHistory = historicalIV.map((h) => h.iv);
    const ivrSource = ivHistory.length > 0 ? ivHistory : allOptions
      .filter((o) => o.iv != null && Number.isFinite(o.iv))
      .map((o) => o.iv);
    const ivrSourceType = ivHistory.length > 0 ? "historical" : "chain-proxy";

    const ivr = calcIVRank(atmIV, ivrSource);
    const ivp = calcIVPercentile(atmIV, ivrSource);

    // Gamma Exposure (DTE <= 30 only)
    const gex = calcGEX(allOptions, underlyingPrice);

    // ─── 3. Group by expiration, fit SVI, compute edges ──────────────────
    const expirationGroups = groupByExpiration(allOptions);
    const expirations = [];

    const sortedEntries = Object.entries(expirationGroups).sort(
      ([, a], [, b]) => a[0].dte - b[0].dte,
    );

    for (const [, group] of sortedEntries) {
      const dte = group[0].dte;

      // Build log-strike / IV data for SVI fitting
      const kData = [];
      const ivData = [];
      for (const opt of group) {
        if (opt.iv != null && Number.isFinite(opt.iv) && opt.strike > 0) {
          kData.push(logStrike(opt.strike, underlyingPrice));
          ivData.push(opt.iv);
        }
      }

      // Fit SVI surface
      const sviParams = fitSVI(kData, ivData);

      // Compute edge per option
      const options = group.map((opt) => {
        let sviIv = null;
        let rawEdge = null;
        let adjustedEdge = null;

        if (
          sviParams &&
          opt.iv != null &&
          Number.isFinite(opt.iv) &&
          opt.strike > 0
        ) {
          const k = logStrike(opt.strike, underlyingPrice);
          sviIv = Math.sqrt(sviTotalVariance(k, sviParams));
          rawEdge = Number((opt.iv - sviIv).toFixed(6));
          if (opt.ask != null && opt.bid != null && opt.vega != null) {
            adjustedEdge = Number(
              calcSpreadAdjustedEdge(rawEdge, opt.ask, opt.bid, opt.vega).toFixed(6),
            );
          }
        }

        return {
          type: opt.type,
          strike: opt.strike,
          bid: opt.bid,
          ask: opt.ask,
          last: opt.last,
          volume: opt.volume,
          openInterest: opt.openInterest,
          iv: opt.iv,
          delta: opt.delta,
          gamma: opt.gamma,
          theta: opt.theta,
          vega: opt.vega,
          rho: opt.rho,
          dte: opt.dte,
          itm: opt.itm,
          sviIv,
          rawEdge,
          adjustedEdge,
        };
      });

      expirations.push({ date: group[0].expirationStr, dte, svi: sviParams, options });
    }

    // Sort by nearest expiration first
    expirations.sort((a, b) => a.dte - b.dte);

    res.json({
      success: true,
      data: {
        ticker,
        underlyingPrice,
        context: {
          rv,
          ivr: {
            ivr: ivr.ivr,
            minIV: ivr.minIV,
            maxIV: ivr.maxIV,
            count: ivr.count,
            source: ivrSourceType,
          },
          ivp: {
            value: ivp,
            count: ivrSource.length,
            source: ivrSourceType,
          },
          gex: {
            total: Number(gex.total.toFixed(2)),
            callGex: Number(gex.callGex.toFixed(2)),
            putGex: Number(gex.putGex.toFixed(2)),
            contractCount: gex.contractCount,
            note: "DTE <= 30 filter applied.",
          },
        },
        expirations,
      },
    });
  } catch (err) {
    console.error(`[options/scan] ${ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Group option contracts by expiration date string. */
function groupByExpiration(options) {
  const groups = {};
  for (const opt of options) {
    const key = opt.expirationStr;
    if (!groups[key]) groups[key] = [];
    groups[key].push(opt);
  }
  return groups;
}

/**
 * Get ATM IV — IV of the option whose strike is closest to the underlying price.
 * @returns {number|null}
 */
function getAtmIV(options, underlyingPrice) {
  let best = null;
  let bestDist = Infinity;
  for (const opt of options) {
    if (opt.iv != null && Number.isFinite(opt.iv)) {
      const dist = Math.abs(opt.strike - underlyingPrice);
      if (dist < bestDist) {
        bestDist = dist;
        best = opt.iv;
      }
    }
  }
  return best;
}

export default router;
