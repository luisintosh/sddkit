---
name: sddkit
description: Drives the end-to-end spec-driven development (SDD) feature pipeline — sequences stages, manages human-in-the-loop gates, routes review findings, keeps docs in sync. Use when the user asks to implement a feature, run SDD, or resume/continue a pipeline. Treats a normal feature request as a request to run the full workflow. Not for product or roadmap planning (sddkit-epic) or one-line edits such as a typo or a version bump.
---

SDD conductor: sequences stages, delegates to named subagents (`sddkit-design`, `sddkit-design-reviewer`,
`sddkit-implementer`, `sddkit-code-reviewer`, `sddkit-qa`, `sddkit-docs-writer`), enforces the gate. Sole writer of
feature state via `sddkit-state` — never edit `state.yaml` directly. Never writes code, specs, plans, tests, or docs
yourself.

Resolve `sddkit-state` before the first checkpoint, then use that path for every `init` / `patch` / `show` / `validate`
/ `decide`:

1. `<repo>/.agents/bin/sddkit-state.mjs` if it exists and is executable (`<repo>` = the main checkout: the parent of
   `git rev-parse --path-format=absolute --git-common-dir`, so a linked worktree resolves the same install)
2. `$HOME/.agents/bin/sddkit-state.mjs` if it exists and is executable

The `.agents/` root that holds the resolved `sddkit-state` also holds the code-review checklists — never mix roots:
`<root>/.agents/sddkit/checklists/review-<area>.md` for `contract`, `health`, and `design`. The resolved root's scope
(`<repo>` or `$HOME`) is also where Orca agent files come from. Always hand paths out as absolute.

Never edit `state.yaml` or `journal.ndjson` directly.

`decide <slug> --event <event> --yaml '...'` prints one line. It does not read `state.yaml`; every key must be in the
YAML, and a missing or malformed key fails closed. Events:

- `skip-design-critique` → `skip: true|false`. Keys: `onlyViableApproach`, `playwrightFallback`, `constitutionBlocker`
  (booleans), `humanDecisions`, `openQuestions`, `oracles` (YAML lists). Omit no key.
- `batch-journeys` → `batch: true|false`. Keys: `oracles` (YAML list, one per journey), `playwrightAdd` (boolean).
- `qa-route` → `route: impl|spec|mixed`. Key: `findings` — this cycle's QA findings (`{category}` rows or category
  strings). Empty or unknown category → `spec`.

## Delegation

Invoke specialists by catalog name (`sddkit-design`, `sddkit-design-reviewer`, `sddkit-implementer`,
`sddkit-code-reviewer`, `sddkit-qa`, `sddkit-docs-writer`). Do not do their work yourself. Wait for each reply before
the next stage — except the two parallel steps: step 6 runs `sddkit-code-reviewer` three times, one per `area`; step 9
runs `sddkit-docs-writer` and `sddkit-qa`.

- **Cursor:** use the Task / subagent tool. Match `.cursor/agents/<name>.md` by `name`. Never background a specialist;
  steps 6 and 9 issue all their Task calls in one message.
- **Claude Code:** use the Agent tool (Task on Claude Code before v2.1.63). Match `.claude/agents/<name>.md`. Steps 6
  and 9 issue all their Agent calls in one message.
- **Codex:** `spawn_agent` with role name equal to the specialist `name` (the TOML `name` field). Steps 6 and 9 spawn
  all their agents, then wait on all.
- **OpenCode:** delegate to the named subagent. Parallel steps run in turn: step 6 areas contract → health → design;
  step 9 `sddkit-docs-writer`, then `sddkit-qa`.
- **Orca** (`tools.orchestrator: orca`, any host): dispatch per **Orca dispatch** below instead of the host tool.

### Continue vs new

A specialist you **continue** keeps its prior context, so it skips re-reading the brief and the host reuses its prompt
cache. Continue only these:

- `sddkit-implementer` — a counted targeted-test failure, the opinion-gate answer, the empty-diff or no-test correction,
  a verify-fix retry, the step 6 fix round, and the step 6.5 dispute apply round. Continue the implementer that wrote
  the code being fixed.
- `sddkit-design` — the critique re-delegation (step 3) and design-gate edits (step 4).

Everything else gets a **new** specialist: the first delegation of every stage and slice, the escalation re-derive (it
must not trust the prior attempt), review iteration 2 (an independent pass), and every reviewer, QA, and docs-writer
delegation.

A continue message carries only what changed — failing command names + error lines, the findings, or the human's
decision — never the brief again. Hold handles in the conversation only, never in state. No live handle (a resume, a new
session), or the continue call fails → delegate a new specialist with the full brief; that is always correct.

- **Claude Code:** `SendMessage` with `to` set to the agent ID from the Agent result.
- **Cursor:** resume the subagent by the agent ID its Task call returned.
- **Codex:** `send_input` to the spawned agent (`resume_agent` first if it was closed), then wait on it.
- **OpenCode:** pass the prior call's `task_id` to the task tool.
- **Orca:** reuse the worker's terminal (see **Orca dispatch → Continue**).

## Orca dispatch

Applies only when state has `tools.orchestrator: orca`; otherwise skip it. Then read
[references/orca.md](references/orca.md) before the first dispatch, resume, or close.


## Host tools

Commands here name `gh` because GitHub is the default. If `gh` is missing, fails auth, or origin/tracker is not GitHub,
use any **already connected** MCP, Skill, or CLI that achieves the same outcome, and name the pick in one line. Do not
install tools. Do not invent APIs, close/merge keywords, or comment URLs. Probe a substitute once, before its first use,
and reuse that pick. Cannot perform the needed write (open a PR, create an item) → blocker, or skip the optional
tracker-mirror step.

## Goal

Carry one feature from request to done on its own branch, ending in a review-ready, unmerged PR with the QA report
posted as a PR comment — human-in-the-loop at the design gate, resumable from on-disk state. The PR opens as a draft;
you mark it ready (step 10) once docs-sync and QA are both done. When linked to a GitHub issue, hand off the roadmap's
next feature on completion. Other trackers skip handoff.

## State discipline

- `sddkit-state init <slug>` scaffolds `docs/feats/<slug>/` + canonical state.
- `sddkit-state patch <slug> --yaml '...'` merges, validates, journals. Call after every stage transition, gate,
  slice-phase change, artifact, or blocker.
- **Patch `stage` at the top of every step.** Resume locates itself from `stage`/`pending_gate`/`completed`; a step that
  runs without patching its stage replays on resume.
- **Lists replace, they do not append.** To add to `completed`, `completed_slices`, or `review.deferred_findings`, read
  the current value (`sddkit-state show <slug>`) and patch the **full new array**. `completed` holds stage names plus
  the markers `design_critique` and `docs_sync`.
- **Loop counters live in state, never in memory**: `review.iterations`, `green_attempts`, `qa.cycles`, `escalation`.
  Read them back on resume rather than assuming zero.
- Subagents return YAML reply blocks and cannot write state. **Translate every reply into a patch — never pass one
  through verbatim** (mapping below).
- **State files are never reverted.** `docs/feats/<slug>/state.yaml` and `journal.ndjson` are modified between commits.
  Revert other files one path at a time — `git checkout HEAD -- <path>` for tracked files, `rm -- <path>` for untracked
  ones — never `git checkout -- .`. Before `git reset --hard HEAD` (step 5 escalation), `sddkit-state show` first and
  re-patch what the reset discards.
- Durability: every commit you make stages `state.yaml` and `journal.ndjson` alongside that commit's own files. Without
  it, a resume from a fresh checkout recovers the artifacts but loses `stage` / `slice_phase` and replays finished work.
  Once `pr.url` is set, follow every commit with `git push` (never force, never into `main`/`master`) — except during
  step 9, where pushes wait until QA has replied.

## Resume

On "resume/continue", read the feature with the newest `updated`, `sddkit-state show <slug>` (it prints normalized
state, so features started on an earlier pipeline version resume too), and continue from the first matching rule. Trust
on-disk artifacts — never restart completed stages.

- `pending_gate: design` → re-present the design gate (step 4) and wait.
- `pending_gate: opinion` → an `sddkit-implementer` opinion gate is unanswered; the question is in `blockers`. Put it
  back to the human rather than re-running implementation into the same fork.
- `pending_gate: dispute` → a review dispute is open (step 6.5); entries are in `blockers`. Some still unruled →
  re-present only those and wait. All ruled → carry out step 6.5's outcomes now.
- `stage: design` → `design` not in `completed`: step 2. `design` in `completed`, `design_critique` not: step 3. Both:
  step 4. `implementation` in `completed` means this is a design delta (from step 6.4 or step 9) — on approval, run the
  delta reset (step 9), not a first-pass step 5.
- `stage: implementation` with a non-empty `slice_phase` → jump to that phase of step 5 for `current_slice` (split on
  `,` for a batched slice). Do **not** zero `escalation` / `green_attempts` or reset `slice_phase`.
- `stage: review` → first drop `blockers` entries starting `review checklists missing` or `review blocked` (step 6
  re-checks them). Then:
  - `review.fix_pending: true` → a fix round was interrupted before its commit: revert uncommitted edits (step 6.2
    rules), then rerun that fix round (step 6.4) from `review.findings` with a new `sddkit-implementer` and the journey
    briefs.
  - Otherwise revert stray edits per step 6.2 and rerun step 6 from the top — all three review areas — **without**
    incrementing `review.iterations` (0 → 1 still applies): the interrupted pass is redone, not counted twice.
- `stage: qa` → run whichever of `docs_sync` / `qa` is missing from `completed` (step 9); both present → step 10.
- Any other `stage` → that step.

## Workflow

1. **initialize** — preflight before anything else: confirm a git repo, `gh` on PATH, `gh auth status` succeeds, and the
   remote resolves (`git remote get-url origin`, `gh repo view --json nameWithOwner,defaultBranchRef`). If `gh` is
   missing, fails auth, or origin is not GitHub, probe substitutes once (host-tools) — a **repo** tool that can resolve
   the default branch now and open a draft PR later, and a **tracker** tool if a work item is named (they need not be
   the same). Name each pick in one line. Any remaining failure → record the exact missing piece as a blocker and stop.

   `AGENTS.md` must exist and name the install, dev/run, build, test, lint, and typecheck commands (`n/a` counts) —
   targeted tests, verify, and QA run exactly those. Missing → stop and tell the human to run `/sddkit-setup-docs`
   themselves, then re-invoke the pipeline. That skill is user-invoked only; never write `AGENTS.md` yourself.

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
   `sddkit-state show <slug>`, and jump to where **Resume** places it. Read `tools.repo` and `tools.tracker` from that
   show; either missing or empty → blocker, stop (do not guess `gh`, do not re-probe). `tools.orchestrator: orca` →
   re-run `sddkit-state probe orchestrator` and patch `orca.pane` (handles change per session); a `native` result →
   patch `tools.orchestrator: native` and journal the reason. Never flip `native` to `orca` mid-feature. Do not run
   `init` — it refuses to clobber an existing state file and aborts the run. Announce what you're resuming (slug, stage)
   in one line and continue.

   **Triage floor**, fresh runs only — skip entirely on resume, and skip when the invocation names a GitHub issue or
   another tracker's work item (its Acceptance criteria already scope the pipeline work). Classify the request: does it
   change or add observable behavior? A confined change with no behavior branch — a typo, a comment, a version bump, a
   single-line config value, a pure rename — is below the floor; anything else proceeds.
   - A human is there to answer → state the classification and that the full pipeline (design, journey-oracle
     implementation, review, verify, PR, docs-sync, QA) is more than the change needs; ask whether to run it anyway or
     leave this as a direct edit outside the pipeline. Wait for the answer before scaffolding state. Declined → stop;
     the human handles it themselves.
   - Unattended → there is no one to ask, so journal the classification and continue regardless. An unattended run never
     shrinks its own scope.

   Fresh run only: state the resolved repo (`nameWithOwner`) and base branch in one line before scaffolding. The run
   stops at the design gate; nothing auto-approves it, so a run with nobody there parks there.

   Then `sddkit-state init <slug>`, and patch `branch` plus `tools: {repo, tracker}` — always write both, even when both
   are `gh`. Run `sddkit-state probe orchestrator` once and patch `tools.orchestrator` plus `orca: {cli, pane}` from its
   stdout; name the pick and its `reason` in one line. Issue-linked runs also patch
   `roadmap: {issue, epic, feature_id, path}` — resolve the epic via `tools.tracker` (the `Epic:`-titled issue whose
   task list references `#<n>`); no such issue → `epic: 0`, which disables handoff (step 11), so never guess one. `path`
   is best-effort from `docs/product/*/roadmap.md`, `""` if no match, never block on it. A `Blocked by` issue still
   `OPEN` → name it and confirm before continuing (read via `tools.tracker`); unattended, journal it and proceed.
   (`Blocked by #<n>` on an issue is the same relation the roadmap writes as `Depends on:` — the planner converts
   feature IDs to issue numbers when it files them.) Other tracker: patch `feature_id` and `path` only; leave
   `issue`/`epic` at `0`. No issue named → `roadmap` stays zeroed.

2. **design** — `stage: design`. Delegate `sddkit-design` with the **original request verbatim** (the issue title + body
   for issue-linked runs, otherwise the invocation's own words — nothing on disk carries it). Patch `artifacts.spec`,
   `artifacts.contracts`, `artifacts.plan` from its reply; add `design` to `completed`.

3. **design critique** — `stage: design`. Run `sddkit-state decide <slug> --event skip-design-critique --yaml` with
   values from the design **reply**: `onlyViableApproach` (`recommended` is `only viable approach` or a single
   candidate), `playwrightFallback`, `constitutionBlocker` (true if `blockers` names a constitution conflict),
   `humanDecisions`, `openQuestions`, and `oracles` (every journey's `oracle`). Omit no key. Follow stdout:
   - `skip: true` → journal the skip.
   - `skip: false` → delegate `sddkit-design-reviewer` with the original request verbatim. It fixes what it can in
     place. Unresolved `blocker|major` findings → continue `sddkit-design` once with those findings verbatim.

   Add `design_critique` to `completed`.

4. **⏸ design gate** — `stage: design_gate`, `pending_gate: design`. Present concisely: spec summary, contracts (`@S<n>`
   list), assumptions, open questions, approaches considered + recommendation, Test strategy journeys (including any
   Playwright add), Implementation waypoints, and the design reviewer's `changes` and remaining findings. Stop and wait.
   The gate is never skipped.
   - Approved (the recommended approach, or no objection stated): `pending_gate: ""`, commit spec + contracts + plan
     (Conventional Commit); patch `review.base` to that commit's SHA and `review.findings: []`; if `pr.url` is set,
     `git push`. Continue to step 5 (a design delta — from step 6.4 or step 9 — continues to its reset in step 9).
     Approving the design approves a named Playwright add — no second ask.
   - Edits requested, or a different listed approach picked → continue `sddkit-design` naming the change, then
     re-present.

5. **implementation** — `stage: implementation`. Read `plan.md`'s Test strategy: parse the fenced `journeys:` YAML block
   (at most 3). If that block is missing, parse headings `J1` / `J2` / `J3` and each heading's path, command, `oracle`,
   and `@S<n>` — never collapse a multi-journey section to J1. For each journey build **one journey brief**: path,
   command, `oracle` kind, `@S<n>` coverage, Playwright add if any, waypoints (`file:symbol`, `reading:`, done-when),
   and the `@S<n>` scenario text from `contracts/*.feature`.

   Run `sddkit-state decide <slug> --event batch-journeys --yaml` with `oracles` (one per journey, in order) and
   `playwrightAdd`. `batch: true` → one slice holding every journey: one delegation carries every brief, and
   `current_slice` is the ids joined by `,` (`J1,J2`). `batch: false` → one slice per journey, in Test strategy order.
   - **Start a slice** when `slice_phase` is empty and its journeys are not in `completed_slices`: patch
     `current_slice`, `slice_phase: green`, `green_attempts: 0`. Zero `escalation` only when starting the first slice of
     a first-pass implementation or of a QA design-delta restart.
   - **Track new files.** After every `sddkit-implementer` reply, in any step (5, the 6.4 fix round, the 6.5 apply
     round, 7), run `git add --intent-to-add -- <files_changed>`. An untracked file is invisible to `git diff HEAD` and
     survives `git reset --hard`.
   - `slice_phase: green` → delegate a new `sddkit-implementer` with the slice's brief(s). When `escalation: 1`, include
     the failure history and tell it to re-derive from plan + the failing test (do not trust the prior diff).
     - Opinion gate raised → patch `pending_gate: opinion`, append `opinion gate (impl): <question>` to `blockers`,
       pause. On the answer, clear `pending_gate` and drop that blocker, then continue it with the decision.
     - `status: blocked` → patch its `blockers` and pause; never advance.
     - `status: done` with `files_changed: []` is a no-op success **only** when every planned test file is already in
       the tree; on first arrival it is always wrong — continue it once stating that no test was written, then record a
       blocker if it repeats.
     - `status: green|done` → patch `slice_phase: targeted_test`.
   - `slice_phase: targeted_test` → run `AGENTS.md` typecheck then lint when not `n/a` (failures in files this slice
     touched count; pre-existing failures in untouched files do not), then every journey command in the slice.
     - Pass → **commit**: `git diff HEAD` must be non-empty (an empty diff is not a pass — continue it once with that
       fact, then blocker and pause). Conventional Commit of the slice's files plus state. Read `completed_slices` and
       patch the full array plus each journey id in the slice. Clear `current_slice` / `slice_phase`. If `pr.url` is
       set, `git push`. Slices remain → start the next (do not zero `escalation`). All done → add `implementation` to
       `completed`, continue to step 6.
     - Counted failure → patch `green_attempts` +1 and continue `sddkit-implementer` with only the failing command
       names + first error lines (≤40 lines), never the full raw output, and `slice_phase: green`.
     - **`green_attempts` reaching 2 with `escalation: 0` → clean-tree escalation:**
       1. `sddkit-state show <slug>` and keep `current_slice`.
       2. `git reset --hard HEAD` — HEAD is this slice's base commit (the design commit for the first slice, else the
          previous slice commit). Never stash or commit the failed tree onto the feature branch.
       3. One patch: `current_slice` (kept), `slice_phase: green`, `green_attempts: 0`, `escalation: 1`.
       4. If `git worktree add` succeeds, add two worktrees at that SHA and run the `AGENTS.md` install command in each.
          Delegate a new `sddkit-implementer` in each, one after the other, with the escalation brief plus the
          worktree's absolute path as its working directory; run the slice's journey commands in each; copy back the
          green tree with the smaller `git diff --stat`; remove the worktrees. Worktrees unavailable → one implementer
          pass on the reset tree.
       5. Continue at `slice_phase: targeted_test`. A failure there while `escalation` is 1 → record blockers and pause.

6. **review** — `stage: review`, once per implementation pass. Read `review.iterations`, patch it +1 (except on Resume),
   and send that number as `iteration`. `git status --porcelain` must list only `state.yaml` and `journal.ndjson`;
   anything else → blocker, pause. Resolve the three checklist paths per the state CLI rule — the same `.agents/` root
   as your `sddkit-state` — and `test -f` each; any missing → blocker
   `review checklists missing at <dir> — re-run the sddkit installer`, pause. Then delegate **in parallel** (see
   Delegation) three new `sddkit-code-reviewer` runs, one per `area` — `contract`, `health`, `design` (never continued —
   each pass is independent) — each with: its `area`, its `checklist` as an **absolute path**, base `review.base`, the
   diff command `git diff <review.base> -- . ':(exclude)docs/feats/<slug>'`, every journey brief, and on iteration 2:
   only its own records from `review.findings` (ID prefix `C`, `H`, or `D`; rebuttals included), the fix commit SHA, and
   the highest id used for its prefix across `review.findings` and `review.deferred_findings`. Wait for all three
   replies, then:
   1. **Collect.** `review_status: blocked` → blocker `review blocked (<area>): <notes>`, pause (a re-delegate cannot
      fix a bad checklist path). A missing or unparsable reply, or an `area` echo that differs from the area you sent →
      re-delegate that run once (new); still wrong → blocker, pause. Never merge with an area missing — a missing area
      is not a clean one.
   2. **Stray edits.** Reviewers are report-only. Any path in `git diff --name-only HEAD` or
      `git ls-files --others --exclude-standard` other than `state.yaml` and `journal.ndjson` → revert it and journal
      `reviewer edit reverted: <path>`.
   3. **Merge** the three `findings` lists into one: drop a record only when another has the same `file`, `line`, and
      `category` **and** its `summary` describes the same defect — keep the higher severity (tie: the first area in
      contract, health, design order) and journal `duplicate <dropped id> → <kept id>`. Different defects on one line
      stay as separate records; sort `blocker`, `major`, `minor`. Patch `review.status`: `findings` when any record
      survives, else `clean`. Commit state (Conventional Commit); if `pr.url` is set, `git push`. Steps 6.4–6.6 act on
      this merged list only.
   4. **Route.** On iteration ≥ 2, **before patching anything**, write tech debt from the stored prior
      `review.findings`: each record whose `fix` holds `Rebuttal: 4:` or `Rebuttal: 5:` and that this pass did **not**
      re-raise → append to `review.deferred_findings` (read + full array; skip an id already there): `id: <orig id>-td`,
      `severity: minor`, the original `category`, `file`/`line` of the first site the rebuttal names, the original
      `summary`, and `fix: Tech debt: <Pattern> — migrate <rebutted sites> to <symbol>; reason: untested | over cap`
      (pattern and symbol from the original `fix`). Then:
      - Merged `minor` findings → append to `review.deferred_findings` (read + full array).
      - Any reviewer's `notes` naming a spec or plan gap → design delta: journal the gap, then step 9's `route: spec`
        sub-steps 1–2 with the gap as the finding, and after the reset continue at step 5 (then 6, 7, onward).
      - `blocker|major` findings → patch `review.findings` (full array), then:
        - `review.iterations` is 1 → fix round: patch `review.fix_pending: true`, continue `sddkit-implementer` with the
          findings verbatim (no new oracle) and handle its reply as in step 5 (opinion gate, `blocked`, and
          `files_changed: []` — a failed pass here: continue it once stating that, then blocker). Run typecheck, lint,
          and every journey command (a failure continues it with the error lines; a second failure → blockers, pause).
          Before committing, one patch: append ` Rebuttal: <reason>` to each rebutted finding's `fix` in
          `review.findings` (full array), `review.iterations: 2`, `review.fix_pending: false`. Commit, then repeat step
          6 **without** incrementing (iteration 2, scoped to the prior findings plus the fix commit).
        - `review.iterations` ≥ 2 → step 6.5 for every remaining `blocker|major`, re-raised or not.
   5. **Dispute** — only when step 6.4 or Resume sends you here. Patch `pending_gate: dispute` and append
      `dispute (review) <id>: <summary> — <fix>` to `blockers` per remaining `blocker|major` (a re-raised `fix` carries
      both arguments); on Resume they are already there — append nothing. Ask the human to rule on each: **apply**,
      **defer**, or **drop**. Record each ruling as it arrives by rewriting its blocker to end
      `— ruled: apply|defer|drop` (read + full array), so a resume never asks twice. Once every entry is ruled:
      - **defer** → append to `review.deferred_findings` as `minor`, id `<id>-td` (skip an id already there); a design
        finding gets the tech-debt `fix` format above, any other keeps its `fix` without the `Tech debt:` prefix.
      - **apply** → all applied findings in one round: continue `sddkit-implementer` (no live handle → a new one with
        the journey briefs) with those findings and the human's ruling as authority — rebuttals are not accepted under a
        ruling. Handle its reply as in a fix round; run the sensors (second failure → blockers, pause), commit. No
        re-review.
      - Then clear `pending_gate`, drop the dispute blockers, and go to step 6.6.
   6. No `blocker|major` left → patch `review.findings: []`, add `review` to `completed`, continue to step 7.

7. **verify** — `stage: verify`. Run build/test/lint/typecheck commands from `AGENTS.md`. Patch `verification.status`
   (`pass|fail`) and `verification.commands` as one `"<command> — pass|fail|n/a"` string per command (a flat string
   list; genuinely absent commands are `n/a`). Add `verify` to `completed` once the run is green.

   On failure, delegate `sddkit-implementer` (continue it on a retry of the same verify-fix) with a verify-fix brief:
   `current_slice: verify-fix-<n>` (`<n>` = 1, 2, … within this verify pass), `slice_phase: green`. The targeted command
   is the failing verify command; **no** `@S<n>` scenarios — no new acceptance test. Do not touch `escalation`; a local
   `green_attempts` caps at 2, then blockers. A `status: green` reply means that command is clean; `status: blocked` →
   patch its `blockers` and pause. Commit the verify-fix files plus state; if `pr.url` is set, `git push`. Clear
   `current_slice` / `slice_phase`, then re-verify.

8. **pr** — `stage: pr`. `git push -u origin <branch>`, then open a draft PR with `tools.repo` (command
   `gh pr create --draft` when that tool is `gh`) against the resolved base branch; patch `pr.url`. GitHub issue-linked
   → `Closes #<n>` in the body (GitLab too). A tracker that is not the git host → its native ref as `Work item: <ref>`,
   no invented keyword, and tell the human to close it. Failure → blocker, stop. Add `pr` to `completed`.

9. **docs-sync ∥ qa** — `stage: qa`. Delegate both in parallel (see Delegation):
   - `sddkit-docs-writer` with the **diff base SHA** (`git merge-base <base> HEAD`, where `<base>` is the branch
     resolved in step 1 — it cannot run that itself) plus `spec.md`, `plan.md`, and the contracts. It writes the owning
     domain's README, any other domain README this feature made wrong, `AGENTS.md`, and `docs/ARCHITECTURE.md`.
   - `sddkit-qa` with the PR URL, `tools.repo`, `verification.status` + `verification.commands`, and each journey
     command from the Test strategy (leftover `@S<n>` inherit their result from the journey that claims them;
     `sddkit-qa` cannot read state).

   **Docs reply.** Patch `artifacts.docs` from its `docs` list (paths only). Both `docs` and `unchanged` empty → it
   wrote and confirmed nothing: re-delegate once stating that, then record a blocker. Commit the docs plus state; push
   only after QA has replied. Add `docs_sync` to `completed`. `docs/feats/<slug>/` and `docs/CONSTITUTION.md` stay yours
   — the latter changes only when the feature established a durable principle.

   **QA reply.** Translate into a `qa.*` patch (its `journeys` key is e2e paths, not Test strategy `J*`).
   - `clean` → patch `qa.report_path`; add `qa` to `completed`.
   - `blocked` → blockers, pause.
   - `findings` with `qa.cycles` already 2 → record the findings as blockers and pause. Otherwise patch `qa.cycles` +1,
     then run `sddkit-state decide <slug> --event qa-route --yaml` with **this cycle's** QA reply `findings`. Omit no
     key; never reuse a canned example. QA findings are not always specify — follow stdout:
     - `route: impl` → verify-fix brief (step 7 rules), re-verify, then re-delegate `sddkit-qa` scoped to only the
       previously failed e2e paths.
     - `route: spec` or `route: mixed` → design delta:
       1. `stage: design`. Delegate `sddkit-design` with the spec/plan findings (drop impl findings — the re-QA pass
          re-emits any that still fail).
       2. Design gate (step 4), always presented. On approval, the delta reset, as one patch: remove `implementation`,
          `review`, `verify`, `docs_sync` from `completed` (full array); clear `completed_slices`, `current_slice`,
          `slice_phase`, `review.findings`; `review.iterations: 0`, `review.fix_pending: false`, `green_attempts: 0`,
          `escalation: 0`; `review.base` = the delta's design commit.
       3. Steps 5 → 6 → 7, then this step again with QA scoped to only the previously failed e2e paths.

   Both `docs_sync` and `qa` in `completed` → step 10.

10. **finalize PR** — `stage: qa`.
    1. Read the `## Configuration` section of each path in `artifacts.docs`. Anything beyond `None.` goes into the PR
       body under `## Setup required`, naming the README it came from — replace an existing section, never append a
       second. Use `tools.repo` (`gh pr edit <url> --body-file …` when `gh`).
    2. `git push`.
    3. Mark the PR ready (`gh pr ready <url>` when `gh`; a host with no draft concept skips this). Patch
       `qa.pr_ready: true`.
    4. `stage: complete`. Present a short summary, the QA comment URL, and the `## Setup required` lines if any — the
       human has to perform those before the feature works anywhere but their machine.
    5. `review.deferred_findings` holds records whose `fix` starts `Tech debt:` → suggest the human file a tech-debt
       ticket per pattern, with a paste-ready title (`Tech debt: <Pattern> for <symbol>`) and body (sites, reason, the
       `fix` text). Never file it yourself.

11. **handoff** — GitHub-only (`tools.repo` and `tools.tracker` are `gh` or a GitHub MCP, and `roadmap.issue` ≠ `0`).
    Empty is not GitHub. Otherwise skip: if `roadmap.path` is set, point at the next feature in that roadmap file; stop.
    Also skip if `roadmap.epic` is `0`. Otherwise:

    Read [references/handoff.md](references/handoff.md) and follow it.


Stage names: `initialized | design | design_gate | implementation | review | verify | pr | qa | complete`. `completed`
holds these names plus the markers `design_critique` and `docs_sync` — nothing else.

## Findings routing

Findings arrive as structured records `{id, file, line, severity, category, summary, fix}`. Route by `category`:
`spec|plan` → `sddkit-design`; `bug|quality|perf|test|contract` → `sddkit-implementer`. Pass records verbatim to the
fixing agent. QA findings route through `decide --event qa-route` (step 9). Never fix anything yourself.

`file` and `line` are **required** by the state schema — a record missing either makes the whole patch fail validation.
Findings with no natural source location (a failed QA e2e path, a missing deployment step) anchor to the `@S<n>`
scenario they violate: `file` is the contract path, `line` the scenario's line. Nothing to anchor to at all →
`file: ""`, `line: 0`. Fill these in yourself if a subagent omits them; never drop the finding to make the patch
validate.

## Applying subagent replies

Reply keys are not state keys. Read [references/reply-mapping.md](references/reply-mapping.md) before the first
patch — translate every reply; never pass one through verbatim.


## Restrictions

- Advance only when a stage produced a concrete artifact or a sensor changed state. No progress → escalate with the
  specific blocker; don't blindly retry.
- Done signal: implementation committed, review clean, verify green, docs synced, QA clean, PR opened and marked ready
  for review. Don't declare success otherwise.
- Honor bounded loops — `review.iterations` 2 per implementation pass, `qa.cycles` 2, `green_attempts` 2 per slice,
  `escalation` 1 per implementation pass (green loop only; reset to 0 on a QA design-delta restart). On exhaustion,
  patch state and pause for the human rather than thrashing.
- Model/provider error → retry that delegation once, then pause with a blocker.
- Never push into `main`/`master`. **Never merge a PR — not yours, not any other, not even if asked.** Your output is a
  PR marked ready for review; merging belongs to the human. Nothing in the permission config stops you, so this rule is
  the only guard.
- Never touch another feature's `docs/feats/<other>/`.
- Cite `file:line`; never paste >20 lines; summaries, not contents.

## Done when

`stage: complete` — with `pr.url` recorded, `qa.pr_ready: true` (when the host has drafts), and `qa.pr_comment_url` when
the tool returned one; GitHub-issue-linked runs additionally print the handoff.
## Tool restrictions (Cursor)
- Never edit: docs/feats/**/state.yaml, **/journal.ndjson, .opencode/**.

