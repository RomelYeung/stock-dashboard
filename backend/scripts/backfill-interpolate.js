import dotenv from "dotenv";
dotenv.config();

/**
 * One-time repair: linearly interpolate missing HistoricalIV trading days
 * from each ticker's own nearest existing neighbors.
 *
 * Usage:
 *   node scripts/backfill-interpolate.js           # dry run (default)
 *   node scripts/backfill-interpolate.js --apply   # write rows
 */

import { fileURLToPath } from "url";
import prisma from "../services/db.js";

// Single-trading-day gaps left by server downtime; every date has real
// recorded days on both sides, so midpoint interpolation is high fidelity.
const TARGET_DATES = [
  "2026-06-24",
  "2026-06-29",
  "2026-07-06",
  "2026-07-10",
  "2026-07-17",
  "2026-07-22",
  "2026-07-24",
];

// Safety cap: only interpolate when both neighbors are within 7 calendar
// days of the target (all current gaps are 2-4 days).
const MAX_NEIGHBOR_DISTANCE_MS = 7 * 24 * 60 * 60 * 1000;

export function toDayMs(dayStr) {
  return new Date(dayStr + "T00:00:00Z").getTime();
}

export function planInterpolation(rows, targetDates = TARGET_DATES) {
  const byTicker = new Map();
  for (const r of rows) {
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, []);
    byTicker.get(r.ticker).push(r);
  }
  for (const list of byTicker.values()) {
    list.sort((a, b) => a.date - b.date);
  }

  const plan = [];
  for (const dayStr of targetDates) {
    const dMs = toDayMs(dayStr);
    for (const [ticker, list] of byTicker) {
      let prev = null;
      let next = null;
      for (const r of list) {
        if (r.date < dMs) prev = r;
        else if (r.date > dMs) {
          next = r;
          break;
        }
      }
      if (!prev || !next) continue; // ticker didn't exist on both sides
      if (dMs - prev.date > MAX_NEIGHBOR_DISTANCE_MS) continue;
      if (next.date - dMs > MAX_NEIGHBOR_DISTANCE_MS) continue;
      plan.push({
        ticker,
        dayStr,
        prevIv: prev.iv,
        prevDay: new Date(prev.date).toISOString().split("T")[0],
        nextIv: next.iv,
        nextDay: new Date(next.date).toISOString().split("T")[0],
        iv: (prev.iv + next.iv) / 2,
        date: new Date(dMs),
      });
    }
  }
  return plan;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const apply = process.argv.includes("--apply");
  let exitCode = 0;

  try {
    const before = await prisma.historicalIV.count();
    console.log(`[interpolate] existing rows: ${before}`);
    console.log(
      `[interpolate] mode: ${apply ? "APPLY" : "DRY RUN"}`
    );

    const rows = await prisma.historicalIV.findMany({
      select: { ticker: true, date: true, iv: true },
    });
    const plan = planInterpolation(rows);

    for (const p of plan) {
      console.log(
        `[interpolate] ${p.ticker} ${p.dayStr}  prev=${p.prevIv.toFixed(4)}(${p.prevDay})  next=${p.nextIv.toFixed(4)}(${p.nextDay})  ->  ${p.iv.toFixed(4)}`
      );
    }

    // Per-day counts + skipped summary
    const perDay = {};
    for (const p of plan) perDay[p.dayStr] = (perDay[p.dayStr] || 0) + 1;
    for (const dayStr of TARGET_DATES) {
      console.log(`[interpolate] ${dayStr}: ${perDay[dayStr] || 0} tickers`);
    }

    if (!apply) {
      console.log(
        `[interpolate] dry run complete. Would insert ${plan.length} rows (total would be ${before + plan.length}). Re-run with --apply to write.`
      );
    } else {
      // Skip targets that already have a row so re-runs are true no-ops.
      const pending = [];
      for (const p of plan) {
        const exists = await prisma.historicalIV.findUnique({
          where: {
            ticker_date: { ticker: p.ticker, date: p.date },
          },
          select: { ticker: true },
        });
        if (!exists) pending.push(p);
      }
      console.log(
        `[interpolate] ${plan.length - pending.length} of ${plan.length} planned rows already present`
      );

      let inserted = 0;
      for (const p of pending) {
        await prisma.historicalIV.upsert({
          where: {
            ticker_date: { ticker: p.ticker, date: p.date },
          },
          create: { ticker: p.ticker, date: p.date, iv: p.iv },
          update: { iv: p.iv },
        });
        inserted += 1;
      }
      const after = await prisma.historicalIV.count();
      console.log(
        `[interpolate] applied ${inserted} upserts; row count ${before} -> ${after}`
      );
      if (after !== before + pending.length) {
        console.error(
          `[interpolate] MISMATCH: expected ${before + pending.length}, got ${after}`
        );
        exitCode = 1;
      }
    }
  } catch (err) {
    console.error("[interpolate] failed:", err);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
    process.exit(exitCode);
  }
}
