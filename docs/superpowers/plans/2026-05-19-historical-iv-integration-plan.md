# Historical IV Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate daily historical IV data into the application to enable accurate IV Rank (IVR) and IV Percentile (IVP) calculations.

**Architecture:**
1. Add `HistoricalIV` model to Prisma schema.
2. Create `HistoricalIV` ingestion service.
3. Create dedicated worker process managed by PM2 for daily data updates.
4. Update `/api/options/scan/:ticker` endpoint to use historical data.

**Tech Stack:** Node.js, Express, Prisma, SQLite, node-cron, PM2.

---

### Task 1: Update Database Schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add HistoricalIV model**

```prisma
model HistoricalIV {
  id        Int      @id @default(autoincrement())
  ticker    String
  date      DateTime
  iv        Float
  
  @@unique([ticker, date])
  @@index([ticker, date])
}
```

- [ ] **Step 2: Run Prisma migration**

Run: `npx prisma migrate dev --name add_historical_iv`

### Task 2: Create Ingestion Service

**Files:**
- Create: `backend/services/historical-iv.js`

- [ ] **Step 1: Write ingestion logic**

```javascript
import prisma from "./db.js";
import * as yf from "./yahoofinance.js"; // Assume this can fetch historical IV or price data to derive IV

// Placeholder for actual IV fetching logic
export async function ingestHistoricalIV(ticker) {
  // 1. Fetch 1 year of historical data
  // 2. Compute/Extract daily closing IV
  // 3. Upsert into HistoricalIV table
}
```

### Task 3: Create Worker Process

**Files:**
- Create: `backend/scripts/historical-iv-worker.js`

- [ ] **Step 1: Write worker script**

```javascript
import cron from "node-cron";
import { ingestHistoricalIV } from "../services/historical-iv.js";

// Cron schedule: 1 hour after market close (e.g., 5 PM EST)
cron.schedule("0 17 * * 1-5", async () => {
  console.log("Starting historical IV ingestion...");
  // Fetch list of tickers to track
  // For each, call ingestHistoricalIV
});
```

### Task 4: Update Scanner Endpoint

**Files:**
- Modify: `backend/routes/options.js`

- [ ] **Step 1: Integrate historical data query**

```javascript
// Inside router.get("/scan/:ticker", ...)
// 1. Query HistoricalIV for last 1 year for ticker
// 2. Compute IVR and IVP using the historical series
```
