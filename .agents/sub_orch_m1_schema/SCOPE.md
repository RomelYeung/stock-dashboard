# Scope: Milestone 1 - DB Schema & Migrations

## Architecture
- **ORM**: Prisma (SQLite)
- **Database File**: `backend/prisma/dev.db`
- **Schema File**: `backend/prisma/schema.prisma`
- **Migration Folder**: `backend/prisma/migrations/`
- **Seed Script**: `backend/scripts/seed.js`

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1.1 | Explore Current Schema | Inspect `schema.prisma`, migrations, and seed logic | None | PLANNED |
| M1.2 | Implement Schema & Migrations | Add `Investor`, `Filing`, `Holding`, `CusipMapping` models. Run migration. | M1.1 | PLANNED |
| M1.3 | Seed Initial Data | Update seed script to insert initial curated investors and mapping | M1.2 | PLANNED |
| M1.4 | Verify Compilation & Migration | Verify that the prisma client generates, migrations apply, and seed runs | M1.3 | PLANNED |
| M1.5 | Integrity Audit | Ensure no cheating/hardcoding/facades are used | M1.4 | PLANNED |

## Interface Contracts
### Database Schema Additions
- **Investor**:
  - `id`: Int / String (PK, autoincrement / uuid - need Explorer to confirm existing PK style)
  - `CIK`: String (unique)
  - `name`: String
  - `fundName`: String? (optional)
  - `philosophy`: String? (optional)
  - `bio`: String? (optional)
  - `photoUrl`: String? (optional)
  - `tags`: String / Json (SQLite supports JSON fields as String or actual Json type in Prisma, let's see how tags are represented)
  - `currentAum`: Float? (optional)
  - `lastFilingDate`: DateTime? (optional)
  - Relations: `filings Filing[]`
- **Filing**:
  - `id`: Int / String (PK)
  - `date`: DateTime
  - `accessionNumber`: String (unique/index)
  - `periodOfReport`: DateTime
  - `type`: String (13F-HR, 13D, 13G)
  - `investorId`: Int / String
  - Relations: `investor Investor`, `holdings Holding[]`
- **Holding**:
  - `id`: Int / String (PK)
  - `ticker`: String
  - `CUSIP`: String
  - `shares`: Float / Int (Let's check representation, usually Int or Float)
  - `value`: Float
  - `optionType`: String (PUT, CALL, or none)
  - `portfolioWeight`: Float
  - `convictionScore`: Float?
  - `filingId`: Int / String
  - Relations: `filing Filing`
- **CusipMapping**:
  - `CUSIP`: String (PK)
  - `ticker`: String
  - `companyName`: String
