---
description: TDD red — write failing tests from the Gherkin contracts.
agent: tester
subtask: true
---
Write failing tests for: **$ARGUMENTS**

- Read `docs/feats/<slug>/contracts/*.feature`. Translate each scenario into a plain vitest/jest or
  Playwright test (per the stack), named after the scenario.
- Edit **test files only**. Run the suite and confirm the new tests **fail for the right reason**.

Return: the test files created and which scenarios are now covered (and confirm they fail).
