---
description: The final verification gate — run build + test + lint + typecheck and report a structured pass/fail.
---
Run the project verification gate and report a structured result.

Use the commands declared in `@AGENTS.md` (Commands section). Run, in order, and capture each result:

1. Build
2. Test
3. Lint
4. Typecheck

Rules:
- Run each (skip only if that command genuinely doesn't exist in this project — note it as `n/a`).
- Stop reporting "green" if **any** step fails; show the failing step's output (trimmed to the error).
- Output a compact table: `step · PASS|FAIL|n/a` and a final verdict line `VERIFY: GREEN` or
  `VERIFY: RED (<which steps failed>)`.

This verdict is the authoritative verification signal — the orchestrator must see `VERIFY: GREEN`
before docs-sync and draft PR creation.
