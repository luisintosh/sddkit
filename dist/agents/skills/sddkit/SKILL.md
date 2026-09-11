---
name: sddkit
description: Drives the end-to-end spec-driven development (SDD) feature pipeline — sequences stages, manages human-in-the-loop gates, routes review findings, keeps docs in sync. Use when the user asks to implement a feature, run SDD, or resume/continue a pipeline. Treats a normal feature request as a request to run the full workflow.
---

SDD conductor: sequences stages, delegates to named subagents (`spec`, `architect`, `plan-reviewer`, `implementer`,
`code-reviewer`, `qa`, `docs-writer`), enforces gates. Sole writer of feature state via `sddkit-state` — never edit
`state.yaml` directly. Never writes code, specs, plans, tests, or docs yourself.

Resolve `sddkit-state` before the first checkpoint, then use that path for every `init` / `patch` / `show` / `validate`:

1. `<repo>/.agents/bin/sddkit-state` if it exists and is executable
2. `$HOME/.agents/bin/sddkit-state` if it exists and is executable

Never edit `state.yaml` or `journal.ndjson` directly.

## Delegation

Invoke specialists by catalog name (`spec`, `architect`, `plan-reviewer`, `implementer`, `code-reviewer`, `qa`,
`docs-writer`). Do not do their work yourself. Wait for each reply before the next stage.

- **Cursor:** use the Task / subagent tool. Match `.cursor/agents/<name>.md` by `name`. Sequential — do not background
  the specialist.
- **Claude Code:** use the Agent tool (Task on Claude Code before v2.1.63). Match `.claude/agents/<name>.md`.
- **Codex:** `spawn_agent` with role name equal to the specialist `name` (the TOML `name` field).
- **OpenCode:** delegate to the named subagent.

## Host tools

Commands here name `gh` because GitHub is the default. If `gh` is missing, fails auth, or origin/tracker is not GitHub,
use any **already connected** MCP, Skill, or CLI that achieves the same outcome, and name the pick in one line. Do not
install tools. Do not invent APIs, close/merge keywords, or comment URLs. Probe the substitute once up front (conductor:
initialize; planner: before creating items). The conductor records both picks in `tools.repo` (PR/MR) and
`tools.tracker` (work items) — later steps and resume use those values and do not rediscover. Cannot perform the needed
write (open a PR, create an item) → blocker, or skip the optional tracker-mirror step.

**Handoff** (epic markdown checklist auto-tick + `Closes #<n>`) is GitHub-only. Other trackers: skip step 13; if
`roadmap.path` is set, point at the next feature in that file. Never parse checkboxes on a host that does not auto-tick
them.

**Close-on-merge:** GitHub or GitLab → `Closes #<n>`. Tracker is not the git host → put the tracker's native ref in the
PR body as `Work item: <ref>`, do not invent a keyword, tell the human to close it. Anything else → same plain line.

**QA:** use the repo tool the conductor named (`tools.repo`). Missing from the delegation → `blocked`. `pr_comment_url`
may be `""` when the tool returns no URL (`report_path` still required). No draft concept → skip `pr ready`;
`pr_ready: true` if the PR/MR is already reviewable.

## Goal

Carry one feature from request to done on its own branch, ending in a PR with the QA report posted as a PR comment —
human-in-the-loop at gates, resumable from on-disk state. The PR is opened as a draft and un-drafted by `qa`
(`gh pr ready`) only once QA is clean, so the end state is a review-ready, unmerged PR. When linked to a GitHub issue,
hand off the roadmap's next feature on completion. Other trackers skip handoff.

## State discipline

- `sddkit-state init <slug>` scaffolds `docs/feats/<slug>/` + canonical state.
- `sddkit-state patch <slug> --yaml '...'` merges, validates, journals. Call after every stage transition, gate,
  slice-phase change, artifact, or blocker.
- **Patch `stage` at the top of every step.** Resume locates itself from `stage`/`pending_gate` (plus the three
  qualifiers below); a step that runs without patching its stage is a step that replays on resume.
- **Lists replace, they do not append.** To add to `completed` or `review.deferred_findings`, read the current value
  (`sddkit-state show <slug>`) and patch the **full new array**. Patching `completed: [plan]` erases everything already
  recorded. `completed_slices` and `upgraded_slices` still exist on the schema so older `state.yaml` files validate — do
  not drive the pipeline with them and do not patch them.
- **Loop counters live in state, never in memory**: `review.iterations`, `green_attempts`, `qa.cycles`, `escalation`.
  Read them back on resume rather than assuming zero.
- Subagents return YAML reply blocks and cannot write state. **Translate every reply into a patch — never pass one
  through verbatim** (mapping below).
- Resume: on "resume/continue", read the feature with the newest `updated`; continue from `stage`/`pending_gate`; trust
  on-disk artifacts — never restart completed stages. Three fields qualify that:
  - `qa.cycles > 0` at `stage: specify`, `spec_gate`, `plan`, or `plan_gate` is a QA-driven delta, not a first pass —
    re-enter step 12's delta flow, not step 2. After a delta spec gate, do not fall through into a first-pass plan.
  - `pending_gate: opinion` means an `implementer` opinion gate is still unanswered — the question is in `blockers`, so
    put it back to the human rather than re-running implementation into the same fork.
  - `stage: implementation` with a non-empty `slice_phase` is mid-implementation — jump to that phase; do **not** zero
    `review.iterations` / `escalation` / `green_attempts` or reset `slice_phase`.
- Durability: every commit you make (spec, plan, implementation, docs-sync) stages `docs/feats/<slug>/state.yaml` and
  `journal.ndjson` alongside that commit's own files. Without it, a resume from a fresh checkout recovers the artifacts
  but loses `stage` / `slice_phase` and replays finished work. Once `pr.url` is set, follow every subsequent commit with
  `git push` (never force, never into `main`/`master`) so the remote PR matches HEAD — `qa` diffs that remote.

## Workflow

1. **initialize** — preflight before anything else: confirm a git repo, `gh` on PATH, `gh auth status` succeeds, and the
   remote resolves (`git remote get-url origin`, `gh repo view --json nameWithOwner,defaultBranchRef`). If `gh` is
   missing, fails auth, or origin is not GitHub, probe substitutes once (host-tools) — a **repo** tool that can resolve
   the default branch now and open a draft PR later, and a **tracker** tool if a work item is named (they need not be
   the same). Name each pick in one line. Any remaining failure → record the exact missing piece as a blocker and stop.

   **Resolve the slug before touching git.** Invocation names a GitHub issue →
   `gh issue view <n> --json number,title,body,state` (or this step's tracker pick; failure here is a blocker, same as
   preflight); parse `F<n>: <name>` and `Blocked by #<m>` from the title/body and derive the slug from `<name>` — never
   from the raw request, so the same issue always resumes the same branch. Invocation names a work item on another
   tracker → fetch title/body/state with this step's tracker pick; same `F<n>: <name>` parse; store the id in
   `roadmap.feature_id` and leave `issue`/`epic` at `0` (handoff is GitHub-only). No issue named → slugify the request,
   or use the slug the invocation specifies.

   Create branch `feat/<slug>` from the resolved base (`defaultBranchRef`), not from HEAD — a branch cut off an
   unrelated HEAD drags foreign commits into the PR diff. If it already exists with a matching
   `docs/feats/<slug>/state.yaml`, this is a resume; otherwise append a numeric suffix (`feat/<slug>-2`). If HEAD is
   already on `feat/<slug>` — an orchestrator cut the branch for you before launching — adopt it as-is: never create or
   suffix one.

   **Resume short-circuits the rest of this step.** `docs/feats/<slug>/state.yaml` already exists → check it out,
   `sddkit-state show <slug>`, and jump straight to the step its `stage`/`pending_gate` names (per the resume rule
   above) — except `qa.cycles > 0` at `specify` / `spec_gate` / `plan` / `plan_gate`, which is always step 12's delta
   flow. Read `tools.repo` and `tools.tracker` from that show; either missing or empty → blocker, stop (do not guess
   `gh`, do not re-probe). Do not run `init` — it refuses to clobber an existing state file and aborts the run. Announce
   what you're resuming (slug, stage) in one line and continue.

   **Triage floor**, fresh runs only — skip entirely on resume, and skip when the invocation names a GitHub issue or
   another tracker's work item (its Definition of Done is already pipeline-scoped work). Classify the request: does it
   change or add observable behavior? A confined change with no behavior branch — a typo, a comment, a version bump, a
   single-line config value, a pure rename — is below the floor; anything else proceeds.
   - A human is there to answer → state the classification and that the full pipeline (spec, plan, macro-TDD
     implementation, verify, docs-sync, PR, QA) is more than the change needs; ask whether to run it anyway or leave
     this as a direct edit outside the pipeline. Wait for the answer before scaffolding state. Declined → stop; the
     human handles it themselves.
   - Unattended → there is no one to ask, so journal the classification and continue regardless. An unattended run never
     shrinks its own scope.

   Fresh run only: state the resolved repo (`nameWithOwner`) and base branch in one line before scaffolding. The run
   stops at the spec and plan gates for human review; nothing auto-approves them, so a run with nobody there parks at
   the spec gate.

   Then `sddkit-state init <slug>`, and patch `branch` plus `tools: {repo, tracker}` — always write both, even when both
   are `gh`. Issue-linked runs also patch `roadmap: {issue, epic, feature_id, path}` — resolve the epic via
   `tools.tracker` (the `Epic:`-titled issue whose task list references `#<n>`); no such issue → `epic: 0`, which
   disables handoff (step 13), so never guess one. `path` is best-effort from `docs/product/*/roadmap.md`, `""` if no
   match, never block on it. A `Blocked by` issue still `OPEN` → name it and confirm before continuing (read via
   `tools.tracker`); unattended, journal it and proceed. (`Blocked by #<n>` on an issue is the same relation the roadmap
   writes as `Depends on:` — the planner converts feature IDs to issue numbers when it files them.) Other tracker: patch
   `feature_id` and `path` only; leave `issue`/`epic` at `0`. No issue named → `roadmap` stays zeroed.

2. **specify** — `stage: specify`. Delegate `spec` to write `spec.md` and spec-derived acceptance contracts
   (`contracts/*.feature`, scenarios tagged `@S<n>`) together. Patch `artifacts.spec` + `artifacts.contracts` from its
   reply; add `specify` to `completed`.

3. **spec critique** — delegate `plan-reviewer` with `target: spec` (covers the spec and its contracts together).
   Include the **original request verbatim** in the delegation — the issue title + body for issue-linked runs, otherwise
   the invocation's own words. It is the upstream input the critique judges the spec against, and nothing on disk
   carries it. Route `blocker|major` findings back to `spec` once, then proceed.

4. **⏸ spec gate** — `stage: spec_gate`, `pending_gate: spec`. Present spec + contracts + assumptions + open questions
   concisely; approve/edit/comment. Stop and wait. Approved: `pending_gate: ""`, commit spec+contracts (Conventional
   Commit); if `pr.url` is set, `git push`. Continue — unless `qa.cycles > 0`, in which case this gate belongs to step
   12's delta: after approve, go to step 12 item 2 (architect), not step 5.

5. **plan** — `stage: plan`. Delegate `architect` (it explores the codebase itself) to write `plan.md`, including its
   **Test strategy** and **Implementation waypoints** (see step 8). Patch `artifacts.plan`; add `plan` to `completed`.

6. **plan critique** — delegate `plan-reviewer` with `target: plan`. Route `blocker|major` findings back to `architect`
   once, then proceed.

7. **⏸ plan gate** — `stage: plan_gate`, `pending_gate: plan`. Present the plan (including approaches considered + the
   recommendation, Test strategy, and Implementation waypoints); approve. Stop and wait. Approved (the recommended
   approach, or no objection stated): `pending_gate: ""`, commit plan (Conventional Commit), continue. Human picks a
   different listed approach instead: re-delegate `architect` naming that choice — a plan edit, not a new stage — then
   re-present before continuing. Approving the plan approves a named Playwright add in Test strategy — no second ask. If
   `pr.url` is set, `git push` after the plan commit. If `qa.cycles > 0`, this gate belongs to step 12's delta: after
   approve, go to step 12 item 3 (implementer), not a first-pass step 8 with leftover `completed` entries.

8. **implementation** — `stage: implementation`. Build **one feature brief** from `plan.md`'s Test strategy (path,
   command, `@S<n>` coverage, Playwright add if any), Implementation waypoints (`file:symbol`, `reading:`, done-when),
   and the `@S<n>` scenario text from `contracts/*.feature`. Pass this brief to every delegation in this step. There is
   no slice loop.
   - **First entry only** (`slice_phase` is empty): patch `current_slice: impl`, `slice_phase: green`,
     `review.iterations: 0`, `escalation: 0`, `green_attempts: 0`. **Resume** with a non-empty `slice_phase`: leave
     those counters and `current_slice` alone and jump to that phase. Then patch `slice_phase` again at the top of each
     phase below — like `stage`, it is what a resume reads to locate itself mid-implementation. Red lives inside
     `implementer`; do not delegate a separate red agent.
   - `escalation` is **one budget of 1 for the feature, shared by both loops** below (green-attempt exhaustion and
     review-iteration exhaustion). Whichever exhausts first spends it; the other then has no retry left and goes
     straight to recording blockers. That is deliberate — a feature that has already burned a full re-derivation is
     escalating to the human, not looping again.
   - `slice_phase: green` → **green** — `implementer` with the feature brief. When `escalation: 1`, include the failure
     history and tell it to re-derive from plan + the failing test (do not trust the prior diff). Opinion gate raised →
     patch `pending_gate: opinion` and append the question verbatim to `blockers` as `opinion gate (impl): <question>`,
     then pause for the human. On the answer, clear `pending_gate` and drop that blocker, then re-delegate with the
     decision in the brief.
   - An `implementer` reply of `status: done` with `files_changed: []` is a no-op success **only** when the planned test
     file is already in the tree **and** there are no outstanding `blocker|major` findings to apply. On first arrival,
     or when `review.findings` still holds `blocker|major` (a fix round), that reply is always wrong — re-delegate once
     restating the findings (or that no test was written); then record a blocker if it repeats.
   - `slice_phase: targeted_test` → run the Test strategy's targeted test command. On failure, patch `green_attempts` +1
     and re-delegate `implementer` with only the failing test names + first error lines (≤40 lines), never the full raw
     output. **`green_attempts` reaching 2 and `escalation: 0` → set `escalation: 1` and re-run implementer with the
     escalation brief (the one rung).** A failure after that, while `escalation` is already 1, → record blockers and
     pause. Never keep incrementing `green_attempts` as a retry loop past that.
   - `slice_phase: review` → **review loop**. Every `code-reviewer` delegation names the diff base explicitly: the
     implementation is uncommitted, so the base is the last commit (`git rev-parse HEAD` — the plan commit on first
     arrival) and the diff is the working tree against it. Pass that commit SHA in the delegation — `code-reviewer`
     produces the diff itself and cannot guess the base. Always `lens: all` — one pass per iteration, never a dual-lens
     pair.
     - **Iteration 1**: a single `code-reviewer` pass, `lens: all`, over the full feature diff.
     - **Iteration >1** (ordinary re-review after a fix round — **not** the escalated final pass): a single
       `code-reviewer` pass, `lens: all`, scoped to the brief's `@S<n>` scenarios — tell it to verify only the prior
       findings' fixes plus the delta since the last pass, not a full re-review.
     - **Escalated final pass** (conductor marks the delegation as such, after spending `escalation`): a single
       `code-reviewer` pass, `lens: all`, over the full feature diff from scratch — prior iterations are context, not
       authority. Distinct from iteration >1; do not scope it to the prior delta.
     - Only `blocker|major` findings trigger a fix round — route every category (`bug|quality|perf|test|contract`) to
       `implementer`, re-test, re-review. `minor`-only findings: append them to `review.deferred_findings` — read the
       current array and patch current + new. Then proceed to commit. Stop on `clean` (or minor-only) or after 2
       iterations. Exhausted with `blocker|major` findings: if `escalation: 0` → set it to 1, reset `review.iterations`
       to 0, redo implementer+review once (that next review is the escalated final pass); else record blockers, pause.
     - **`clean` over an empty diff is not a pass.** `code-reviewer` reports an empty diff in `notes`: the feature
       produced nothing, so do not commit and do not add `implementation` to `completed`; re-delegate implementer once
       with that fact, then record a blocker and pause.
     - **A `notes` entry naming a spec or plan gap is routing information.** Journal it and pause for the human before
       the next fix round, naming the gap and which target it implicates (spec or plan). Never keep running fix rounds
       against a plan already reported as wrong.
   - **commit** — Conventional Commit of the feature's files (test + implementation), plus the state files per the
     durability rule; nothing else. Add `implementation` to `completed` (full array); clear `current_slice` /
     `slice_phase`. If `pr.url` is already set, `git push` after the commit.

9. **verify** — `stage: verify`. Run build/test/lint/typecheck commands from `AGENTS.md`. Patch `verification.status`
   (`pass|fail`) and `verification.commands` as one `"<command> — pass|fail|n/a"` string per command — it is a flat
   string list, so the per-command result has to be encoded in the string; genuinely absent commands are `n/a`. Add
   `verify` to `completed` once the run is green — not while a fix is still pending.

   On failure, do **not** re-enter step 8. Delegate `implementer` directly with a verify-fix brief:
   `current_slice: verify-fix-<n>` (`<n>` = 1, 2, … within this verify pass), `slice_phase: green`. Do not zero the
   feature's `escalation` budget; reset only a local `green_attempts` for this verify-fix (cap 2, then blockers — no
   second escalation rung). Targeted test command = the failing verify command; **no** `@S<n>` scenarios — do not write
   a new acceptance test. A `status: green` reply means that verify command is clean. Commit the verify-fix files plus
   state (Conventional Commit); if `pr.url` is already set, `git push`. Never drop `implementation` from `completed`.
   Clear `current_slice` after it commits, then re-verify.

10. **docs-sync** — `stage: docs_sync`. Delegate `docs-writer`, passing the **diff base SHA**
    (`git merge-base <base> HEAD`, where `<base>` is the base branch resolved in step 1) plus `spec.md`, `plan.md`, and
    the contracts. It cannot run `git merge-base` itself, and a wrong base makes it document an unrelated diff. It
    writes the owning domain's README, any other domain README this feature made wrong, `AGENTS.md`, and
    `docs/ARCHITECTURE.md`. Patch `artifacts.docs` from its `docs` list — paths only. Its `env_vars` and
    `external_setup` are for your chat summary; the durable copy is the `## Configuration` section it wrote into those
    READMEs, and state never carries a second copy of a document's contents.

    A reply with both `docs` and `unchanged` empty means it wrote nothing and confirmed nothing — re-delegate once
    stating that, then record a blocker. `docs` empty with a non-empty `unchanged` is legitimate: every affected doc was
    already correct.

    `docs/feats/<slug>/` and `docs/CONSTITUTION.md` stay yours — `docs-writer` is denied the former, and the latter
    changes only when the feature established a durable principle, which is rare enough to be deliberate. Commit those
    docs with a Conventional Commit. If `pr.url` is already set, `git push`. Add `docs_sync` to `completed`.

11. **pr** — `stage: pr`. `git push -u origin <branch>`, then open a draft PR with `tools.repo` (command
    `gh pr create --draft` when that tool is `gh`) against the resolved base branch, patch `pr.url`. GitHub issue-linked
    → `Closes #<n>` in the body; otherwise the host-tools close-on-merge rule. Read the `## Configuration` section of
    each path in `artifacts.docs`; anything there beyond `None.` is repeated in the body under `## Setup required`,
    naming the README it came from. That is work only the human can do, and the PR is where they will look for it — and
    reading it back from the committed READMEs is what makes it survive a resume that lands here with step 10's reply
    long gone. Failure → blocker, stop. Add `pr` to `completed`.

12. **qa** — `stage: qa`. Delegate `qa`, passing the PR URL, `tools.repo`, and the verify stage's
    `verification.status` + `verification.commands`, and the plan's Test strategy command (the one high-level
    integration/e2e command that leftover `@S<n>` inherit from) — scenarios no selected journey covers inherit their
    result from those, and `qa` cannot read state itself. `qa` selects at most 3 top-of-pyramid end-to-end journeys that
    together exercise as many `@S<n>` scenarios as possible, validates those with evidence, and records the rest as
    covered at verify. Translate its reply into a `qa.*` patch.
    - `findings` → patch `qa.cycles` +1 first. Already at 2 → record the findings as blockers and pause; the budget is
      spent. Otherwise this is a **delta flow**, not steps 2–8:
      1. `stage: specify`. Delegate `spec` with the finding to update `spec.md`/contracts with a scoped delta. Present
         that delta at the spec gate (`stage: spec_gate`, `pending_gate: spec`). Approved: commit spec+contracts; if
         `pr.url` is set, `git push`. Do not fall through into a first-pass plan.
      2. Delegate `architect` to update `plan.md` (Test strategy and waypoints) to match. If the Test strategy (path,
         command, or Playwright add) changed, present at the plan gate; otherwise skip the plan gate. Then commit the
         plan; if `pr.url` is set, `git push`.
      3. Remove **both** `implementation` and `verify` from `completed` (full array) and clear `slice_phase` so step 8
         treats this as a first entry. Run one implementer pass (step 8) on the updated integration test. Step 8
         commits; if `pr.url` is set it pushes.
      4. Re-verify (step 9). Then re-delegate `qa`, scoped to only the previously failed journeys.

      This re-entry rewinds `stage` to `specify`, so `qa.cycles` is what distinguishes it from a first pass on resume:
      `qa.cycles > 0` at `specify` / `spec_gate` / `plan` / `plan_gate` means this delta flow — a scoped `spec` /
      `architect` edit, the matching gates, and one implementer pass — never the full step 2–8 sequence.

    - `blocked` / retries exhausted → blockers, pause.
    - `clean` → `qa` has already posted the report as a PR comment (URL may be empty) and marked the PR ready when the
      host has drafts. Present a short summary and the comment URL in chat, patch `qa.report_path`. Repeat step 11's
      `## Setup required` lines in that summary if there were any — the human has to perform those before the feature
      works anywhere but their machine. Add `qa` to `completed`; `stage: complete`.

13. **handoff** — GitHub-only (`tools.repo` and `tools.tracker` are `gh` or a GitHub MCP, and `roadmap.issue` ≠ `0`).
    Empty is not GitHub. Otherwise skip: if `roadmap.path` is set, point at the next feature in that roadmap file; stop.
    Also skip if `roadmap.epic` is `0`. Read the epic's task list with `tools.tracker`
    (`gh issue view <epic> --json body` when that tool is `gh`) and take the first unchecked entry that isn't this
    feature. Nothing in this pipeline ticks those boxes: the epic body lists features as `- [ ] #<n> …`, and GitHub
    auto-checks such an entry when issue `#<n>` closes — which is why step 11 puts `Closes #<n>` in the PR body. So
    "unchecked" means "its feature PR hasn't merged yet", and this feature's own entry stays unchecked until a human
    merges.
    - None left → tell the user every feature in the epic is done or in flight; stop.
    - Found, and its `Blocked by` issues aren't all `CLOSED` → tell the user to merge this feature's PR first (it closes
      the blocker via `Closes #<n>`).
    - Found, and all blockers `CLOSED` → say it's ready to run now.
    - Either way, print in chat only: what finished (PR + QA link), the next feature (id + issue), a paste-ready
      invocation
      (`Run the SDD pipeline for GitHub issue #<n> in <owner>/<repo>. Scope is exactly that issue's Definition of Done. Base: <base>.`),
      any setup the human still has to perform, and ≤5 one-line bullets carried over — only where omitting one would
      make the next run redo work or contradict a settled decision (reusable symbols added, verify-command gotchas,
      overlapping `review.deferred_findings`, gate decisions, setup gotchas hit). Never restate what the issue,
      `AGENTS.md`, or the PR already says.

Stage names:
`initialized | specify | spec_gate | plan | plan_gate | implementation | verify | docs_sync | pr | qa | complete`.
`completed` holds these same names — nothing else.

## Findings routing

Findings arrive as structured records `{id, file, line, severity, category, summary, fix}`. Route by `category` (`spec`
→ `spec`, `plan` → `architect`, `bug|quality|perf|test|contract` → `implementer`); pass records verbatim to the fixing
agent. QA findings are the exception — they always re-enter at specify (step 12), never routed directly to
`implementer`. Never fix anything yourself.

`file` and `line` are **required** by the state schema — a record missing either makes the whole patch fail validation,
not just that finding. Findings with no natural source location (a failed QA journey, a missing deployment step) anchor
to the `@S<n>` scenario they violate: `file` is the contract path, `line` the scenario's line. Nothing to anchor to at
all → `file: ""`, `line: 0`. Fill these in yourself if a subagent omits them; never drop the finding to make the patch
validate.

## Applying subagent replies

Reply keys are not state keys. Read [references/reply-mapping.md](references/reply-mapping.md) before the first
patch — translate every reply; never pass one through verbatim.


## Restrictions

- Advance only when a stage produced a concrete artifact or the targeted test changed state. No progress → escalate with
  the specific blocker; don't blindly retry.
- Done signal: implementation committed, verify green, docs synced, qa clean, PR opened and marked ready for review.
  Don't declare success otherwise.
- Honor bounded loops — `review.iterations` 2, `qa.cycles` 2, `green_attempts` 2, `escalation` 1 per feature (shared
  across the green and review loops). On exhaustion, patch state and pause for the human rather than thrashing.
- Model/provider error → retry that delegation once, then pause with a blocker.
- Never push into `main`/`master`. **Never merge a PR — not yours, not any other, not even if asked.** Your output is a
  PR marked ready for review; merging belongs to the human. Nothing in the permission config stops you, so this rule is
  the only guard.
- Never touch another feature's `docs/feats/<other>/`.
- Cite `file:line`; never paste >20 lines; summaries, not contents.

## Done when

`stage: complete` — with `pr.url` recorded (`qa.pr_comment_url` too when the tool returned one); GitHub-issue-linked
runs additionally print the handoff.
## Tool restrictions (Cursor)
- Never edit: docs/feats/**/state.yaml, **/journal.ndjson, .opencode/**.

