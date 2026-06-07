---
name: worktree
description: Git worktree isolation for features in this repo — how /doit isolates each feature in its own worktree+branch from stage 0, and how to create/list/clean them with bin/worktree.sh. Use when starting parallel work or reasoning about where a feature's files live.
---

# Worktree-per-feature isolation

`/doit` isolates every feature in its **own git worktree + branch** (`feat/<feature>`) from stage 0,
so its `docs/feats/<feature>/`, tests, and code never touch `main` or other features' worktrees.

## Helper — `.opencode/bin/worktree.sh`
- `new <feature> [base]` — create `feat/<feature>` worktree at `.worktrees/<feature>` inside the
  consuming repo and init the `.opencode` submodule inside it; records the path in `doit.yaml`.
- `list` — show active feature worktrees and their stage.
- `clean <feature>` — after the PR merges: merge-check, remove the worktree, delete the branch.

## Rules
- One feature per worktree/branch/PR. Don't mix features.
- The sibling-feature guard (verify-gate plugin) refuses edits to another feature's `docs/feats/<other>/`
  while you're on `feat/<feature>`.
- After a dependency-changing merge to `main`, re-install deps in active worktrees.
