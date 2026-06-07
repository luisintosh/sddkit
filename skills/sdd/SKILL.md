---
name: sdd
description: Spec-driven development workflow for this repo — how specs, Gherkin contracts, plans, and tasks fit together under docs/feats/<feature>/, and the order to produce them. Use when starting or reasoning about any feature's lifecycle.
---

# Spec-Driven Development (this repo)

Every feature flows through durable artifacts under `docs/feats/<feature>/`:

1. **spec.md** — the *what & why*. Requirements, user stories, out-of-scope. No tech choices.
2. **contracts/*.feature** — Gherkin Given/When/Then acceptance criteria derived from the spec. These
   are the executable source of truth; tests are translated from them (vitest/jest/playwright — no
   Cucumber runner).
3. **plan.md** — the *how*. Approach, affected files, code to reuse, risks, test strategy. Reads
   `docs/ARCHITECTURE.md`.
4. **tasks.md** — small, ordered, checkbox tasks. The single source of truth for progress.

## Rules
- Don't write code before spec + contracts exist and are approved.
- Keep scope to the approved spec; surface ambiguities at the human gates instead of guessing.
- Governing principles live in `docs/CONSTITUTION.md`.

The `/doit` command orchestrates this end-to-end; the individual stages are also runnable as
`/specify`, `/contracts`, `/plan`, `/tasks`, `/implement`.
