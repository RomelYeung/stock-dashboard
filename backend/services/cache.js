import NodeCache from "node-cache";
import { persistCache, loadCache } from "./cache-persist.js";
import {
  CACHE_TTL_FUNDAMENTALS,
  CACHE_TTL_PRICE,
  CACHE_PERSIST_INTERVAL_MS,
} from "../constants.js";

const fundamentalsCache = new NodeCache({ stdTTL: CACHE_TTL_FUNDAMENTALS });
const priceCache = new NodeCache({ stdTTL: CACHE_TTL_PRICE });

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

export const flush = () => {
  fundamentalsCache.flushAll();
  priceCache.flushAll();
};

export const stats = () => ({
  fundamentals: fundamentalsCache.getStats(),
  price: priceCache.getStats(),
});