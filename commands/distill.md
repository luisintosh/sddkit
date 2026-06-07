---
description: Promote durable, always-relevant facts from memory into AGENTS.md / docs/ARCHITECTURE.md.
---
Distill memory into the always-loaded docs.

Recent memory log:
!`tail -30 docs/memory/log.md 2>/dev/null || echo "(empty)"`

Current AGENTS.md:
@AGENTS.md

Do this:
- Identify facts that are **durable and always relevant** (conventions, commands, invariants) and
  promote them into `AGENTS.md` (keep it SHORT — edit/prune, don't just append).
- Promote architectural facts/decisions into `docs/ARCHITECTURE.md`.
- Leave task-specific or one-off notes in `docs/memory/` only.

Return a concise list of what you promoted and where. Do not bloat AGENTS.md.
