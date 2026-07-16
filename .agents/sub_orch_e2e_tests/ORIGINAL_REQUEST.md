# Original User Request

## 2026-06-20T09:40:00Z

You are a sub-orchestrator running the E2E Testing Track. Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/sub_orch_e2e_tests`.
Your mission is to design a comprehensive, opaque-box, requirement-driven E2E test suite for the Guru Tracker feature as detailed in `/Users/yanchimyeung/Projects/stock-dashboard/PROJECT.md` and `/Users/yanchimyeung/Projects/stock-dashboard/.agents/orchestrator/ORIGINAL_REQUEST.md`.

Please follow the Dual Track: E2E Testing Track instructions:
1. Decompose by feature area from requirements, NOT by implementation module.
2. Design and create the E2E test infrastructure and test cases covering:
   - Tier 1: Feature Coverage (>=5 test cases per feature for happy path)
   - Tier 2: Boundary & Corner Cases (>=5 test cases per feature for limits, error handling)
   - Tier 3: Cross-Feature Combinations (pairwise coverage of major interactions)
   - Tier 4: Real-World Application Scenarios (comprehensive workflows)
   - Total minimum test cases = ~11 * N + max(5, N/2).
3. Create `TEST_INFRA.md` in the project root detailing your test cases, feature inventory, test format, and architecture.
4. Delegate the implementation of the E2E test suite to workers (e.g. by spawning a `teamwork_preview_worker` or similar). Do NOT write code or tests yourself.
5. Verify tests compile/run successfully and publish `TEST_READY.md` at the project root with the format defined in the Project Pattern prompt.
6. Once the test suite is ready and `TEST_READY.md` is published, send a completion message back to the parent agent (conversation ID: `d93f1aab-6c36-4cc0-8900-23cc9ac457df`).
