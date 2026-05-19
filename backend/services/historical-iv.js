import prisma from "./db.js";
import { getOptionChainParsed } from "./schwab-client.js";

/**
 * Find ATM IV — IV of the option whose strike is closest to the underlying price.
 * Searches both calls and puts.
 * @param {{ strike: number, iv: number }[]} options
 * @param {number} underlyingPrice
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

/**
 * Fetch today's ATM IV for a ticker and upsert it into the HistoricalIV table.
 * @param {string} ticker
 * @returns {Promise<{ ticker: string, iv: number } | null>}
 */
export async function ingestHistoricalIV(ticker) {
  let chain;
  try {
    chain = await getOptionChainParsed(ticker);
  } catch {
    return null;
  }

  const allOptions = [...chain.calls, ...chain.puts];
  if (allOptions.length === 0) return null;

  const atmIV = getAtmIV(allOptions, chain.underlyingPrice);
  if (atmIV == null) return null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.historicalIV.upsert({
    where: { ticker_date: { ticker, date: today } },
    update: { iv: atmIV },
    create: { ticker, date: today, iv: atmIV },
  });

  return { ticker, iv: atmIV };
}

/**
 * Query historical IV data for a ticker with a lookback period.
 * @param {string} ticker
 * @param {number} [days=252] - Number of calendar days to look back (default ~1 trading year)
 * @returns {Promise<{ date: string, iv: number }[]>}
 */
export async function getHistoricalIV(ticker, days = 252) {
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - days);
  lookback.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.historicalIV.findMany({
    where: {
      ticker,
      date: { gte: lookback },
    },
    orderBy: { date: "desc" },
  });

  return rows.map((r) => ({
    date: r.date.toISOString().split("T")[0],
    iv: r.iv,
  }));
}
