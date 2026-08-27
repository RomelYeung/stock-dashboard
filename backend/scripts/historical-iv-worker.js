import cron from "node-cron";
import { fileURLToPath } from "url";
import { ingestHistoricalIV } from "../services/historical-iv.js";
import prisma from "../services/db.js";
import {
  isTradingDay,
  getNYTradingDateStr,
  getMissedTradingDays
} from "../services/trading-calendar.js";

/** Default tickers to track for historical IV. */
export const DEFAULT_TICKERS = [
  "SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "META",
];

/**
 * Fetch unique tickers from PortfolioItem and WishListItem, merged with DEFAULT_TICKERS.
 * @returns {Promise<string[]>}
 */
export async function getActiveTickers() {
  try {
    const portfolioItems = await prisma.portfolioItem.findMany({
      select: { ticker: true }
    });
    const wishlistItems = await prisma.wishListItem.findMany({
      select: { ticker: true }
    });
    const dbTickers = [
      ...portfolioItems.map(item => item.ticker),
      ...wishlistItems.map(item => item.ticker)
    ];
    const uniqueTickers = new Set([
      ...DEFAULT_TICKERS.map(t => t.trim().toUpperCase()),
      ...dbTickers.map(t => t.trim().toUpperCase())
    ]);
    return Array.from(uniqueTickers).filter(Boolean);
  } catch (err) {
    console.error(`[IV Worker] [${new Date().toISOString()}] Error fetching active tickers from DB: ${err.message}`);
    return DEFAULT_TICKERS;
  }
}

/**
 * Run ingestion for every active ticker.
 * Catches per-ticker errors so a single failure doesn't stop the batch.
 * @param {string|null} tradingDate - Optional YYYY-MM-DD trading date string
 * @returns {Promise<{ ticker: string, iv: number | null }[]>}
 */
export async function ingestAllTickers(tradingDate = null) {
  const results = [];
  const tickers = await getActiveTickers();

  for (const ticker of tickers) {
    try {
      const result = await ingestHistoricalIV(ticker, tradingDate);
      if (result) {
        results.push(result);
        console.log(`[IV Worker] [${new Date().toISOString()}] Success: ${ticker} IV = ${result.iv}${tradingDate ? ` (Backfill ${tradingDate})` : ""}`);
      } else {
        results.push({ ticker, iv: null });
        console.warn(`[IV Worker] [${new Date().toISOString()}] No data: ${ticker}`);
      }
    } catch (err) {
      results.push({ ticker, iv: null });
      console.error(`[IV Worker] [${new Date().toISOString()}] Error: ${ticker} — ${err.message}`);
    }
  }

  const succeeded = results.filter((r) => r.iv != null).length;
  const failed = results.length - succeeded;
  console.log(
    `[IV Worker] [${new Date().toISOString()}] Ingestion complete${tradingDate ? ` for ${tradingDate}` : ""}: ${succeeded} succeeded, ${failed} failed`
  );

  return results;
}

export async function runIngestionWithRetry(attempt = 1) {
  try {
    const todayStr = getNYTradingDateStr();
    if (!isTradingDay(todayStr)) {
      console.log(`[IV Worker] [${new Date().toISOString()}] Skip ingestion: ${todayStr} is not a trading day.`);
      return;
    }
    
    if (attempt === 1) {
      await runBackfill();
    }

    console.log(`[IV Worker] [${new Date().toISOString()}] Starting ingestion for ${todayStr} (Attempt ${attempt})`);
    const results = await ingestAllTickers(todayStr);
    
    const succeeded = results.filter((r) => r.iv != null).length;
    
    // If more than 50% failed, retry up to 2 times
    if (results.length > 0 && succeeded < results.length / 2) {
      if (attempt < 3) {
        console.warn(`[IV Worker] [${new Date().toISOString()}] >50% ingestion failures. Retrying in 30 minutes (Attempt ${attempt + 1})...`);
        setTimeout(() => runIngestionWithRetry(attempt + 1), 30 * 60 * 1000);
      } else {
        console.error(`[IV Worker] [${new Date().toISOString()}] Ingestion failed after 3 attempts.`);
      }
    }
  } catch (err) {
    console.error(`[IV Worker] [${new Date().toISOString()}] Error in runIngestionWithRetry: ${err.message}`);
  }
}

export async function runBackfill() {
  try {
    console.log(`[IV Worker] [${new Date().toISOString()}] Starting backfill check...`);
    const todayStr = getNYTradingDateStr();
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 7);
    const sinceStr = lookbackDate.toISOString().split("T")[0];
    const recentTradingDays = getMissedTradingDays(sinceStr, todayStr);

    const activeTickers = await getActiveTickers();
    const expectedCount = Math.max(1, activeTickers.length);

    const nyHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date()),
      10
    );

    const daysToBackfill = [];
    for (const dayStr of recentTradingDays) {
      if (dayStr < todayStr || (dayStr === todayStr && nyHour >= 18)) {
        const count = await prisma.historicalIV.count({
          where: { date: new Date(dayStr + "T00:00:00Z") },
        });
        if (count < expectedCount * 0.8) {
          daysToBackfill.push(dayStr);
        }
      }
    }

    if (daysToBackfill.length === 0) {
      console.log(`[IV Worker] [${new Date().toISOString()}] Backfill: all recent trading days fully covered`);
      return;
    }

    if (daysToBackfill.length > 5) {
      console.warn(
        `[IV Worker] [${new Date().toISOString()}] Backfill: WARNING - missed ${daysToBackfill.length} days (${daysToBackfill[0]} to ${daysToBackfill[daysToBackfill.length - 1]}). Gap is too large to backfill accurately, skipping.`
      );
      return;
    }

    console.log(
      `[IV Worker] [${new Date().toISOString()}] Backfill: Found ${daysToBackfill.length} missed days. Starting backfill sequence...`
    );

    for (const dayStr of daysToBackfill) {
      console.log(`[IV Worker] [${new Date().toISOString()}] Backfill: Starting for ${dayStr}`);
      await ingestAllTickers(dayStr);
      console.log(`[IV Worker] [${new Date().toISOString()}] Backfill: Completed for ${dayStr}`);
    }

    console.log(`[IV Worker] [${new Date().toISOString()}] Backfill: All missed days completed.`);
  } catch (err) {
    console.error(`[IV Worker] [${new Date().toISOString()}] Error during backfill: ${err.message}`);
  }
}

/**
 * Schedule the daily IV ingestion cron jobs.
 */
export function startCronJob() {
  // Primary cron: 5 PM ET Mon-Fri
  const primaryTask = cron.schedule("0 17 * * 1-5", () => {
    console.log(`[IV Worker] [${new Date().toISOString()}] Primary cron triggered.`);
    runIngestionWithRetry();
  }, {
    timezone: "America/New_York"
  });
  primaryTask.start();
  console.log(`[IV Worker] [${new Date().toISOString()}] Primary Cron scheduled: daily at 17:00 America/New_York (Mon-Fri)`);

  // Safety-net cron: 6 PM ET Mon-Fri
  const safetyTask = cron.schedule("0 18 * * 1-5", async () => {
    console.log(`[IV Worker] [${new Date().toISOString()}] Safety-net cron triggered.`);
    try {
      const todayStr = getNYTradingDateStr();
      if (!isTradingDay(todayStr)) return;
      
      const todayDate = new Date(todayStr + "T00:00:00Z");
      const count = await prisma.historicalIV.count({
        where: { date: todayDate },
      });
      
      if (count === 0) {
        console.log(`[IV Worker] [${new Date().toISOString()}] Safety-net: No records for ${todayStr}. Running ingestion...`);
        runIngestionWithRetry();
      } else {
        console.log(`[IV Worker] [${new Date().toISOString()}] Safety-net: ${count} records exist for ${todayStr}. All good.`);
      }
    } catch (err) {
      console.error(`[IV Worker] [${new Date().toISOString()}] Error in safety-net cron: ${err.message}`);
    }
  }, {
    timezone: "America/New_York"
  });
  safetyTask.start();
  console.log(`[IV Worker] [${new Date().toISOString()}] Safety-net Cron scheduled: daily at 18:00 America/New_York (Mon-Fri)`);

  // Run backfill asynchronously on startup
  runBackfill();

  return primaryTask;
}

// ─── Run directly ─────────────────────────────────────────────────────────
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  startCronJob();
}


