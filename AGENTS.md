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

## Active Plugins

- `opencode-antigravity-auth` — Use Antigravity's free models instead of API billing
- `opencode-dynamic-context-pruning` — Optimize token usage by pruning obsolete tool outputs
- `superpowers` — Structured development methodology
