import NodeCache from "node-cache";
import { persistCache, loadCache } from "./cache-persist.js";
import {
  CACHE_TTL_FUNDAMENTALS,
  CACHE_TTL_PRICE,
  CACHE_TTL_INSIDER,
  CACHE_TTL_INSIDER_EMPTY,
  CACHE_TTL_COMPARABLES,
  CACHE_TTL_LIVE_PRICE,
  CACHE_TTL_NEWS,
  CACHE_TTL_NEWS_AI,
  CACHE_TTL_GURU_DATA,
  CACHE_PERSIST_INTERVAL_MS,
} from "../constants.js";

const fundamentalsCache = new NodeCache({ stdTTL: CACHE_TTL_FUNDAMENTALS, maxKeys: 5000, useClones: false });
const priceCache = new NodeCache({ stdTTL: CACHE_TTL_PRICE, maxKeys: 1000, useClones: false });
const insiderCache = new NodeCache({ stdTTL: CACHE_TTL_INSIDER, maxKeys: 1000, useClones: false });
const comparablesCache = new NodeCache({ stdTTL: CACHE_TTL_COMPARABLES, maxKeys: 1000, useClones: false });
const livePriceCache = new NodeCache({ stdTTL: CACHE_TTL_LIVE_PRICE, maxKeys: 1000, useClones: false, checkperiod: 60 });
const earningsProfileCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const newsCache = new NodeCache({ stdTTL: CACHE_TTL_NEWS, maxKeys: 500, useClones: false });
const newsSummaryCache = new NodeCache({ stdTTL: CACHE_TTL_NEWS_AI, maxKeys: 500, useClones: false });
const guruDataCache = new NodeCache({ stdTTL: CACHE_TTL_GURU_DATA, maxKeys: 500, useClones: false });

let guruDataEpoch = 0;

// Load persisted cache on startup
loadCache(fundamentalsCache, priceCache);

// Persist cache on changes
const persistInterval = setInterval(() => {
  persistCache(fundamentalsCache, priceCache);
}, CACHE_PERSIST_INTERVAL_MS);

async function gracefulShutdown(signal) {
  clearInterval(persistInterval);
  await persistCache(fundamentalsCache, priceCache);
  console.log(`Cache persisted on ${signal}`);
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export const getFundamentals = (key) => fundamentalsCache.get(key);
export const setFundamentals = (key, value) => fundamentalsCache.set(key, value);

export const getPrice = (key) => priceCache.get(key);
export const setPrice = (key, value) => priceCache.set(key, value);

export const getInsider = (key) => insiderCache.get(key);
export const setInsider = (key, value, ttl) => {
  if (ttl !== undefined) {
    insiderCache.set(key, value, ttl);
  } else {
    insiderCache.set(key, value);
  }
};

export const getComparables = (key) => comparablesCache.get(key);
export const setComparables = (key, value) => comparablesCache.set(key, value);

export const getLivePrice = (key) => livePriceCache.get(key);
export const setLivePrice = (key, value) => livePriceCache.set(key, value);

export const getEarningsProfile = (key) => earningsProfileCache.get(key);
export const setEarningsProfile = (key, value) => earningsProfileCache.set(key, value);

export { earningsProfileCache };

export const getNews = (key) => newsCache.get(key);
export const setNews = (key, value) => newsCache.set(key, value);
export const getNewsSummary = (key) => newsSummaryCache.get(key);
export const setNewsSummary = (key, value) => newsSummaryCache.set(key, value);

export async function getOrFetchGuru(key, fetcher) {
  const epochAtStart = guruDataEpoch;              // capture BEFORE fetching
  const prefixed = `e${epochAtStart}:${key}`;

  // 1. Cache hit (current epoch only)
  const cached = guruDataCache.get(prefixed);
  if (cached !== undefined) return cached;

  // 2. Piggyback on in-flight fetch for the same logical key
  const inflightKey = `guru:${key}`;
  if (inflightRequests.has(inflightKey)) return inflightRequests.get(inflightKey);

  // 3. Fetch exactly once; write under the STARTING epoch only if unchanged
  const promise = fetcher()
    .then((value) => {
      if (epochAtStart === guruDataEpoch) {
        // Empty payloads get a short TTL so arbitrary/empty quarters can't permanently occupy slots
        const short = value && ((Array.isArray(value) && value.length === 0) || (value.history && value.history.length === 0));
        try {
          guruDataCache.set(prefixed, value, short ? 300 : CACHE_TTL_GURU_DATA);
        } catch (err) {
          console.error("[cache] guruDataCache set failed:", err.message); // graceful: overflow must NEVER 500 a request
        }
      }
      return value;
    })
    .finally(() => {
      inflightRequests.delete(inflightKey);
    });
  inflightRequests.set(inflightKey, promise);
  return promise;
}

export const clearGuruData = () => {
  guruDataEpoch += 1;     // in-flight writes land under the old epoch → invisible + already flushed
  guruDataCache.flushAll();
};

export const flush = () => {
  fundamentalsCache.flushAll();
  priceCache.flushAll();
  insiderCache.flushAll();
  comparablesCache.flushAll();
  livePriceCache.flushAll();
  earningsProfileCache.flushAll();
  newsCache.flushAll();
  newsSummaryCache.flushAll();
  guruDataCache.flushAll();
};

export const stats = () => {
  const segments = [
    fundamentalsCache.getStats(),
    priceCache.getStats(),
    insiderCache.getStats(),
    comparablesCache.getStats(),
    livePriceCache.getStats(),
    earningsProfileCache.getStats(),
    newsCache.getStats(),
    newsSummaryCache.getStats(),
    guruDataCache.getStats(),
  ];
  return {
    keys: segments.reduce((s, c) => s + c.keys, 0),
    hits: segments.reduce((s, c) => s + c.hits, 0),
    misses: segments.reduce((s, c) => s + c.misses, 0),
    ksize: segments.reduce((s, c) => s + c.ksize, 0),
    vsize: segments.reduce((s, c) => s + c.vsize, 0),
  };
};

const inflightRequests = new Map();

/**
 * Get a cached value, or fetch it exactly once (even under concurrent load).
 * @param {Function} getter - Cache getter (e.g., getFundamentals)
 * @param {Function} setter - Cache setter (e.g., setFundamentals)
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function to compute the value on miss
 * @param {number} [ttl] - Optional TTL in seconds to pass to the setter
 * @returns {Promise<any>}
 */
export async function getOrFetch(getter, setter, key, fetcher, ttl) {
  // 1. Cache hit — return immediately
  const cached = getter(key);
  if (cached !== undefined) return cached;

  // 2. In-flight request exists — piggyback on it
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  // 3. Cache miss — fetch exactly once
  const promise = fetcher()
    .then((value) => {
      if (ttl !== undefined) {
        setter(key, value, ttl);
      } else {
        setter(key, value);
      }
      return value;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, promise);
  return promise;
}