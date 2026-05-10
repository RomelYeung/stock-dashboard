# AGENTS.md

This project uses the [Superpowers](https://github.com/obra/superpowers) plugin for structured development workflows (brainstorming, planning, TDD, code review, subagent-driven development, etc.).

## Project-Specific Conventions

**Simplicity First**
- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.

**Surgical Changes**
- Touch only what you must. Match existing style.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't "improve" adjacent code, comments, or formatting.

**Release Notes**
- Every user-visible change MUST include a release note entry in `frontend/public/release-notes.html`
- Add the entry to the appropriate month section (create a new `<section class="month-group">` if the month doesn't exist yet)
- Use the established format: `<article class="release-entry">` with `<time datetime="YYYY-MM-DD">`, `<h3>`, `<p>`, and a type badge (`<span class="tag tag-feature">` or `tag-fix`, `tag-improvement`, `tag-security`)
- Keep entries in reverse chronological order within each month (newest at the top)
- Write headlines in imperative mood ("Add X", "Fix Y", "Redesign Z")
- Include user impact in the description; avoid internal implementation details unless relevant

## Active Plugins

- `opencode-antigravity-auth` — Use Antigravity's free models instead of API billing
- `opencode-dynamic-context-pruning` — Optimize token usage by pruning obsolete tool outputs
- `superpowers` — Structured development methodology
