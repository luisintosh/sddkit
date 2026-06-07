---
description: Generate Gherkin acceptance contracts from the approved spec.
agent: spec
subtask: true
---
Generate Gherkin acceptance contracts for: **$ARGUMENTS**

- Read `docs/feats/<slug>/spec.md`. Write `.feature` files under `docs/feats/<slug>/contracts/`.
- Use concrete **Given/When/Then** scenarios covering happy paths, edge cases, and error states.
- These are the executable source of truth the tester translates into vitest/jest/playwright tests
  (no Cucumber/BDD runner). Keep scenario names descriptive — tests will be named after them.

Return the list of scenarios created (titles only).
