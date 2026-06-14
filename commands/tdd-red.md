---
description: TDD red — write failing tests from the Gherkin contracts.
agent: tester
subtask: true
---
Write failing tests for: **$ARGUMENTS**

- Read `docs/feats/<slug>/tasks.md` and `contracts/*.feature`. If `$ARGUMENTS` names a slice or task
  scope, translate only that slice's related scenarios into tests using the consuming repository's
  existing test framework, naming style, fixtures, and layout. If no scope is provided, cover the next
  incomplete slice.
- Edit **test-only files/locations**. Run the targeted test command/scope for this slice and confirm
  the new tests **fail for the right reason**.

Return: the slice/task scope, test files created, scenarios now covered, targeted test command, and
confirmation that the new tests fail for the right reason.
