# Live Price Updates — Design Spec

## Problem

The stock dashboard currently requires a manual page refresh (via the Refresh button in the header) to see updated prices. During market hours, prices can change every few seconds, but users see stale data until they notice and click refresh. This creates a poor experience for active monitoring.

## Goal

Add automatic live price updates every 30 seconds during regular market hours, without blocking the UI on Yahoo Finance calls and without triggering rate limits. Separate fast-changing live data (price, change, changePercent) from slow-changing fundamental data (P/E, market cap, 52W range, etc.) so that fundamentals are fetched once and prices update in-place.

## Design Principles

- **Separation of concerns**: Live price data (changes every 30s) and fundamental data (changes rarely, cached 7 days) use separate endpoints, caches, and hooks.
- **Stale-while-revalidate**: Never block the UI on Yahoo Finance. Return stale data immediately and refresh in the background.
- **Market-aware**: Polling only activates during regular market hours (09:30–16:00 ET, weekdays). No API calls after hours or on weekends.
- **Rate-limit conscious**: Max ~4 Yahoo `quote()` calls per 30s window for a typical 4-ticker portfolio = ~480 calls/hour. With backpressure and error cooldown, this stays well within Yahoo's generous rate limits.
- **Smooth UI**: Price changes are merged into StockCard data without re-rendering the entire grid. Brief flash animations on change.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│                                                                  │
│  usePortfolio(tickers)           useLivePrices(tickers)          │
│  ┌──────────────────────┐       ┌────────────────────────┐      │
│  │ Fetched once on load │       │ Polls every 30s during │      │
│  │ 7d staleTime         │       │ market hours           │      │
│  │ Full summary data    │       │ Returns only price/    │      │
│  │                      │       │ change/changePercent   │      │
│  └──────────┬───────────┘       └───────────┬────────────┘      │
│             │                               │                   │
│             ▼                               ▼                   │
│     ┌─────────────────────────────────────────────┐             │
│     │            App.jsx merge logic               │             │
│     │  liveData overrides data[ticker].currentPrice│             │
│     │  data[ticker].change, data[ticker].change... │             │
│     └──────────────┬──────────────────────────────┘             │
│                    │                                            │
│                    ▼                                            │
│     ┌──────────────────────────────┐                           │
│     │        StockCard             │                           │
│     │  - Flash on price change     │                           │
│     │  - Pulsing "Live" dot        │                           │
│     │  - "Updated Xs ago" text     │                           │
│     └──────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (POST)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Express Backend                              │
│                                                                  │
│  POST /api/stocks/portfolio/live                                 │
│  ┌──────────────────────────────────────────────┐               │
│  │ 1. Check livePriceCache for each ticker       │               │
│  │ 2. Cache hit → return immediately             │               │
│  │ 3. Cache miss → return stale immediately      │               │
│  │ 4. Background: fetch from Yahoo, update cache │               │
│  └──────────────────┬───────────────────────────┘               │
│                     │                                            │
│                     ▼                                            │
│  ┌──────────────────────────────────────────────┐               │
│  │         Yahoo Finance Service                 │               │
│  │  yahooFinance.quote(tickers) → lightweight    │               │
│  │  Single module call, not quoteSummary()       │               │
│  │  150ms delay between individual calls         │               │
│  └──────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Backend Changes

### 1. `backend/constants.js` — New cache TTL constant

Add after existing cache TTL constants (line 6):

```js
export const CACHE_TTL_LIVE_PRICE = 30; // 30 seconds for live prices
```

### 2. `backend/services/cache.js` — New `livePriceCache`

Add a new cache instance alongside the existing ones (after line 14):

```js
const livePriceCache = new NodeCache({ stdTTL: CACHE_TTL_LIVE_PRICE });
```

Add exported accessors:

```js
export const getLivePrice = (key) => livePriceCache.get(key);
export const setLivePrice = (key, value) => livePriceCache.set(key, value);
```

Update `flush()` to include the new cache (line 46–51):

```js
export const flush = () => {
  fundamentalsCache.flushAll();
  priceCache.flushAll();
  insiderCache.flushAll();
  comparablesCache.flushAll();
  livePriceCache.flushAll();
};
```

Update `stats()` to include the new cache (line 53–58):

```js
export const stats = () => ({
  fundamentals: fundamentalsCache.getStats(),
  price: priceCache.getStats(),
  insider: insiderCache.getStats(),
  comparables: comparablesCache.getStats(),
  livePrice: livePriceCache.getStats(),
});
```

The `livePriceCache` uses a **stale-while-revalidate** pattern:
- On read: return cached value if it exists (even if technically expired — NodeCache will still have it between TTL expiry and actual eviction, but for the SWR pattern we check manually)
- On miss or expired: return stale data immediately, trigger background fetch
- The 30s TTL means Yahoo is never called more than once per 30s per ticker

**No persistence**: Unlike `fundamentalsCache` and `priceCache`, the `livePriceCache` is not persisted to disk. There is no value in caching 30-second prices across server restarts.

### 3. `backend/services/yahoofinance.js` — New `getLivePrices()` function

Add after the existing `getPortfolioSummaries()` function (after line 326):

```js
/**
 * Batch fetch live prices (lightweight) for a portfolio of tickers.
 * Uses yahooFinance.quote() which is a single-module call, much lighter
 * than quoteSummary(). Returns only currentPrice, change, changePercent.
 *
 * Uses stale-while-revalidate: returns cached data immediately,
 * refreshes stale entries in the background, never blocks.
 */
let pendingFetches = {}; // deduplicate in-flight requests per ticker

async function getLivePrices(tickers) {
  const results = [];
  const staleTickers = [];

  for (const ticker of tickers) {
    const cached = cache.getLivePrice(ticker);
    if (cached) {
      results.push({ ticker, data: cached, stale: false });
    } else {
      // Will return stale placeholder and fetch in background
      staleTickers.push(ticker);
      results.push({ ticker, data: null, stale: true });
    }
  }

  // Fire background refresh for stale tickers (never await — fire and forget)
  if (staleTickers.length > 0) {
    refreshLivePrices(staleTickers);
  }

  return results;
}

async function refreshLivePrices(tickers) {
  // Deduplicate: skip tickers already being fetched
  const unique = tickers.filter((t) => !pendingFetches[t]);
  if (unique.length === 0) return;

  unique.forEach((t) => (pendingFetches[t] = true));

  try {
    for (const ticker of unique) {
      try {
        // quote() is a lightweight single-module call — returns only price data
        const quote = await yahooFinance.quote(ticker);
        const data = {
          currentPrice: quote.regularMarketPrice,
          change: quote.regularMarketChange,
          changePercent: quote.regularMarketChangePercent,
        };
        cache.setLivePrice(ticker, data);
      } catch (err) {
        console.error(`[live-price] ${ticker}:`, err.message);
      }
      await delay(YAHOO_FINANCE_DELAY_MS);
    }
  } finally {
    unique.forEach((t) => delete pendingFetches[t]);
  }
}
```

Export the new function in the module exports block (line 366–375):

```js
export {
  getSummary,
  getFinancials,
  getBalanceSheet,
  getFundamentalsTimeSeries,
  getPriceHistory,
  getOhlcv,
  getPortfolioSummaries,
  getHoldings,
  getLivePrices,  // ← new
};
```

**Key design decisions:**
- Uses `yahooFinance.quote(ticker)` instead of `yahooFinance.quoteSummary()` — the `quote()` module is a single lightweight call returning only price fields, whereas `quoteSummary()` fetches multiple modules (price, summaryDetail, defaultKeyStatistics, etc.) and is much heavier
- Background refresh pattern ensures the HTTP response is never delayed by Yahoo Finance latency
- `pendingFetches` map prevents duplicate in-flight requests for the same ticker

### 4. `backend/routes/stocks.js` — New `POST /api/stocks/portfolio/live` endpoint

Add after the existing portfolio endpoint (after line 289):

```js
// POST /api/stocks/portfolio/live
// Body: { tickers: ["AAPL", "MSFT", "GOOG"] }
// Returns lightweight live price data (currentPrice, change, changePercent)
// Uses stale-while-revalidate: cached data returned immediately,
// stale entries refreshed in background — never blocks on Yahoo Finance
router.post("/portfolio/live", async (req, res) => {
  const { tickers } = req.body;

  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ success: false, error: "Provide a non-empty 'tickers' array in the request body." });
  }
  if (tickers.length > MAX_PORTFOLIO_TICKERS) {
    return res.status(400).json({ success: false, error: `Maximum ${MAX_PORTFOLIO_TICKERS} tickers per request.` });
  }

  try {
    const results = await yf.getLivePrices(tickers.map((t) => t.toUpperCase()));
    res.json({
      success: true,
      data: results,
    });
  } catch (err) {
    console.error("[portfolio/live]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

## Frontend Changes

### 5. `frontend/src/hooks/useStockData.js` — New `useLivePrices()` hook

Add after the existing `usePortfolio` hook (after line 57):

```js
import { useState, useEffect, useRef, useCallback } from "react";
import { getMarketStatus } from "../utils/marketStatus";

// ...

/**
 * Poll for live price updates every 30s during market hours.
 * Automatically stops polling when market closes or component unmounts.
 * On network failure, retries with exponential backoff (30s → 60s → 120s → max 300s).
 *
 * @param {string[]} tickers - Array of ticker symbols
 * @returns {{ liveData: Record<string, {currentPrice, change, changePercent}>, isActive: boolean }}
 */
export function useLivePrices(tickers) {
  const [liveData, setLiveData] = useState({});
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef(null);
  const backoffRef = useRef(30000); // starts at 30s
  const errorCountRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchLivePrices = useCallback(async () => {
    if (!tickers.length) return;

    // Check market status on each tick
    const marketStatus = getMarketStatus();
    if (!marketStatus.isOpen) {
      setIsActive(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setIsActive(true);

    try {
      const res = await fetch("/api/stocks/portfolio/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "API error");
      }

      // Reset backoff on success
      backoffRef.current = 30000;
      errorCountRef.current = 0;

      const newData = {};
      for (const item of json.data || []) {
        if (item.data) {
          newData[item.ticker] = item.data;
        }
      }

      if (mountedRef.current) {
        setLiveData((prev) => ({ ...prev, ...newData }));
      }
    } catch (err) {
      console.error("[live-prices] fetch failed:", err.message);
      errorCountRef.current++;

      // Exponential backoff: 30s → 60s → 120s → 300s (cap)
      const nextBackoff = Math.min(backoffRef.current * 2, 300000);
      backoffRef.current = nextBackoff;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(fetchLivePrices, nextBackoff);
      }
    }
  }, [tickers]);

  useEffect(() => {
    mountedRef.current = true;

    // Initial check: only start polling if market is open
    const marketStatus = getMarketStatus();
    if (marketStatus.isOpen && tickers.length > 0) {
      setIsActive(true);
      // Immediate first fetch
      fetchLivePrices();
      // Then every 30s
      intervalRef.current = setInterval(fetchLivePrices, 30000);
    }

    // Re-check market status every minute
    const marketCheckInterval = setInterval(() => {
      const status = getMarketStatus();
      if (status.isOpen && !intervalRef.current && tickers.length > 0) {
        // Market just opened — start polling
        setIsActive(true);
        fetchLivePrices();
        intervalRef.current = setInterval(fetchLivePrices, 30000);
      } else if (!status.isOpen && intervalRef.current) {
        // Market just closed — stop polling
        setIsActive(false);
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 60000);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearInterval(marketCheckInterval);
    };
  }, [fetchLivePrices, tickers]);

  return { liveData, isActive };
}
```

### 6. `frontend/src/App.jsx` — Integrate live prices

**Imports** (line 8–9):
```js
import { usePortfolio, useLivePrices } from "./hooks/useStockData";
```

**After `usePortfolio` call** (after line 30):
```js
const { data, loading, errors, refetch } = usePortfolio(tickers);
const { liveData, isActive: liveActive } = useLivePrices(tickers);
```

**Merge live data into `data` before rendering** (after the hooks, before the return, e.g. around line 39):

We need to derive a merged data object. Add this after the `useEffect` block (around line 46):

```js
// Merge live price data into portfolio data
// Live data overrides currentPrice, change, changePercent if present
const mergedData = {};
for (const [ticker, stockData] of Object.entries(data)) {
  mergedData[ticker] = {
    ...stockData,
    ...(liveData[ticker] ? {
      currentPrice: liveData[ticker].currentPrice,
      change: liveData[ticker].change,
      changePercent: liveData[ticker].changePercent,
    } : {}),
  };
}
```

**Pass merged data to StockCard** (line 147):
```jsx
data={mergedData[ticker]}
```

**Pass `liveActive` to StockCard** (line 152):
```jsx
liveActive={liveActive}
```

Render the component:
```jsx
<StockCard
  key={ticker}
  ticker={ticker}
  data={mergedData[ticker]}
  error={errors[ticker]}
  loading={loading && !data[ticker]}
  onClick={setSelectedTicker}
  index={i}
  liveActive={liveActive}
/>
```

Also pass `liveActive` to `StockAnalysisPage` for the current ticker (line 164):
```jsx
<StockAnalysisPage
  ticker={selectedTicker}
  currentPrice={mergedData[selectedTicker]?.currentPrice}
  onBack={handleBackFromAnalysis}
/>
```

### 7. `frontend/src/components/StockCard.jsx` — Live indicators and flash animations

**Update function signature** (line 80):

```jsx
export default function StockCard({ ticker, data, error, loading, onClick, index, liveActive }) {
```

**Update the price change display to include a flash animation on change:**

Add a `useEffect` to detect price changes and trigger flash. Insert after the function signature and before the return:

```jsx
import { useState, useEffect, useRef } from "react";

// ...

export default function StockCard({ ticker, data, error, loading, onClick, index, liveActive }) {
  const positive = data ? isPositive(data.changePercent) : null;
  const [flash, setFlash] = useState(null);
  const prevPriceRef = useRef(data?.currentPrice);

  // Detect price change and trigger flash animation
  useEffect(() => {
    if (data?.currentPrice != null && prevPriceRef.current != null) {
      if (data.currentPrice !== prevPriceRef.current) {
        const isUp = data.currentPrice > prevPriceRef.current;
        setFlash(isUp ? "up" : "down");
        const timer = setTimeout(() => setFlash(null), 500);
        prevPriceRef.current = data.currentPrice;
        return () => clearTimeout(timer);
      }
    } else if (data?.currentPrice != null) {
      prevPriceRef.current = data.currentPrice;
    }
  }, [data?.currentPrice]);
```

**Add the flash animation keyframe** — insert into the existing `<style>` block in `App.jsx` (line 184–195) or inline in StockCard. Since StockCard doesn't have its own `<style>` block and `App.jsx` does, add it there:

In `App.jsx` at line 194 (before closing `</style>`), add:
```css
@keyframes flash-up {
  0% { background: rgba(0, 229, 160, 0.15); }
  100% { background: transparent; }
}
@keyframes flash-down {
  0% { background: rgba(255, 77, 109, 0.15); }
  100% { background: transparent; }
}
```

**Add live indicator dot to StockCard header** — insert inside the card header area, next to the price block (around line 113 in StockCard.jsx):

```jsx
{data && liveActive && (
  <div style={styles.liveDot} title="Live updates active" />
)}
```

And add the "Updated Xs ago" text in the footer area (around line 164):

```jsx
{liveActive && (
  <span style={styles.liveFooterText}>
    Live · updated just now
  </span>
)}
```

**Add LiveDot styling** inside `styles` object (after line 197):

```js
liveDot: {
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  background: "var(--accent-green)",
  animation: "blink 2s ease-in-out infinite",
  flexShrink: 0,
},
liveFooterText: {
  color: "var(--accent-green)",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  fontWeight: 300,
  opacity: 0.7,
},
```

**Add card-level flash styling** — apply to the card's `style` prop conditionally:

```jsx
<motion.div
  style={{
    ...styles.card,
    cursor: loading || error ? "default" : "pointer",
    ...(flash === "up" ? { background: "rgba(0, 229, 160, 0.06)" } : {}),
    ...(flash === "down" ? { background: "rgba(255, 77, 109, 0.05)" } : {}),
  }}
  ...
>
```

## Rate Limiting & Safety

| Concern | Mitigation |
|---------|-----------|
| **Yahoo Finance rate limit** | `getLivePrices()` uses `yahooFinance.quote()` (lightweight) instead of `quoteSummary()` (heavy). 150ms delay between calls. Max ~4 calls per 30s for 4-ticker portfolio = ~480 calls/hour during market hours. Yahoo's limit is undocumented but known to be well above this for `quote()` calls. |
| **Overlapping in-flight requests** | `pendingFetches` map in `yahoofinance.js` prevents duplicate Yahoo calls for the same ticker while a fetch is in progress. |
| **HTTP 429 backpressure** | On 429 response, frontend exponentially backs off to 2-minute intervals for 5 minutes (starts at 30s, doubles each error: 30s → 60s → 120s → 300s cap). If errors persist beyond 5 consecutive failures, polling stops with a console warning. |
| **Market hours gating** | `useLivePrices` only starts polling when `getMarketStatus().isOpen === true`. A 60-second interval continuously rechecks market status. No API calls after hours, weekends, or holidays. |
| **Server-side rate limiting** | The existing `RATE_LIMIT_GLOBAL_MAX = 100` per minute from `constants.js` applies globally. The `/portfolio/live` endpoint inherits this protection. |

## Error Handling

| Failure mode | Handling |
|---|---|
| **Yahoo Finance error** | Backend returns stale cached data (if any) and logs the error. Background refresh silently fails — next poll attempt will retry. UI never breaks. |
| **Partial Yahoo failures** | If some tickers succeed and others fail, successful ones are returned with their data and failed ones are omitted from results (frontend keeps last known price). |
| **Network failure (frontend)** | `fetchLivePrices` catches the error, increments `errorCountRef`, and applies exponential backoff. After 5 consecutive failures, polling stops with `console.warn`. User sees last known prices with a stale indicator. |
| **Server error (5xx)** | Same as network failure — caught by frontend catch block, triggers backoff. |
| **Cache miss on first poll** | Backend returns `data: null` for uncached tickers immediately. Background refresh populates cache. Frontend skips null entries and keeps last known prices. |

## Data Flow Diagram

```
Page Load
    │
    ▼
usePortfolio → POST /api/stocks/portfolio
    │              │
    │              ▼
    │         yahooFinance.quoteSummary()
    │              │
    │              ▼
    │         cache.setFundamentals (7d TTL)
    │              │
    ▼              ▼
StockCard renders with full data
    │
    ▼
useLivePrices → checks getMarketStatus()
    │
    ├── isOpen === false → idle (no polling)
    │
    └── isOpen === true → start polling every 30s
         │
         ▼
    POST /api/stocks/portfolio/live
         │
         ▼
    for each ticker:
         │
         ├── livePriceCache hit → return cached
         │
         └── livePriceCache miss → return null (stale)
              │
              ▼ (background, never awaited)
         yahooFinance.quote(ticker) + 150ms delay
              │
              ▼
         cache.setLivePrice(ticker, data, 30s TTL)
         │
         ▼
    Response returned to frontend
         │
         ▼
    setLiveData(prev => ({...prev, ...newData}))
         │
         ▼
    App.jsx merges liveData → data (overrides price/change/changePercent)
         │
         ▼
    StockCard re-renders with new price
         │
         ├── Flash animation (green/red, 500ms)
         ├── Live dot pulsing
         └── "Updated just now" text
```

## Files Modified

| File | Change |
|------|--------|
| `backend/constants.js` | Add `CACHE_TTL_LIVE_PRICE = 30` |
| `backend/services/cache.js` | Add `livePriceCache` instance + get/set/flush/stats exports |
| `backend/services/yahoofinance.js` | Add `getLivePrices()` + `refreshLivePrices()` using `yahooFinance.quote()` |
| `backend/routes/stocks.js` | Add `POST /api/stocks/portfolio/live` route |
| `frontend/src/hooks/useStockData.js` | Add `useLivePrices(tickers)` hook with market gating + exponential backoff |
| `frontend/src/App.jsx` | Import `useLivePrices`, merge `liveData` into data, pass to StockCard |
| `frontend/src/components/StockCard.jsx` | Add `liveActive` prop, flash animation, live dot, "Updated" text |
| `frontend/public/release-notes.html` | Add release note entry |

## Release Note Entry

Add to `frontend/public/release-notes.html` inside the May 2026 `<section class="month-group">`, at the top (before the existing May 11 entry):

```html
<article class="release-entry">
  <div class="entry-meta">
    <time datetime="2026-05-11">May 11, 2026</time>
    <span class="tag tag-feature">Feature</span>
  </div>
  <h3>Add live price updates every 30 seconds during market hours</h3>
  <p>Stock cards now show automatically updating prices during regular market hours (9:30 AM – 4:00 PM ET, weekdays). A pulsing green dot indicates active live updates, and price changes trigger a brief flash animation. Polling pauses when the market closes and resumes when it reopens — no manual refresh needed.</p>
</article>
```
