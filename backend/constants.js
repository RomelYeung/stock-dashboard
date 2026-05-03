// Cache TTLs (seconds)
export const CACHE_TTL_FUNDAMENTALS = 60 * 60 * 24 * 7; // 7 days
export const CACHE_TTL_PRICE = 60 * 60 * 24; // 1 day
export const CACHE_TTL_FRED = 60 * 60 * 24; // 1 day
export const CACHE_PERSIST_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// API limits
export const MAX_PORTFOLIO_TICKERS = 20;
export const YAHOO_FINANCE_DELAY_MS = 150;

// Ticker validation
export const TICKER_REGEX = /^[A-Z0-9\-\.]{1,10}$/;

// Rate limiting
export const RATE_LIMIT_GLOBAL_MAX = 100;
export const RATE_LIMIT_INDICATORS_MAX = 20;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// Price history
export const VALID_PERIODS = ["1mo", "3mo", "6mo", "1y", "2y", "5y"];

// Margin debt
export const MARGIN_DEBT_UPDATE_DAYS_MIN = 15;
export const MARGIN_DEBT_UPDATE_DAYS_MAX = 21;
export const MARGIN_DEBT_STALE_DAYS = 60;

// External API timeouts
export const FRED_TIMEOUT_MS = 10_000;
