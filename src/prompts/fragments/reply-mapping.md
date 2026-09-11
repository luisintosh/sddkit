## Applying subagent replies

Reply keys are not state keys. Translate:

- **sddkit-spec** → its `artifacts` list splits across `artifacts.spec` and `artifacts.contracts`; `blockers` →
  `blockers`.
- **sddkit-architect** → its `artifacts` list gives `artifacts.plan`; `blockers` → `blockers`.
- **sddkit-implementer** → `blockers` → `blockers`.
- **sddkit-plan-reviewer** → `review_status` → `review.status`; `findings` → `review.findings`. Artifact critiques are
  single-pass, so there is no `iterations` to carry.
- **sddkit-code-reviewer** → `review_status` → `review.status`; `findings` → `review.findings` (minor-only →
  `review.deferred_findings`); `iterations` → `review.iterations`. One `lens: all` reply per iteration — no dual-lens
  merge.
- **sddkit-qa** → `qa_status` → `qa.status`; `scenarios_total|scenarios_passed|scenarios_failed`, `findings`,
  `report_path`, `pr_comment_url`, `pr_ready` all nest under `qa.*`; `blockers` → `blockers`.
- **sddkit-docs-writer** → `docs` → `artifacts.docs`; `blockers` → `blockers`. Its `env_vars` and `external_setup` have
  no state field on purpose — they are already written into the READMEs `artifacts.docs` points at, and state stores
  pointers to documents, never their contents.

Everything else a subagent returns has no state field. Most of it is for your reasoning and the chat summary: `feature`,
`scenarios`, `open_questions`, `human_decisions`, `addressed_findings`, `rebutted_findings`, `files`,
`scenarios_covered`, `test_path`, `test_command`, `playwright_fallback`, `tests_passing`, `journeys`,
sddkit-implementer's `status`, sddkit-plan-reviewer's `target`, sddkit-spec's `assumptions`, sddkit-architect's
`approaches` and `recommended`, sddkit-code-reviewer's `lens`, and sddkit-docs-writer's `env_vars`, `external_setup`,
`unchanged`, and `notes`.

The remaining three drive control flow in step 8 and must be acted on even though nothing records them: `opinion_gate`
parks the run; `files_changed: []` on sddkit-implementer's `status: done` is a no-op success only when the planned test
is already in the tree **and** there are no outstanding `blocker|major` findings — on first arrival or a fix round it is
a failed pass, not success; and `sddkit-code-reviewer`'s `notes` is its only channel for an empty diff or a spec/plan
gap.

One trap if you patch a reply verbatim: `sddkit-qa`'s keys are top-level in the reply but nested under `qa` in state, so
the patch reports success while silently discarding every value.
