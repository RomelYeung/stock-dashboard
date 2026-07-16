import cron from "node-cron";
import { fileURLToPath } from "url";
import { ingestHistoricalIV } from "../services/historical-iv.js";
import prisma from "../services/db.js";

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
    console.error(`[IV Worker] Error fetching active tickers from DB: ${err.message}`);
    return DEFAULT_TICKERS;
  }
}

/**
 * Run ingestion for every active ticker.
 * Catches per-ticker errors so a single failure doesn't stop the batch.
 * @returns {Promise<{ ticker: string, iv: number | null }[]>}
 */
export async function ingestAllTickers() {
  const results = [];
  const tickers = await getActiveTickers();

  for (const ticker of tickers) {
    try {
      const result = await ingestHistoricalIV(ticker);
      if (result) {
        results.push(result);
        console.log(`[IV Worker] Success: ${ticker} IV = ${result.iv}`);
      } else {
        results.push({ ticker, iv: null });
        console.warn(`[IV Worker] No data: ${ticker}`);
      }
    } catch (err) {
      results.push({ ticker, iv: null });
      console.error(`[IV Worker] Error: ${ticker} — ${err.message}`);
    }
  }

  const succeeded = results.filter((r) => r.iv != null).length;
  const failed = results.length - succeeded;
  console.log(
    `[IV Worker] Ingestion complete: ${succeeded} succeeded, ${failed} failed`,
  );

  return results;
}

/**
 * Checks if it is a weekday in New York timezone, checks if today's IV records
 * exist in the database, and runs ingestion in the background if they don't.
 * @returns {Promise<void>}
 */
export async function runStartupCheck() {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
    });
    const weekday = formatter.format(new Date());
    const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);

    if (!isWeekday) {
      console.log(`[IV Worker] Startup check skipped: today is ${weekday} (weekend in New York)`);
      return;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const count = await prisma.historicalIV.count({
      where: { date: today },
    });

    if (count === 0) {
      console.log("[IV Worker] Startup check: No historical IV records found for today. Starting background ingestion...");
      return ingestAllTickers().catch((err) => {
        console.error(`[IV Worker] Background startup ingestion failed: ${err.message}`);
      });
    } else {
      console.log(`[IV Worker] Startup check: ${count} historical IV records already exist for today.`);
    }
  } catch (err) {
    console.error(`[IV Worker] Error during startup check: ${err.message}`);
  }
}

/**
 * Schedule the daily IV ingestion cron job.
 * Runs weekdays at 17:00 America/New_York (5 PM Eastern Time — after market close).
 * @returns {import("node-cron").ScheduledTask}
 */
export function startCronJob() {
  const task = cron.schedule("0 17 * * 1-5", () => {
    console.log("[IV Worker] Starting daily scheduled IV ingestion...");
    ingestAllTickers();
  }, {
    timezone: "America/New_York"
  });
  task.start();
  console.log("[IV Worker] Cron scheduled: daily at 17:00 America/New_York (Mon-Fri)");

  // Run startup check asynchronously
  runStartupCheck();

  return task;
}

// ─── Run directly ─────────────────────────────────────────────────────────
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  startCronJob();
}

