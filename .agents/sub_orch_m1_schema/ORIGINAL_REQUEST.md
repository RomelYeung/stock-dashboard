# Original User Request

## 2026-06-20T09:39:36Z

You are a sub-orchestrator running Milestone 1: DB Schema & Migrations. Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/sub_orch_m1_schema`.
Your mission is to implement the database schema additions for the Guru Tracker in the SQLite database via Prisma.

Please check `/Users/yanchimyeung/Projects/stock-dashboard/PROJECT.md` for interface contracts and DB schema additions:
- `Investor`: CIK, name, fundName, philosophy, bio, photoUrl, tags (JSON), currentAum, lastFilingDate.
- `Filing`: date, accessionNumber, periodOfReport, type (13F-HR, 13D, 13G), investorId.
- `Holding`: ticker, CUSIP, shares, value, optionType (PUT, CALL, or none), portfolioWeight, convictionScore, filingId.
- `CusipMapping`: CUSIP (PK), ticker, companyName.

Your workflow:
1. Decompose the task into subtasks if needed (e.g., schema design, creating migration, seeding initial curated investors, running verify).
2. Spawn an Explorer (`teamwork_preview_explorer`) to inspect existing models in `/Users/yanchimyeung/Projects/stock-dashboard/backend/prisma/schema.prisma` and check how migrations/seeds are executed.
3. Spawn a Worker (`teamwork_preview_worker`) to update the Prisma schema file, run migrations (e.g. using `npx prisma migrate dev`), and update/write any seed scripts.
   Include this verbatim in the Worker's dispatch prompt:
   "DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected."
4. Spawn Reviewer(s) to verify schema changes and migration success.
5. Spawn a Forensic Auditor to ensure no violations.
6. Verify that the database schema compiles, migrations are applied successfully, and the initial seed script seeds data without errors.
7. Once successfully verified, write a handoff report (`handoff.md` in your directory) and send a completion message back to the parent agent (conversation ID: `d93f1aab-6c36-4cc0-8900-23cc9ac457df`).
