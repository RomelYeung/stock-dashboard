# AGENTS.md
## Project-Specific Conventions

**Release Notes**
- Every user-visible change MUST include a release note entry in `frontend/public/release-notes.html`
- Add the entry to the appropriate month section (create a new `<section class="month-group">` if the month doesn't exist yet)
- Use the established format: `<article class="release-entry">` with `<time datetime="YYYY-MM-DD">`, `<h3>`, `<p>`, and a type badge (`<span class="tag tag-feature">` or `tag-fix`, `tag-improvement`, `tag-security`)
- Keep entries in reverse chronological order within each month (newest at the top)
- Write headlines in imperative mood ("Add X", "Fix Y", "Redesign Z")
- Include user impact in the description; avoid internal implementation details unless relevant

**For the architect:** Do not write code yourself. You should instead delegate the coding work to relevant subagents.

**For subagents reading this file:** The conventions above ("Release Notes") apply to YOUR work. Make sure you employ relevant skills for your role and the task at hand.
Do not try to delegate work to other agents, and do not ask the user questions. Instead, ask the architect agent for help.

## Active Plugins

- `opencode-antigravity-auth` — Use Antigravity's free models instead of API billing
- `opencode-dynamic-context-pruning` — Optimize token usage by pruning obsolete tool outputs
