# Handoff Report — Explorer Schema Analysis

## 1. Observation
- **Schema File (`backend/prisma/schema.prisma`)**:
  - Configured database provider is SQLite:
    ```prisma
    datasource db {
      provider = "sqlite"
      url      = env("DATABASE_URL")
    }
    ```
  - Primary Key style: `@id @default(uuid())` of type `String`. Found on:
    - `User.id` (line 11)
    - `PortfolioItem.id` (line 23)
    - `WishListItem.id` (line 36)
    - `HistoricalIV.id` (line 47)
    - `ChatSession.id` (line 57)
    - `ChatMessage.id` (line 67)
  - Existing models: `User`, `PortfolioItem`, `WishListItem`, `HistoricalIV`, `ChatSession`, `ChatMessage`.
- **Package Manifest (`backend/package.json`)**:
  - No custom npm scripts are defined for migrations or seeding (lines 7–12).
- **Migration History (`backend/prisma/migrations/`)**:
  - Contains two migrations:
    - `20260519103422_add_historical_iv/migration.sql`: Creates `User`, `PortfolioItem`, `WishListItem`, and `HistoricalIV` tables.
    - `20260519103655_remove_redundant_indexes/migration.sql`: Drops index `HistoricalIV_ticker_date_idx` and `HistoricalIV_ticker_idx` (lines 1–6).
  - Search command `grep_search` for `ChatSession` across `/Users/yanchimyeung/Projects/stock-dashboard/backend/prisma/migrations` yielded zero results, meaning the `ChatSession` and `ChatMessage` models are not included in the migration SQL scripts.
- **Readme Setup (`README.md`)**:
  - Setup commands listed: `npx prisma generate` and `npx prisma migrate dev` (lines 82–83), plus database reset with `npx prisma migrate reset` (line 158).
- **Seed Script (`backend/scripts/seed.js`)**:
  - Seed function `seedAdmin()` checks for `"admin@stock-dashboard.local"` via `prisma.user.findUnique` (lines 13–15).
  - If not found, generates a random 24-byte hex password, hashes it using `hashPassword` from `backend/services/auth.js`, inserts it via `prisma.user.create` as role `"ADMIN"`, and prints it to the console (lines 22–42).
- **Server Startup Integration (`backend/server.js`)**:
  - Imports `seedAdmin` (line 27) and runs it directly on startup in `app.listen` (line 135).

## 2. Logic Chain
- **Database Type**: Direct configuration in `schema.prisma` dictates database connection and dialect. Since `provider = "sqlite"` is configured, SQLite dialect is used.
- **ID Strategy**: Model properties dictate the PK type and generation algorithm. Every `@id` property has `@default(uuid())`, which generates CUID-equivalent or UUID-standard string formats using SQLite's TEXT type.
- **Migrations Status**: Because the database is SQLite and there are only two migrations created in `backend/prisma/migrations/`, we can reconstruct the migration timeline. However, because `ChatSession` and `ChatMessage` are defined in the schema but missing in the migration folder, these tables are either unmigrated or were pushed without generating migration files.
- **Seeding Execution**: Because `seedAdmin` is called directly inside `app.listen()` in `server.js`, seeding is executed on every server startup, checking whether the database contains the admin account.

## 3. Caveats
- Since this was a read-only investigation, no schema updates or migrations were executed, and the contents of `dev.db` were not directly queried via SQLite CLI.
- Assumed the missing migration for `ChatSession` / `ChatMessage` means the local dev environment might have used `prisma db push` or is in an unmigrated state.

## 4. Conclusion
- The schema uses SQLite with UUID string primary keys.
- Migrations are operated using the Prisma CLI (`npx prisma migrate dev`), but the `ChatSession` and `ChatMessage` models are currently not represented in the migration SQL folder, indicating the migration history is out of sync with the schema.
- Seeding runs automatically upon starting the backend API server and guarantees the presence of an admin user with a randomly generated 24-byte password if none exists.

## 5. Verification Method
1. Inspect the migration files under `/Users/yanchimyeung/Projects/stock-dashboard/backend/prisma/migrations/` to verify that no SQL references `ChatSession` or `ChatMessage`.
2. Inspect `backend/server.js` (line 135) to verify the automatic call to `seedAdmin()`.
3. Running `npm run dev` in the backend directory can verify that the seeding logs print to the terminal when the database is fresh or when no admin user exists.
