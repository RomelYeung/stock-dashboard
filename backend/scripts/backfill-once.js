import dotenv from "dotenv";
dotenv.config();

import { fileURLToPath } from "url";
import prisma from "../services/db.js";
import { runBackfill, getActiveTickers } from "./historical-iv-worker.js";
import { getMissedTradingDays } from "../services/trading-calendar.js";

/**
 * Verify that recent trading days have sufficient historical IV rows.
 * Returns { ok: boolean, deficient: Array<{day, count, expected}> }.
 */
export async function verifyRecentCompleteness(prisma, { expectedCountOverride } = {}) {
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());

  const nyHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
    10
  );

  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - 7);
  const sinceStr = lookbackDate.toISOString().split("T")[0];
  const recentTradingDays = getMissedTradingDays(sinceStr, todayStr);

  const expectedCount =
    expectedCountOverride ?? Math.max(1, (await getActiveTickers()).length);

  const deficient = [];
  for (const day of recentTradingDays) {
    if (day < todayStr || (day === todayStr && nyHour >= 18)) {
      const count = await prisma.historicalIV.count({
        where: { date: new Date(day + "T00:00:00Z") },
      });
      if (count < expectedCount * 0.8) {
        deficient.push({ day, count, expected: expectedCount });
      }
    }
  }

  return { ok: deficient.length === 0, deficient };
}

// ─── Run directly ─────────────────────────────────────────────────────
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  let exitCode = 0;

  try {
    console.log("[backfill-once] starting");
    await runBackfill();
    console.log("[backfill-once] runBackfill completed");

    // Independent completeness verification
    const { ok, deficient } = await verifyRecentCompleteness(prisma);
    if (!ok) {
      console.error("[backfill-once] INCOMPLETE:");
      for (const { day, count, expected } of deficient) {
        console.error(`  ${day}: ${count}/${expected} rows`);
      }
      exitCode = 1;
    } else {
      console.log("[backfill-once] completeness verified");
    }
  } catch (err) {
    console.error("[backfill-once] failed:", err);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
    process.exit(exitCode);
  }
}
