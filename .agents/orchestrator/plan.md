# plan.md — Guru Tracker Implementation

This plan outlines the milestones and steps required to complete the Guru Tracker feature in the `stock-dashboard` application. Per the user's latest instructions, execution will conclude after Phase 2 (Cross-Investor Analytics) is completed. Phase 3 (AI Strategy Insights / Gemini integration) is skipped.

## Architecture & Tech Stack
- **Database**: SQLite with Prisma ORM
- **Backend**: Express.js, Zod validation, JWT authentication cookies, Node-cron for daily ingestion
- **Frontend**: React, TanStack Query (React Query), Custom CSS, Charting via Recharts/Plotly

---

## Milestones Roadmap

| Phase | Milestone | Name | Description | Status |
|---|---|---|---|---|
| Phase 1 | **M1** | DB Schema & Migrations | Create schema models (Investor, Filing, Holding, CusipMapping) and apply Prisma migrations | **DONE** |
| Phase 1 | **M2** | Data Ingestion Pipeline | Implement SEC EDGAR client, 13F XML parser, 13D/13G parser, and CUSIP translation mechanism | **DONE** |
| Phase 1 | **M3** | Backend API Endpoints | Mount `/api/gurus` routes with validation, caching, security checks, and integration tests | **DONE** (Needs Verification) |
| Phase 2 | **M4** | Frontend Routing & Base Views | Implement `/gurus` tab, curated investor grid, search, and holdings table | **PLANNED** |
| Phase 2 | **M5** | Cross-Investor Analytics | Implement concentration metrics (HHI), overlap heatmap matrix, and position timeline charts | **PLANNED** |
| Phase 2 | **M6** | Tiered Auth & Access Control | Restrict historical/timeline details to logged-in users; guest upgrade wall | **PLANNED** |
| Phase 2 | **M7** | E2E Integration & Hardening | Run E2E test suites (Vitest & Jest), resolve bugs, verify layout compliance, write release notes | **PLANNED** |

---

## Current Status & Tasks
- **Current Milestone**: M4 (Frontend Routing & Base Views) & M5 (Cross-Investor Analytics).
- **Recent Progress**: Ingestion pipeline and database migrations are fully implemented, verified, and audited. Express routes are coded.
- **Immediate Action**: Dispatch Explorer to investigate how to integrate `/gurus` UI in the frontend (App.jsx, navigation tabs, styles, layouts), then proceed to implement and verify.
