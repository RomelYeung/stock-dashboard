# Milestone 2: Data Ingestion Pipeline Exploration Report

## Overview
This report provides a read-only codebase exploration to support the design and implementation of the **Milestone 2: Data Ingestion Pipeline**. It covers existing ticker and CUSIP lookup mechanisms, Prisma database client configuration and models, E2E test stubs and contract requirements, SEC filing ingestion paths, and potential constraints/risks.

---

## 1. Yahoo Finance Ticker and CUSIP Lookups
* **File Examined**: `backend/services/yahoofinance.js`
* **Findings**:
  * There is **no explicit or dedicated lookup mechanism for CUSIPs** in `yahoofinance.js`. The word "cusip" does not appear in the file.
  * The primary search mechanism is `searchTickers(query, options = {})` (line 638), which delegates to `yahooFinance.search(query, { quotesCount }, { validateResult: false })`.
  * *Yahoo Finance Search capability*: While the general search API can often resolve standard financial identifiers like CUSIPs, ISINs, or company names to ticker symbols, it is not a deterministic or optimized mapping mechanism.
  * Therefore, a local lookup table mapping CUSIPs to tickers is necessary to avoid relying solely on external search APIs.

---

## 2. Database client and Prisma initialization
* **Files Examined**: `backend/services/db.js`, `backend/prisma/schema.prisma`, `backend/scripts/seed.js`
* **Findings**:
  * **Client Initialization**:
    * `backend/services/db.js` exports a default singleton instance of `PrismaClient` directly:
      ```javascript
      import { PrismaClient } from "@prisma/client";
      const prisma = new PrismaClient();
      export default prisma;
      ```
    * Other files import this client as `import prisma from "./db.js";` or `import prisma from "../services/db.js";`.
  * **Database Type**:
    * The database is **SQLite** (configured in `backend/prisma/schema.prisma` lines 5–8):
      ```prisma
      datasource db {
        provider = "sqlite"
        url      = env("DATABASE_URL")
      }
      ```
  * **Relevant Schema Models**:
    * **`Investor`**: Holds guru details.
      ```prisma
      model Investor {
        id             String    @id @default(uuid())
        CIK            String    @unique
        name           String
        fundName       String?
        philosophy     String?
        bio            String?
        photoUrl       String?
        tags           Json      // Stored as JSON array/object
        currentAum     Float?
        lastFilingDate DateTime?
        filings        Filing[]
        createdAt      DateTime  @default(now())
        updatedAt      DateTime  @updatedAt
      }
      ```
    * **`Filing`**: Holds filing header information.
      ```prisma
      model Filing {
        id              String    @id @default(uuid())
        date            DateTime
        accessionNumber String    @unique
        periodOfReport  DateTime
        type            String
        investorId      String
        investor        Investor  @relation(fields: [investorId], references: [id], onDelete: Cascade)
        holdings        Holding[]
        createdAt       DateTime  @default(now())
        updatedAt       DateTime  @updatedAt

        @@index([investorId])
      }
      ```
    * **`Holding`**: Represents individual positions in a filing.
      ```prisma
      model Holding {
        id              String   @id @default(uuid())
        ticker          String
        CUSIP           String
        shares          Float
        value           Float
        optionType      String   @default("none") // e.g. PUT, CALL, none
        portfolioWeight Float
        convictionScore Float?
        filingId        String
        filing          Filing   @relation(fields: [filingId], references: [id], onDelete: Cascade)
        createdAt       DateTime @default(now())
        updatedAt       DateTime @updatedAt

        @@index([filingId])
      }
      ```
    * **`CusipMapping`**: A dedicated table for mapping CUSIPs directly to tickers.
      ```prisma
      model CusipMapping {
        CUSIP       String   @id
        companyName String
        ticker      String
        createdAt   DateTime @default(now())
        updatedAt   DateTime @updatedAt
      }
      ```
  * **Seeded Data**:
    * `backend/scripts/seed.js` initializes curated data if tables are empty:
      * **Investors**:
        * Warren Buffett: CIK `0001067983`, Fund: `Berkshire Hathaway Inc`
        * Michael Burry: CIK `0001649339`, Fund: `Scion Asset Management, LLC`
      * **Cusip Mappings**:
        * `"594918104"` &rarr; `"MSFT"` (MICROSOFT CORP)
        * `"037833100"` &rarr; `"AAPL"` (APPLE INC)
        * `"023135106"` &rarr; `"AMZN"` (AMAZON.COM, INC.)

---

## 3. Gurus Test Contract & Interfaces
* **File Examined**: `backend/routes/__tests__/gurus.e2e.test.js`
* **Findings**:
  * **Test Helper Stubs** (Contract requirements):
    1. **`parse13Fxml(xmlString)`**:
       * Parses 13F XML strings to extract holdings.
       * Traverses root `informationTable` or `InfoTable` elements down to array/single-object `infoTable` or `InfoTable`.
       * Maps keys (allowing alternative casing, e.g. `nameOfIssuer` vs `NameOfIssuer`):
         * `companyName` &larr; `nameOfIssuer` / `NameOfIssuer`
         * `cusip` &larr; `cusip` / `Cusip` / `CUSIP`
         * `shares` &larr; `shrsOrPrnAmt.sshLevel` / `ShrsOrPrnAmt.SshLevel` (parsed to float)
         * `value` &larr; `value` / `Value` (parsed to float)
         * `optionType` &larr; `putCall` / `PutCall` (defaulting to `"none"`, converted to lowercase)
       * Returns: `Array<{ companyName, cusip, shares, value, optionType }>`
    2. **`parse13D_G(filingData)`**:
       * Validates that `filingData.type` is `"13D"` or `"13G"`.
       * Calculates `convictionScore`: base score of `8.5` (for `"13D"`) or `5.0` (for `"13G"`), plus a premium of `1.5` if `percentOfClass > 10`.
       * Returns: `{ eventType, date, convictionScore }`
    3. **`translateCusipToTicker(cusip, localCache = {}, fallbackFetcher = null)`**:
       * Checks `localCache[cusip]` first. If missed and `fallbackFetcher` exists, invokes `fallbackFetcher(cusip)`.
    4. **`calculateQoQ(prevHoldings, currentHoldings)`**:
       * Compares consecutive quarter holdings arrays (mapped by `ticker`).
       * Emits diff items with the following classification:
         * New: ticker not present in previous holdings.
         * Increased: current shares > previous shares.
         * Decreased: current shares < previous shares.
         * Closed: ticker present in previous but not current holdings.
       * Diffs returned contain: `{ ticker, change, sharesDiff, valueDiff }`.
    5. **`pruneHistory(filings)`**:
       * Sorts filings by `date` (descending) and returns only the 8 most recent.
    6. **`truncateHoldingsForPrompt(holdings, tokenLimit = 100)`**:
       * Loops through holdings and truncates the list once a cumulative count (assumed 10 tokens per holding representation) exceeds the limit.
  * **Expected REST API Routes**:
    * **`GET /api/gurus`**: Lists all legendary investors.
    * **`GET /api/gurus/activity`**: Combined feed of transactions/activity sorted by date descending.
    * **`GET /api/gurus/ticker/:ticker`**: Reverse lookup showing which gurus hold a given ticker. Returns array of `{ guruId, guruName, fundName, quarter, shares, value, weight }`.
    * **`GET /api/gurus/:id/holdings`**: Returns holdings. Must accept query param `quarter` (format: `/^\d{4}-Q[1-4]$/`). Invalid quarter returns 400. Non-existent ID returns 404.
    * **`POST /api/gurus/sync`**: On-demand sync route.
      * Needs authentication (fails with 401 if missing).
      * Validates request body contains a 10-character `CIK` (fails with 400 if invalid format).
      * Enforces a rate limit of 2 seconds (2000ms) between calls for the same CIK (fails with 429).
      * Returns status `202 Accepted` on successful ingestion trigger.
    * **`GET /api/gurus/:id/history`**: Returns filing history. Fails with 403 for guest users.
    * **`GET /api/gurus/:id/ai-strategy`**: Returns AI-generated strategy. Fails with 403 for guest users. Implements caching and handles 503 errors gracefully.

---

## 4. SEC Filings Fetching Mechanics
* **Files Examined**: `backend/services/secGuidance.js`, `backend/services/insiderTrading.js`
* **Findings**:
  * The codebase interacts with the SEC EDGAR API directly.
  * **User-Agent Requirement**: Every fetch request to `sec.gov` must include a compliant `User-Agent` header to prevent blocking:
    ```javascript
    const SEC_HEADERS = {
      "User-Agent": "StockDashboard/1.0 (contact@example.com)",
    };
    ```
  * **Filing Metadata Fetching**:
    * A CIK number is fetched using the ticker mapping index: `https://www.sec.gov/files/company_tickers.json` (cached module-level in memory).
    * Recent filing headers are retrieved from `https://data.sec.gov/submissions/CIK${cik}.json`.
  * **XML/Document Retrieval**:
    * Accession numbers contain dashes (e.g. `0001067983-26-000004`). In the archive directories, dashes are stripped to form the directory name `acc` (e.g. `000106798326000004`).
    * The directory listing JSON is requested at `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/index.json`.
    * File lists are iterated to locate target `.xml` documents (like the holdings table for 13F-HR).
    * The target file is fetched from `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${filename}`.
  * *Application to 13F*: The same structure fits 13F ingestion. We fetch the submissions JSON, isolate filings with `form === "13F-HR"`, resolve their archive directories using `index.json`, locate the `.xml` file containing the holdings info table, download it, and pass it to `parse13Fxml`.

---

## 5. Potential Risks & Constraints
1. **SEC EDGAR Rate Limits**:
   * **Constraint**: SEC EDGAR strictly restricts API request volume to a maximum of **10 requests per second**.
   * **Mitigation**: Implement throttling (e.g. sequential requests with a 150-200ms delay) and parallel request batching limits.
2. **User-Agent Headers**:
   * **Constraint**: Missing or custom non-standard User-Agent headers will result in immediate HTTP `403 Forbidden` response from the SEC.
   * **Mitigation**: Enforce the usage of the predefined `SEC_HEADERS` configuration across all SEC network requests.
3. **Database Concurrency and Locking**:
   * **Constraint**: The project uses **SQLite**, which locks the entire database file during write transactions. Multiple parallel sync actions writing large volumes of holdings (often hundreds of rows per filing) can easily trigger database-locked/busy issues or CPU spikes.
   * **Mitigation**: Process ingestions asynchronously (as represented by the `202 Accepted` status). Synchronize DB write sessions or serialize the processing of large XML datasets.
4. **CUSIP to Ticker Translation Failure**:
   * **Constraint**: SEC 13F filings list positions using CUSIP codes rather than ticker symbols. Yahoo Finance Search is a non-deterministic fallback that can be rate limited or return incorrect mappings.
   * **Mitigation**: Use local `CusipMapping` table as the primary lookup. Fall back to Yahoo Finance Search query if missing, then write newly resolved mappings back to `CusipMapping` to prevent future hits.
5. **Payload Size and Parsing Overhead**:
   * **Constraint**: Processing massive 13F XML files (thousands of entries for some funds) can cause substantial CPU load and thread blocking in Node.js.
   * **Mitigation**: Use streaming XML parsers or offload parsing to workers if necessary.
