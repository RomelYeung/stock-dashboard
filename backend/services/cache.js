import NodeCache from "node-cache";

// Default TTL: 2 hours for fundamentals, 15 minutes for price data
const fundamentalsCache = new NodeCache({ stdTTL: 60 * 60 * 2 });
const priceCache = new NodeCache({ stdTTL: 60 * 15 });

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