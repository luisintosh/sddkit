---
name: sdd
description: Spec-driven development workflow for this repo — how specs, Gherkin contracts, plans, and tasks fit together under docs/feats/<feature>/, and the order to produce them. Use when starting or reasoning about any feature's lifecycle.
---

# Spec-Driven Development (this repo)

Every feature flows through durable artifacts under `docs/feats/<feature>/`:

1. **spec.md** — the *what & why*. Requirements, user stories, out-of-scope. No tech choices.
2. **contracts/*.feature** — Gherkin Given/When/Then acceptance criteria derived from the spec. These
   are the executable source of truth; tests are translated into the consuming repository's existing
   test framework and layout. Do not introduce a BDD runner unless that repository already uses one
   or the human approves it.
3. **plan.md** — the *how*. Approach, affected files, code to reuse, risks, test strategy. Reads
   `docs/ARCHITECTURE.md`.
4. **tasks.md** — small, ordered, checkbox tasks grouped into feature slices. Each slice is a
   red→green→targeted-test→review→commit loop.

## Rules
- Don't write code before spec + contracts exist and are approved.
- After tasks exist, build feature slices one at a time: failing tests, implementation, targeted test,
  review, fixes/re-review, then commit.
- Keep scope to the approved spec; surface ambiguities at the human gates instead of guessing.
- Governing principles live in `docs/CONSTITUTION.md`.

The `/doit` command orchestrates this end-to-end; the individual stages are also runnable as
`/specify`, `/contracts`, `/plan`, `/tasks`, `/implement`.
