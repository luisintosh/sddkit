# opencode-harness-toolkit

A thin [opencode](https://opencode.ai) harness for **spec-driven development (SDD)**: an approved
spec, spec-derived acceptance contracts (tagged `@S<n>` for traceability), TDD using the consuming
repo's own test stack, a multi-agent pipeline with a self-correcting escalation ladder, and a
file-based **`state.yaml` checkpoint** with exactly one writer — all driven by a single primary
agent, `sdd`, that runs an autonomous-but-human-in-the-loop workflow and is resumable from on-disk
state.

## Layout

```text
opencode.jsonc
package.json          plugin runtime deps (yaml, zod, @opencode-ai/plugin) — installed to .opencode/
manifest.txt           sha256 manifest of every installable file, CI-verified
agents/
  sdd.md                primary — sequences stages, owns gates, routes findings, checkpoints state
  spec.md               writes spec.md + acceptance contracts/*.feature (@S<n> tagged), together
  architect.md           explores the codebase, writes plan.md (includes the Slices section)
  tester.md               red phase — failing tests from acceptance contracts (test-only edits)
  implementer.md          green phase — minimal impl to pass tests (no test edits)
  implementer-pro.md      hidden escalation rung — stronger model, invoked after 2 failed attempts
  reviewer.md              read-only reviewer — slice-diff review + pre-gate spec/plan critique
  qa.md                    validates the finished feature against spec/contracts
plugins/
  sdd-guard.ts           checkpoint + compact tools, guardrails, append-only journal (opencode plugin)
  sdd-guard.test.ts       bun test suite for the plugin's merge/validate/guard logic
scripts/
  gen-manifest.sh         regenerates manifest.txt
  check.mjs               CI hygiene checks (frontmatter schema, README drift, manifest freshness)
test/
  e2e-install.sh          Tier 1 — installer lifecycle, runs in CI, no network needed
  e2e-pipeline.sh         Tier 2 — one real (cheap) opencode run, manual, not wired into CI
  fixture-repo/           tiny Node project e2e-pipeline.sh installs the harness into
```

State lives in the **consuming repo's root**, owned by that repo:

```text
AGENTS.md                always-loaded project memory (install/dev/build/test/lint/typecheck commands)
docs/
  ARCHITECTURE.md        system design, module map, key decisions
  CONSTITUTION.md        governing principles (optional)
  feats/<feature>/
    state.yaml           the checkpoint — single writer (sdd, via the checkpoint tool), Zod-validated
    journal.ndjson       append-only audit trail of every checkpoint write
    spec.md
    contracts/*.feature  Given/When/Then scenarios tagged @S1, @S2, ...
    plan.md              includes the Slices section (slice ID, risk tier, scenarios, test command)
.codesight/
  wiki/                 codebase context map (index.md + topic articles) — see Codebase Context below
```

## Models

Each agent is pinned to a model chosen for its workload and cost, with a `steps` cap as thrash/budget
insurance. `implementer-pro` is a hidden escalation-only agent — `@sdd` invokes it, you never
delegate to it directly.

| agent | model | notes |
|---|---|---|
| `sdd` | `opencode-go/kimi-k2.7-code` | conductor — pure tool-calling/state management |
| `spec` | `opencode-go/glm-5.2` | low-volume, high-leverage reasoning and writing |
| `architect` | `opencode-go/glm-5.2` | best open coder + long context for codebase exploration |
| `tester` | `opencode-go/kimi-k2.7-code` | test-writing + run-loop heavy |
| `implementer` | `opencode-go/deepseek-v4-flash` | highest-iteration role; green phase has an oracle (failing tests) |
| `implementer-pro` | `opencode-go/deepseek-v4-pro` | hidden — escalation rung, same family as implementer |
| `reviewer` | `opencode-go/kimi-k2.7-code` | cross-provider vs. the implementer, for an independent perspective; also gives the final verdict on escalated slices |
| `qa` | `opencode-go/glm-5.2` | terminal/browser-driven validation workload |

This table is checked in CI (`scripts/check.mjs`) against each agent's frontmatter — it cannot drift
silently.

## Use

### Install

Run the installer from the root of the consuming repository:

```bash
curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | bash
```

This downloads `manifest.txt` for the resolved ref, fetches every file it lists into a scratch
directory, verifies each sha256, and only then installs into `.opencode/` — nothing is written unless
every file checks out. Re-running is safe and idempotent:

- unchanged files are left alone
- files that changed upstream are updated
- files you edited locally are backed up under `.opencode/.backup-<timestamp>/` before being replaced
- files removed upstream are pruned (backed up first if you'd modified them)

Options (environment variables):

- `VERSION=v0.2.0` — pin to a specific release tag (default: latest tag, falling back to `master`)
- `BRANCH=some-branch` — install from a branch instead of a tag
- `LOCAL_SOURCE=/path/to/checkout` — install from a local copy instead of downloading (CI/testing)
- `TARGET_DIR=/path` — install into a directory other than the current one
- `INSTALL_RTK=true` — opt-in: set up [`rtk`](https://github.com/rtk-ai/rtk) — run its own
  `rtk init --opencode` setup and configure its **global** config (`~/.config/rtk/config.toml`) to
  exclude `git diff`/`git show` from rewriting, so the SDD reviewer never sees a truncated diff. If
  `rtk` isn't on `PATH` and you're running this interactively on macOS with Homebrew installed, it
  offers to `brew install rtk` (y/N) first — skipped automatically, never prompted, under a piped
  `curl | bash` or any other non-interactive install. Off by default because it touches machine-wide
  state, not just this repo; existing `exclude_commands` entries are never overwritten — `--doctor`
  reports what's missing if you skip this.

Flags: `--dry-run` (show what would change without writing anything), `--doctor` (environment checks
only — this also runs automatically, warn-only, after a real install).

### Setup Docs

Run once in the consuming repo:

```text
/setup-docs
```

This creates the project AI working context: `AGENTS.md` (including a dev/run command, since `qa`
depends on it, and a single-test-file command, since the implementation slice loop depends on it),
`docs/ARCHITECTURE.md`, `docs/CONSTITUTION.md`, and `docs/feats/.gitkeep` if missing.

### Setup Context (optional)

Run once in the consuming repo, after `Node >= 18` is available:

```text
/setup-context
```

This runs [`codesight`](https://github.com/Houseofmvps/codesight) to generate `.codesight/wiki/` — a
committable, structured map of the codebase (routes, schema, hot files, topic articles). `@spec`,
`@architect`, and `@implementer` read `.codesight/wiki/index.md` first as an orientation hint before
falling back to Grep/Glob, and `@sdd` best-effort refreshes it at the plan stage and again at
docs-sync so the committed map stays current. See [Codebase Context](#codebase-context) below.

### Start a Feature

The default agent is `sdd` — start by typing a feature request:

```text
Add account export.
```

`sdd` asks once, in a single message, whether to create a new branch or continue on the current one,
whether to use GitHub integration (draft PR + QA report as a PR comment) or stay local (everything on
the feature branch, QA report in chat + on disk), and whether to run autonomously (no human gates,
pausing only on unresolvable blockers) or with human review at the spec and plan gates. It then
slugifies the feature, scaffolds `docs/feats/<slug>/state.yaml`, and runs the pipeline below. To
resume an interrupted or gated run, ask `sdd` to continue.

## Pipeline

```
initialize → specify (spec + contracts) → spec critique → ⏸spec gate
  → plan (incl. Slices) → plan critique → ⏸plan gate
  → implementation slices → verify → docs-sync → pr → qa → complete
```

`@architect` tags each slice in `plan.md`'s Slices section with a risk tier — `standard`
(behavior-changing, maps to an `@S<n>` scenario) or `low` (config/wiring/glue with no new behavior) —
visible to the human at the plan gate. Each implementation slice then runs one of two flows:

```
standard: red(@tester) → green(@implementer) → targeted test → review loop(@reviewer) → commit
low:                      green(@implementer) → targeted test → single review pass    → commit
```

A `blocker` finding on a `low`-risk slice upgrades it to the `standard` flow in place (re-run red +
the full review loop) — the safety valve if a slice was mis-tiered. `@sdd` builds one **slice
brief** (the slice's section from `plan.md`, `@S<n>` scenario text, targeted test command) per slice
and passes it to every delegation, instead of pointing each subagent back at the full spec/contracts/
plan artifacts.

In `mode: interactive`, both gates pause for human approval. In `mode: autonomous`, gates auto-approve
once their pre-gate critique is clean or addressed, and the pipeline runs through to completion or an
unresolvable blocker without stopping — an opinion gate raised by an implementer still pauses either
way, since it's a genuine design fork rather than a routine approval. The reviewer is read-only and
bounded (max 2 iterations per `standard` slice, max 2 QA-driven fix cycles); a `minor`-only verdict is
recorded as `deferred_findings` on the slice and the slice commits without a fix round; re-review
iterations after the first check only that prior findings were fixed plus the delta since, not the
full diff again. Before each gate, `@reviewer` also runs a one-shot artifact critique on the spec+
contracts or plan so the gate sees a pre-hardened draft.

**Escalation ladder**: if `@implementer` fails the slice's targeted tests twice, or a review loop
exhausts with unresolved `blocker`/`major` findings, `@sdd` sets `escalation: 1` and re-runs the green
phase via the hidden `@implementer-pro` (a stronger model in the same family). Once escalated, the
slice's final clean verdict comes from a fresh `@reviewer` pass over the diff from scratch, treating
earlier iterations as context rather than authority. One rung only; a second exhaustion pauses for the
human.

`@qa` validates the finished feature by selecting at most 3 top-of-pyramid end-to-end journeys that
together exercise as many `@S<n>` scenarios as possible; every other scenario is recorded as covered
by its tagged test at `verify`. A QA finding re-enters the pipeline at **specify**: `@spec` updates
`spec.md`/contracts with a delta scoped to the finding, `@architect` updates `plan.md` to match, the
affected slice(s) run the slice loop again, `verify` re-runs, and `@qa` re-validates only the
previously failed journey(s). Max 2 QA-driven cycles.

"Done" is: all slices committed, `verify` green, docs synced, `qa` clean — plus a draft PR opened when
GitHub mode is on. `sdd` doesn't declare success otherwise.

## State enforcement

`docs/feats/<feature>/state.yaml` has exactly one writer: `@sdd`, and only through the `checkpoint`
custom tool shipped in `plugins/sdd-guard.ts` — never by editing the file. Subagents never touch
state; they return a YAML reply block that `@sdd` applies. The plugin:

- **validates** every write against a Zod schema (stage/slice_phase enums, required keys, finding
  records) before it touches disk, and writes atomically (tmp file + rename)
- **journals** every checkpoint to `docs/feats/<feature>/journal.ndjson` — a full audit trail
- **blocks** direct edits to `state.yaml`/`journal.ndjson`, any write into `.opencode/**`
  (self-modification), and writes into another feature's `docs/feats/<other>/` while a different
  feature is active — all via a `tool.execute.before` hook that throws to stop the write
- adds defense-in-depth against pushing straight to `main`/`master` from a bash tool call, beyond the
  declarative deny rules in `opencode.jsonc`
- exposes a `compact` tool — the programmatic equivalent of `/compact` — that `@sdd` calls at three
  points in the pipeline (after the plan gate, after every slice commit, after `verify` goes green) to
  summarize its own session context. Callable only by `@sdd`; failures/timeouts are journaled and swallowed, never block the
  workflow.

Agent frontmatter (`permission.edit`) denies the same paths declaratively as a second layer, and
`opencode.jsonc` denies `git push* main*`/`git push* master*` outright while keeping `gh pr merge *`
on `ask`.

## Codebase Context

Two optional, non-blocking tools cut the tokens spent exploring and reading the codebase:

- **[`codesight`](https://github.com/Houseofmvps/codesight)** — `/setup-context` generates
  `.codesight/wiki/`, a committable map of the codebase (index + topic articles). `@spec`,
  `@architect`, and `@implementer` read the index first as a hint, then verify with Grep/Glob before
  citing `file:line` — the wiki is never treated as ground truth. `@sdd` best-effort refreshes it at
  the plan stage and again at docs-sync (`npx codesight --wiki`); failures are silently skipped, never
  block the pipeline. `opencode.jsonc` also registers a `codesight` MCP server (`npx codesight --mcp`)
  so any agent can query it (routes, schema, blast radius) on demand.
- **[`rtk`](https://github.com/rtk-ai/rtk)** — opt-in via `INSTALL_RTK=true` at install time. Filters
  noisy bash output (test runs, lint, `git status`/`log`) before it reaches the model. It only affects
  the `bash` tool — opencode's built-in Grep/Glob/Read bypass it — so its effect is scoped to the
  verify/review/qa stages. The installer configures its global `exclude_commands` to leave `git
  diff`/`git show` untouched, since the review loop depends on seeing the full uncommitted diff.

## Notes

- No commands or scripts are required beyond the bundled `/setup-docs`/`/setup-context` commands and
  the shipped `sdd-guard` plugin — `opencode` auto-installs the plugin's dependencies from
  `.opencode/package.json`.
- The workflow runs in the current repository checkout — no worktree isolation.
- `AGENTS.md` must list the project's install/dev/build/test/lint/typecheck commands; `sdd` and `qa`
  read them at the `verify` and `qa` stages respectively.
- GitHub integration is optional and off by default when unattended (`github: false`); `sdd` asks
  once at initialize time when interactive.
