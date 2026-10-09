## Review dispute (step 6.5)

Only when step 6.4 or `quest-state next` sends you here.

1. Patch `pending_gate: dispute` and, per remaining `blocker|major` finding, append the blocker
   `dispute (review) <id>: <summary> — <fix>` (`--append '{blockers: [...]}'`; a re-raised `fix` carries both
   arguments). On resume they are already there — append nothing.
2. Ask the human to rule on each: **apply**, **defer**, or **drop**. Record each ruling as it arrives, so a resume never
   asks twice: one patch that `--drop`s the entry and `--append`s the same text ending `— ruled: apply|defer|drop`.
3. Once every entry is ruled:
   - **defer** → `--append` to `review.deferred_findings` a `minor` copy with id `<id>-td` (skip an id already there —
     check `show`). A design finding gets the tech-debt `fix`
     `Tech debt: <Pattern> — migrate <sites> to <symbol>; reason: deferred at dispute` (pattern, sites, and symbol from
     its `fix`); any other keeps its `fix` without the `Tech debt:` prefix.
   - **apply** → all applied findings in one round: continue `shadow-implementer` (no live handle → a new one with the
     journey briefs) with those findings and the human's ruling as authority — rebuttals are not accepted under a
     ruling. Handle its reply as in a fix round (step 6.4): opinion gate, `blocked`, and `files_changed: []` (continue
     it once stating that, then blocker). Run typecheck, lint, and every journey command (second failure → blockers,
     pause), commit. No re-review.
   - **drop** → nothing to record.
4. Clear `pending_gate`, `--drop` the dispute blockers, and go to step 6.6.
