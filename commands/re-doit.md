---
description: Resume an interrupted or gated /doit run from its on-disk state.
agent: orchestrator
---
Resume the feature: **$ARGUMENTS** (if empty, find the most recently updated `docs/feats/*/doit.yaml`).

State files found:
!`for f in docs/feats/*/doit.yaml; do [ -f "$f" ] && { echo "== $f =="; cat "$f"; }; done 2>/dev/null || echo "(none here — may be in a worktree)"`
Worktrees:
!`.opencode/bin/worktree.sh list 2>/dev/null || true`

Do this:
1. Read the target `doit.yaml`; determine `stage`, `completed`, and any `pending_gate`.
2. **Reattach to the feature's worktree** (the `worktree:` path). All work continues there.
3. If a `pending_gate` is set, the human edits are now on disk — clear the gate and continue from the
   next stage. Otherwise resume from the last incomplete stage.
4. Continue the `/doit` pipeline to completion (review loop → verify → docs-sync → PR), updating
   `doit.yaml` after each stage.

Never restart completed stages from scratch; trust the on-disk artifacts.
