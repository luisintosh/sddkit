---
description: Run the full feature pipeline end-to-end (worktree → spec → contracts → plan → task-slice loops → verify → docs → PR), pausing only at human gates.
agent: orchestrator
---
Drive the feature: **$ARGUMENTS**

You are orchestrating. Slugify the feature name to `<slug>`. Persist progress to
`docs/feats/<slug>/doit.yaml` after **every** stage and after every loop phase so `/re-doit` can
resume. Run stages in order; delegate to the named subagents; pause only at the human gates.

0. **worktree** — run `!.opencode/bin/worktree.sh new "<slug>"` and switch into the printed worktree
   path. All work below happens there. (If already in the feature worktree, skip.)
1. **specify** — `@spec` writes `docs/feats/<slug>/spec.md`.
2. **⏸ spec gate** — present the spec; get approve/edit/comment. (Unattended: set
   `pending_gate: spec` in doit.yaml and stop.)
3. **contracts** — `@spec` writes Gherkin `contracts/*.feature` from the approved spec.
4. **plan** — `@architect` writes `plan.md` (reads `docs/ARCHITECTURE.md`, prefers reuse).
5. **⏸ plan gate** — present the plan; get approval. (Unattended: `pending_gate: plan`, stop.)
6. **tasks** — `@architect` writes `tasks.md` as ordered feature slices. Each slice lists its task IDs,
   related contract scenarios, and the targeted test scope/command to use once tests exist.
7. **feature loops** — for each incomplete slice in `tasks.md`, update `doit.yaml` with
   `stage: feature-loop`, `current_loop: <slice-id>`, and the current `loop_phase`, then run:
   - **red** — `@tester` writes only the failing tests for this slice's tasks/contracts and confirms
     they fail for the right reason.
   - **green** — `@implementer` makes this slice pass with the smallest correct change, checking off
     only the slice's completed task boxes. If the implementer raises an **opinion gate** (a genuine
     design fork), pause for the human.
   - **targeted test** — run the slice's targeted test command/scope. If it fails, route back to the
     responsible agent and retry only with concrete progress.
   - **review loop** — run `@reviewer` (read-only) against the uncommitted slice diff. Route findings:
     bug|quality|perf → `@implementer`; test|contract → `@tester`. Re-run the targeted tests and
     re-review. Stop when `no findings` or after **3** iterations (then raise a concise human note
     with the residue). The reviewer never edits.
   - **commit** — commit the slice's tests, implementation, and task progress with a Conventional
     Commit message. Mark the slice in `completed_loops` and clear `current_loop` / `loop_phase`.
8. **verify** — after all slices are committed, run full `/verify`. Must be `VERIFY: GREEN` to proceed;
   if RED, route back through the smallest necessary slice-style fix/re-review/commit before retrying.
9. **docs-sync** — update `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/memory/`, and **this** feature's
    `docs/feats/<slug>/` (finalize tasks). Never touch another feature's `docs/feats/<other>/`.
10. **pr** — run `/pr <slug>` to open the review-friendly draft PR. Stop after PR creation; never
    merge into `main` or `master`.

Liveness: advance only on real progress; never blind-retry — on a stuck stage or an exhausted bound,
write `doit.yaml` and raise a specific human note. The only "done" is all slice commits complete,
`VERIFY: GREEN`, docs synced, and an opened draft PR.
