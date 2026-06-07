---
description: Run the TDD red→green cycle for a feature's tasks (standalone implement).
agent: implementer
---
Implement the tasks for: **$ARGUMENTS**

Work task-by-task from `docs/feats/<slug>/tasks.md`, following TDD:
1. Ensure failing tests exist for the task's behavior (delegate to the tester / `/tdd-red` if not).
2. Make them pass (`/tdd-green` discipline — minimal change, no test edits).
3. Check the task's box in `tasks.md`.

Continue until all tasks are checked and `/verify` is green. Surface genuine design forks (opinion
gate) instead of guessing. Return progress against `tasks.md`.
