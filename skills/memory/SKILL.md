---
name: memory
description: How to use this repo's file-based Markdown memory under docs/memory/ — when to remember, recall, and distill facts so durable knowledge persists across sessions without bloating context. Use before re-deriving project facts or when you learn something durable.
---

# File-based memory (docs/memory/)

Memory is plain Markdown — no database, no MCP. It is **not auto-loaded**; you read it on demand.

- **Recall first.** Before re-deriving a project fact, grep `docs/memory/` (or run `/recall <query>`).
  `docs/memory/MEMORY.md` is the index; one-fact files are `docs/memory/<slug>.md`; `log.md` is the
  append-only history.
- **Remember durable facts.** When you learn something that will matter again (a decision, a gotcha,
  a non-obvious convention), run `/remember <fact>` — it appends to `log.md`, adds a one-fact file,
  and indexes it in `MEMORY.md`. Keep entries terse; one fact per file.
- **Distill periodically.** `/distill` promotes always-relevant facts into `AGENTS.md` (kept SHORT)
  and architectural facts into `docs/ARCHITECTURE.md`. Don't bloat AGENTS.md — prune as you go.

Only `AGENTS.md` is always in context; everything in `docs/` is read on demand to keep token cost flat.
