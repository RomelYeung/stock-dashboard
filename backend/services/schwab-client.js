import { getValidAccessToken } from "./schwab-auth.js";

const BASE_URL = "https://api.schwabapi.com/marketdata/v1";

// Circuit breaker: track last 429 to avoid hammering a rate-limited API
let last429Time = 0;

/**
 * Build request headers with Bearer token.
 * @param {string} token - Valid access token
 * @returns {object} Headers object
 */
function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

/**
 * Perform a GET request to the Schwab Market Data API.
 * Handles 429 rate limits with Retry-After backoff (one retry)
 * and a 60-second circuit breaker to skip calls after a 429.
 * @param {string} path - URL path (e.g. "/quotes")
 * @param {object} [params] - Query parameters
 * @returns {Promise<object>} Parsed JSON response
 */
async function apiGet(path, params = {}) {
  // Circuit breaker: if 429 received in last 60s, throw immediately
  if (last429Time > 0 && Date.now() - last429Time < 60000) {
    throw new Error("Schwab API 429 circuit breaker: too many requests recently, skipping call");
  }

  const token = await getValidAccessToken();
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(token),
  });

  if (res.status === 429) {
    last429Time = Date.now();
    const retryAfter = res.headers.get("Retry-After");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds) && seconds > 0) {
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        const retryRes = await fetch(url.toString(), {
          method: "GET",
          headers: authHeaders(token),
        });
        if (retryRes.ok) {
          return retryRes.json();
        }
        if (retryRes.status === 429) {
          throw new Error(`Schwab API 429 on GET ${path} after retry: still rate limited`);
        }
        const text = await retryRes.text();
        throw new Error(`Schwab API ${retryRes.status} on GET ${path} (retry): ${text}`);
      }
    }
    throw new Error(`Schwab API 429 on GET ${path}: rate limited`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab API ${res.status} on GET ${path}: ${text}`);
  }

  return res.json();
}

// ─── Endpoint Methods ────────────────────────────────────────────────────

/**
 * Get quotes for one or more symbols.
 * GET /quotes?symbols=AAPL,TSLA&fields=quote,reference
 * @param {string|string[]} symbols - Single symbol or array of symbols
 * @param {string} [fields] - Comma-separated field groups (quote, reference, fundamental, regular, extended)
 * @returns {Promise<object>}
 */
async function getQuotes(symbols, fields) {
  const symbolStr = Array.isArray(symbols) ? symbols.join(",") : symbols;
  const params = { symbols: symbolStr };
  if (fields) params.fields = fields;
  return apiGet("/quotes", params);
}

/**
 * Get a quote for a single symbol.
 * Schwab single-symbol endpoint returns 404; use batch endpoint.
 * @param {string} symbol
 * @param {string} [fields]
 * @returns {Promise<object|null>}
 */
async function getQuote(symbol, fields) {
  const result = await getQuotes([symbol], fields);
  return result[symbol] || null;
}

/**
 * Get price history for a symbol.
 * GET /pricehistory
 * @param {string} symbol
 * @param {object} [opts]
 * @param {string} [opts.periodType] - day, month, year, ytd
 * @param {number} [opts.period] - Number of periods
 * @param {string} [opts.frequencyType] - minute, daily, weekly, monthly
 * @param {number} [opts.frequency] - Number of frequency units per candle
 * @param {number} [opts.startDate] - Start epoch milliseconds
 * @param {number} [opts.endDate] - End epoch milliseconds
 * @param {boolean} [opts.needExtendedHoursData]
 * @returns {Promise<object>}
 */
async function getPriceHistory(symbol, opts = {}) {
  const params = {};
  if (opts.periodType) params.periodType = opts.periodType;
  if (opts.period !== undefined) params.period = opts.period;
  if (opts.frequencyType) params.frequencyType = opts.frequencyType;
  if (opts.frequency !== undefined) params.frequency = opts.frequency;
  if (opts.startDate !== undefined) params.startDate = opts.startDate;
  if (opts.endDate !== undefined) params.endDate = opts.endDate;
  if (opts.needExtendedHoursData !== undefined) params.needExtendedHoursData = opts.needExtendedHoursData;
  return apiGet(`/pricehistory`, { symbol, ...params });
}

/**
 * Get option chain for a symbol.
 * GET /chains
 * @param {string} symbol
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
async function getOptionChain(symbol, opts = {}) {
  const params = { symbol, ...opts };
  return apiGet("/chains", params);
}

/**
 * Get market movers for an index.
 * GET /movers/{index}
 * @param {string} index - $DJI, $COMPX, $SPX, NYSE, NASDAQ, OTCBB
 * @param {object} [opts]
 * @param {string} [opts.sort] - VOLUME, TRADES, PERCENT_CHANGE_UP, PERCENT_CHANGE_DOWN
 * @param {number} [opts.frequency] - 0, 1, 5, 10, 30, 60
 * @returns {Promise<object>}
 */
async function getMovers(index, opts = {}) {
  return apiGet(`/movers/${encodeURIComponent(index)}`, opts);
}

/**
 * Get market hours for given markets on a date.
 * GET /markets
 * @param {string|string[]} markets - Comma-separated: EQUITY, OPTION, FUTURE, BOND, FOREX
 * @param {string} [date] - YYYY-MM-DD format, defaults to today
 * @returns {Promise<object>}
 */
async function getMarketHours(markets, date) {
  const marketStr = Array.isArray(markets) ? markets.join(",") : markets;
  const params = { markets: marketStr };
  if (date) params.date = date;
  return apiGet("/markets", params);
}

/**
 * Search instruments by symbol or description.
 * GET /instruments
 * @param {string} symbol - Symbol or search string
 * @param {string} projection - symbol-search, symbol-regex, desc-search, desc-regex, fundamental
 * @returns {Promise<object>}
 */
async function getInstruments(symbol, projection) {
  return apiGet("/instruments", { symbol, projection });
}

export {
  getQuotes,
  getQuote,
  getPriceHistory,
  getOptionChain,
  getMovers,
  getMarketHours,
  getInstruments,
};
