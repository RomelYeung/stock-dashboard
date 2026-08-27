import { CACHE_TTL_EARNINGS_CALENDAR } from "../constants.js";

/**
 * Earnings calendar service (Finnhub primary source).
 *
 * Finnhub's `/calendar/earnings` endpoint returns at most 1500 rows per call
 * and orders them by symbol, so a wide date range silently truncates (e.g.
 * FICO disappears because it sorts after the first 1500). To get a complete,
 * reliable map we scan in weekly windows and recursively subdivide any window
 * that hits the 1500 cap. The resulting symbol -> next-date map is cached for
 * a day and looked up per ticker.
 *
 * If FINNHUB_API_KEY is unset (or the fetch fails), the map is empty and
 * callers fall back to Yahoo Finance (+ quarter projection in yahoofinance.js).
 */

const getApiKey = () => process.env.FINNHUB_API_KEY;
const BASE_URL = "https://finnhub.io/api/v1/calendar/earnings";
const HORIZON_DAYS = 90;
const WINDOW_DAYS = 7;
const RESULT_CAP = 1500;
const MAX_SUBDIVIDE_DEPTH = 4;

let cache = { map: null, expires: 0 };
let inflight = null; // dedupe concurrent loads

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchWindow(from, to) {
  const url = `${BASE_URL}?from=${toISODate(from)}&to=${toISODate(to)}&token=${getApiKey()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`Finnhub earnings calendar HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.earningsCalendar) ? data.earningsCalendar : [];
}

// Recursively fetch a date range, subdividing any window that hits the cap.
async function fetchRange(from, to, depth = 0) {
  let entries;
  try {
    entries = await fetchWindow(from, to);
  } catch (err) {
    console.error(
      `[earningsCalendar] fetch failed ${toISODate(from)}..${toISODate(to)}:`,
      err.message
    );
    return [];
  }

  if (entries.length >= RESULT_CAP && depth < MAX_SUBDIVIDE_DEPTH) {
    const mid = new Date((from.getTime() + to.getTime()) / 2);
    const left = await fetchRange(from, mid, depth + 1);
    const right = await fetchRange(mid, to, depth + 1);
    return left.concat(right);
  }
  return entries;
}

async function loadCalendar() {
  if (!getApiKey()) return new Map();
  const now = Date.now();
  if (cache.map && now < cache.expires) return cache.map;
  if (inflight) return inflight;

  inflight = (async () => {
    const start = startOfToday();
    const end = new Date(start);
    end.setDate(end.getDate() + HORIZON_DAYS);

    const all = await fetchRange(start, end);
    const map = new Map();
    for (const e of all) {
      const sym = (e.symbol || "").toUpperCase();
      if (!sym || !e.date) continue;
      const existing = map.get(sym);
      // Keep the earliest future-ish date we see for the symbol.
      if (!existing || e.date < existing.date) {
        map.set(sym, { date: e.date, hour: e.hour || null });
      }
    }
    cache = { map, expires: Date.now() + CACHE_TTL_EARNINGS_CALENDAR * 1000 };
    console.log(`[earningsCalendar] loaded ${map.size} upcoming earnings dates`);
    return map;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function toISODateTime(entry) {
  const dateStr = entry.date;
  if (entry.hour === "amc") return `${dateStr}T20:00:00.000Z`; // after market close
  if (entry.hour === "bmo") return `${dateStr}T12:30:00.000Z`; // before market open
  return `${dateStr}T00:00:00.000Z`;
}

/**
 * Return the next upcoming earnings date (ISO string) for a ticker from the
 * Finnhub calendar, or null when unavailable.
 */
export async function getNextEarningsDate(ticker) {
  const map = await loadCalendar();
  const entry = map.get(ticker.toUpperCase());
  if (!entry) return null;
  return toISODateTime(entry);
}

/** Fire-and-forget preload for server startup (populates the daily cache). */
export function preloadEarningsCalendar() {
  if (!getApiKey()) return;
  loadCalendar().catch((err) =>
    console.error("[earningsCalendar] preload failed:", err.message)
  );
}
