# sddkit

A thin harness for **spec-driven development (SDD)** on [OpenCode](https://opencode.ai), [Cursor](https://cursor.com),
[Claude Code](https://code.claude.com), and [Codex](https://developers.openai.com/codex): one approved design (spec,
tagged acceptance contracts `@S<n>`, and plan), cheapest-oracle journeys (at most three, public-boundary or golden
first) with the consuming repo's test stack, a multi-agent pipeline with a design reviewer that fixes what it finds and
a code reviewer run once per area in parallel, a one-rung clean-tree escalation loop, and a file-based **`state.yaml`
checkpoint** written only through `.agents/bin/sddkit-state.mjs`.

Prompts live once under `src/prompts/`; `pnpm run build` transpiles them into OpenCode, Cursor, Claude Code, Codex, and
shared skill formats under `dist/` (tracked so install does not need a client-side build).

## Layout

```text
src/
  catalog.yaml           host × profile models + per-agent adapters
  prompts/agents/        canonical agent bodies (no app frontmatter)
  prompts/commands/      sddkit-setup-docs
  prompts/fragments/     shared includes
  state/                 sddkit-state CLI (schema, merge, io, transitions, next, review-merge)
tools/
  install.ts             installer source → dist/install.js (npx + bunx)
  transpile.ts           → dist/{opencode,cursor,claude,codex} + dist/agents/skills
  build-cli.ts           → dist/bin/sddkit-state.mjs
  build-install.ts       bundle install.ts for Node
  gen-manifest.ts        → manifest.txt
  check.ts               hygiene
evals/<skill>/           prompt-behavior and trigger evals (skill-creator format)
dist/                    generated install payload (tracked; never hand-edit)
  install.js             npx/bunx CLI (not copied into consuming repos)
```

State lives in the **consuming repo**:

```text
AGENTS.md
docs/ARCHITECTURE.md
docs/CONSTITUTION.md
docs/feats/<feature>/
  state.yaml             checkpoint — sole writer: .agents/bin/sddkit-state.mjs (via conductor)
  journal.ndjson         append-only audit trail
  spec.md
  contracts/*.feature
  plan.md
docs/product/<slug>/
  roadmap.md             optional, written by sddkit-epic
src/<domain>/README.md   domain doc, written by sddkit-docs-writer at docs-sync
docs/domains/<domain>.md same, for a domain too cross-cutting to own a directory
.agents/bin/sddkit-state.mjs    installed by npx/bunx sddkit
.agents/skills/          sddkit, sddkit-epic + sddkit-setup-docs
.opencode/               OpenCode agents + opencode.jsonc
.cursor/agents/          Cursor specialists
.claude/agents/          Claude Code specialists
.claude/skills/          copy of shared skills (Claude does not load .agents/skills/)
.codex/agents/           Codex specialists
```

## Models

Models live in `src/catalog.yaml` as a host × profile matrix. Agents declare a `profile`; emitters format the host's
entry. Skills (`sddkit`, `sddkit-epic`) inherit the session model — run `/sddkit` on Grok 4.6 Extra High, Claude sonnet,
or Codex terra.

| profile         | OpenCode                      | Cursor                         | Claude                  | Codex                  |
| --------------- | ----------------------------- | ------------------------------ | ----------------------- | ---------------------- |
| `conduct`       | `opencode-go/qwen3.7-plus`    | `inherit`                      | `inherit`               | `inherit`              |
| `think`         | `openai/gpt-5.6-sol`          | `grok-4.6[effort=xhigh]`       | `opus[effort=medium]`   | `gpt-5.6-terra[xhigh]` |
| `execute`       | `openai/gpt-5.6-luna`         | `grok-4.6[effort=high]`        | `sonnet[effort=high]`   | `gpt-5.6-terra[high]`  |
| `design-review` | `opencode-go/kimi-k3`         | `grok-4.6[effort=high]`        | `sonnet[effort=high]`   | `gpt-5.6-terra[high]`  |
| `code-review`   | `opencode-go/kimi-k2.7-code`  | `claude-sonnet-5[effort=high]` | `opus[effort=high]`     | `gpt-5.6-sol[high]`    |
| `validate`      | `opencode-go/deepseek-v4-pro` | `grok-4.6[effort=medium]`      | `sonnet[effort=medium]` | `gpt-5.6-terra[high]`  |
| `write`         | `opencode-go/kimi-k3`         | `grok-4.6[effort=medium]`      | `sonnet[effort=medium]` | `gpt-5.6-luna[medium]` |

| agent                    | profile         |
| ------------------------ | --------------- |
| `sddkit`                 | `conduct`       |
| `sddkit-design`          | `think`         |
| `sddkit-design-reviewer` | `design-review` |
| `sddkit-implementer`     | `execute`       |
| `sddkit-code-reviewer`   | `code-review`   |
| `sddkit-qa`              | `validate`      |
| `sddkit-docs-writer`     | `write`         |
| `sddkit-epic`            | `think`         |

Checked in CI against `src/catalog.yaml` and emitted frontmatter / Codex TOML.

### Orca (optional)

When [Orca](https://github.com/stablyai/orca) is running, the conductor dispatches each specialist as a supervised Orca
worker instead of the host's subagent, on any host. The CLI and model per profile come from `orchestrators.orca` in
`src/catalog.yaml`:

| specialist                                       | worker                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `sddkit-design`                                  | `claude --model opus --effort medium --permission-mode auto` |
| `sddkit-design-reviewer`, `sddkit-code-reviewer` | `claude --model sonnet --effort high --permission-mode auto` |
| `sddkit-implementer`                             | `cursor-agent --model grok-4.7-low --yolo`                   |
| `sddkit-qa`, `sddkit-docs-writer`                | `cursor-agent --model grok-4.7-high --yolo`                  |

At initialize the conductor runs `sddkit-state probe orchestrator`. All of these must hold, or it delegates natively as
before:

- `orca status --json` reports a ready runtime
- `claude` and `cursor-agent` are on `PATH`
- each routed specialist's agent file is installed (`.claude/agents/` and `.cursor/agents/`, in the repo or `$HOME`) —
  install both the Claude and Cursor hosts

If the conductor itself runs in an Orca terminal, each specialist opens in a split pane to its right, titled
`<specialist> · <stage>`, and the conductor closes it once the specialist settles (a specialist being continued keeps
its pane until the retry loop ends). Otherwise workers open as Orca tabs, closed the same way. The conductor launches
every worker itself, so workers skip approval prompts (Claude auto mode, Cursor `--yolo`) and an unattended run never
stalls on one. Briefs and replies pass through `.git/sddkit/<slug>/`, so they never land in the diff. Opt out with
`SDDKIT_ORCHESTRATOR=native`.

## Install

From the root of the consuming repository:

```bash
npx -y github:luisintosh/sddkit
bunx github:luisintosh/sddkit
```

`-y` skips npm’s “ok to install this package?” so the only prompts are the installer. Pin a tag with `#v1.3.0` on either
command.

On a TTY the installer asks for **scope** (this repo vs `$HOME`) and **hosts** (Cursor / Claude Code / Codex / OpenCode
— one, many, or all), then prints the file plan and asks to apply. Detected CLIs are pre-checked; you can still install
a host that is not on `PATH`. Non-interactive runs default to `project` + `all`. The payload is the `dist/` in the git
ref npx/bunx fetched — the installer never builds on the client.

Re-running is idempotent: unchanged files skip. The installer prints every create, update, overwrite, and delete, then
applies after confirmation on a TTY (`--yes`, `CI`, and non-TTY runs apply after printing the plan). Local edits are
overwritten — this toolkit repo is the version store. Removed upstream files are deleted when the target holds the
`.harness-manifest` a previous install wrote; otherwise delete stale `sddkit-*` agent files by hand.

Flags: `--dry-run`, `--doctor`, `--yes`.

Env (CI / scripts): `INSTALL_SCOPE=project|global`, `INSTALL_TARGET=all|cursor,claude,codex,opencode`. Global OpenCode
writes only `~/.config/opencode/agents/` — never `opencode.jsonc`. Claude skills are a **copy** of `.agents/skills/`.

After install, invoke `.agents/bin/sddkit-state.mjs` from the repo root. It is a Node ESM bundle; the `.mjs` extension
keeps that even when the consuming repo's `package.json` is CommonJS. Node 20+ is already required for `npx`. The
installer prints next steps: `/sddkit-setup-docs`, installing [`gh`](https://cli.github.com/) (required — the pipeline
verifies it at start). Another forge or tracker is fine if an MCP, Skill, or CLI for it is already connected. Optional
[rtk](https://github.com/rtk-ai/rtk) hint (never auto-installed).

### Setup Docs

```text
/sddkit-setup-docs
```

Creates `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONSTITUTION.md`, and `docs/feats/.gitkeep` if missing. `AGENTS.md`
must include install/dev/build/test/lint/typecheck (and a single-test-file command). It does **not** backfill domain
READMEs for existing code — `sddkit-docs-writer` creates each one as a feature touches that domain.

### Start a Feature

**OpenCode:** default agent is `sddkit` — type a feature request.

**Cursor / Claude / Codex:** run the `/sddkit` skill (or ask the Agent to follow the SDD skill) on your most capable
session model (Grok Extra High / opus / sol), then describe the feature.

`sddkit` verifies `gh` (or a connected substitute) + the target repo, creates `feat/<slug>`, scaffolds state with
`.agents/bin/sddkit-state.mjs init`, and runs the pipeline, stopping once at the design gate for review. Resume by
asking to continue — the conductor asks `sddkit-state next` where the feature stands.

Not for a confined, no-behavior-branch change — a typo, a comment, a version bump, a single-line config value, a pure
rename. A fresh run flags these and asks before scaffolding state; an unattended run, or one naming a GitHub issue,
always runs the full pipeline regardless.

Name a GitHub issue (`gh issue view` number or URL), or another tracker's work item if a substitute is connected, and
`sddkit` links to it: scope comes from its Acceptance criteria, the slug is derived from the issue title, and completion
prints a **handoff** when the tracker is GitHub — a paste-ready invocation for the roadmap's next feature, plus anything
this run learned that the next one needs.

### Plan a Product (optional)

**OpenCode:** Tab-switch to the `sddkit-epic` agent and describe the idea.

**Cursor:** run the `/sddkit-epic` skill (it inherits your session model — use your most capable one for this).

Explores the codebase to answer what it can before asking anything, refines the idea into a measurable goal, explores
candidate approaches, then writes an epic-level feature roadmap with dependency-derived parallel/sequential waves to
`docs/product/<slug>/roadmap.md`, and one work item per feature to `docs/product/<slug>/items/F<n>.md` — outcome title,
user story, context, optional proposed solution (mermaid), Given/When/Then acceptance criteria, out of scope, and
dependencies/risks/open questions — each reviewed by an adversarial product-owner subagent before you approve it. Offers
to commit it and to create GitHub issues (one epic + one per feature, wired with `Blocked by #N`). Standalone — doesn't
touch the SDD pipeline; each resulting feature is meant to be run through `sddkit` on its own. Ends by printing a
paste-ready invocation for the roadmap's first feature.

### Run a Roadmap

There's no separate orchestrator — one `sddkit` run per feature, chained by copy/paste. Run a feature by naming its
GitHub issue; when it completes, `sddkit` prints the next feature's invocation (skipped if that feature's blockers
haven't merged yet — merge the open PR first). Paste it into a fresh chat and continue. Each run starts with a clean
context; the handoff carries forward only what the next run actually needs.

## Pipeline

```
initialize → design (spec + contracts + plan) → design critique (fixes in place; skippable) → ⏸design gate
  → implementation (failing cheap oracle, then impl; two cheap journeys batched) → sensors → commit
  → review (contract ∥ health ∥ design, report-only) → verify → pr → docs-sync ∥ qa → finalize PR → complete
  → handoff
```

1. **Design.** `sddkit-design` writes `spec.md`, the `@S<n>` contracts, and `plan.md` in one session. It picks the
   cheapest sensor that can fail each observable `@S<n>` (public-boundary or golden before integration/e2e), groups
   scenarios into at most 3 journeys, and writes a fenced `journeys:` YAML block in `plan.md`. A committed Playwright
   oracle is planned only when the feature is UI-only; QA otherwise covers UI paths ad hoc with
   [agent-browser](https://github.com/vercel-labs/agent-browser), which must be installed (QA blocks with the install
   step if it is missing).
2. **Design critique.** `sddkit-design-reviewer` fixes unambiguous issues in the spec, contracts, and plan, and reports
   only what needs a human or a redesign. Skipped when `skip-design-critique` is true: one journey with a `boundary` or
   `golden` oracle, a single viable approach, no Playwright, no human decisions, no open questions, and no constitution
   blocker.
3. **Design gate.** The one human approval, never skipped.
4. **Implementation.** `sddkit-implementer` writes each journey's failing oracle and the implementation in one pass. Two
   `boundary`/`golden` journeys with no Playwright add go in one delegation (`batch-journeys`).
5. **Review.** `sddkit-code-reviewer` runs three times in parallel, one per area — contract (correctness, coverage,
   silent failure), health (blast radius, security, test quality, residue), and design (patterns, lightweight DDD, a
   repo-wide structural sweep). Each run reads only its area's checklist, installed at
   `.agents/sddkit/checklists/review-<area>.md` beside `.agents/bin/sddkit-state.mjs`; the conductor passes the absolute
   path. Reviewers are report-only: the conductor judges duplicates and `sddkit-state review-merge` writes one list, and
   `blocker`/`major` go to one implementer fix round and a second, delta-scoped review; what survives that goes to the
   human as a dispute (apply, defer, or drop). The implementer writes to the same checklists, so most issues never reach
   review.
6. **Verify, PR, docs-sync ∥ QA.** After verify, the draft PR opens; `sddkit-docs-writer` and `sddkit-qa` then run in
   parallel. The conductor adds `## Setup required` to the PR body and marks it ready once both are done.

**Escalation:** if a slice's targeted tests fail twice, `sddkit-state snapshot` saves state inside `.git`,
`git reset --hard` returns to the slice base, `sddkit-state transition --event escalate` restores the state, and
`sddkit-implementer` re-derives (optionally two worktrees in parallel; keep the smaller green diff). One rung; then
pause for a human.

**Retries continue the same specialist.** A targeted-test retry, a verify-fix retry, the review fix round, and design
edits after critique or the gate go back to the specialist that did the work, with its context intact, instead of a
fresh one: Claude Code `SendMessage`, Cursor resume by agent ID, Codex `send_input`, OpenCode `task_id`, and under Orca
the same worker terminal (`worker-start --terminal`), whose pane stays open until the loop ends. The provider's prompt
cache then covers everything the specialist already read. Escalation, review iteration 2, and every reviewer, QA, and
docs pass stay fresh. On Claude Code, `sddkit-design` and `sddkit-implementer` request a 1-hour cache
(`experimental.cacheTtl`, set by `claude.cache_ttl` in `src/catalog.yaml`; Claude Code v2.1.248+) so the cache outlives
the test runs and gate waits between those turns.

**QA:** findings route by category (`sddkit-state decide --event qa-route`) — impl-only to a verify-fix, spec/plan-only
to a design delta (always presents the design gate), mixed runs the design delta and drops stale impl findings for the
re-QA pass. A reviewer's spec or plan gap starts the same design delta; it keeps the review base, so the next review
still covers the code written before it.

**Docs:** `docs-sync` delegates to `sddkit-docs-writer`, which writes the touched domain's `README.md` — co-located with
the code, or `docs/domains/<domain>.md` when the domain is cross-cutting — to a fixed skeleton (purpose, how it works,
usage, configuration, gotchas), capped at 120 lines, current state only, never a changelog. Environment variables and
external service setup are grepped out of the feature's own diff and repeated in the PR body under `## Setup required`,
since that part is work only a human can do.

## State

`docs/feats/<feature>/state.yaml` is written only via:

```bash
.agents/bin/sddkit-state.mjs init <feature>
.agents/bin/sddkit-state.mjs patch <feature> --yaml 'stage: design'          # lists in --yaml replace
.agents/bin/sddkit-state.mjs patch <feature> --append 'completed: [design]'  # also --drop, --inc
.agents/bin/sddkit-state.mjs show <feature>
.agents/bin/sddkit-state.mjs validate <feature>
.agents/bin/sddkit-state.mjs next [<feature>]                                # where a resume continues
.agents/bin/sddkit-state.mjs transition <feature> --event start-slice --yaml 'slice: J1'
.agents/bin/sddkit-state.mjs snapshot <feature>                              # before escalation's git reset --hard
.agents/bin/sddkit-state.mjs review-merge <feature> --file replies.yaml
.agents/bin/sddkit-state.mjs decide <feature> --event qa-route --yaml 'findings: [{category: bug}]'
.agents/bin/sddkit-state.mjs probe orchestrator   # orca | native, see Models → Orca
.agents/bin/sddkit-state.mjs version              # protocol the conductor requires
```

Named transitions (`start-slice`, `escalate`, `slice-done`, `start-verify-fix`, `verify-fix-done`, `review-enter`,
`design-delta`, `design-revised`, `design-approved`) own the loop fields — slices, escalation, review iterations and
base, the design delta and its reset — and refuse when called out of order. The conductor applies subagent reply YAML
through `patch`. OpenCode also denies direct edits to `state.yaml` / `journal.ndjson`, both in each agent's permission
map and, for project installs, in `opencode.jsonc`.

## Editing prompts

1. Edit `src/prompts/` and/or `src/catalog.yaml`
2. `pnpm run build && pnpm run check && pnpm test`

## Notes

- No OpenCode plugin — state is the CLI only.
- Implementation runs in the current checkout. Escalation may add two temporary worktrees, keep the smaller green diff,
  then remove them.
- `sddkit` never merges its own PR — that's the human's call, every time. That rule lives in the prompts, not the
  permission config: `gh pr merge` is allowed at the config level, so branch protection is your hard backstop.
- OpenCode agent permission maps hold only narrow hard denies: `state.yaml` / `journal.ndjson` for every agent, frozen
  `docs/feats/**` inputs for the implementer, code reviewer, and docs writer, and git internals, host config, and
  git/tracker writes for the code reviewer. Everything else — what an agent may edit or run — is scoped by its prompt,
  as on Claude and Cursor, and by your own config. An agent's rules win over global ones only for the patterns they
  name; everything else falls through to your `opencode.json`.
- Project installs also write `.opencode/opencode.jsonc`, whose global map denies destructive commands (`rm -rf`, force
  push, `git reset --hard`, `sudo`, piping to a shell). A global install writes no `opencode.jsonc`, so those denies are
  absent there unless your own `~/.config/opencode/opencode.json` adds them.
- No permission is `ask`. An unattended `opencode run` has no responder for a bash/edit permission request, so a
  reachable `ask` would stall it indefinitely. Dangerous commands are hard denies instead — refused, so the agent
  adapts. `pnpm run check` enforces this; only `sddkit-epic`, which is interactive-only, is exempt.
