## Handoff (step 11)

Read the epic's task list with `tools.tracker` (`gh issue view <epic> --json body` when that tool is `gh`) and take the
first unchecked entry that isn't this feature. Nothing in this pipeline ticks those boxes: the epic body lists features
as `- [ ] #<n> …`, and GitHub auto-checks such an entry when issue `#<n>` closes — which is why step 8 puts
`Closes #<n>` in the PR body. So "unchecked" means "its feature PR hasn't merged yet", and this feature's own entry
stays unchecked until a human merges.

- None left → tell the user every feature in the epic is done or in flight; stop.
- Found, and its `Blocked by` issues aren't all `CLOSED` → tell the user to merge this feature's PR first (it closes the
  blocker via `Closes #<n>`).
- Found, and all blockers `CLOSED` → say it's ready to run now.
- Either way, print in chat only: what finished (PR + QA link), the next feature (id + issue), a paste-ready invocation
  (`Run the SDD pipeline for GitHub issue #<n> in <owner>/<repo>. Scope is exactly that issue's Acceptance criteria. Base: <base>.`),
  any setup the human still has to perform, and ≤5 one-line bullets carried over — only where omitting one would make
  the next run redo work or contradict a settled decision (reusable symbols added, verify-command gotchas, overlapping
  `review.deferred_findings` or unfiled `Tech debt:` records, gate decisions, setup gotchas hit). Never restate what the
  issue, `AGENTS.md`, or the PR already says.
