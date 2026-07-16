# Original User Request

## 2026-06-20T10:00:13Z

You are a sub-orchestrator running Milestone 2: Data Ingestion Pipeline. Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/sub_orch_m2_ingestion`.
Your mission is to implement data retrieval and parsing for SEC 13F and 13D/13G filings and save them to the database.

Please check `/Users/yanchimyeung/Projects/stock-dashboard/PROJECT.md` and `/Users/yanchimyeung/Projects/stock-dashboard/.agents/orchestrator/ORIGINAL_REQUEST.md`.
Requirements:
1. Fetch and parse 13F XML and 13D/13G filings from SEC EDGAR API.
2. Comply with the SEC rate limit (max 10 requests per second) and include descriptive user-agent headers identifying the application.
3. Translate CUSIPs to tickers: use local mapping cache first, then query Yahoo Finance or local mapping fallbacks.
4. Calculate position metrics: share count, total value, portfolio weight, conviction scores, and quarter-over-quarter differences (New, Closed, Increased, Decreased).
5. History pruning: maintain exactly 8 quarters (2 years) of historical filings per investor.
6. Build a dual sync system:
   - Daily cron job check for new filings for the 11 curated investors (Warren Buffett, Ray Dalio, Bill Ackman, David Tepper, Howard Marks, Michael Burry, Seth Klarman, Stanley Druckenmiller, Li Lu, Terry Smith, Chase Coleman).
   - On-demand sync mechanism/function by CIK.

Your workflow:
1. Decompose the task into subtasks if needed (e.g. SEC client service, XML parser, CUSIP mapping service, calculation module, cron integration).
2. Spawn an Explorer (`teamwork_preview_explorer`) to inspect existing backend services (e.g. `backend/services/yahoofinance.js`) and database functions.
3. Spawn a Worker (`teamwork_preview_worker`) to implement the pipeline, write unit tests for the EDGAR parser, and run verification.
   Include this verbatim in the Worker's dispatch prompt:
   "DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected."
4. Spawn Reviewer(s) to verify code correctness and unit test success.
5. Spawn a Forensic Auditor to verify integrity.
6. Once successfully verified, write a handoff report (`handoff.md` in your directory) and send a completion message back to the parent agent (conversation ID: `d93f1aab-6c36-4cc0-8900-23cc9ac457df`).
