## Design delta

Reached from step 6.4 (a reviewer's `notes` name a spec or plan gap → `origin: review`), from step 9 (QA `route: spec`
or `route: mixed` → `origin: qa`), or from `sddkit-state next` with `step: 9-delta` (resume at sub-step 2).

1. `sddkit-state transition <slug> --event design-delta --yaml '{origin: <review|qa>, findings: [...]}'` — sets
   `stage: design` and stores the findings in `delta.findings`, so an interrupted delta resumes here instead of
   re-presenting the old design. Findings: for `qa`, this cycle's `spec|plan` findings only (drop impl findings — the
   re-QA pass re-emits any that still fail); for `review`, the gap as one `spec` or `plan` record per the anchor rule
   (`file: ""`, `line: 0` when nothing anchors it).
2. Delegate a **new** `sddkit-design` with `delta.findings` (read via `show`) verbatim. Patch its artifacts as in step
   2, then `sddkit-state transition <slug> --event design-revised`.
3. Design gate (step 4), always presented. On approval, `transition design-approved` runs the delta reset: it removes
   `implementation`, `review`, `verify`, and `docs_sync` from `completed`; clears `completed_slices`, `current_slice`,
   `slice_phase`, and `review.findings`; zeroes `review.iterations`, `green_attempts`, and `escalation`; clears
   `review.fix_pending`. A `qa` delta moves `review.base` to the delta's design commit; a `review` delta keeps the
   original base, so the next review still covers code written before the delta and re-raises any blocker that survives.
4. Steps 5 → 6 → 7, then the step `sddkit-state next` reports as `after_verify` — 8 when no PR exists yet, 9 when it
   does. After a `qa` delta, step 9 re-delegates `sddkit-qa` scoped to only the previously failed e2e paths
   (`qa.findings`).
