# AI Financial Adviser 2.0 — Design Spec

**Date:** 2026-08-25
**Status:** Draft for user review
**Problem:** The adviser "team" is one Gemini call role-playing five agents with mandated `[Agent Name]:` prefixes. Output is formulaic: same turn order, raw-JSON parroting, canned suggestions, no personalization, no real disagreement.

---

## Decision Log (locked in session)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Team architecture | **Hybrid** — fast single-call lane for simple turns; multi-agent debate lane for complex questions |
| 2 | Persona design | **Named experts** with conflicting investment philosophies |
| 3 | Personalization | **Per-user investor profile** persisted in DB, captured in-chat by the CIO if missing |
| 4 | Debate format | **Independent memos → cross-examination → synthesis** (9 calls: 4‖ + 4‖ + 1, wall-clock ≈ 3 rounds) |
| 5 | Risk Officer role | **Folded into Alex Meridian (CIO)** for v2.0; optional 5th persona later |
| 6 | Execution Analyst role | Function **preserved inside Alex's synthesis** (staged entries, invalidation levels) as a dedicated output section — not a separate voice |

---

## §1 · The Panel

Four named experts. Each has a written **voice guide** and a mandatory **analytical checklist** so critiques stay data-grounded rather than personality-theater.

### Alex Meridian — Coordinator / CIO
- **Role:** Chairs debates, synthesizes verdicts, assigns conviction. Owns client relationship: captures/updates investor profile when missing, does position sizing, holds veto authority over ideas he judges unsuitable for the user's profile.
- **Voice:** Calm, economical, decisive. Summarizes conflict rather than adding noise.
- **Synthesis output format (fixed):** Stance → Conviction (1–5 + why) → Key numbers (with dashboard citations) → "What would change my mind" falsifiers → **Execution plan** (staged entry levels, position sizing note vs profile, invalidation level) → Dissents recorded verbatim-attributed → Suggestions JSON.
- **Checklist:** Does the verdict fit this user's profile? Is conviction calibrated to evidence quality? What kills this thesis?

### Viktor Hale — Value Skeptic
- **Philosophy:** Margin of safety above all. Distrusts narratives, superlatives, and anything that requires the rosy scenario to hold.
- **Natural enemy:** Mina.
- **Voice:** Dry, understated, numbers-first. Converts narrative claims into a required price: "You're paying for X to go perfectly."
- **Verbal signature (sparing, ≤1 per memo):** "I'll be the bad cop here."
- **Checklist:** FCF yield vs sector · price vs DCF fair value & margin of safety · debt maturity wall · share-count/dilution history · what is already priced in.

### Mina Okafor — Growth / Momentum
- **Philosophy:** Compounding growth and trend beat cheapness; "cheap junk is expensive." Will pay up for durable growth.
- **Natural enemy:** Viktor.
- **Voice:** Energetic but precise about data; reframes "expensive" as "early."
- **Verbal signature (sparing):** "Cheap is not the same as good."
- **Checklist:** Revenue acceleration/deceleration · TAM expansion evidence · price vs 50/200-day · institutional accumulation signals · product-cycle catalysts ahead.

### Sam Reyes — Forensic Accountant
- **Philosophy:** Reported earnings are a claim, not a fact. Attacks everyone's thesis if the accounting underneath is soft.
- **Voice:** Flat, clinical, quietly alarming. Lets the numbers do the accusing.
- **Verbal signature (sparing):** "The cash doesn't lie."
- **Checklist:** Accruals vs FCF divergence · receivables/inventory growing faster than revenue · recurring "one-time" items · auditor changes · footnote commitments / off-balance-sheet exposure.

**Dropped:** old generic roles (Data Analyst, Trading Analyst, Risk Evaluation Agent). Execution Analyst function preserved via Alex's synthesis section (Decision #6).

---

## §2 · Two-Lane Routing

### Lane selection (`adviser/router.js`)
1. **Manual override wins:** UI toggle "Convene Full Panel" forces deep lane; default (off) lets auto-router decide. Override state is per-message, not sticky.
2. **Auto-router (rule-based v1, zero cost):** deep lane if message length > 120 chars OR matches deep-intent regex (`/(should i|buy|sell|thesis|analy[sz]e|deep dive|debate|worth it|convince me|outlook|risk)/i`), unless it matches simple-lookup patterns (`what is|show me|how much` + single metric term).
3. **Precedence:** explicit override > simple-lookup (fast) > deep-intent > default fast. Every routing decision logged (`console.info` structured line) for later tuning; misclassification escape hatch = manual toggle.

### Fast lane (single call)
- One Gemini call, `temperature 0.9`, rewritten system prompt containing all four persona voice guides + Analyst Brief + investor profile + proper multi-turn history.
- Personas may still speak via `[Name]:` prefixes (existing stream parser reused unchanged).
- Tools (news / SEC / earnings) unchanged.
- Used for greetings, follow-ups, quick factual questions.

### Deep lane pipeline (`adviser/debate.js`)
Streamed stage events keep the UI alive throughout.

- **Stage 0 — Brief (deterministic code, no LLM):** build Analyst Brief, load profile, assemble history digest per §3.
- **Stage 1 — Independent memos (4 parallel calls):** each persona gets own system prompt (identity + voice guide + checklist) with brief + profile + history digest + user question. Output schema: `{ stance, memo ≤300 words, key_evidence[], conviction 1–5 }`. Independence = diverse sampling before any groupthink can form. UI: "Viktor Hale has filed his memo…"
- **Stage 2 — Cross-examination (4 parallel calls):** each persona sees peers' memos; **must rebut ≥1 specific point they believe wrong AND concede ≥1 point where a peer is right** (concession rule prevents strawman theater).
- **Stage 3 — Synthesis (1 call, Alex):** sees brief + memos + rebuttals; emits fixed synthesis format (§1) including execution plan and dynamic suggestions JSON.
- **Wall-clock ≈ 3 sequential rounds** (parallel within rounds) ≈ acceptable for an explicitly deep mode.

### Persistence
New Prisma model `AdviserDebate { id, sessionId FK, ticker, question, memos Json, rebuttals Json, synthesis String, createdAt }`. History replay renders stored artifacts; export includes them.

---

## §3 · Context Engineering

- **Analyst Brief replaces raw JSON dump.** New deterministic builder `adviser/analystBrief.js` digests yfinance summary / financials / balance sheet / 20-day price history / insider / options-presence into labeled sections: Valuation snapshot (price vs DCF fair value, multiples vs sector) · Growth & margin trends · Balance-sheet health · Price-action stats · Insider/institutional activity · Options posture · **Auto-detected red flags** (e.g., receivables ≫ revenue — feeds Sam's checklist directly). Target ≤ ~1500 tokens (today's dump is unbounded).
- **Real multi-turn history.** Fast lane uses a proper alternating `contents` array (capped at last 20 messages) instead of today's flattened single-string re-send each turn. Deep-lane persona prompts receive the last 3 exchanges verbatim + the current question; Stage-2/3 prompts additionally receive the memos/rebuttals, which carry the debate context.
- **Citations preserved:** `#wacc`, `#growth`, `#dcf-value`, `#monte-carlo` markdown links remain mandated in fast-lane replies and Stage-3 synthesis.

## §4 · Investor Profile

- **Schema:** nullable columns on `User`: `investorRiskTolerance String?` (CONSERVATIVE/BALANCED/AGGRESSIVE), `investorHorizon String?` (SHORT/MEDIUM/LONG), `investorStyle String?` (VALUE/GROWTH/BLEND/INDEX), `investorNotes String?`.
- **Capture paths:** (a) optional 3-chip quick setup on chat splash; (b) organic — if profile is null, Alex asks once early in first session (prompt instruction); backend runs a cheap structured-extraction call on the answer and saves silently. Never blocks the chat on failure.
- **Injection:** profile block included in every prompt, both lanes, all personas. Personas explicitly instructed to argue suitability *for this user* (e.g., Mina conceding momentum risk is wrong for a SHORT-horizon conservative profile).
- **UI:** profile chip in header showing current values + edit affordance.

## §5 · Dynamic Suggestions

- Prompt examples ("What are the downside risks?") **removed** so the model stops parroting them.
- Fast lane keeps `[Suggestions]:` JSON trailer; requirements rewritten: suggestions must derive from conversation state or visible data gaps ("We haven't examined their debt maturity schedule").
- Deep lane: suggestions come from Stage-3 synthesis schema. Frontend parsing unchanged.

## §6 · Deep Research Cleanup

Move the hardcoded mega-prompt out of `AIFinancialAdviserChat.jsx` into backend service `backend/services/deepResearchPrompts.js`, parameterized by ticker; frontend sends intent only. Behavior preserved.

## §7 · Frontend Changes

- Persona registry (names, colors, initial-avatars) replacing `agentColors`; unknown agents fall back gracefully.
- Debate stage progress via enriched SSE status events: `{type:'stage', lane:'deep', stage:'brief'|'memos'|'rebuttal'|'synthesis', agent?, label}` — existing event types untouched for backward compat.
- Profile chip + splash quick-setup.
- "Convene Full Panel" toggle near input.
- Sessions/history/export keep working; export includes debate artifacts.

## §8 · Files Touched

**Backend**
- NEW `backend/services/adviser/personas.js` — persona definitions (identity, voice guides, checklists)
- NEW `backend/services/adviser/analystBrief.js`
- NEW `backend/services/adviser/router.js`
- NEW `backend/services/adviser/debate.js`
- REWORK `backend/services/aiFinancialAdviser.js` → thin facade: sessions, SSE emission, persistence; delegates to router/fast-lane/debate
- NEW `backend/routes/profile.js` — GET/PUT `/api/profile/investor` (auth-scoped)
- EDIT `backend/routes/stocks.js` (minor: delegate adviser logic to facade)
- EDIT `prisma/schema.prisma` (+ migration)
- NEW `backend/services/deepResearchPrompts.js`

**Frontend**
- REWORK `frontend/src/components/AIFinancialAdviserChat.jsx` (personas UI, stages, profile chip, toggle, DR prompt removal)

## §9 · Cost / Latency Budget

| Lane | Calls | Wall-clock |
|---|---|---|
| Fast | 1 (+tools) | unchanged vs today |
| Deep | 9 (4‖ + 4‖ + 1) | ≈ 3 sequential rounds |
| Brief builder | 0 LLM | ms |

Model stays `gemini-2.5-flash` everywhere in v2.0; upgrading synthesis to a stronger model flagged as future option, out of scope.

## §10 · Error Handling

- Memo/rebuttal call failure → retry once → else continue with "(memo unavailable)" marker; synthesis notes the missing perspective.
- Router misclassification → manual toggle escape hatch; decisions logged for tuning.
- Profile extraction failure → silent retry next opportunity; never blocks chat.
- SSE disconnect mid-debate → completed stages persisted; reconnect resumes or degrades to fast-lane answer.

## §11 · Testing & Rollout

- **Unit:** brief-builder fixtures; router heuristic table; suggestion/profile-extraction parsing.
- **Integration:** SSE event shape both lanes; session persistence incl. `AdviserDebate` artifacts.
- **Kill switch:** env flag `ADVISER_V2=legacy` restores current behavior during rollout.
- **Manual QA script:** sample questions across lanes; regression on citations/suggestions/export/history.
- **Release notes:** entry in `frontend/public/release-notes.html` (August section) required at implementation time per AGENTS.md.

## Out of Scope (v2.0)

5th persona (Priya Nair-style Risk Officer) · stronger model for synthesis · composable boards · streaming token-level rebroadcast of memo drafts (stage-level granularity only).
