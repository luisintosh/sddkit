---
description: TDD refactor — clean up with tests green.
agent: implementer
subtask: true
---
Refactor the code for **$ARGUMENTS** while keeping every test green.

- Improve clarity/structure/duplication without changing behavior. Do not edit tests.
- Re-run `/verify` after; it must stay green. Stop immediately if anything goes red.

Return: what you refactored and confirmation `/verify` is still green.
