## Applying subagent replies

Reply keys are not state keys. Translate:

- **spec** → its `artifacts` list splits across `artifacts.spec` and `artifacts.contracts`; `blockers` → `blockers`.
- **architect** → its `artifacts` list gives `artifacts.plan`; `blockers` → `blockers`.
- **tester / implementer** → `blockers` → `blockers`.
- **plan-reviewer** → `review_status` → `review.status`; `findings` → `review.findings`. Artifact critiques are
  single-pass, so there is no `iterations` to carry.
- **code-reviewer** → `review_status` → `review.status`; `findings` → `review.findings` (minor-only →
  `review.deferred_findings`); `iterations` → `review.iterations`. Two lens replies (`contract` + `health`) for the same
  iteration merge into one patch first, per step 8's iteration-1 review loop — concatenate `findings`,
  `review_status: findings` if either lens found any, and `review.iterations` advances by 1 for the merged pair, never
  per lens.
- **qa** → `qa_status` → `qa.status`; `scenarios_total|scenarios_passed|scenarios_failed`, `findings`, `report_path`,
  `pr_comment_url`, `pr_ready` all nest under `qa.*`; `blockers` → `blockers`.
- **docs-writer** → `docs` → `artifacts.docs`; `blockers` → `blockers`. Its `env_vars` and `external_setup` have no
  state field on purpose — they are already written into the READMEs `artifacts.docs` points at, and state stores
  pointers to documents, never their contents.

Everything else a subagent returns has no state field. Most of it is for your reasoning and the chat summary: `feature`,
`scenarios`, `open_questions`, `slices`, `slice_ids`, `human_decisions`, `addressed_findings`, `rebutted_findings`,
`files`, `scenarios_covered`, `test_command`, `tests_passing`, `journeys`, tester's `status`, plan-reviewer's `target`,
spec's `assumptions`, architect's `approaches` and `recommended`, code-reviewer's `lens`, and docs-writer's `env_vars`,
`external_setup`, `unchanged`, and `notes`.

The remaining three drive control flow in step 8 and must be acted on even though nothing records them: `opinion_gate`
parks the run, `files_changed: []` on implementer's `status: done` marks a slice that produced nothing, and
`code-reviewer`'s `notes` is its only channel for an empty diff or a spec/plan gap.

One trap if you patch a reply verbatim: `qa`'s keys are top-level in the reply but nested under `qa` in state, so the
patch reports success while silently discarding every value.
