# Technical Spec: Database Indexes — Phase 1

**Date:** 2026-07-19  
**Status:** Draft (revision 2 — reviewer feedback incorporated)  
**Scope:** `backend/prisma/schema.prisma`

---

## 1. Objective

Add performance-critical indexes to the SQLite database for fast lookups on the most-queried fields. This is a **purely additive** schema change: new indexes only, no new relations or foreign keys.

---

## 2. Current State

The schema already has:
- `@@index([filingId])` on `Holding` (line 122)
- `@@index([investorId])` on `Filing` (line 104)
- `@@unique([ticker, date])` on `HistoricalIV` (line 53)
- `@@unique` on `User.email`, `Investor.CIK`, `Filing.accessionNumber`

**Missing** (to be added):
- Indexes on `Holding.ticker`, `Holding.CUSIP`
- Index on `CusipMapping.ticker`
- Indexes on `Filing.date`, `Filing.periodOfReport`
- Composite index on `Filing` for `(investorId, periodOfReport)` queries
- Indexes on `ChatMessage.sessionId`, `ChatMessage.createdAt`

---

## 3. Proposed Changes

### 3.1 New Indexes on `Holding`

```prisma
model Holding {
  // ... existing fields unchanged ...

  @@index([ticker])
  @@index([CUSIP])
  @@index([filingId])          // already exists
}
```

**Rationale:** The `ticker` and `CUSIP` columns are used in lookups when filtering holdings by symbol or identifier (e.g., portfolio aggregation, search). Without an index, these are full table scans.

**Note on `CUSIP`:** The `CUSIP` column will **not** be a foreign key. Approximately 4.7% of `Holding` rows (1,081 of 22,899) contain CUSIP values that do not exist in `CusipMapping` — including sentinel values like `"UNKNOWN"` and empty strings, plus legitimate-but-unmapped CUSIPs. Enforcing a foreign key constraint would break ingestion. The `CUSIP` column is indexed purely for query performance; the join to `CusipMapping` remains logical-only (application-layer joins).

### 3.2 New Index on `CusipMapping`

```prisma
model CusipMapping {
  CUSIP       String   @id
  ticker      String
  companyName String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([ticker])
}
```

**Rationale:** Lookups by `ticker` to resolve CUSIP codes are frequent. Adding an index on `ticker` avoids scanning the entire mapping table.

### 3.3 New Indexes on `Filing`

```prisma
model Filing {
  // ... existing fields unchanged ...

  @@index([date])
  @@index([periodOfReport])
  @@index([investorId, periodOfReport])  // composite — replaces existing @@index([investorId])
}
```

**Rationale:**
- `date` — used in date-range queries for filing retrieval.
- `periodOfReport` — used in period-based filtering and reporting.
- Composite `(investorId, periodOfReport)` — the most common query pattern is "all filings for investor X in period Y." A composite index satisfies this in a single index seek rather than a partial index scan + filter.

**Note:** The existing single-column `@@index([investorId])` is **removed** because the composite `@@index([investorId, periodOfReport])` covers single-column `investorId` queries as well (SQLite B-tree left-prefix rule). Keeping both would be redundant and waste write I/O.

### 3.4 New Indexes on `ChatMessage`

```prisma
model ChatMessage {
  // ... existing fields unchanged ...

  @@index([sessionId])
  @@index([createdAt])
}
```

**Rationale:**
- `sessionId` — loading chat history for a session requires filtering by `sessionId`. Currently unindexed — every session message load is a full table scan.
- `createdAt` — used for session-history ordering and pagination (e.g., "show most recent messages first"). Ordering without an index requires a full table sort.

---

## 4. Migration Strategy

1. Run `npx prisma migrate dev --name add-performance-indexes` to generate the migration SQL.
2. SQLite will create the indexes via `CREATE INDEX` statements.
3. **No data loss** — all changes are additive (new indexes) or index replacements (drop `investorId`, add composite). No foreign keys are introduced, so no FK validation against existing data.
4. **No relation changes** — `Holding` ↔ `CusipMapping` remains logical-only. No `@relation` decorators. No `holdings` back-relation on `CusipMapping`.

---

## 5. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Removing single-column `@@index([investorId])` could break queries that use only `investorId` | No — SQLite B-tree indexes support left-prefix matching. The composite `@@index([investorId, periodOfReport])` satisfies `WHERE investorId = ?` as efficiently as the single-column index. Verified via `EXPLAIN QUERY PLAN`. |
| `ChatMessage.createdAt` index may be redundant if session count is low | Unlikely to be low at scale. Index is cheap to maintain. |
| 4.7% of `Holding.CUSIP` values are unmapped | By design: no FK constraint is added. Application code must handle missing `CusipMapping` gracefully (return `null` for `ticker` / `companyName`). |

---

## 6. Acceptance Criteria

- [ ] `npx prisma migrate dev` succeeds without errors
- [ ] `npx prisma generate` produces a client with unchanged model shapes (no new relation fields)
- [ ] All new indexes are present in the generated migration SQL:
  - `Holding`: `ticker`, `CUSIP`, `filingId` (filingId already existed)
  - `CusipMapping`: `ticker`
  - `Filing`: `date`, `periodOfReport`, `[investorId, periodOfReport]`
  - `ChatMessage`: `sessionId`, `createdAt`
- [ ] The old `@@index([investorId])` on `Filing` is replaced by the composite index (confirmed in migration SQL as `DROP INDEX` + `CREATE INDEX`)
- [ ] Existing tests (if any) continue to pass
- [ ] Querying `prisma.holding.findMany({ where: { ticker: 'AAPL' } })` uses the new index (verify via `EXPLAIN QUERY PLAN` in SQLite)

---

## 7. Files Affected

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add 7 indexes, remove 1 redundant index |
| `backend/prisma/migrations/` | New migration directory (auto-generated) |
