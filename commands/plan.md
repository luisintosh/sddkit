---
description: Write the implementation plan for a feature (the how).
agent: architect
subtask: true
---
Write the implementation plan for: **$ARGUMENTS**

- Read `docs/feats/<slug>/spec.md`, `docs/feats/<slug>/contracts/*.feature`, and
  `docs/ARCHITECTURE.md`. Use `@explorer` for broad codebase searches.
- Write `docs/feats/<slug>/plan.md` (plan template): approach, affected modules/files, **existing
  code to reuse** (`file:symbol`), data/API changes, risks/trade-offs, and a test strategy mapping
  each Gherkin scenario to the consuming repository's test layers (unit, integration, e2e, or
  equivalents).
- Prefer reuse over new code. Keep it minimal and reversible.

Return a short summary + the path. Flag anything needing a human decision.
