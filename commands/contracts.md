---
description: Generate Gherkin acceptance contracts from the approved spec.
agent: spec
subtask: true
---
Generate Gherkin acceptance contracts for: **$ARGUMENTS**

- Read `docs/feats/<slug>/spec.md`. Write `.feature` files under `docs/feats/<slug>/contracts/`.
- Use concrete **Given/When/Then** scenarios covering happy paths, edge cases, and error states.
- These are the executable source of truth the tester translates into the consuming repository's
  existing test stack. Do not introduce a BDD runner unless that repository already uses one or the
  human approves it. Keep scenario names descriptive — tests will be named after them.

Return the list of scenarios created (titles only).
