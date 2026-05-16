import NodeCache from "node-cache";
import { persistCache, loadCache } from "./cache-persist.js";
import {
  CACHE_TTL_FUNDAMENTALS,
  CACHE_TTL_PRICE,
  CACHE_TTL_INSIDER,
  CACHE_TTL_COMPARABLES,
  CACHE_TTL_LIVE_PRICE,
  CACHE_PERSIST_INTERVAL_MS,
} from "../constants.js";

const fundamentalsCache = new NodeCache({ stdTTL: CACHE_TTL_FUNDAMENTALS, maxKeys: 5000, useClones: false });
const priceCache = new NodeCache({ stdTTL: CACHE_TTL_PRICE, maxKeys: 1000, useClones: false });
const insiderCache = new NodeCache({ stdTTL: CACHE_TTL_INSIDER, maxKeys: 1000, useClones: false });
const comparablesCache = new NodeCache({ stdTTL: CACHE_TTL_COMPARABLES, maxKeys: 1000, useClones: false });
const livePriceCache = new NodeCache({ stdTTL: CACHE_TTL_LIVE_PRICE, maxKeys: 1000, useClones: false, checkperiod: 60 });
const earningsProfileCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

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
export const setInsider = (key, value) => insiderCache.set(key, value);

export const getComparables = (key) => comparablesCache.get(key);
export const setComparables = (key, value) => comparablesCache.set(key, value);

export const getLivePrice = (key) => livePriceCache.get(key);
export const setLivePrice = (key, value) => livePriceCache.set(key, value);

export const getEarningsProfile = (key) => earningsProfileCache.get(key);
export const setEarningsProfile = (key, value) => earningsProfileCache.set(key, value);

export { earningsProfileCache };

export const flush = () => {
  fundamentalsCache.flushAll();
  priceCache.flushAll();
  insiderCache.flushAll();
  comparablesCache.flushAll();
  livePriceCache.flushAll();
  earningsProfileCache.flushAll();
};

export const stats = () => {
  const segments = [
    fundamentalsCache.getStats(),
    priceCache.getStats(),
    insiderCache.getStats(),
    comparablesCache.getStats(),
    livePriceCache.getStats(),
    earningsProfileCache.getStats(),
  ];
  return {
    keys: segments.reduce((s, c) => s + c.keys, 0),
    hits: segments.reduce((s, c) => s + c.hits, 0),
    misses: segments.reduce((s, c) => s + c.misses, 0),
    ksize: segments.reduce((s, c) => s + c.ksize, 0),
    vsize: segments.reduce((s, c) => s + c.vsize, 0),
  };
};