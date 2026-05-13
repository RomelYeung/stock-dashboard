# AGENTS.md
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

## Multi-Agent Workflow

This project uses a multi-agent orchestration system. The `architect` agent is the primary orchestrator and NEVER modifies files directly. All file modifications are performed by specialized subagents (`@coder`, `@ui-specialist`, `@integrator`).

**For the architect:** Do not attempt to enforce these conventions by writing code yourself. Include them as acceptance criteria in your task dispatches.

**For subagents reading this file:** The conventions above ("Simplicity First", "Surgical Changes", "Release Notes") apply to YOUR work.

## Active Plugins

- `opencode-antigravity-auth` — Use Antigravity's free models instead of API billing
- `opencode-dynamic-context-pruning` — Optimize token usage by pruning obsolete tool outputs
