# Release Notes Page — Design Spec

**Date:** 2026-05-09
**Status:** Approved

---

## 1. Overview

Create a standalone `/release-notes.html` page that tracks site updates in reverse chronological order, grouped by month. The page uses semantic HTML, matches the existing dark theme design system, and is easy to scan.

## 2. Location & Routing

- **File:** `frontend/public/release-notes.html`
- **URL:** `http://localhost:3000/release-notes.html` (Vite serves `public/` files at root)
- **Back link:** Header includes a link back to `/` (the main app)

## 3. HTML Structure

```
<body>
  <!-- Ambient background orbs (same as main app) -->
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>
  <div class="bg-orb bg-orb-3"></div>

  <div class="layout">
    <header>
      <!-- Logo + "Release Notes" title + "← Back to App" link -->
    </header>

    <main>
      <section class="month-group">
        <h2>Month Year</h2>
        <article class="release-entry">
          <div class="entry-meta">
            <time datetime="YYYY-MM-DD">Month Day, Year</time>
            <span class="tag tag-feature">Feature</span>
          </div>
          <h3>Short headline describing the change</h3>
          <p>2–3 sentences of detail explaining what changed and why it matters.</p>
        </article>
        <!-- More entries... -->
      </section>
      <!-- More month groups... -->
    </main>
  </div>
</body>
```

## 4. Semantic HTML Elements

| Element | Usage |
|---------|-------|
| `<header>` | Page header with branding and nav |
| `<main>` | Primary content area |
| `<section>` | Monthly group container |
| `<article>` | Individual release entry (self-contained) |
| `<time datetime="...">` | Machine-readable date |
| `<h2>` | Month/year headings |
| `<h3>` | Entry headline |

## 5. Design System (Matching Existing App)

- **Background:** `#05080f` (near-black) with noise texture overlay
- **Typography:** Syne (headings), Inter (body), DM Mono (dates)
- **Cards:** Glass-morphism — `rgba(255,255,255,0.035)` background, `backdrop-filter: blur(20px)`, `1px solid rgba(255,255,255,0.07)` border
- **Text colors:** `#e8edf5` primary, `#5a6a80` secondary
- **Accent colors:**
  - Feature: `#00e5a0` (green)
  - Fix: `#ff4d6d` (red)
  - Improvement: `#4f8dff` (blue)
  - Security: `#ffb547` (amber)
- **Spacing:** Consistent with existing app (16px gaps, 14px border radius)

## 6. Entry Format Template

Each release entry follows this consistent format:

```html
<article class="release-entry">
  <div class="entry-meta">
    <time datetime="2026-05-09">May 9, 2026</time>
    <span class="tag tag-feature">Feature</span>
  </div>
  <h3>Short, specific headline (imperative mood)</h3>
  <p>What changed, in 2–3 sentences. Include user impact. No internal implementation details unless relevant.</p>
</article>
```

**Tag types:** `Feature` | `Fix` | `Improvement` | `Security` | `Dependency`

## 7. Initial Content

Populate from git history (26 commits), grouped by month:

**May 2026:**
- Consolidated Financials + Comparables tabs into redesigned FundamentalsTab
- Added responsive breakpoints for mobile/tablet
- Added glass-morphism Peer Comparison Table with Diff column

**April 2026:**
- Added SEC EDGAR insider trading data (Form 4)
- Added AAII Investor Sentiment to Market Indicators
- Added sector rotation signals and leaderboard
- Fixed credit spread calculation logic

**March 2026:**
- Added DCF valuation with Monte Carlo simulation
- Added Market Indicators dashboard (VIX, Fed rates, yield curve, etc.)
- Initial portfolio tracking with Yahoo Finance

## 8. AGENTS.md Update

Add to `AGENTS.md` under Project-Specific Conventions:

```markdown
**Release Notes**
- Every user-visible change MUST include a release note entry in `frontend/public/release-notes.html`
- Add the entry to the appropriate month section (create new section if needed)
- Use the established format: `<article>` with `<time>`, `<h3>`, `<p>`, and a type badge
- Keep entries in reverse chronological order within each month
```

## 9. Files to Create/Modify

- **Create:** `frontend/public/release-notes.html`
- **Modify:** `AGENTS.md` (add Release Notes convention)

## 10. Verification

- Open `http://localhost:3000/release-notes.html` in browser
- Verify styling matches the main app (dark theme, glass cards, correct fonts)
- Verify semantic HTML structure with browser devtools
- Verify back link navigates to `/`
