---
description: Run the full feature pipeline end-to-end (worktree → spec → contracts → plan → tasks → TDD → review → verify → docs → PR), pausing only at human gates.
agent: orchestrator
---
Drive the feature: **$ARGUMENTS**

You are orchestrating. Slugify the feature name to `<slug>`. Persist progress to
`docs/feats/<slug>/doit.yaml` after **every** stage so `/re-doit` can resume. Run stages in order;
delegate to the named subagents; pause only at the three gates.

0. **worktree** — run `!.opencode/bin/worktree.sh new "<slug>"` and switch into the printed worktree
   path. All work below happens there. (If already in the feature worktree, skip.)
1. **specify** — `@spec` writes `docs/feats/<slug>/spec.md`.
2. **⏸ spec gate** — present the spec; get approve/edit/comment. (Unattended: set
   `pending_gate: spec` in doit.yaml and stop.)
3. **contracts** — `@spec` writes Gherkin `contracts/*.feature` from the approved spec.
4. **plan** — `@architect` writes `plan.md` (reads `docs/ARCHITECTURE.md`, prefers reuse).
5. **⏸ plan gate** — present the plan; get approval. (Unattended: `pending_gate: plan`, stop.)
6. **tasks** — `@architect` writes the checkbox `tasks.md`.
7. **tdd-red** — `@tester` writes failing vitest/jest/playwright tests from the contracts.
8. **implement** — `@implementer` makes them pass (green), task by task, checking off `tasks.md`.
   If the implementer raises an **opinion gate** (a genuine design fork), pause for the human.
9. **review loop** — run `@reviewer` (read-only). Route findings: bug|quality|perf → `@implementer`;
   test|contract → `@tester`. Re-review. Stop when `no findings` or after **3** iterations (then
   raise a concise human note with the residue). The reviewer never edits.
10. **verify** — run `/verify`. Must be `VERIFY: GREEN` to proceed; if RED, route back and retry.
11. **docs-sync** — update `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/memory/`, and **this** feature's
    `docs/feats/<slug>/` (finalize tasks). Never touch another feature's `docs/feats/<other>/`.
12. **pr** — run `/pr <slug>` to open the review-friendly draft PR.

Liveness: advance only on real progress; never blind-retry — on a stuck stage or an exhausted bound,
write `doit.yaml` and raise a specific human note. The only "done" is `VERIFY: GREEN` + an opened PR.
