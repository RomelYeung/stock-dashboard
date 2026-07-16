## 2026-06-20T09:40:34Z
You are an Explorer. Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/explorer_schema`.
Your mission is to inspect the existing models in `/Users/yanchimyeung/Projects/stock-dashboard/backend/prisma/schema.prisma` and check how migrations/seeds are executed.
Specifically, find:
1. What existing models are defined, what the ID style is (e.g. Int autoincrement vs String CUID/UUID) for primary keys, and what database provider is configured.
2. How database migrations are managed, what scripts or npm commands exist, and inspect the migration folder to see existing migrations.
3. Check the content and logic of the seed script `/Users/yanchimyeung/Projects/stock-dashboard/backend/scripts/seed.js`. How is seeding executed, what data does it seed, and how does it interface with Prisma?
4. Write your findings to `/Users/yanchimyeung/Projects/stock-dashboard/.agents/explorer_schema/analysis.md` and deliver a handoff report.
