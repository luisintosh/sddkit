---
description: Run the TDD red→green cycle for a feature's tasks (standalone implement).
agent: implementer
---
Implement the tasks for: **$ARGUMENTS**

Work slice-by-slice from `docs/feats/<slug>/tasks.md`, following TDD:
1. Pick the requested slice/task scope, or the next incomplete slice.
2. Ensure failing tests exist for the slice's behavior (delegate to the tester / `/tdd-red` if not).
3. Make them pass (`/tdd-green` discipline — minimal change, no test edits).
4. Run the slice's targeted tests.
5. Check only the completed task boxes in `tasks.md`.

For standalone use, continue until all requested slices are checked. Do not imply full `/verify` for
each slice; full `/verify` is the final `/doit` gate after all slice commits. Surface genuine design
forks (opinion gate) instead of guessing. Return progress against `tasks.md`.
