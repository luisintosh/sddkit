---
description: Save a durable fact to docs/memory/ (one fact per file) and index it.
---
Remember this fact: **$ARGUMENTS**

Do exactly this:
1. Append a timestamped line to `docs/memory/log.md`: `- <YYYY-MM-DD> $ARGUMENTS`.
2. Create a one-fact file `docs/memory/<kebab-slug>.md` containing the fact and any essential context
   (only if it's a distinct, reusable fact — skip if it duplicates an existing one).
3. Add a row to the table in `docs/memory/MEMORY.md`: `| <short title> | <file> | <YYYY-MM-DD> |`.

Keep each entry terse. Do not touch `AGENTS.md` (use `/distill` to promote durable facts there).
Today's date: !`date +%Y-%m-%d`
