# Historical IV Integration Design

## Overview
This design outlines the integration of historical daily closing Implied Volatility (IV) data into the `stock-dashboard` application to enable accurate calculation of IV Rank (IVR) and IV Percentile (IVP).

## Data Model
Add `HistoricalIV` model to `backend/prisma/schema.prisma`:

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

## Architecture
1. **Data Ingestion:** A new service (`backend/services/historical-iv.js`) will handle fetching daily closing IV data.
2. **Worker Process:** A dedicated script (`backend/scripts/historical-iv-worker.js`) will run independently, managed by PM2, and use `node-cron` to trigger ingestion.
3. **Scanner Integration:** The `/api/options/scan/:ticker` endpoint will query `HistoricalIV` for 1-year lookback data to compute true IVR/IVP.

## Data Flow
1. **Worker Process:** Wakes up on cron schedule.
2. **Ingestion Service:** Fetches ticker list -> Fetches daily IV -> Upserts into SQLite.
3. **Scanner Endpoint:** Fetches current chain data -> Fetches historical IV from SQLite -> Computes IVR/IVP -> Returns response.

## Error Handling
- Missing data: Fallback to existing proxy method with warning log.
- API failures: Include retries and logging in the ingestion job.
