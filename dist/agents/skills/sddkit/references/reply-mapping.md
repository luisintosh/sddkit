## Applying subagent replies

Reply keys are not state keys. Translate:

- **sddkit-design** → its `artifacts` list splits across `artifacts.spec`, `artifacts.contracts`, and `artifacts.plan`;
  `blockers` → `blockers`. In a design delta, follow it with `transition design-revised`.
- **sddkit-design-reviewer** → nothing is persisted. Its `changes`, `fixed`, and `findings` are shown at the design
  gate; unresolved `blocker|major` `findings` are passed verbatim to `sddkit-design`.
- **sddkit-implementer** → `blockers` → `blockers`.
- **sddkit-code-reviewer** (three runs, one per `area`) → never applied one by one: `sddkit-state review-merge` (step
  6.3) writes all three at once — `review.status`, `blocker|major` → `review.findings`, `minor` →
  `review.deferred_findings`. `iterations` is an echo — you own the count.
- **sddkit-qa** → `qa_status` → `qa.status`; `scenarios_total|scenarios_passed|scenarios_failed`, `findings`,
  `report_path`, `pr_comment_url` all nest under `qa.*`; `blockers` → `blockers`. `qa.pr_ready` is yours to set in
  step 10.
- **sddkit-docs-writer** → `docs` → `artifacts.docs`; `blockers` → `blockers`. Its `env_vars` and `external_setup` have
  no state field on purpose — they are already written into the READMEs `artifacts.docs` points at, and state stores
  pointers to documents, never their contents.

Everything else a subagent returns has no state field. Most of it is for your reasoning and the chat summary: `feature`,
`scenarios`, `open_questions`, `assumptions`, `human_decisions`, `approaches`, `recommended`, `playwright_fallback`,
`journeys`, `scenarios_covered`, `addressed_findings`, `test_commands`, `tests_passing`, `files_changed`, QA `journeys`,
sddkit-implementer's `status`, and sddkit-docs-writer's `env_vars`, `external_setup`, `unchanged`, and `notes`.

These drive control flow though nothing records them: `opinion_gate` and `files_changed: []` (step 5; in a review fix
round, a failed pass — step 6.4), `rebutted_findings` (step 6.4), and the code reviewers' stray edits and `notes` (steps
6.2, 6.4).

One trap if you patch a reply verbatim: `sddkit-qa`'s keys are top-level in the reply but nested under `qa` in state, so
the patch reports success while silently discarding every value.
