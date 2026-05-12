# Live Price Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic live price updates every 30 seconds during market hours via a lightweight stale-while-revalidate backend endpoint and a frontend polling hook.

**Architecture:** A new `POST /api/stocks/portfolio/live` endpoint returns cached live prices immediately, refreshing stale entries in the background via `yahooFinance.quote()`. The frontend `useLivePrices` hook polls this endpoint every 30s during market hours, with exponential backoff on errors. Live data merges into StockCard props for in-place updates with flash animations.

**Tech Stack:** Express backend (Node.js, yahoo-finance2, node-cache), React frontend (Vite, Framer Motion, @tanstack/react-query)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `backend/constants.js` | Add `CACHE_TTL_LIVE_PRICE = 30` constant |
| `backend/services/cache.js` | Add `livePriceCache` instance (30s TTL, no persistence) |
| `backend/services/yahoofinance.js` | Add `getLivePrices()` (SWR read) and `refreshLivePrices()` (background Yahoo fetch) |
| `backend/routes/stocks.js` | Add `POST /api/stocks/portfolio/live` route handler |
| `frontend/src/hooks/useStockData.js` | Add `useLivePrices(tickers)` hook with market gating + exponential backoff |
| `frontend/src/App.jsx` | Import hook, merge live data into portfolio data, pass to StockCard |
| `frontend/src/components/StockCard.jsx` | Add `liveActive` prop, flash animation, live dot, footer text |
| `frontend/public/release-notes.html` | Add release note entry for May 2026 |

---

### Task 1: Add live price cache TTL constant

**Files:**
- Modify: `backend/constants.js:6`

- [ ] **Step 1: Add `CACHE_TTL_LIVE_PRICE` after existing cache TTLs**

Insert after line 6 (`export const CACHE_TTL_COMPARABLES = 60 * 60 * 24; // 24 hours`):
```js
export const CACHE_TTL_LIVE_PRICE = 30; // 30 seconds for live prices
```

- [ ] **Step 2: Commit**

```bash
git add backend/constants.js
git commit -m "feat: add live price cache TTL constant"
```

---

### Task 2: Add livePriceCache to cache service

**Files:**
- Modify: `backend/services/cache.js:1-58`

- [ ] **Step 1: Import `CACHE_TTL_LIVE_PRICE`**

Update the import block (lines 3–9):
```js
import {
  CACHE_TTL_FUNDAMENTALS,
  CACHE_TTL_PRICE,
  CACHE_TTL_INSIDER,
  CACHE_TTL_COMPARABLES,
  CACHE_TTL_LIVE_PRICE,      // ← add
  CACHE_PERSIST_INTERVAL_MS,
} from "../constants.js";
```

- [ ] **Step 2: Create `livePriceCache` instance**

Add after line 14:
```js
const livePriceCache = new NodeCache({ stdTTL: CACHE_TTL_LIVE_PRICE });
```

- [ ] **Step 3: Add exported accessors**

Add after line 44:
```js
export const getLivePrice = (key) => livePriceCache.get(key);
export const setLivePrice = (key, value) => livePriceCache.set(key, value);
```

- [ ] **Step 4: Update `flush()` to include livePriceCache**

Update lines 46–51:
```js
export const flush = () => {
  fundamentalsCache.flushAll();
  priceCache.flushAll();
  insiderCache.flushAll();
  comparablesCache.flushAll();
  livePriceCache.flushAll();  // ← add
};
```

- [ ] **Step 5: Update `stats()` to include livePriceCache**

Update lines 53–58:
```js
export const stats = () => ({
  fundamentals: fundamentalsCache.getStats(),
  price: priceCache.getStats(),
  insider: insiderCache.getStats(),
  comparables: comparablesCache.getStats(),
  livePrice: livePriceCache.getStats(),  // ← add
});
```

**Important:** Do NOT add `livePriceCache` to `loadCache()` or `persistCache()` calls — live prices should not persist across restarts.

- [ ] **Step 6: Commit**

```bash
git add backend/services/cache.js
git commit -m "feat: add livePriceCache with 30s TTL"
```

---

### Task 3: Add getLivePrices service function

**Files:**
- Modify: `backend/services/yahoofinance.js:1-375`

- [ ] **Step 1: Import `YAHOO_FINANCE_DELAY_MS`**

Add after line 2 (after the cache import, before the `yahooFinance` instantiation):
```js
import { YAHOO_FINANCE_DELAY_MS } from "../constants.js";
```

- [ ] **Step 2: Add module-level deduplication map**

Add after line 5 (after the `delay` helper):
```js
let pendingFetches = {}; // deduplicate in-flight requests per ticker
```

- [ ] **Step 3: Add `getLivePrices` and `refreshLivePrices` functions**

Add after `getPortfolioSummaries` (after line 326):
```js
async function getLivePrices(tickers) {
  const results = [];
  const staleTickers = [];

  for (const ticker of tickers) {
    const cached = cache.getLivePrice(ticker);
    if (cached) {
      results.push({ ticker, data: cached, stale: false });
    } else {
      staleTickers.push(ticker);
      results.push({ ticker, data: null, stale: true });
    }
  }

  if (staleTickers.length > 0) {
    refreshLivePrices(staleTickers);
  }

  return results;
}

async function refreshLivePrices(tickers) {
  const unique = tickers.filter((t) => !pendingFetches[t]);
  if (unique.length === 0) return;

  unique.forEach((t) => (pendingFetches[t] = true));

  try {
    for (const ticker of unique) {
      try {
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

- [ ] **Step 4: Export `getLivePrices`**

Update the export block (lines 366–375):
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
  getLivePrices,  // ← add
};
```

- [ ] **Step 5: Commit**

```bash
git add backend/services/yahoofinance.js
git commit -m "feat: add getLivePrices with stale-while-revalidate"
```

---

### Task 4: Add POST /api/stocks/portfolio/live route

**Files:**
- Modify: `backend/routes/stocks.js:289`

- [ ] **Step 1: Add route handler after existing portfolio endpoint**

Insert after line 289 (after the closing `});` of the `/portfolio` route):
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

- [ ] **Step 2: Commit**

```bash
git add backend/routes/stocks.js
git commit -m "feat: add POST /api/stocks/portfolio/live endpoint"
```

---

### Task 5: Add useLivePrices frontend hook

**Files:**
- Modify: `frontend/src/hooks/useStockData.js:1-164`

- [ ] **Step 1: Add React and marketStatus imports**

Update line 1:
```js
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarketStatus } from "../utils/marketStatus";
```

- [ ] **Step 2: Add `useLivePrices` hook after `usePortfolio`**

Insert after line 57 (after the `usePortfolio` function closing brace):
```js
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

    const marketStatus = getMarketStatus();
    if (marketStatus.isOpen && tickers.length > 0) {
      setIsActive(true);
      fetchLivePrices();
      intervalRef.current = setInterval(fetchLivePrices, 30000);
    }

    const marketCheckInterval = setInterval(() => {
      const status = getMarketStatus();
      if (status.isOpen && !intervalRef.current && tickers.length > 0) {
        setIsActive(true);
        fetchLivePrices();
        intervalRef.current = setInterval(fetchLivePrices, 30000);
      } else if (!status.isOpen && intervalRef.current) {
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

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useStockData.js
git commit -m "feat: add useLivePrices hook with market gating and backoff"
```

---

### Task 6: Integrate live prices in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:1-350`

- [ ] **Step 1: Update imports**

Line 8:
```js
import { usePortfolio, useLivePrices } from "./hooks/useStockData";
```

- [ ] **Step 2: Add useLivePrices hook call**

After line 30:
```js
const { data, loading, errors, refetch } = usePortfolio(tickers);
const { liveData, isActive: liveActive } = useLivePrices(tickers);
```

- [ ] **Step 3: Add merged data derivation**

After line 45 (after the market status `useEffect` closing brace):
```js
  // Merge live price data into portfolio data
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

- [ ] **Step 4: Pass merged data and liveActive to StockCard**

Update lines 143–153:
```jsx
{tickers.map((ticker, i) => (
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
))}
```

- [ ] **Step 5: Pass merged currentPrice to StockAnalysisPage**

Update lines 161–167:
```jsx
<StockAnalysisPage
  ticker={selectedTicker}
  currentPrice={mergedData[selectedTicker]?.currentPrice}
  onBack={handleBackFromAnalysis}
/>
```

- [ ] **Step 6: Add flash animation keyframes**

Update the `<style>` block (lines 184–194):
```jsx
<style>{`
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  @keyframes flash-up {
    0% { background: rgba(0, 229, 160, 0.15); }
    100% { background: transparent; }
  }
  @keyframes flash-down {
    0% { background: rgba(255, 77, 109, 0.15); }
    100% { background: transparent; }
  }
`}</style>
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: integrate live prices into App with merge layer and flash keyframes"
```

---

### Task 7: Add live indicators to StockCard

**Files:**
- Modify: `frontend/src/components/StockCard.jsx:1-310`

- [ ] **Step 1: Add `useState`, `useEffect`, `useRef` to imports**

Update line 1:
```js
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
```

- [ ] **Step 2: Add `liveActive` prop and flash state**

Update the function signature (line 80):
```jsx
export default function StockCard({ ticker, data, error, loading, onClick, index, liveActive }) {
```

Add after line 81 (after `const positive = ...`):
```jsx
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

- [ ] **Step 3: Add flash styling to motion.div**

Update lines 84–88:
```jsx
<motion.div
  style={{
    ...styles.card,
    cursor: loading || error ? "default" : "pointer",
    ...(flash === "up" ? { background: "rgba(0, 229, 160, 0.06)" } : {}),
    ...(flash === "down" ? { background: "rgba(255, 77, 109, 0.05)" } : {}),
  }}
```

- [ ] **Step 4: Add live dot to price block**

Inside the price block, after the change div (around line 124), add:
```jsx
            {liveActive && (
              <div style={styles.liveDot} title="Live updates active" />
            )}
```

So the full price block (lines 116–128) becomes:
```jsx
          {data && (
            <div style={styles.priceBlock}>
              <div style={styles.price}>{formatPrice(data.currentPrice)}</div>
              <div style={{
                ...styles.change,
                color: positive ? "var(--accent-green)" : "var(--accent-red)",
                background: positive ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
              }}>
                {positive ? "▲" : "▼"} {formatChange(data.changePercent)}
              </div>
              {liveActive && (
                <div style={styles.liveDot} title="Live updates active" />
              )}
            </div>
          )}
```

- [ ] **Step 5: Add live footer text**

Replace the footer block (lines 163–182) with:
```jsx
      {/* Footer */}
      {data && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            52W: {formatPrice(data.fiftyTwoWeekLow)} – {formatPrice(data.fiftyTwoWeekHigh)}
          </span>
          {liveActive ? (
            <span style={styles.liveFooterText}>Live · updated just now</span>
          ) : data.earningsDate ? (
            <span
              style={{
                ...(isEarningsSoon(data.earningsDate) ? styles.earningsCta : styles.footerText),
                ...(isEarningsSoon(data.earningsDate) ? styles.earningsGlow : {}),
              }}
            >
              {formatEarningsDate(data.earningsDate)}
            </span>
          ) : (
            <span style={styles.footerCta}>View details →</span>
          )}
        </div>
      )}
```

- [ ] **Step 6: Add live dot and live footer text styles**

Add to the `styles` object (after line 296, after `earningsGlow`):
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

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/StockCard.jsx
git commit -m "feat: add live dot, flash animation, and live footer to StockCard"
```

---

### Task 8: Add release note entry

**Files:**
- Modify: `frontend/public/release-notes.html:331-341`

- [ ] **Step 1: Insert new release entry at the top of May 2026**

Insert after line 332 (`<h2>May 2026</h2>`) and before line 334 (the existing May 11 entry):
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

- [ ] **Step 2: Commit**

```bash
git add frontend/public/release-notes.html
git commit -m "docs: add live price updates release note"
```

---

### Task 9: Verification

- [ ] **Step 1: Start the backend**

```bash
cd /Users/yanchimyeung/Projects/stock-dashboard/backend
npm start
```
Expected: Server starts on port 3001 (or configured port).

- [ ] **Step 2: Start the frontend**

```bash
cd /Users/yanchimyeung/Projects/stock-dashboard/frontend
npm run dev
```
Expected: Vite dev server starts, usually on port 5173.

- [ ] **Step 3: Open browser and verify initial load**

Navigate to `http://localhost:5173` (or the port Vite reports).

Expected:
- Portfolio loads with 4 default tickers (AAPL, MSFT, NVDA, GOOGL)
- No live dot visible if market is closed
- If market is open: green pulsing dot appears on each card after ~30s

- [ ] **Step 4: Verify live endpoint directly (optional)**

If market is open, test the endpoint with curl:
```bash
curl -X POST http://localhost:3001/api/stocks/portfolio/live \
  -H "Content-Type: application/json" \
  -d '{"tickers": ["AAPL", "MSFT"]}'
```

Expected: JSON response with `success: true` and `data` array containing `{ ticker, data: { currentPrice, change, changePercent }, stale: boolean }`.

- [ ] **Step 5: Verify stale-while-revalidate**

Run the same curl command twice in quick succession:
```bash
curl -X POST http://localhost:3001/api/stocks/portfolio/live \
  -H "Content-Type: application/json" \
  -d '{"tickers": ["AAPL"]}' && \
sleep 2 && \
curl -X POST http://localhost:3001/api/stocks/portfolio/live \
  -H "Content-Type: application/json" \
  -d '{"tickers": ["AAPL"]}'
```

Expected: First call returns `stale: true` (or cached data if already in cache). Second call within 30s returns `stale: false` with cached data. Response time should be < 10ms for cached hits.

- [ ] **Step 6: Verify market-hours gating**

If testing outside market hours, temporarily modify `getMarketStatus()` in `frontend/src/utils/marketStatus.js` to always return `isOpen: true`, reload the page, and confirm polling starts. Revert the change after testing.

- [ ] **Step 7: Verify flash animation**

Trigger a price update by either waiting for a real market change or by manually calling the backend endpoint with a modified cache value (e.g., via a test script). The card background should briefly flash green (price up) or red (price down).

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat: live price updates — complete"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ `CACHE_TTL_LIVE_PRICE` constant — Task 1
- ✅ `livePriceCache` with no persistence — Task 2
- ✅ `getLivePrices()` + `refreshLivePrices()` with `yahooFinance.quote()` — Task 3
- ✅ `POST /api/stocks/portfolio/live` route — Task 4
- ✅ `useLivePrices` hook with market gating + exponential backoff — Task 5
- ✅ App.jsx merge layer + flash keyframes — Task 6
- ✅ StockCard live dot + flash + footer text — Task 7
- ✅ Release note entry — Task 8

**2. Placeholder scan:** No TBD, TODO, or vague steps. Every code block is complete and copy-paste ready.

**3. Type consistency:**
- `getLivePrices` returns `{ ticker, data, stale }[]` — used correctly in route and frontend
- `useLivePrices` returns `{ liveData, isActive }` — used as `liveData` and `liveActive` in App.jsx
- `liveActive` prop passed through to StockCard — signature matches
