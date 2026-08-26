# AI Financial Adviser 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-call role-played adviser team with a hybrid two-lane architecture (fast single call / multi-agent debate), named expert personas, per-user investor profiles, and de-canned dynamic suggestions.

**Architecture:** `aiFinancialAdviser.js` becomes a thin facade that classifies each message into a **fast lane** (one Gemini call, persona voices, real multi-turn history) or **deep lane** (independent memos → cross-examination → CIO synthesis, 9 calls ≈ 3 rounds). A deterministic Analyst Brief builder replaces the raw JSON dump; an env kill-switch restores legacy behavior.

**Tech Stack:** Node ESM, Express, Prisma/SQLite, @google/genai (`gemini-2.5-flash`), Jest (ESM), React (Vite/vitest frontend, no component tests today).

**Spec:** `.opencode/plans/2026-08-25-ai-financial-adviser-2.0.md`

## Global Constraints

- Backend tests: run from `backend/` with `npm test` (= `node --experimental-vm-modules node_modules/.bin/jest`). Test files match `**/__tests__/**/*.test.js`. Mock ESM deps with `jest.unstable_mockModule` (see `services/__tests__/aiClient.test.js` for the pattern).
- All backend source uses ES modules (`import`). No new npm dependencies.
- Gemini access only via `getAiClient()` from `backend/services/aiClient.js`; model string always `process.env.GEMINI_MODEL || 'gemini-2.5-flash'`.
- SSE wire format is unchanged: every event is `data: ${JSON.stringify(obj)}\n\n`, terminated by `data: [DONE]\n\n`. Existing event shapes (`{type:'sessionId'}`, `{type:'status',message}`, `{agent,chunk}`) MUST keep working; new events are additive (`{type:'stage',...}`).
- Kill switch: setting env `ADVISER_V2=legacy` must restore today's exact behavior (old prompt, flattened history, temperature 0.7).
- Prisma: after any schema edit run `npx prisma migrate dev --name <name>` from `backend/` (SQLite `prisma/dev.db`).
- Frontend verification: `npm run build` from `frontend/` (vite) must pass.
- Release-notes convention: user-visible changes get an entry in `frontend/public/release-notes.html` (August month-group, reverse chronological).
- Commit style: follow repo log (`feat: …`, `fix: …`, `perf(gurus): …` lowercase imperative).

---

### Task 1: Prisma schema — investor profile + AdviserDebate

**Files:**
- Modify: `backend/prisma/schema.prisma` (User model ~line 10, ChatSession ~line 56; append new model)

**Interfaces:**
- Produces: `User.investorRiskTolerance|investorHorizon|investorStyle|investorNotes` (all `String?`); `prisma.adviserDebate` model used by Task 7/8 with fields `sessionId, ticker, question, memos(Json), rebuttals(Json), synthesis(String)`.

- [ ] **Step 1: Edit schema**

In `model User` add after `role`:

```prisma
  investorRiskTolerance String? // CONSERVATIVE | BALANCED | AGGRESSIVE
  investorHorizon       String? // SHORT | MEDIUM | LONG
  investorStyle         String? // VALUE | GROWTH | BLEND | INDEX
  investorNotes         String?
```

In `model ChatSession` add relation field:

```prisma
  debates   AdviserDebate[]
```

Append new model:

```prisma
model AdviserDebate {
  id        String      @id @default(uuid())
  sessionId String
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  ticker    String
  question  String
  memos     Json
  rebuttals Json
  synthesis String
  createdAt DateTime    @default(now())

  @@index([sessionId])
}
```

- [ ] **Step 2: Migrate + validate**

```bash
cd backend && npx prisma migrate dev --name adviser_v2_profile_and_debates && npx prisma validate
```
Expected: migration applied, `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Regression check**

Run: `cd backend && npm test` — Expected: all existing suites PASS (schema change is additive).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(adviser): add investor profile fields and AdviserDebate model"
```

---

### Task 2: Persona definitions module

**Files:**
- Create: `backend/services/adviser/personas.js`
- Test: `backend/services/adviser/__tests__/personas.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PANEL` — array of 4 persona objects `{ id, name, colorToken, role }` where names are exactly `"Alex Meridian" | "Viktor Hale" | "Mina Okafor" | "Sam Reyes"` and colorTokens are CSS var names (`--accent-blue|--accent-amber|--accent-green|--accent-red`).
  - `getPersonaByName(name)` → persona or `null`.
  - `personaSystemPrompt(persona, { ticker })` → string (identity + voice guide + checklist + memo JSON output contract).
  - `personaRebuttalPrompt(persona, { peersBlock })` → string (must contain both rebut and concede instructions).
  - `alexSynthesisPrompt({ briefText, profileBlock, memosBlock, rebuttalsBlock })` → string (fixed synthesis format incl. Execution plan + `[Suggestions]:` trailer contract).
  - `fastLaneSystemPrompt({ profileBlock })` → string (roster + voice summaries + citation + suggestion rules, NO example suggestions).
  - `PROFILE_CAPTURE_INSTRUCTION` — string appended when profile incomplete (asks Alex to ask once).

- [ ] **Step 1: Write failing test**

```js
// backend/services/adviser/__tests__/personas.test.js
import { PANEL, getPersonaByName, personaSystemPrompt, personaRebuttalPrompt,
         alexSynthesisPrompt, fastLaneSystemPrompt, PROFILE_CAPTURE_INSTRUCTION } from "../personas.js";

describe("personas", () => {
  test("panel has exactly the four named experts", () => {
    expect(PANEL.map(p => p.name)).toEqual(["Alex Meridian", "Viktor Hale", "Mina Okafor", "Sam Reyes"]);
    expect(PANEL.map(p => p.colorToken)).toEqual(["--accent-blue", "--accent-amber", "--accent-green", "--accent-red"]);
  });

  test("every persona has non-empty philosophy, voice guide and ≥3-item checklist", () => {
    for (const p of PANEL) {
      expect(p.philosophy.length).toBeGreaterThan(20);
      expect(p.voiceGuide.length).toBeGreaterThan(20);
      expect(Array.isArray(p.checklist)).toBe(true);
      expect(p.checklist.length).toBeGreaterThanOrEqual(3);
      expect(p.verbalSignature.length).toBeGreaterThan(3);
    }
  });

  test("getPersonaByName is case-insensitive and null-safe", () => {
    expect(getPersonaByName("viktor hale").id).toBe("viktor");
    expect(getPersonaByName("Nobody")).toBeNull();
  });

  test("memo prompt embeds identity, checklist and strict JSON contract", () => {
    const v = getPersonaByName("Viktor Hale");
    const s = personaSystemPrompt(v, { ticker: "AAPL" });
    expect(s).toContain("Viktor Hale");
    expect(s).toContain("AAPL");
    expect(s).toContain('"stance"');
    expect(s).toContain('"conviction"');
    expect(s.toLowerCase()).toContain("margin of safety"); // philosophy present
  });

  test("rebuttal prompt demands a specific rebuttal AND a concession", () => {
    const s = personaRebuttalPrompt(getPersonaByName("Sam Reyes"), { peersBlock: "MEMOS-HERE" });
    expect(s).toContain("MEMOS-HERE");
    expect(/rebut/i.test(s)).toBe(true);
    expect(/concede/i.test(s));
  });

  test("synthesis prompt fixes Alex's output sections and suggestion trailer", () => {
    const s = alexSynthesisPrompt({ briefText: "BRIEF", profileBlock: "", memosBlock: "M", rebuttalsBlock: "R" });
    expect(s).toContain("BRIEF"); expect(s).toContain("M"); expect(s).toContain("R");
    expect(s).toContain("What would change my mind");
    expect(s).toContain("Execution plan");
    expect(s).toContain("[Suggestions]:");
  });

  test("fast lane prompt has no canned example suggestions", () => {
    const s = fastLaneSystemPrompt({ profileBlock: "" });
    expect(s).toContain("[Suggestions]:");
    expect(s).not.toContain("What are the downside risks?");
    expect(s).toMatch(/vary/i); // turn-order variation instruction present
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest adviser/__tests__/personas` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement personas.js**

```js
// backend/services/adviser/personas.js
// Single source of truth for the adviser panel: identities, voices, checklists,
// and every prompt fragment derived from them. No LLM calls happen here.

export const ALEX = {
  id: "alex",
  name: "Alex Meridian",
  colorToken: "--accent-blue",
  role: "Coordinator / CIO",
  philosophy:
    "Chairs the debate and owns the client relationship: suitability vs the investor profile, position sizing, and veto authority over ideas that do not fit this user.",
  voiceGuide:
    "Calm, economical, decisive. You summarize conflict instead of adding noise. You never pad. You assign calibrated conviction and record dissent honestly.",
  verbalSignature: "",
  checklist: [
    "Does the verdict fit THIS user's risk tolerance, horizon and style?",
    "Is conviction calibrated to evidence quality, not enthusiasm?",
    "What specifically would kill this thesis (falsifiers)?",
    "Position sizing and staged entry/exit levels given the user's profile",
  ],
};

export const VIKTOR = {
  id: "viktor",
  name: "Viktor Hale",
  colorToken: "--accent-amber",
  role: "Value Skeptic",
  philosophy:
    "Margin of safety above all else. Distrusts narratives, superlatives, and anything that requires the rosy scenario to hold. Converts narrative claims into a required price.",
  voiceGuide:
    "Dry, understated, numbers-first. You ask 'what am I paying for?' and translate stories into price requirements. Sparing use of your signature line adds weight — never repeat it mechanically.",
  verbalSignature: "I'll be the bad cop here.",
  checklist: [
    "FCF yield vs sector — what cash return does the price imply?",
    "Price vs intrinsic value estimate — how thin is the margin of safety?",
    "Debt maturity wall and refinancing risk",
    "Share-count / dilution history",
    "What perfect outcome is already priced in?",
  ],
};

export const MINA = {
  id: "mina",
  name: "Mina Okafor",
  colorToken: "--accent-green",
  role: "Growth / Momentum",
  philosophy:
    "Compounding growth and trend beat cheapness; cheap junk is expensive. Will pay up for durable growth backed by evidence, not hope. Reframes 'expensive' as possibly 'early'.",
  voiceGuide:
    "Energetic but precise about data. You cite acceleration numbers and trend levels, never vibes. Sparing use of your signature line — once per memo maximum.",
  verbalSignature: "Cheap is not the same as good.",
  checklist: [
    "Revenue acceleration or deceleration — direction of change matters more than level",
    "Evidence the addressable market is expanding (not just claimed)",
    "Price vs 50-day and 200-day moving averages; institutional accumulation signals",
    "Product-cycle catalysts on the horizon",
  ],
};

export const SAM = {
  id: "sam",
  name: "Sam Reyes",
  colorToken: "--accent-red",
  role: "Forensic Accountant",
  philosophy:
    "Reported earnings are a claim, not a fact. Attacks any thesis — including allies' — when the accounting underneath is soft. Lets the numbers do the accusing.",
  voiceGuide:
    "Flat, clinical, quietly alarming. You quote figures without adjectives and flag divergence between accruals and cash. Sparing use of your signature line.",
  verbalSignature: "The cash doesn't lie.",
  checklist: [
    "Accruals vs free-cash-flow divergence",
    "Receivables or inventory growing materially faster than revenue",
    "Recurring 'one-time' items inflating operating results",
    "Footnote commitments or off-balance-sheet exposure",
  ],
};

export const PANEL = [ALEX, VIKTOR, MINA, SAM];

export function getPersonaByName(name) {
  if (!name) return null;
  const needle = String(name).trim().toLowerCase();
  return PANEL.find((p) => p.name.toLowerCase() === needle) || null;
}

const CITATION_RULES = `
CITATION INSTRUCTIONS:
Whenever you mention a specific financial metric that appears on the user's dashboard (WACC, Revenue Growth,
DCF Fair Value, Monte Carlo bounds), you MUST format it as a markdown link with the id as the href.
Valid hrefs: "#wacc", "#growth", "#dcf-value", "#monte-carlo".
Example: "The [WACC](#wacc) of 8.5% implies a [DCF Fair Value](#dcf-value) of $150."`;

function checklistBlock(p) {
  return p.checklist.map((c, i) => `${i + 1}. ${c}`).join("\n");
}

export function personaSystemPrompt(persona, { ticker }) {
  const sig = persona.verbalSignature
    ? `\nYou may use your signature line at most once, and only if it lands naturally: "${persona.verbalSignature}"`
    : "";
  return `You are ${persona.name}, ${persona.role}, on a four-expert investment panel analyzing ${ticker}.
Your philosophy: ${persona.philosophy}

YOUR VOICE (stay in character, write like a human expert, vary sentence rhythm):
${persona.voiceGuide}${sig}

YOUR ANALYTICAL CHECKLIST (cover what the data supports; skip items with no data rather than padding):
${checklistBlock(persona)}

OUTPUT CONTRACT — reply with ONLY a JSON object, no markdown fence, matching exactly:
{"stance": "bullish"|"bearish"|"neutral", "memo": "<=300 words in your voice citing concrete numbers", "key_evidence": ["..."], "conviction": <integer 1-5>}`;
}

export function personaRebuttalPrompt(persona, { peersBlock }) {
  return `You are ${persona.name}, ${persona.role}, on a four-expert panel. Your colleagues filed independent memos:

${peersBlock}

Cross-examination round. Two mandatory parts, in this order:

## Rebuttal
Identify at least ONE specific claim from a named colleague that you believe is WRONG or overweighted, quote it briefly, and argue why with data. Attack the weakest point, not the strongest.

## Concession
Name at least ONE point from a colleague you must CONCEDE is right, and say plainly why. Honest concession builds the panel's credibility; skipping it is a failure.

Stay in your voice (${persona.voiceGuide}). Be specific and brief. Do not restate your own memo.`;
}

export function alexSynthesisPrompt({ briefText, profileBlock, memosBlock, rebuttalsBlock }) {
  return `${profileBlock}
ANALYST BRIEF:
${briefText}

INDEPENDENT MEMOS:
${memosBlock}

CROSS-EXAMINATION:
${rebuttalsBlock}

You are Alex Meridian, CIO and chair of this panel. Synthesize the debate into YOUR verdict. Write flowing markdown in your calm, decisive voice — do NOT use "[Agent Name]:" prefixes except when quoting a dissent verbatim.

Use EXACTLY these sections as markdown headings, in order:
## Stance
## Conviction
A single integer 1-5 with one-sentence justification tied to evidence quality.
## Key Numbers
Bullet points; dashboard metrics must use citation links (${CITATION_RULES.split("\n")[2].trim()}).
## What Would Change My Mind
Concrete falsifiers — specific observable thresholds, not vagueness.
## Execution Plan
Staged entry levels (e.g. tranches with prices or conditions), position-sizing note relative to the user's profile above, and an invalidation level where the thesis is dead.
## Dissents Recorded
Attribute disagreements to named panelists; quote their strongest opposing point.
${CITATION_RULES}

SUGGESTIONS RULES:
At the very end, append exactly one JSON array of 2-3 suggested follow-up questions on the format:
[Suggestions]: ["...", "..."]
Suggestions MUST derive from THIS conversation's open threads or visible data gaps (something we have NOT examined yet, e.g. an unstudied balance-sheet item or an upcoming catalyst). Never suggest generic boilerplate.`;
}

export function fastLaneSystemPrompt({ profileBlock }) {
  const roster = PANEL.map(
    (p) => `- ${p.name} (${p.role}): ${p.philosophy.split(".")[0]}. Voice: ${p.voiceGuide.split(".")[0]}.`
  ).join("\n");

  return `You are the coordination voice of a four-expert investment advisory panel discussing one stock. You speak AS the panel members, using the exact format "[Full Name]: message" whenever a member talks. The panel:
${roster}

RULES OF ENGAGEMENT:
- Speak through whichever members have something MATERIAL to add this turn. A member may stay silent. Vary who opens and the order of speakers between turns — never repeat the same sequence twice in a row.
- Members may disagree sharply, reference and attack each other's earlier points, and change their minds when evidence demands it.
- Never repeat a previous turn's structure or opening line. No filler intros like "Let me analyze".
- Ground every factual claim in the provided analyst brief, conversation context, or tool results. If data is missing, name what is missing instead of inventing numbers.
${profileBlock ? `\nINVESTOR PROFILE (tailor suitability, sizing and urgency to this person):\n${profileBlock}\n` : ""}
When the coordinator speaks (framing, synthesis, suitability calls), use "[Alex Meridian]:" — he also owns risk assessment and position sizing for the user.
${CITATION_RULES}

SUGGESTIONS RULES:
At the very end of your response, append exactly ONE structured JSON array containing 2-3 suggested follow-up questions:
[Suggestions]: ["...", "..."]
They MUST arise from this conversation (an unexplored thread, a data gap, a disagreement worth pressing). Never reuse generic questions across turns.`;
}

export const PROFILE_CAPTURE_INSTRUCTION =
  "If the INVESTOR PROFILE section above contains unknowns, ask the user about ONE missing dimension early in this reply (risk tolerance, time horizon, or preferred style) — briefly, in Alex Meridian's voice, woven into your answer rather than interrogating.";
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest adviser/__tests__/personas` — Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/adviser/personas.js backend/services/adviser/__tests__/personas.test.js
git commit -m "feat(adviser): named expert personas with voice guides and checklists"
```

---

### Task 3: Analyst Brief builder (deterministic, replaces raw JSON dump)

**Files:**
- Create: `backend/services/adviser/analystBrief.js`
- Test: `backend/services/adviser/__tests__/analystBrief.test.js`

**Interfaces:**
- Consumes: the exact `quantData` object built by `POST /api/stocks/:ticker/advisor-chat`: `{ summary, financials, balanceSheet, priceHistory, optionChain, insiderData, ticker? }` (all fields may be null).
- Produces: `buildAnalystBrief(data)` → `{ text: string, redFlags: string[] }`. `text` ≤ 7000 chars (~1750 tokens), plain-text labeled sections. Exported helpers: `num(v)`, `pct(v)`.

- [ ] **Step 1: Write failing test**

```js
// backend/services/adviser/__tests__/analystBrief.test.js
import { buildAnalystBrief } from "../analystBrief.js";

const FIXTURE = {
  ticker: "TEST",
  summary: {
    price: { regularMarketPrice: 150, regularMarketChangePercent: 1.2 },
    summaryDetail: { trailingPe: 28.4, forwardPe: 24.1, priceToBook: 9.2, marketCap: 2_400_000_000_000 },
    meta: { longName: "Test Corp", sector: "Technology" },
  },
  financials: [
    { date: "2024-12-31", totalRevenue: 120_000_000_000, netIncome: 30_000_000_000 },
    { date: "2023-12-31", totalRevenue: 100_000_000_000, netIncome: 25_000_000_000 },
  ],
  balanceSheet: [
    { date: "2024-12-31", totalCash: 60_000_000_000, totalDebt: 90_000_000_000, receivables: 50_000_000_000 },
    { date: "2023-12-31", totalCash: 55_000_000_000, totalDebt: 85_000_000_000, receivables: 35_000_000_000 },
  ],
  priceHistory: Array.from({ length: 20 }, (_, i) => ({ close: 100 + i })),
  optionChain: { hasOptions: true },
  insiderData: { transactions: [
    { transactionType: "Sell" }, { transactionType: "Sell" }, { transactionType: "Buy" },
  ]},
};

describe("buildAnalystBrief", () => {
  test("emits labeled sections from fixture data", () => {
    const { text } = buildAnalystBrief(FIXTURE);
    expect(text).toContain("VALUATION SNAPSHOT");
    expect(text).toContain("GROWTH & PROFITABILITY");
    expect(text).toContain("BALANCE SHEET");
    expect(text).toContain("PRICE ACTION");
    expect(text).toContain("INSIDER ACTIVITY");
    expect(text).toContain("+20.0%"); // 100 -> 120 over window
  });

  test("flags receivables growing much faster than revenue", () => {
    const { redFlags } = buildAnalystBrief(FIXTURE);
    expect(redFlags.some(f => /receivab/i.test(f))).toBe(true);
  });

  test("handles fully-null input without throwing", () => {
    const { text, redFlags } = buildAnalystBrief({});
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(redFlags).toEqual([]);
    expect(text).toMatch(/unavailable/i);
  });

  test("caps length near token budget", () => {
    const { text } = buildAnalystBrief(FIXTURE);
    expect(text.length).toBeLessThanOrEqual(6000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest adviser/__tests__/analystBrief` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```js
// backend/services/adviser/analystBrief.js
// Deterministic pre-digestion of raw quantData into a compact labeled brief.
// Replaces the previous unbounded JSON.stringify() context dump.

const MAX_TEXT = 6000;

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pct(from, to) {
  const a = num(from), b = num(to);
  if (!a || !b || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

function fmtBig(n) {
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toFixed(2);
}

function fmtPctVal(p) {
  return p === null ? "n/a" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function latestTwo(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return [null, null];
  const sorted = [...arr].sort((x, y) => String(x.date).localeCompare(String(y.date)));
  return [sorted[sorted.length - 2] || null, sorted[sorted.length - 1]];
}

export function buildAnalystBrief(data = {}) {
  const redFlags = [];
  const lines = [];
  const push = (...ls) => lines.push(...ls);

  const summary = data.summary || {};
  const meta = summary.meta || {};
  const price = summary.price || {};
  const sd = summary.summaryDetail || {};

  push(`# ANALYST BRIEF — ${meta.longName || data.ticker || "?"} (${data.ticker || "?"})`);
  if (meta.sector) push(`Sector: ${meta.sector}`);

  // ── Valuation snapshot ────────────────────────────────────────────────
  push("", "## VALUATION SNAPSHOT");
  push(`Price: $${num(price.regularMarketPrice)?.toFixed(2) ?? "unavailable"} (${fmtPctVal(num(price.regularMarketChangePercent))} today)`);
  if (num(sd.marketCap)) push(`Market cap: $${fmtBig(num(sd.marketCap))}`);
  if (num(sd.trailingPe) || num(sd.forwardPe)) push(`P/E trailing ${num(sd.trailingPe)?.toFixed(1) ?? "n/a"} / forward ${num(sd.forwardPe)?.toFixed(1) ?? "n/a"}; P/B ${num(sd.priceToBook)?.toFixed(1) ?? "n/a"}`);
  if (data.dcfFairValue != null) {
    const upside = pct(num(data.dcfFairValue), num(price.regularMarketPrice));
    push(`DCF Fair Value (dashboard): $${num(data.dcfFairValue).toFixed(2)} → implied upside ${fmtPctVal(upside)}`);
  }

  // ── Growth & profitability ────────────────────────────────────────────
  push("", "## GROWTH & PROFITABILITY");
  const [finPrev, finLast] = latestTwo(data.financials);
  if (finLast) {
    const revGrowth = finPrev ? pct(finPrev.totalRevenue, finLast.totalRevenue) : null;
    const niGrowth = finPrev ? pct(finPrev.netIncome, finLast.netIncome) : null;
    const margin = num(finLast.netIncome) && num(finLast.totalRevenue)
      ? (finLast.netIncome / finLast.totalRevenue) * 100 : null;
    push(`Latest FY revenue $${fmtBig(num(finLast.totalRevenue))} YoY ${fmtPctVal(revGrowth)}; net income $${fmtBig(num(finLast.netIncome))} YoY ${fmtPctVal(niGrowth)}; margin ${margin === null ? "n/a" : margin.toFixed(1) + "%"}`);
    if (revGrowth !== null) lines[lines.length - 1] += revGrowth < 0 ? " ← revenue contracting" : "";
  } else {
    push("Income statement: unavailable");
  }

  // ── Balance sheet ─────────────────────────────────────────────────────
  push("", "## BALANCE SHEET HEALTH");
  const [bsPrev, bsLast] = latestTwo(data.balanceSheet);
  let receivablesGrowth = null, revenueGrowth = null;
  if (bsLast) {
    const netCash = (num(bsLast.totalCash) || 0) - (num(bsLast.totalDebt) || 0);
    push(`Cash $${fmtBig(num(bsLast.totalCash))}, debt $${fmtBig(num(bsLast.totalDebt))} → net ${netCash >= 0 ? "cash" : "debt"} $${fmtBig(Math.abs(netCash))}`);
    if (bsPrev && num(bsPrev.receivables) && num(bsLast.receivables)) {
      receivablesGrowth = pct(bsPrev.receivables, bsLast.receivables);
      push(`Receivables $${fmtBig(num(bsLast.receivables))} YoY ${fmtPctVal(receivablesGrowth)}`);
    }
  } else {
    push("Balance sheet: unavailable");
  }

  // Red-flag rule 1: receivables ≫ revenue
  if (finPrev && finLast && bsPrev && bsLast &&
      num(bsPrev.receivables) && num(bsLast.receivables)) {
    revenueGrowth = pct(finPrev.totalRevenue, finLast.totalRevenue);
    if (receivablesGrowth !== null && revenueGrowth !== null &&
        receivablesGrowth > revenueGrowth * 1.5 && receivablesGrowth > 20) {
      redFlags.push(`FORENSIC: receivables grew ${fmtPctVal(receivablesGrowth)} vs revenue ${fmtPctVal(revenueGrowth)} — possible revenue-quality issue (channel stuffing?). Sam Reyes should examine.`);
    }
  }

  // ── Price action (window provided by caller, currently last 20 closes) ─
  push("", "## PRICE ACTION (recent window)");
  const hist = Array.isArray(data.priceHistory) ? data.priceHistory : [];
  const closes = hist.map((h) => num(h.close)).filter(Number.isFinite);
  if (closes.length >= 2) {
    const chg = pct(closes[0], closes[closes.length - 1]);
    const hi = Math.max(...closes), lo = Math.min(...closes);
    push(`${closes.length}-session move ${fmtPctVal(chg)}; range $${lo.toFixed(2)}–$${hi.toFixed(2)} (last $${closes[closes.length - 1].toFixed(2)})`);
  } else {
    push("Price history: unavailable");
  }

  // ── Insider activity ──────────────────────────────────────────────────
  push("", "## INSIDER ACTIVITY");
  const txs = data.insiderData?.transactions;
  if (Array.isArray(txs) && txs.length) {
    const buys = txs.filter((t) => /buy/i.test(t.transactionType || "")).length;
    const sells = txs.filter((t) => /sell/i.test(t.transactionType || "")).length;
    push(`${txs.length} recent transactions: ${buys} buys / ${sells} sells`);
    if (sells >= 3 * buys && sells >= 3) {
      redFlags.push(`INSIDER: heavy selling cluster (${sells} sells vs ${buys} buys) — Viktor should weigh against bullish cases.`);
    }
  } else {
    push("Insider data: unavailable");
  }

  // ── Options posture ───────────────────────────────────────────────────
  push("", "## OPTIONS MARKET");
  push(data.optionChain?.hasOptions ? "Listed options available (dashboard has IV/monte-carlo tools)." : "No listed options.");

  if (redFlags.length) push("", "## AUTO-DETECTED RED FLAGS", ...redFlags.map((f) => `⚠ ${f}`));

  let text = lines.join("\n").trim();
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT - 20)}\n…(truncated)`;
  return { text, redFlags };
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest adviser/__tests__/analystBrief` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/adviser/analystBrief.js backend/services/adviser/__tests__/analystBrief.test.js
git commit -m "feat(adviser): deterministic analyst brief builder replaces raw JSON dump"
```

---

### Task 4: Lane router

**Files:**
- Create: `backend/services/adviser/router.js`
- Test: `backend/services/adviser/__tests__/router.test.js`

**Interfaces:**
- Produces: `classifyLane(message, { forceDeep = false } = {})` → `'deep' | 'fast'`. Precedence: explicit override > simple-lookup (fast) > deep-intent > default fast. Exports `DEEP_INTENT_RE` and `SIMPLE_LOOKUP_RE` for testing/UI reuse.

- [ ] **Step 1: Write failing test**

```js
// backend/services/adviser/__tests__/router.test.js
import { classifyLane } from "../router.js";

describe("classifyLane", () => {
  const cases = [
    ["hi", "fast"],
    ["what is the WACC?", "fast"],
    ["show me insider activity", "fast"],
    ["how much debt do they have?", "fast"],
    ["Should I buy AAPL right now given the valuation?", "deep"],
    ["Analyze the risks of holding this into earnings", "deep"],
    ["Convince me this isn't just hype around the product cycle", "deep"],
    ["I've been watching this consolidate for weeks and I think the smart-money accumulation plus upcoming catalysts make a breakout likely, but the debt wall worries me.", "deep"], // >120 chars, no keywords
  ];
  for (const [msg, expected] of cases) {
    test(`${JSON.stringify(msg.slice(0, 40))} → ${expected}`, () => {
      expect(classifyLane(msg)).toBe(expected);
    });
  }
  test("override wins over simple lookup", () => {
    expect(classifyLane("what is the WACC?", { forceDeep: true })).toBe("deep");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest adviser/__tests__/router` — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// backend/services/adviser/router.js
// Rule-based lane classifier (v1, zero cost). Decisions are logged for tuning.

export const DEEP_INTENT_RE =
  /(should i|buy|sell|thesis|analy[sz]e|deep dive|debate|worth it|convince me|outlook|risk)/i;

export const SIMPLE_LOOKUP_RE = /^\s*(what is|whats|what's|show me|how much)\b/i;

export function classifyLane(message, { forceDeep = false } = {}) {
  const msg = String(message || "");
  let lane;
  if (forceDeep) lane = "deep";
  else if (SIMPLE_LOOKUP_RE.test(msg)) lane = "fast";
  else if (msg.length > 120 || DEEP_INTENT_RE.test(msg)) lane = "deep";
  else lane = "fast";

  console.info(JSON.stringify({
    evt: "adviser_lane", lane, len: msg.length,
    forced: forceDeep || undefined, sample: msg.slice(0, 60),
  }));
  return lane;
}
```

- [ ] **Step 4: Run tests** — `cd backend && npx jest adviser/__tests__/router` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/adviser/router.js backend/services/adviser/__tests__/router.test.js
git commit -m "feat(adviser): rule-based two-lane router"
```

---

### Task 5: Investor profile service

**Files:**
- Create: `backend/services/adviser/profile.js`
- Test: `backend/services/adviser/__tests__/profile.test.js`

**Interfaces:**
- Consumes: `prisma` default export from `backend/services/db.js`; `getAiClient()` from `backend/services/aiClient.js`.
- Produces:
  - `VALID_PROFILE` — `{ riskTolerance:["CONSERVATIVE","BALANCED","AGGRESSIVE"], horizon:["SHORT","MEDIUM","LONG"], style:["VALUE","GROWTH","BLEND","INDEX"] }`
  - `getInvestorProfile(userId)` → `{ riskTolerance,horizon,style,notes }` (all `null` when unset or `userId` falsy). Never throws.
  - `saveInvestorProfile(userId, patch)` → validated subset persisted to User columns (`investorRiskTolerance` etc.). Throws on invalid enum values.
  - `formatProfileBlock(p)` → `""` or labeled block string.
  - `isProfileComplete(p)` → boolean.
  - `extractProfileFromMessage(message)` → `{ riskTolerance?,horizon?,style?,notes? } | null`; never throws.

- [ ] **Step 1: Write failing test**

```js
// backend/services/adviser/__tests__/profile.test.js
import { jest } from "@jest/globals";

const mockPrisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
jest.unstable_mockModule("../../db.js", () => ({ default: mockPrisma }));

const mockGenerateContent = jest.fn();
const mockAi = { models: { generateContent: mockGenerateContent } };
jest.unstable_mockModule("../../aiClient.js", () => ({ getAiClient: () => mockAi }));

const { getInvestorProfile, saveInvestorProfile, formatProfileBlock, isProfileComplete, extractProfileFromMessage }
  = await import("../profile.js");

describe("investor profile service", () => {
  beforeEach(() => jest.clearAllMocks());

  test("getInvestorProfile returns null-fields for missing user and null userId", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect(await getInvestorProfile("u1")).toEqual({ riskTolerance: null, horizon: null, style: null, notes: null });
    expect(await getInvestorProfile(null)).toEqual({ riskTolerance: null, horizon: null, style: null, notes: null });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("maps db columns to normalized keys", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      investorRiskTolerance: "AGGRESSIVE", investorHorizon: "LONG", investorStyle: "GROWTH", investorNotes: "likes semis",
    });
    expect(await getInvestorProfile("u1")).toEqual({ riskTolerance: "AGGRESSIVE", horizon: "LONG", style: "GROWTH", notes: "likes semis" });
  });

  test("saveInvestorProfile validates enums and writes mapped columns", async () => {
    mockPrisma.user.update.mockResolvedValue({});
    await saveInvestorProfile("u1", { riskTolerance: "BALANCED", horizon: "SHORT", junk: "ignored" });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { investorRiskTolerance: "BALANCED", investorHorizon: "SHORT" },
    });
    await expect(saveInvestorProfile("u1", { riskTolerance: "YOLO" })).rejects.toThrow(/invalid value/i);
  });

  test("formatProfileBlock empty when nothing set, labeled when set", () => {
    expect(formatProfileBlock({ riskTolerance: null, horizon: null, style: null, notes: null })).toBe("");
    const block = formatProfileBlock({ riskTolerance: "CONSERVATIVE", horizon: "MEDIUM", style: null, notes: null });
    expect(block).toContain("CONSERVATIVE"); expect(block).toContain("MEDIUM");
  });

  test("isProfileComplete requires all three enums", () => {
    expect(isProfileComplete({ riskTolerance: "BALANCED", horizon: "LONG", style: "BLEND" })).toBe(true);
    expect(isProfileComplete({ riskTolerance: "BALANCED", horizon: null, style: "BLEND" })).toBe(false);
  });

  test("extractProfileFromMessage parses model JSON and survives garbage", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '{"riskTolerance":"AGGRESSIVE","horizon":"LONG","style":null,"notes":null}',
    });
    expect(await extractProfileFromMessage("I'm aggressive with a 10 year horizon"))
      .toEqual({ riskTolerance: "AGGRESSIVE", horizon: "LONG", style: null, notes: null });

    mockGenerateContent.mockResolvedValueOnce({ text: "I could not detect anything." });
    expect(await extractProfileFromMessage("hello there")).toBeNull();

    mockGenerateContent.mockRejectedValueOnce(new Error("boom"));
    expect(await extractProfileFromMessage("whatever")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest adviser/__tests__/profile` — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// backend/services/adviser/profile.js
import prisma from "../db.js";
import { getAiClient } from "../aiClient.js";

export const VALID_PROFILE = {
  riskTolerance: ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"],
  horizon: ["SHORT", "MEDIUM", "LONG"],
  style: ["VALUE", "GROWTH", "BLEND", "INDEX"],
};

const EMPTY = () => ({ riskTolerance: null, horizon: null, style: null, notes: null });
const COLS = { riskTolerance: "investorRiskTolerance", horizon: "investorHorizon", style: "investorStyle", notes: "investorNotes" };

function normalize(row) {
  if (!row) return EMPTY();
  return {
    riskTolerance: row.investorRiskTolerance ?? null,
    horizon: row.investorHorizon ?? null,
    style: row.investorStyle ?? null,
    notes: row.investorNotes ?? null,
  };
}

export async function getInvestorProfile(userId) {
  if (!userId) return EMPTY();
  try {
    const row = await prisma.user.findUnique({ where: { id: userId } });
    return normalize(row);
  } catch (e) {
    console.error("[adviser-profile]", e.message);
    return EMPTY();
  }
}

export async function saveInvestorProfile(userId, patch) {
  const data = {};
  for (const key of Object.keys(COLS)) {
    const v = patch?.[key];
    if (v == null) continue;
    if (key !== "notes") {
      const allowed = VALID_PROFILE[key];
      const up = String(v).toUpperCase();
      if (!allowed.includes(up)) throw new Error(`Invalid value for ${key}: ${v}`);
      data[COLS[key]] = up;
    } else {
      data[COLS[key]] = String(v).slice(0, 500);
    }
  }
  if (Object.keys(data).length === 0) return;
  await prisma.user.update({ where: { id: userId }, data });
}

export function formatProfileBlock(p) {
  if (!p) return "";
  const parts = [];
  if (p.riskTolerance) parts.push(`Risk tolerance: ${p.riskTolerance}`);
  if (p.horizon) parts.push(`Time horizon: ${p.horizon}`);
  if (p.style) parts.push(`Preferred style: ${p.style}`);
  if (p.notes) parts.push(`Notes: ${p.notes}`);
  if (parts.length === 0) return "";
  return `INVESTOR PROFILE:\n${parts.map((s) => `- ${s}`).join("\n")}`;
}

export function isProfileComplete(p) {
  return Boolean(p && VALID_PROFILE.riskTolerance.includes(p.riskTolerance)
    && VALID_PROFILE.horizon.includes(p.horizon)
    && VALID_PROFILE.style.includes(p.style));
}

const EXTRACT_SYSTEM = `You detect an investor's self-description in a chat message. Reply with ONLY a JSON object (no fences):
{"riskTolerance": "CONSERVATIVE"|"BALANCED"|"AGGRESSIVE"|null, "horizon": "SHORT"|"MEDIUM"|"LONG"|null, "style": "VALUE"|"GROWTH"|"BLEND"|"INDEX"|null, "notes": "short paraphrase or null"}
Map phrases conservatively ("long term" → LONG, "play it safe" → CONSERVATIVE). Use null when not stated.`;

export async function extractProfileFromMessage(message) {
  try {
    const ai = getAiClient();
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: String(message).slice(0, 2000) }] }],
      config: { systemInstruction: EXTRACT_SYSTEM, temperature: 0.1 },
    });
    const m = String(res.text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const out = {};
    for (const k of Object.keys(COLS)) if (parsed[k] != null) out[k] = parsed[k];
    return Object.keys(out).length ? out : null;
  } catch (e) {
    console.error("[adviser-profile-extract]", e.message);
    return null;
  }
}
```

- [ ] **Step 4: Run tests** — `cd backend && npx jest adviser/__tests__/profile` — Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/adviser/profile.js backend/services/adviser/__tests__/profile.test.js
git commit -m "feat(adviser): persistent investor profile service with in-chat extraction"
```

---

### Task 6: Agent-prefix stream splitter (shared util)

**Files:**
- Create: `backend/services/adviser/agentPrefixStream.js`
- Test: `backend/services/adviser/__tests__/agentPrefixStream.test.js`

**Interfaces:**
- Produces: `createAgentPrefixSplitter(initialAgent = "Alex Meridian")` → `{ push(text) → [{agent,chunk}], end() → [{agent,chunk}] }`. This ports the streaming regex logic currently inline in `aiFinancialAdviser.js` (lines 133–156) so facade and debate share it. The facade refactor in Task 8 replaces its inline copy with this module (behavior identical).

- [ ] **Step 1: Write failing test**

```js
// backend/services/adviser/__tests__/agentPrefixStream.test.js
import { createAgentPrefixSplitter } from "../agentPrefixStream.js";

describe("agentPrefixSplitter", () => {
  test("splits [Agent]: prefixes mid-stream like the current facade logic", () => {
    const sp = createAgentPrefixSplitter("Alex Meridian");
    const out1 = sp.push("[Viktor Hale]: This is expensive.");
    expect(out1[0]).toEqual({ agent: "Alex Meridian", chunk: "" });
    expect(out1[1].agent).toBe("Viktor Hale");
    const rest = out1.slice(1).map(o => o.chunk).join("") + sp.push(" More.").map(o => o.chunk).join("") + sp.end().map(o => o.chunk).join("");
    expect(rest.replace(/\s+/g, " ").trim()).toBe("This is expensive. More.".replace(/\s+/g, " ").trim());
  });

  test("plain text accumulates under current agent until flushed", () => {
    const sp = createAgentPrefixSplitter("Coordinator");
    expect(sp.push("hello ")).toEqual([]);
    expect(sp.end()).toEqual([{ agent: "Coordinator", chunk: "hello " }]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd backend && npx jest adviser/__tests__/agentPrefixStream` — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// backend/services/adviser/agentPrefixStream.js
// Shared "[Agent Name]: text" stream splitter. Faithful port of the regex
// state machine previously inlined in services/aiFinancialAdviser.js.

export function createAgentPrefixSplitter(initialAgent = "Alex Meridian") {
  let buffer = "";
  let currentAgent = initialAgent;

  const drain = function* (flushAll = false) {
    const regex = /\[([^\]]+)\]:\s*/g;
    let match;
    while ((match = regex.exec(buffer)) !== null) {
      if (match.index > 0) yield { agent: currentAgent, chunk: buffer.substring(0, match.index) };
      currentAgent = match[1];
      buffer = buffer.substring(match.index + match[0].length);
      regex.lastIndex = 0;
    }
    if (flushAll && buffer.length > 0) {
      yield { agent: currentAgent, chunk: buffer };
      buffer = "";
    }
  };

  return {
    push(text) {
      buffer += text;
      const out = [];
      for (const piece of drain(false)) out.push(piece);
      // Same bounded-buffer heuristic as the original facade implementation.
      if (buffer.length > 50) {
        const nl = buffer.lastIndexOf("\n");
        const safeLength = nl !== -1 ? nl + 1 : buffer.length - 20;
        if (safeLength > 0) {
          out.push({ agent: currentAgent, chunk: buffer.substring(0, safeLength) });
          buffer = buffer.substring(safeLength);
        }
      }
      return out;
    },
    end() {
      const out = [];
      for (const piece of drain(true)) out.push(piece);
      return out;
    },
  };
}
```

- [ ] **Step 4: Run tests** — Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/adviser/agentPrefixStream.js backend/services/adviser/__tests__/agentPrefixStream.test.js
git commit -m "refactor(adviser): extract shared agent-prefix stream splitter"
```

---

### Task 7: Debate pipeline (deep lane)

**Files:**
- Create: `backend/services/adviser/debate.js`
- Test: `backend/services/adviser/__tests__/debate.test.js`

**Interfaces:**
- Consumes: `PANEL`, `personaSystemPrompt`, `personaRebuttalPrompt`, `alexSynthesisPrompt` from `./personas.js`; `createAgentPrefixSplitter` from `./agentPrefixStream.js`; `getAiClient()`; `prisma.adviserDebate.create`.
- Produces: `runDebate({ sessionId, ticker, userMessage, briefText, profileBlock, historyDigest })` — async generator yielding SSE-safe events:
  - `{type:'status', message}` and `{type:'stage', stage:'memos'|'rebuttal'|'synthesis', label, agent?}`
  - `{agent:'Alex Meridian', chunk}` text deltas during synthesis
  - terminal `{type:'synthesis_complete', fullText}` (facade consumes this WITHOUT forwarding; used to persist the chat message)
  Side effect: writes one `adviserDebate` row. Memo/rebuttal failures retry once then mark `"(memo unavailable)"` and the debate continues.

- [ ] **Step 1: Write failing test**

```js
// backend/services/adviser/__tests__/debate.test.js
import { jest } from "@jest/globals";

const mockCreate = jest.fn().mockResolvedValue({});
jest.unstable_mockModule("../../db.js", () => ({
  default: { adviserDebate: { create: mockCreate } },
}));

let scriptedResponses = [];
const mockGenerateContent = jest.fn(() => {
  const next = scriptedResponses.shift();
  if (next instanceof Error) throw next;
  return Promise.resolve({ text: typeof next === "string" ? next : JSON.stringify(next) });
});
const mockStream = jest.fn(async function* () {
  for (const t of ["## Stance\n", "Constructive on TEST.", "\n\n[Suggestions]: [\"Check debt schedule\"]"]) {
    yield { text: t };
  }
});
jest.unstable_mockModule("../../aiClient.js", () => ({
  getAiClient: () => ({ models: { generateContent: mockGenerateContent, generateContentStream: mockStream } }),
}));

const { runDebate } = await import("../debate.js");

const MEMO = { stance: "bullish", memo: "Numbers look fine.", key_evidence: ["rev +20%"], conviction: 4 };

async function collect(gen) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("runDebate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    scriptedResponses = [];
  });

  test("runs memos → rebuttals → synthesis and persists artifacts", async () => {
    scriptedResponses = [MEMO, MEMO, MEMO, MEMO, MEMO, MEMO, MEMO, MEMO]; // 4 memos + 4 rebuttals (rebuttal returns JSON but pipeline tolerates)
    const events = await collect(runDebate({
      sessionId: "s1", ticker: "TEST", userMessage: "Should I buy?",
      briefText: "BRIEF", profileBlock: "", historyDigest: "",
    }));

    const stages = events.filter(e => e.type === "stage").map(e => e.stage);
    expect(stages).toEqual(["brief", "memos", "rebuttal", "synthesis"]);
    expect(events.some(e => e.agent === "Alex Meridian" && e.chunk === "Constructive on TEST.")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "synthesis_complete" });
    expect(events.at(-1).fullText).toContain("Constructive on TEST.");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0].data;
    expect(arg.sessionId).toBe("s1");
    expect(arg.ticker).toBe("TEST");
    expect(arg.memos).toHaveLength(4);
    expect(arg.rebuttals).toHaveLength(4);
    expect(arg.synthesis).toContain("Stance");
  });

  test("failed memo retries once then marks unavailable, debate still completes", async () => {
    scriptedResponses = [new Error("boom"), MEMO, MEMO, MEMO, MEMO, MEMO, MEMO, MEMO, MEMO]; // first call fails, retry succeeds
    const events = await collect(runDebate({
      sessionId: "s2", ticker: "TEST", userMessage: "q", briefText: "B", profileBlock: "", historyDigest: "",
    }));
    expect(mockGenerateContent.mock.calls.length).toBe(9); // 4 memos (1 fails twice) + 4 rebuttals
    expect(mockCreate).toHaveBeenCalled();
    const memosArg = mockCreate.mock.calls[0][0].data.memos;
    expect(memosArg.every(m => m.stance === "bullish" || m.memo === "(memo unavailable)")).toBe(true);
    expect(events.at(-1).type).toBe("synthesis_complete");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest adviser/__tests__/debate` — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// backend/services/adviser/debate.js
import { getAiClient } from "../aiClient.js";
import prisma from "../db.js";
import { PANEL, personaSystemPrompt, personaRebuttalPrompt, alexSynthesisPrompt, ALEX } from "./personas.js";
import { createAgentPrefixSplitter } from "./agentPrefixStream.js";

const MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

function lenientJSON(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function callWithRetry(fn) {
  try { return await fn(); } catch (e) {
    console.error("[debate] call failed, retrying once:", e.message);
    try { return await fn(); } catch (e2) {
      console.error("[debate] retry failed:", e2.message);
      return null;
    }
  }
}

async function generateMemo(persona, { ticker, briefText, profileBlock, historyDigest, userMessage }) {
  const res = await callWithRetry(() =>
    getAiClient().models.generateContent({
      model: MODEL(),
      contents: [{
        role: "user",
        parts: [{ text: `${profileBlock}\nANALYST BRIEF:\n${briefText}\n\nRECENT CONVERSATION:\n${historyDigest || "(start of conversation)"}\n\nUSER QUESTION: ${userMessage}` }],
      }],
      config: { systemInstruction: personaSystemPrompt(persona, { ticker }), temperature: 0.8 },
    })
  );
  const parsed = res ? lenientJSON(res.text) : null;
  if (!parsed || !parsed.memo) {
    return { personaId: persona.id, name: persona.name, stance: "unknown", memo: "(memo unavailable)", key_evidence: [], conviction: 0 };
  }
  return {
    personaId: persona.id,
    name: persona.name,
    stance: parsed.stance || "neutral",
    memo: String(parsed.memo).slice(0, 2500),
    key_evidence: Array.isArray(parsed.key_evidence) ? parsed.key_evidence.slice(0, 5) : [],
    conviction: Math.min(5, Math.max(1, Number(parsed.conviction) || 3)),
  };
}

function memosBlock(memos) {
  return memos.map((m) =>
    `=== ${m.name} (${m.stance}, conviction ${m.conviction}/5) ===\n${m.memo}\nEvidence: ${JSON.stringify(m.key_evidence)}`
  ).join("\n\n");
}

async function generateRebuttal(persona, others) {
  const peersBlock = others.map((m) => `--- ${m.name}: ${m.memo}`).join("\n");
  const res = await callWithRetry(() =>
    getAiClient().models.generateContent({
      model: MODEL(),
      contents: [{ role: "user", parts: [{ text: personaRebuttalPrompt(persona, { peersBlock }) }] }],
      config: { systemInstruction: personaSystemPrompt(persona, { ticker: others[0]?.ticker || "" }).split("OUTPUT CONTRACT")[0], temperature: 0.8 },
    })
  );
  const body = res?.text ? String(res.text).slice(0, 2500) : "(rebuttal unavailable)";
  return { personaId: persona.id, name: persona.name, rebuttal: body };
}

export async function* runDebate({ sessionId, ticker, userMessage, briefText, profileBlock, historyDigest }) {
  // Stage 0 — brief is pre-built by the facade (deterministic); emit its stage marker
  yield { type: "stage", stage: "brief", label: "Building analyst brief..." };

  // Stage 1 — independent memos (parallel)
  yield { type: "stage", stage: "memos", label: "Panel convening — independent memos in progress..." };
  const memoPromises = PANEL.map((p) =>
    generateMemo(p, { ticker, briefText, profileBlock, historyDigest, userMessage })
  );
  const memos = await Promise.all(memoPromises);
  for (const m of memos) {
    yield { type: "status", message: m.memo === "(memo unavailable)"
      ? `${m.name}'s memo was lost — continuing without it.`
      : `${m.name} filed his/her memo (${m.stance}, conviction ${m.conviction}/5).` };
  }

  // Stage 2 — cross-examination (parallel; each sees the other three)
  yield { type: "stage", stage: "rebuttal", label: "Cross-examination — panelists challenge and concede..." };
  const rebuttalPromises = PANEL.map((p) => {
    const others = memos.filter((m) => m.personaId !== p.id).map((m) => ({ ...m, ticker }));
    return generateRebuttal(p, others);
  });
  const rebuttals = await Promise.all(rebuttalPromises);

  // Stage 3 — Alex synthesizes (streaming)
  yield { type: "stage", stage: "synthesis", label: "Alex Meridian is synthesizing the verdict..." };
  const synthesisPrompt = alexSynthesisPrompt({
    briefText,
    profileBlock: profileBlock || "(no investor profile on file)",
    memosBlock: memosBlock(memos),
    rebuttalsBlock: rebuttals.map((r) => `--- ${r.name}: ${r.rebuttal}`).join("\n"),
  });

  const splitter = createAgentPrefixSplitter(ALEX.name);
  const stream = await getAiClient().models.generateContentStream({
    model: MODEL(),
    contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }],
    config: { systemInstruction: `You are ${ALEX.name}, CIO chairing this panel. ${ALEX.voiceGuide}`, temperature: 0.7 },
  });

  let fullText = "";
  for await (const chunk of stream) {
    const t = chunk.text || "";
    if (!t) continue;
    fullText += t;
    for (const piece of splitter.push(t)) yield { agent: piece.agent, chunk: piece.chunk };
  }
  for (const piece of splitter.end()) yield { agent: piece.agent, chunk: piece.chunk };

  try {
    await prisma.adviserDebate.create({
      data: { sessionId, ticker, question: userMessage, memos, rebuttals, synthesis: fullText },
    });
  } catch (e) {
    console.error("[debate] persistence failed:", e.message);
  }

  yield { type: "synthesis_complete", fullText };
}
```

- [ ] **Step 4: Run tests** — `cd backend && npx jest adviser/__tests__/debate` — Expected: PASS (2 tests). Note: the mocked `generateContentStream` is consumed via `for await` because it's an async generator — matches production usage of `generateContentStream`.

- [ ] **Step 5: Commit**

```bash
git add backend/services/adviser/debate.js backend/services/adviser/__tests__/debate.test.js
git commit -m "feat(adviser): deep-lane debate pipeline (memos, cross-exam, synthesis)"
```

---

### Task 8: Facade rework — two lanes behind one entry point

**Files:**
- Modify: `backend/services/aiFinancialAdviser.js` (rewrite top half; keep exports/signatures)
- Test: `backend/services/__tests__/aiFinancialAdviser.test.js` (new)

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces (unchanged public API): `streamAdviserChat(sessionId, userId, ticker, userMessage, quantData, opts?)` where `opts = { forceDeep = false }`; plus unchanged `getSessionsList`, `getSessionHistory`. New internal behavior selected by env `ADVISER_V2` (`undefined`/anything ≠ `legacy` → v2).

- [ ] **Step 1: Write failing test**

```js
// backend/services/__tests__/aiFinancialAdviser.test.js
import { jest } from "@jest/globals";

const mockPrisma = {
  chatSession: {
    findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: "sess-1" }),
  },
  chatMessage: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
};
jest.unstable_mockModule("../db.js", () => ({ default: mockPrisma }));

const capturedConfigs = [];
let streamChunks = [];
const mockStream = jest.fn(async function* () {
  for (const t of streamChunks) yield { text: t };
});
const mockGenerateContent = jest.fn();
jest.unstable_mockModule("../aiClient.js", () => ({
  getAiClient: () => ({
    models: {
      generateContentStream: (args) => { capturedConfigs.push(args); return mockStream(args); },
      generateContent: mockGenerateContent,
    },
  }),
}));

// Debate is stubbed so we can assert delegation without running a real pipeline.
const mockRunDebate = jest.fn(async function* () { yield { type: "synthesis_complete", fullText: "VERDICT" }; });
jest.unstable_mockModule("../adviser/debate.js", () => ({ runDebate: mockRunDebate }));

const { streamAdviserChat } = await import("../aiFinancialAdviser.js");

async function collect(gen) { const out = []; for await (const e of gen) out.push(e); return out; }

const QUANT = { summary: {}, financials: [], balanceSheet: [], priceHistory: [], optionChain: { hasOptions: false }, insiderData: {} };

describe("streamAdviserChat lanes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedConfigs.length = 0;
    streamChunks = ["Hello from the panel.\n\n[Suggestions]: [\"x\"]"];
    delete process.env.ADVISER_V2;
  });

  test("v2 fast lane: proper multi-turn contents, temp 0.9, brief in first turn, suggestions kept raw", async () => {
    const events = await collect(streamAdviserChat(null, null, "TEST", "hi there", QUANT));

    const cfg = capturedConfigs[0];
    expect(cfg.config.temperature).toBe(0.9);
    expect(cfg.systemInstruction).toContain("Alex Meridian");          // roster present
    expect(cfg.contents[0].parts[0].text).toContain("ANALYST BRIEF");  // brief injected once, first turn
    expect(Array.isArray(cfg.contents)).toBe(true);
    const flat = cfg.contents.flatMap(c => c.parts.map(p => p.text)).join("");
    expect(flat).toContain("hi there");
    expect(events.some(e => e.agent && e.chunk.includes("Hello from the panel."))).toBe(true);
  });

  test("deep question delegates to runDebate and persists VERDICT as model message", async () => {
    await collect(streamAdviserChat("sess-1", null, "TEST", "Should I buy this stock for the long term thesis?", QUANT));
    expect(mockRunDebate).toHaveBeenCalledTimes(1);
    expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "model", content: "VERDICT" }) })
    );
  });

  test("ADVISER_V2=legacy restores legacy behavior (temp 0.7, flattened prompt)", async () => {
    process.env.ADVISER_V2 = "legacy";
    await collect(streamAdviserChat(null, null, "TEST", "Should I buy?", QUANT));
    const cfg = capturedConfigs[0];
    expect(cfg.config.temperature).toBe(0.7);
    expect(JSON.stringify(cfg.contents)).toContain("Quantitative & Fundamental Data");
    expect(mockRunDebate).not.toHaveBeenCalled();
  });
});
```

Note: `mockPrisma.chatMessage.create` assertion in test 2 relies on `findMany` returning `[]` so history digest is empty — acceptable.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest __tests__/aiFinancialAdviser` — Expected: FAIL (current implementation always temp 0.7, no debate delegation, no ADVISER_V2 handling).

- [ ] **Step 3: Rework the facade**

Rewrite `backend/services/aiFinancialAdviser.js` keeping imports of news/sec/earnings and the `tools` declaration verbatim. Replace `SYSTEM_PROMPT` with `LEGACY_SYSTEM_PROMPT` (identical text). Then:

```js
import { classifyLane } from "./adviser/router.js";
import { buildAnalystBrief } from "./adviser/analystBrief.js";
import { fastLaneSystemPrompt, PROFILE_CAPTURE_INSTRUCTION } from "./adviser/personas.js";
import { getInvestorProfile, formatProfileBlock, isProfileComplete, extractProfileFromMessage } from "./adviser/profile.js";
import { runDebate } from "./adviser/debate.js";
import { createAgentPrefixSplitter } from "./adviser/agentPrefixStream.js";

const isLegacy = () => process.env.ADVISER_V2 === "legacy";

export async function* streamAdviserChat(sessionId, userId, ticker, userMessage, quantData, opts = {}) {
  const forceDeep = Boolean(opts.forceDeep);

  // ── Session management (unchanged) ──
  let session;
  if (sessionId) session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  else if (userId) {
    session = await prisma.chatSession.findFirst({ where: { userId, ticker }, orderBy: { createdAt: "desc" } });
  }
  if (!session) session = await prisma.chatSession.create({ data: { userId, ticker } });
  yield { type: "sessionId", sessionId: session.id };

  await prisma.chatMessage.create({ data: { sessionId: session.id, role: "user", content: userMessage } });

  const history = await prisma.chatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });

  const lane = isLegacy() ? null : classifyLane(userMessage, { forceDeep });
  let fullResponse = "";

  if (lane === "deep") {
    // ── Deep lane: delegate to the debate pipeline ──
    const { text: briefText } = buildAnalystBrief({ ...quantData, ticker });
    const profile = await getInvestorProfile(userId);
    const lastThree = history.slice(-4, -1); // prior turns, excluding the message just saved
    const historyDigest = lastThree
      .map((m) => `${m.role === "user" ? "User" : "Panel"}: ${String(m.content).slice(0, 300)}`)
      .join("\n")
      .slice(0, 1500);

    for await (const ev of runDebate({
      sessionId: session.id, ticker, userMessage,
      briefText, profileBlock: formatProfileBlock(profile), historyDigest,
    })) {
      if (ev.type === "synthesis_complete") { fullResponse = ev.fullText; continue; }
      yield ev; // status / stage / agent-chunk events pass straight through
    }
  } else if (lane === "fast") {
    // ── Fast lane v2: one call, real multi-turn contents, brief in first turn ──
    const { text: briefText, redFlags } = buildAnalystBrief({ ...quantData, ticker });
    if (redFlags.length) yield { type: "status", message: "Red flags detected — panel notified." };

    const profile = await getInvestorProfile(userId);
    const profileBlock = formatProfileBlock(profile);
    const profileIncomplete = Boolean(userId) && !isProfileComplete(profile);
    let systemInstruction = fastLaneSystemPrompt({ profileBlock }) + "\n" +
      (redFlags.length ? `AUTO-DETECTED RED FLAGS (address if relevant):\n${redFlags.join("\n")}\n` : "") +
      (profileIncomplete && !profileBlock ? "INVESTOR PROFILE:\n- Not yet provided.\n\n" : "") +
      (profileIncomplete ? PROFILE_CAPTURE_INSTRUCTION : "");

    const pastTurns = history.slice(0, -1).slice(-20); // exclude message just saved; cap 20 turns
    const contents = [];
    pastTurns.forEach((msg, i) => {
      const text = i === 0
        ? `ANALYST BRIEF:\n${briefText}\n---\n${msg.content}` // brief rides on the first turn only
        : msg.content;
      contents.push({ role: msg.role === "user" ? "user" : "model", parts: [{ text }] });
    });
    if (contents.length === 0) contents.push({ role: "user", parts: [{ text: `ANALYST BRIEF:\n${briefText}\n---\n${userMessage}` }] });

    const aiClient = getAiClient();
    const splitter = createAgentPrefixSplitter("Alex Meridian");

    const responseStream = await aiClient.models.generateContentStream({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents,
      config: { systemInstruction, temperature: 0.9, tools },
    });

    for await (const chunk of responseStream) {
      const text = chunk.text || "";
      if (!text) continue;
      fullResponse += text;
      for (const piece of splitter.push(text)) yield { agent: piece.agent, chunk: piece.chunk };
    }
    for (const piece of splitter.end()) yield { agent: piece.agent, chunk: piece.chunk };

    // Silent profile capture when incomplete (never blocks, never errors out loud)
    if (userId && !isProfileComplete(profile)) {
      extractProfileFromMessage(userMessage)
        .then(async (patch) => {
          if (patch) {
            const { saveInvestorProfile } = await import("./adviser/profile.js");
            await saveInvestorProfile(userId, patch);
            console.info(JSON.stringify({ evt: "adviser_profile_updated", userId }));
          }
        })
        .catch(() => {});
    }
  } else {
    // ── Legacy path: byte-for-byte today's behavior ──
    const formattedHistory = history
      .map((msg) => (msg.role === "user" ? `User: ${msg.content}` : msg.content))
      .join("\n\n");

    const prompt = `System Context:\nTicker: ${ticker}\nQuantitative & Fundamental Data:\n${JSON.stringify(quantData, null, 2)}\n\nConversation History:\n${formattedHistory}\n\nContinue the conversation. You must speak on behalf of the Coordinator and relevant subagents.\nBegin your next turn using the [Agent Name]: format.`;

    let contents = [{ role: "user", parts: [{ text: prompt }] }];
    let currentAgent = "Coordinator";

    while (true) {
      const responseStream = await getAiClient().models.generateContentStream({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents,
        config: { systemInstruction: LEGACY_SYSTEM_PROMPT, temperature: 0.7, tools },
      });

      let buffer = "";
      let functionCalls = [];
      let functionCallParts = [];

      for await (const chunk of responseStream) {
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const p of chunk.candidates[0].content.parts) if (p.functionCall) functionCallParts.push(p);
        }
        if (chunk.functionCalls?.length) functionCalls.push(...chunk.functionCalls);

        const text = chunk.text || "";
        if (text) {
          fullResponse += text;
          buffer += text;
          const regex = /\[([^\]]+)\]:\s*/g;
          let match;
          while ((match = regex.exec(buffer)) !== null) {
            if (match.index > 0) yield { agent: currentAgent, chunk: buffer.substring(0, match.index) };
            currentAgent = match[1];
            buffer = buffer.substring(match.index + match[0].length);
            regex.lastIndex = 0;
          }
          if (buffer.length > 50) {
            const safeLength = buffer.lastIndexOf("\n") !== -1 ? buffer.lastIndexOf("\n") + 1 : buffer.length - 20;
            if (safeLength > 0) {
              yield { agent: currentAgent, chunk: buffer.substring(0, safeLength) };
              buffer = buffer.substring(safeLength);
            }
          }
        }
      }
      if (buffer.length > 0) yield { agent: currentAgent, chunk: buffer };

      if (functionCalls.length > 0) {
        const functionResponses = [];
        for (const call of functionCalls) {
          const { name } = call;
          yield { type: "status", message: `Coordinator is running tool: ${name}...` };
          let result = {};
          try {
            if (name === "fetchRecentNews") {
              const articles = await newsService.getStockNews(ticker);
              const aiSummary = await newsService.getNewsAISummary(ticker, articles);
              result = { sentiment: aiSummary.sentiment, summary: aiSummary.summary };
            } else if (name === "fetchSECFilings") {
              result = await secGuidance.getSecGuidance(ticker);
            } else if (name === "fetchEarningsSentiment") {
              result = await earnings.getEarningsSentiment(ticker);
            }
          } catch (e) {
            result = { error: e.message };
          }
          functionResponses.push({ functionResponse: { name, response: result } });
        }
        contents.push({ role: "model", parts: functionCallParts });
        contents.push({ role: "user", parts: functionResponses });
      } else break;
    }
  }

  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "model", content: fullResponse },
  });
}
```

Keep `getSessionsList` and `getSessionHistory` exactly as they are.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest __tests__/aiFinancialAdviser && npm test` — Expected: new suite PASS (3 tests); full backend suite PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/aiFinancialAdviser.js backend/services/__tests__/aiFinancialAdviser.test.js
git commit -m "feat(adviser): two-lane facade with legacy kill switch"
```

---

### Task 9: Route wiring — forceDeep passthrough + profile endpoints

**Files:**
- Modify: `backend/routes/stocks.js:609-647` (advisor-chat POST body)
- Create: `backend/routes/profile.js`
- Modify: `backend/server.js` (~line 105, mount profile routes)

**Interfaces:**
- Consumes: `streamAdviserChat(..., { forceDeep })` from Task 8; profile service from Task 5.
- Produces: `POST /api/stocks/:ticker/advisor-chat` accepts optional `forceDeep:boolean`; `GET /api/profile/investor` → `{success, data:{riskTolerance,horizon,style,notes}}`; `PUT /api/profile/investor` accepts partial patch, returns updated profile.

- [ ] **Step 1: stocks.js — read forceDeep and pass opts**

In the advisor-chat POST handler replace:

```js
const { message, sessionId } = req.body;
```
with
```js
const { message, sessionId, forceDeep } = req.body;
```
and replace the streaming loop call:
```js
for await (const chunk of streamAdviserChat(sessionId, userId, req.ticker, message, quantData)) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  if (res.flush) res.flush();
}
```
with a disconnect-resilient version (spec §10: a client that leaves mid-debate must not abort the pipeline — the generator keeps running and persists the debate + model message even though writes are skipped):
```js
for await (const chunk of streamAdviserChat(sessionId, userId, req.ticker, message, quantData, { forceDeep: Boolean(forceDeep) })) {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    if (res.flush) res.flush();
  }
}
```

- [ ] **Step 2: Create profile routes**

```js
// backend/routes/profile.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { getInvestorProfile, saveInvestorProfile } from "../services/adviser/profile.js";

const router = express.Router();

router.get("/investor", requireAuth, async (req, res) => {
  try {
    const data = await getInvestorProfile(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("[profile/investor GET]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/investor", requireAuth, async (req, res) => {
  try {
    await saveInvestorProfile(req.user.id, req.body || {});
    const data = await getInvestorProfile(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("[profile/investor PUT]", err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
```

- [ ] **Step 3: Mount in server.js**

Next to the other mounts (~line 105):

```js
import profileRoutes from "./routes/profile.js";   // top imports
app.use("/api/profile", profileRoutes);
```

- [ ] **Step 4: Smoke-test manually**

Start backend, then with a valid auth cookie/token:
```bash
curl -X PUT localhost:3000/api/profile/investor -H 'Content-Type: application/json' -d '{"riskTolerance":"BALANCED","horizon":"LONG","style":"BLEND"}'
curl localhost:3000/api/profile/investor
```
Expected: second call echoes the saved values.

- [ ] **Step 5: Run full backend suite + commit**

Run: `cd backend && npm test` — Expected: PASS.

```bash
git add backend/routes/stocks.js backend/routes/profile.js backend/server.js
git commit -m "feat(adviser): forceDeep passthrough and /api/profile/investor endpoints"
```

---

### Task 10: Deep Research prompt moves server-side

**Files:**
- Create: `backend/services/deepResearchPrompts.js`
- Modify: `backend/routes/ai.js:10-13,16-31`
- Modify: `frontend/src/components/AIFinancialAdviserChat.jsx` (remove `DEEP_RESEARCH_PROMPT`, send `{ ticker }` only)

**Interfaces:**
- Produces: `buildDeepResearchPrompt(ticker)` → string (the exact mega-prompt currently hardcoded in the JSX, parameterized). `/api/ai/deep-research/start` accepts `{ticker, prompt?}` — prompt optional, defaults to builder output. Backward compatible.

- [ ] **Step 1: Create backend prompt module**

Move the template from `AIFinancialAdviserChat.jsx` lines 295–332 into:

```js
// backend/services/deepResearchPrompts.js
export function buildDeepResearchPrompt(ticker) {
  return `Role & Objective
You are an elite AI equity research assistant. Conduct a comprehensive, multi-step deep research investigation to generate a highly structured, data-driven fundamental analysis report on ${ticker}.
Utilize your deep web search capabilities to locate the absolute latest SEC filings (10-K/10-Q), recent earnings call transcripts, real-time market data, and current news context.

Tone & Audience
Objectively evaluate both the Bull and Bear cases, then declare a synthesized, evidence-based stance. Remain highly analytical, objective, and institutional in tone. Do not use conversational filler. Deliver insights with maximum scannability for retail and sophisticated investors.

Required Structure & Data Integration
Organize the output exactly into the following sections using clear markdown headings:

1. Investment Overview
- State the core thesis focusing on primary macroeconomic, industry, or company-specific catalysts.
- Investment Highlights: Detail recent strategic moves and standout financial metrics from the latest earnings report.
- Investment Risks: Isolate the largest current drags on profitability, execution delays, or macroeconomic headwinds.
- Actionable Levels: Highlight a concrete "Price Watch Zone" (key support/resistance) and upcoming forward catalysts.

2. Company Profile & Macro Environment
- Detail the business model, core operating segments, and global market share.
- Identify the current stage of the company (e.g., Growth, Mature, Turnaround) and its primary KPI.
- Analyze current Macro & Sector headwinds/tailwinds affecting this specific business.

3. Financial Analysis
- Revenue & Growth: Integrate precise latest quarter metrics (YoY growth, margin expansion/contraction).
- Profitability & Cash Flow: FCF, ROIC vs. WACC, balance sheet health/Net Cash.
- Include a visual indicator (e.g., "Signal: 🟢 / 🟡 / 🔴") with a brief trailing summary at the end of each sub-section.

4. Company DNA & Governance
- Analyze management alignment, recent capital return programs, and insider vs. institutional ownership.
- Call out notable recent position shifts by major institutional funds.
- Highlight customer base dynamics (e.g., switching costs, recurring revenue stickiness).

5. Competitive Moat
- Define the overall moat rating (Wide, Narrow, None) and break down its core dimensions.

6. Valuation & Thesis
- Compare current valuation multiples against specific, named industry peers.
- Define a Fair Value Range and estimated safety margin.
- End with a definitive, single-sentence conclusion summarizing the investment thesis.`;
}
```

(Note: the original contained a redundant `(${ticker})` duplication — fixed here to a single interpolation.)

- [ ] **Step 2: ai.js — optional prompt**

```js
import { buildDeepResearchPrompt } from "../services/deepResearchPrompts.js";

const startDeepResearchSchema = z.object({
  ticker: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  prompt: z.string().min(1).optional(),
});
```
and inside the handler:
```js
const fullPrompt = `Deep research request for ${req.body.ticker}:\n\n${req.body.prompt || buildDeepResearchPrompt(req.body.ticker)}`;
```
(Keep the rest of the handler untouched.)

- [ ] **Step 3: Frontend stops sending prompt**

In `AIFinancialAdviserChat.jsx` delete the entire `const DEEP_RESEARCH_PROMPT = ...` block (lines ~295–332) and change the POST body to:
```js
body: JSON.stringify({ ticker })
```

- [ ] **Step 4: Verify**

Run: `cd backend && npm test && cd ../frontend && npm run build` — Expected: backend suite PASS; vite build succeeds.

Manual smoke: trigger Deep Research from UI; confirm the report still renders (prompt now built server-side).

- [ ] **Step 5: Commit**

```bash
git add backend/services/deepResearchPrompts.js backend/routes/ai.js frontend/src/components/AIFinancialAdviserChat.jsx
git commit -m "refactor(deep-research): move mega-prompt server-side, frontend sends intent only"
```

---

### Task 11: Frontend — persona registry, stage events, Full Panel toggle

**Files:**
- Modify: `frontend/src/components/AIFinancialAdviserChat.jsx`

**Interfaces:**
- Consumes: SSE events `{type:'stage', label}`, `{agent, chunk}` with NEW agent names; `forceDeep` body param.
- Produces: UI renders new persona names/colors; keeps rendering OLD agent names from historical sessions (merged registry).

- [ ] **Step 1: Merge agent registry**

Replace the `agentColors` constant (lines 841–848) with:

```js
const agentColors = {
  // v2 panel
  "Alex Meridian": "var(--accent-blue)",
  "Viktor Hale": "var(--accent-amber)",
  "Mina Okafor": "var(--accent-green)",
  "Sam Reyes": "var(--accent-red)",
  // legacy names — historical sessions still render correctly
  "Coordinator": "var(--accent-blue)",
  "Data Analyst": "var(--accent-green)",
  "Trading Analyst": "var(--accent-amber)",
  "Execution Analyst": "var(--accent-purple)",
  "Risk Evaluation Agent": "var(--accent-red)",
  "Deep Research": "var(--accent-purple)",
  "System": "var(--text-secondary)",
};
```

- [ ] **Step 2: Handle stage events + forceDeep toggle**

Add state near the others:
```js
const [forceDeep, setForceDeep] = useState(false);
```
In `sendMessage`'s fetch body add the flag and reset it after send:
```js
body: JSON.stringify({ message: text, sessionId, forceDeep }),
...
finally { ... setIsSending(false); setCurrentAgent(null); setToolStatus(null); setForceDeep(false); }
```
In the SSE parse switch add (alongside `parsed.type === 'status'`):
```js
} else if (parsed.type === 'stage') {
  setToolStatus(parsed.label);
}
```
Add the toggle button next to the Send button in the active-debate input area:
```jsx
<button
  onClick={() => setForceDeep(!forceDeep)}
  title="Force the full four-expert debate for the next message"
  style={{ ...headerBtn, opacity: forceDeep ? 1 : 0.55,
           borderColor: forceDeep ? "var(--accent-purple)" : "rgba(255,255,255,0.1)" }}
>
  {forceDeep ? "⚖ Full Panel ON" : "⚖ Full Panel"}
</button>
```
Also add the same toggle to the splash-screen input row (reuse identical JSX).

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && npm run build` — Expected: build succeeds.

Manual smoke: send "hi" (fast), "Should I buy?" (auto-deep), and a simple question with toggle ON (forced deep). Confirm stage labels appear in the status pill, agents render with distinct colors, suggestions chips still work.

```bash
git add frontend/src/components/AIFinancialAdviserChat.jsx
git commit -m "feat(adviser-ui): v2 persona colors, debate stage statuses, Full Panel toggle"
```

---

### Task 12: Frontend — investor profile chip & quick setup

**Files:**
- Modify: `frontend/src/components/AIFinancialAdviserChat.jsx`

**Interfaces:**
- Consumes: `GET/PUT /api/profile/investor` from Task 9.

- [ ] **Step 1: State + load/save**

Add:
```js
const [profile, setProfile] = useState(null);          // {riskTolerance,horizon,style,notes}
const [profileLoaded, setProfileLoaded] = useState(false);
const [draftProfile, setDraftProfile] = useState({});  // splash quick-setup form
```
and inside the profile-load `.then`, after `setProfile(d.data)`, add `setDraftProfile(d.data || {});`
Load on mount alongside the sessions effect:
```js
useEffect(() => {
  fetch("/api/profile/investor")
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { if (d.success) setProfile(d.data); })
    .catch(() => {})           // 401/unauthenticated → silently skip
    .finally(() => setProfileLoaded(true));
}, []);
```
Save helper:
```js
const saveProfile = async (patch) => {
  const res = await fetch("/api/profile/investor", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  const d = await res.json();
  if (d.success) setProfile(d.data);
};
```

- [ ] **Step 2: Splash quick-setup (only when profile incomplete)**

Inside the splash block (`!debateActive`), above the input row, render the quick-setup row when `profileLoaded && (!profile || !profile.riskTolerance || !profile.horizon || !profile.style)`:

```jsx
const selectStyle = { ...chatInput, padding: "8px 12px", fontSize: "13px", flex: "1" };
// ...inside splash JSX, above the input wrap:
{profileLoaded && (!profile || !profile.riskTolerance || !profile.horizon || !profile.style) && (
  <div style={{ display: "flex", gap: "6px", width: "100%", marginBottom: "12px" }}>
    {[["riskTolerance", "Risk", ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]],
      ["horizon", "Horizon", ["SHORT", "MEDIUM", "LONG"]],
      ["style", "Style", ["VALUE", "GROWTH", "BLEND", "INDEX"]]].map(([key, label, opts]) => (
      <select key={key} value={draftProfile[key] || ""}
              onChange={(e) => setDraftProfile((p) => ({ ...p, [key]: e.target.value }))}
              style={selectStyle}>
        <option value="">{label}…</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    ))}
    <button style={headerBtn}
            onClick={() => saveProfile(Object.fromEntries(Object.entries(draftProfile).filter(([, v]) => v)))}>
      Save
    </button>
  </div>
)}
```
Save persists only chosen keys; a plain text "Skip" link below (onClick sets a local `profileSetupDismissed` state) hides the row without saving.

- [ ] **Step 3: Header profile chip**

In the header actions area (left of History button), render when profile exists:
```jsx
<span title={`${profile.riskTolerance || "?"} · ${profile.horizon || "?"} · ${profile.style || "?"}`}
      style={{ ...headerBtn, cursor: "default", borderColor: "var(--glass-border)" }}>
  {(profile.riskTolerance || "?").slice(0, 4)} · {(profile.horizon || "?").slice(0, 3)}
</span>
```

- [ ] **Step 4: Verify + commit**

Run: `cd frontend && npm run build` — Expected: success.
Manual smoke: save prefs on splash → chip appears; reopen chat → selects prefilled; PUT persists across reload.

```bash
git add frontend/src/components/AIFinancialAdviserChat.jsx
git commit -m "feat(adviser-ui): investor profile quick-setup and header chip"
```

---

### Task 13: Release notes + manual QA script

**Files:**
- Modify: `frontend/public/release-notes.html` (August month-group)

- [ ] **Step 1: Add release entry**

Insert at the TOP of the August `<section class="month-group">`:

```html
<article class="release-entry">
  <time datetime="2026-08-25">August 25, 2026</time>
  <h3>Rebuild the AI Financial Adviser into a real expert panel</h3>
  <span class="tag tag-feature">Feature</span>
  <p>The adviser team is now four named experts — CIO Alex Meridian, value skeptic Viktor Hale, growth investor Mina Okafor, and forensic accountant Sam Reyes — who disagree, cross-examine each other, and concede good points. Simple questions get quick answers; complex questions convene the Full Panel for an independent-memo debate ending in a synthesized verdict with conviction rating, falsifiers, and a staged execution plan. Advice is now tailored to your saved investor profile (risk, horizon, style), and follow-up suggestions are generated from the actual conversation instead of a fixed list.</p>
</article>
```

- [ ] **Step 2: Run the manual QA script**

Execute and record results (fix regressions before proceeding):

| # | Scenario | Expectation |
|---|----------|-------------|
| 1 | "hi" in fresh chat | Fast lane; natural varied reply; no identical opener twice in a row |
| 2 | "what is the WACC?" | Fast lane; WACC rendered as clickable pill |
| 3 | "Should I buy X?" | Auto-deep; 4 memo statuses → cross-exam status → synthesis with Stance/Conviction/Execution/Dissents headings |
| 4 | Toggle Full Panel + "how's the chart look?" | Forced deep despite simple wording |
| 5 | Ask about a company with receivables spike (fixture-driven unit covers logic; visually confirm red-flag status line appears when brief detects one) | Status pill mentions red flags |
| 6 | Old session replay (pre-upgrade messages) | Legacy agent names render with legacy colors; export works |
| 7 | Deep Research from + menu | Report generates; request payload contains no prompt field |
| 8 | Set profile on splash, reload, ask aggressive-risk question | Advice references saved profile; chip shows values |
| 9 | `ADVISER_V2=legacy` restart | Behavior identical to pre-upgrade |
| 10 | Backend `npm test` + frontend `npm run build` | Both green |

- [ ] **Step 3: Commit**

```bash
git add frontend/public/release-notes.html
git commit -m "docs: release notes for adviser 2.0"
```

---

## Out of Scope (per spec)

Fifth persona (dedicated Risk Officer) · stronger model for synthesis · composable boards · token-level memo streaming (stage-level only).
