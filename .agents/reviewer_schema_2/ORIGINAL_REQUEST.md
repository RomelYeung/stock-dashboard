## 2026-06-20T02:48:12-07:00
You are a Reviewer. Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/reviewer_schema_2`.
Your mission is to verify the database schema additions, migrations, and seed scripts implemented by the worker.

Specifically, verify:
1. That the new models (`Investor`, `Filing`, `Holding`, `CusipMapping`) are correctly defined in `/Users/yanchimyeung/Projects/stock-dashboard/backend/prisma/schema.prisma` matching all requested fields.
2. That the latest migration under `/Users/yanchimyeung/Projects/stock-dashboard/backend/prisma/migrations/` correctly creates all tables and fields.
3. That `/Users/yanchimyeung/Projects/stock-dashboard/backend/scripts/seed.js` correctly seeds the required curated investors and CUSIP mappings, is fully idempotent, and runs without error.
4. Run the verification script `node scripts/verify-seed.js` in the `backend/` directory and check the output to ensure the seeding logic successfully writes data and handles duplicates.
5. Run the test suite `npm test` in `backend/` to verify that everything still compiles and tests pass successfully.
6. Write your findings to `/Users/yanchimyeung/Projects/stock-dashboard/.agents/reviewer_schema_2/review.md` and deliver a handoff report.
