import { promises as fs } from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "cache");
const FUNDAMENTALS_FILE = path.join(CACHE_DIR, "fundamentals.json");
const PRICE_FILE = path.join(CACHE_DIR, "price.json");

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

export async function persistCache(fundamentalsCache, priceCache) {
  try {
    await ensureCacheDir();
    const fundamentals = fundamentalsCache.keys().reduce((acc, key) => {
      acc[key] = fundamentalsCache.get(key);
      return acc;
    }, {});
    const prices = priceCache.keys().reduce((acc, key) => {
      acc[key] = priceCache.get(key);
      return acc;
    }, {});

    await fs.writeFile(FUNDAMENTALS_FILE, JSON.stringify(fundamentals));
    await fs.writeFile(PRICE_FILE, JSON.stringify(prices));
  } catch (err) {
    console.error("Failed to persist cache:", err.message);
  }
}

export async function loadCache(fundamentalsCache, priceCache) {
  try {
    await ensureCacheDir();

    try {
      const fundamentalsData = await fs.readFile(FUNDAMENTALS_FILE, "utf-8");
      const fundamentals = JSON.parse(fundamentalsData);
      for (const [key, value] of Object.entries(fundamentals)) {
        fundamentalsCache.set(key, value);
      }
    } catch (err) {
      if (err.code !== "ENOENT") console.error("Failed to load fundamentals cache:", err.message);
    }

    try {
      const priceData = await fs.readFile(PRICE_FILE, "utf-8");
      const prices = JSON.parse(priceData);
      for (const [key, value] of Object.entries(prices)) {
        priceCache.set(key, value);
      }
    } catch (err) {
      if (err.code !== "ENOENT") console.error("Failed to load price cache:", err.message);
    }

    console.log("Cache loaded from disk");
  } catch (err) {
    console.error("Failed to load cache:", err.message);
  }
}
