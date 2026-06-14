---
description: Break the plan into an ordered, checkbox task list.
agent: architect
subtask: true
---
Break the approved plan for **$ARGUMENTS** into tasks.

- Read `docs/feats/<slug>/plan.md` and `contracts/`. Write `docs/feats/<slug>/tasks.md` using the
  tasks template: small, ordered, individually verifiable `[ ]` items grouped into explicit feature
  slices, plus the "Done when" checklist.
- Each task should be completable and checkable on its own; sequence by dependency.
- Each slice should be a reviewable red→green→targeted-test→review→commit loop. List the slice ID,
  the task IDs it contains, related contract scenarios, and the targeted test scope/command to use
  once the tests exist.

Return the slice count, task count, and the path.
