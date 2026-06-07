---
description: TDD green — implement the minimum to make failing tests pass.
agent: implementer
subtask: true
---
Make the failing tests pass for: **$ARGUMENTS**

- Work against the failing tests + `docs/feats/<slug>/plan.md`. Implement the smallest correct change.
- **Do not edit test files.** Reuse existing code where possible (`@explorer`).
- The harness re-runs touched tests after edits; fix failures within the turn until green.
- If you hit a genuine design fork the spec/plan/contracts don't settle, stop and ask (opinion gate).

Return: files changed and the passing test summary.
