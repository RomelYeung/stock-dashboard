import cron from "node-cron";
import { fileURLToPath } from "url";
import { ingestHistoricalIV } from "../services/historical-iv.js";

/** Default tickers to track for historical IV. */
export const DEFAULT_TICKERS = [
  "SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "META",
];

/**
 * Run ingestion for every ticker in DEFAULT_TICKERS.
 * Catches per-ticker errors so a single failure doesn't stop the batch.
 * @returns {Promise<{ ticker: string, iv: number | null }[]>}
 */
export async function ingestAllTickers() {
  const results = [];

  for (const ticker of DEFAULT_TICKERS) {
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
 * Schedule the daily IV ingestion cron job.
 * Runs weekdays at 22:00 UTC (5 PM EST / 6 PM EDT — always after market close).
 * @returns {import("node-cron").ScheduledTask}
 */
export function startCronJob() {
  const task = cron.schedule("0 22 * * 1-5", () => {
    console.log("[IV Worker] Starting daily scheduled IV ingestion...");
    ingestAllTickers();
  });
  task.start();
  console.log("[IV Worker] Cron scheduled: daily at 22:00 UTC (Mon-Fri)");
  return task;
}

// ─── Run directly ─────────────────────────────────────────────────────────
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  startCronJob();
}
