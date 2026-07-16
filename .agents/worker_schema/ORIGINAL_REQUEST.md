## 2026-06-20T09:42:17Z
You are a worker. Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_schema`.
Your mission is to update the Prisma schema file, run migrations, and update/write seed scripts for the Guru Tracker database setup.

Tasks:
1. Update `/Users/yanchimyeung/Projects/stock-dashboard/backend/prisma/schema.prisma` to add the following models:
   - `Investor`:
     - `id`: String @id @default(uuid())
     - `CIK`: String @unique
     - `name`: String
     - `fundName`: String?
     - `philosophy`: String?
     - `bio`: String?
     - `photoUrl`: String?
     - `tags`: Json
     - `currentAum`: Float?
     - `lastFilingDate`: DateTime?
     - `filings`: Filing[]
     - `createdAt`: DateTime @default(now())
     - `updatedAt`: DateTime @updatedAt
   - `Filing`:
     - `id`: String @id @default(uuid())
     - `date`: DateTime
     - `accessionNumber`: String @unique
     - `periodOfReport`: DateTime
     - `type`: String
     - `investorId`: String
     - `investor`: Investor @relation(fields: [investorId], references: [id], onDelete: Cascade)
     - `holdings`: Holding[]
     - `createdAt`: DateTime @default(now())
     - `updatedAt`: DateTime @updatedAt
     - Indexes: `@@index([investorId])`
   - `Holding`:
     - `id`: String @id @default(uuid())
     - `ticker`: String
     - `CUSIP`: String
     - `shares`: Float
     - `value`: Float
     - `optionType`: String @default("none") // e.g. PUT, CALL, none
     - `portfolioWeight`: Float
     - `convictionScore`: Float?
     - `filingId`: String
     - `filing`: Filing @relation(fields: [filingId], references: [id], onDelete: Cascade)
     - `createdAt`: DateTime @default(now())
     - `updatedAt`: DateTime @updatedAt
     - Indexes: `@@index([filingId])`
   - `CusipMapping`:
     - `CUSIP`: String @id
     - `ticker`: String
     - `companyName`: String
     - `createdAt`: DateTime @default(now())
     - `updatedAt`: DateTime @updatedAt

2. Run the database migration by executing `npx prisma migrate dev --name add_guru_tracker` from the `backend/` directory. Ensure the migration creates all tables and updates the dev database (`backend/prisma/dev.db`). Ensure that prisma client is regenerated.

3. Update `/Users/yanchimyeung/Projects/stock-dashboard/backend/scripts/seed.js` to also seed initial curated investors and some basic CUSIP mappings if they don't already exist.
   Ensure this seeding runs as part of the existing seed logic so it executes automatically on startup.
   Curated Investors to seed if the Investor table is empty:
   - Warren Buffett (CIK: `0001067983`, name: "Warren Buffett", fundName: "Berkshire Hathaway Inc", philosophy: "Value Investing", bio: "Warren Edward Buffett is an American business magnate, investor, and philanthropist.", photoUrl: "https://example.com/buffett.jpg", tags: ["value", "long-term", "legendary"], currentAum: 300000000000.0)
   - Michael Burry (CIK: `0001649339`, name: "Michael Burry", fundName: "Scion Asset Management, LLC", philosophy: "Contrarian / Value", bio: "Michael James Burry is an American investor, hedge fund manager, and physician.", photoUrl: "https://example.com/burry.jpg", tags: ["contrarian", "short", "macro"], currentAum: 200000000.0)
   Basic CUSIP Mappings to seed if the CusipMapping table is empty:
   - CUSIP: `594918104`, ticker: `MSFT`, companyName: `MICROSOFT CORP`
   - CUSIP: `037833100`, ticker: `AAPL`, companyName: `APPLE INC`
   - CUSIP: `023135106`, ticker: `AMZN`, companyName: `AMAZON.COM, INC.`

4. Run the seed script or run a quick script to verify it seeds data without errors. Verify that the seeded records exist in the database (e.g. by logging them or writing a verification script).

Include this verbatim in your execution logic:
"DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected."

Write your progress to `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_schema/changes.md` and deliver a handoff report.
