## Applying subagent replies

Reply keys are not state keys. Translate:

- **sddkit-design** → its `artifacts` list splits across `artifacts.spec`, `artifacts.contracts`, and `artifacts.plan`;
  `blockers` → `blockers`.
- **sddkit-design-reviewer** → nothing is persisted. Its `changes`, `fixed`, and `findings` are shown at the design
  gate; unresolved `blocker|major` `findings` are passed verbatim to `sddkit-design`.
- **sddkit-implementer** → `blockers` → `blockers`.
- **sddkit-code-reviewer** → `review_status` → `review.status`; `findings` → `review.findings` (minor-only →
  `review.deferred_findings`); `fixed` is journaled, not stored. `iterations` is an echo — you own the count.
- **sddkit-qa** → `qa_status` → `qa.status`; `scenarios_total|scenarios_passed|scenarios_failed`, `findings`,
  `report_path`, `pr_comment_url` all nest under `qa.*`; `blockers` → `blockers`. `qa.pr_ready` is yours to set in
  step 10.
- **sddkit-docs-writer** → `docs` → `artifacts.docs`; `blockers` → `blockers`. Its `env_vars` and `external_setup` have
  no state field on purpose — they are already written into the READMEs `artifacts.docs` points at, and state stores
  pointers to documents, never their contents.

Everything else a subagent returns has no state field. Most of it is for your reasoning and the chat summary: `feature`,
`scenarios`, `open_questions`, `assumptions`, `human_decisions`, `approaches`, `recommended`, `playwright_fallback`,
`journeys`, `scenarios_covered`, `addressed_findings`, `rebutted_findings`, `test_commands`, `tests_passing`,
`files_changed`, QA `journeys`, sddkit-implementer's `status`, and sddkit-docs-writer's `env_vars`, `external_setup`,
`unchanged`, and `notes`.

These drive control flow and must be acted on even though nothing records them: `opinion_gate` parks the run;
`files_changed: []` on sddkit-implementer's `status: done` is a no-op success only when the planned test is already in
the tree **and** there are no routed `blocker|major` findings — on first arrival or a fix round it is a failed pass, not
success; `sddkit-code-reviewer`'s `files_changed` is checked against HEAD (step 6); and its `notes` is its only channel
for an empty diff or a spec/plan gap.

One trap if you patch a reply verbatim: `sddkit-qa`'s keys are top-level in the reply but nested under `qa` in state, so
the patch reports success while silently discarding every value.
