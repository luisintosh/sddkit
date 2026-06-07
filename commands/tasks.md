---
description: Break the plan into an ordered, checkbox task list.
agent: architect
subtask: true
---
Break the approved plan for **$ARGUMENTS** into tasks.

- Read `docs/feats/<slug>/plan.md` and `contracts/`. Write `docs/feats/<slug>/tasks.md` using the
  tasks template: small, ordered, individually verifiable `[ ]` items, plus the "Done when" checklist.
- Each task should be completable and checkable on its own; sequence by dependency.

Return the task count and the path.
