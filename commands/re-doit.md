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
1. Read the target `doit.yaml`; determine `stage`, `completed`, `pending_gate`, `current_loop`,
   `loop_phase`, and `completed_loops`. If loop fields are absent, infer completed loops from
   `tasks.md` and initialize the missing fields in `doit.yaml`.
2. **Reattach to the feature's worktree** (the `worktree:` path). All work continues there.
3. If a `pending_gate` is set, the human edits are now on disk — clear the gate and continue from the
   next stage. Otherwise resume from the last incomplete stage.
4. If `stage: feature-loop`, resume the recorded slice at `loop_phase` without restarting earlier loop
   phases. If there is no active loop, pick the first slice in `tasks.md` that is not in
   `completed_loops`.
5. Continue the `/doit` pipeline to completion (remaining feature loops → full verify → docs-sync →
   draft PR), updating `doit.yaml` after each stage and loop phase.

Never restart completed stages from scratch; trust the on-disk artifacts.
