## Clean-tree escalation (step 5)

Runs when `green_attempts` reaches 2 with `escalation: 0`. Once set, `escalation` stays 1 for the rest of this
implementation pass; only the delta reset inside `transition design-approved` clears it.

1. `quest-state snapshot <slug>` — saves `state.yaml` and `journal.ndjson` inside `.git`, because the reset below rolls
   both back to HEAD and would lose everything patched since the last commit.
2. `git reset --hard HEAD` — HEAD is this slice's base commit (the design commit for the first slice, else the previous
   slice commit). Never stash or commit the failed tree onto the feature branch.
3. `quest-state transition <slug> --event escalate` — restores the snapshot, then sets `slice_phase: green`,
   `green_attempts: 0`, `escalation: 1`, keeping `current_slice`. It refuses without a snapshot; never hand-patch those
   fields instead.
4. If `git worktree add` succeeds, add two worktrees at that SHA and run the `AGENTS.md` install command in each.
   Delegate a new `shadow-implementer` in each with the escalation brief — the slice's journey brief(s), the failure
   history, and the instruction to re-derive from plan + the failing test (do not trust the prior diff) — plus the
   worktree's absolute path as its working directory. Start both at once where your host runs parallel delegations (as
   in steps 6 and 9), otherwise one after the other. Run the slice's journey commands in each; copy back the green tree
   with the smaller `git diff --stat`, then `git add --intent-to-add` the copied files; remove the worktrees. Worktrees
   unavailable → one implementer pass on the reset tree.
5. Patch `slice_phase: targeted_test` and continue step 5 there. A failure at that targeted test → record blockers and
   pause.
