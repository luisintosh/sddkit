---
description: TDD green — implement the minimum to make failing tests pass.
agent: implementer
subtask: true
---
Make the failing tests pass for: **$ARGUMENTS**

- Work against the failing tests + `docs/feats/<slug>/plan.md` + the active slice in
  `docs/feats/<slug>/tasks.md`. Implement the smallest correct change for that slice.
- **Do not edit test files.** Reuse existing code where possible (`@explorer`).
- Re-run the slice's targeted tests after edits; fix failures within the turn until green.
- If you hit a genuine design fork the spec/plan/contracts don't settle, stop and ask (opinion gate).

Return: the slice/task scope, files changed, targeted test command, and the passing test summary.
