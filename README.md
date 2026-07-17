# opencode-harness-toolkit

A thin [opencode](https://opencode.ai) harness for **spec-driven development (SDD)**: an approved
spec, spec-derived acceptance contracts (tagged `@S<n>` for traceability), TDD using the consuming
repo's own test stack, a multi-agent pipeline with a self-correcting escalation ladder, and a
file-based **`state.yaml` checkpoint** with exactly one writer — all driven by a single primary
agent, `sdd`, that runs an autonomous-but-human-in-the-loop workflow and is resumable from on-disk
state.

## Layout

The toolkit is being made **harness-agnostic**: a shared, harness-free core plus thin per-harness
adapters. `core/` and `adapters/` are the only hand-edited source; each harness's installable tree is
**generated** into `build/<harness>/` (gitignored) by the build step and installed from there.

```text
core/                    harness-free shared code
  state-engine/          state.yaml schema, deep-merge, atomic IO, guard predicates, checkpoint
  mcp/server.ts          stdio MCP server exposing the `checkpoint` tool — used by every harness
agents/
  sdd.md                primary — sequences stages, owns gates, routes findings, checkpoints state
  spec.md               writes spec.md + acceptance contracts/*.feature (@S<n> tagged), together
  architect.md           explores the codebase, writes plan.md (includes the Slices section)
  tester.md               red phase — failing tests from acceptance contracts (test-only edits)
  implementer.md          green phase — minimal impl to pass tests (no test edits)
  implementer-pro.md      hidden escalation rung — stronger model, invoked after 2 failed attempts
  reviewer.md              read-only reviewer — slice-diff review + pre-gate spec/plan critique
  qa.md                    validates the finished feature against spec/contracts
adapters/opencode/       OpenCode-specific wiring
  opencode.jsonc         config — registers the checkpoint MCP server + guard plugin
  package.json           the one runtime dep the plugin can't bundle (@opencode-ai/plugin)
  plugin/sdd-guard.ts    thin: guard hooks + compact tool (imports core; checkpoint is the MCP server)
build/
  assemble.mjs           copies each adapter's static files into build/<harness>/
  bundle.mjs             esbuild-bundles the plugin + MCP server into standalone JS (no npm needed)
scripts/
  gen-manifest.sh         regenerates build/<harness>/manifest.txt from the built tree
  check.mjs               CI hygiene checks (frontmatter, opencode.jsonc, README drift, tree manifest)
test/
  e2e-install.sh          Tier 1 — installer lifecycle over a built tree, runs in CI, no network needed
  e2e-pipeline.sh         Tier 2 — one real (cheap) opencode run, manual, not wired into CI
  fixture-repo/           tiny Node project e2e-pipeline.sh installs the harness into
```

Build the OpenCode install tree with `bun run build:opencode` → `build/opencode/`.

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

`docs/feats/<feature>/state.yaml` is written only through the `checkpoint` tool — never by editing the
file. In the pipeline only `@sdd` calls it; subagents never touch state, they return a YAML reply
block that `@sdd` applies. `checkpoint` is served by the shared **core MCP server**
(`core/mcp/server.ts`), which:

- **validates** every write against a Zod schema (stage/slice_phase enums, required keys, finding
  records) before it touches disk, and writes atomically (tmp file + rename)
- **journals** every checkpoint to `docs/feats/<feature>/journal.ndjson` — a full audit trail

The thin OpenCode guard plugin (`adapters/opencode/plugin/sdd-guard.ts`, bundled to
`.opencode/plugins/sdd-guard.js`) enforces the hard, path/command-based guardrails via a
`tool.execute.before` hook that throws to stop the write:

- **blocks** direct edits to `state.yaml`/`journal.ndjson`, any write into `.opencode/**`
  (self-modification), and writes into another feature's `docs/feats/<other>/` while a different
  feature is active
- adds defense-in-depth against pushing straight to `main`/`master` from a bash tool call, beyond the
  declarative deny rules in `opencode.jsonc`
- exposes a `compact` tool — the programmatic equivalent of `/compact` — that `@sdd` calls at three
  points in the pipeline (after the plan gate, after every slice commit, after `verify` goes green) to
  summarize its own session context. Callable only by `@sdd`; failures/timeouts are journaled and swallowed, never block the
  workflow.

The `checkpoint` MCP tool can't see which agent calls it (MCP has no caller identity), so the
single-writer rule is prompt discipline — `@sdd` is the only agent told to call it, and subagents
always return reply blocks instead. The hard guardrails above don't depend on caller identity, so they
hold regardless.

Agent frontmatter (`permission.edit`) denies the same paths declaratively as a second layer, and
`opencode.jsonc` denies `git push* main*`/`git push* master*` outright while keeping `gh pr merge *`
on `ask`.

## Notes

- No commands or scripts are required beyond the bundled `/setup-docs` command and the shipped
  `sdd-guard` plugin — `opencode` auto-installs the plugin's dependencies from `.opencode/package.json`.
- The workflow runs in the current repository checkout — no worktree isolation.
- `AGENTS.md` must list the project's install/dev/build/test/lint/typecheck commands; `sdd` and `qa`
  read them at the `verify` and `qa` stages respectively.
- GitHub integration is optional and off by default when unattended (`github: false`); `sdd` asks
  once at initialize time when interactive.
