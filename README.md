# opencode-harness-toolkit

A harness for **spec-driven development (SDD)**, supporting [OpenCode](https://opencode.ai) and
[Cursor](https://cursor.com): an approved spec, spec-derived acceptance contracts (tagged `@S<n>`
for traceability), TDD using the consuming repo's own test stack, a multi-agent pipeline with a
self-correcting escalation ladder, and a file-based **`state.yaml` checkpoint** — all driven by an
`sdd` agent that runs an autonomous-but-human-in-the-loop workflow and is resumable from on-disk
state.

On OpenCode, `sdd` is the `default_agent` — just describe your feature and it takes over. On
Cursor, there's no equivalent "default agent" mechanism (confirmed against Cursor's own docs: custom
`.cursor/agents/*.md` files are always subagents, dispatched via `/name` or delegation, never a
session's own starting agent) — type `/sdd <feature request>` to start.

## Layout

The toolkit is being made **harness-agnostic**: a shared, harness-free core plus thin per-harness
adapters. `core/` and `adapters/` are the only hand-edited source; each harness's installable tree is
**generated** into `build/<harness>/` (gitignored) by the build step and installed from there.

```text
core/                    harness-free shared code
  state-engine/          state.yaml schema, deep-merge, atomic IO, guard predicates, checkpoint
  mcp/server.ts          stdio MCP server exposing the `checkpoint` tool — used by every harness
  roles.yml              harness-agnostic agent roster: description only (the one field every
                         harness's frontmatter schema shares — see roles.yml's own header comment)
  agents/                agent prompt BODIES only, no frontmatter — the 8 agents below
    sdd.md                primary — sequences stages, owns gates, routes findings, checkpoints state
    spec.md               writes spec.md + acceptance contracts/*.feature (@S<n> tagged), together
    architect.md           explores the codebase, writes plan.md (includes the Slices section)
    tester.md               red phase — failing tests from acceptance contracts (test-only edits)
    implementer.md          green phase — minimal impl to pass tests (no test edits)
    implementer-pro.md      escalation rung — stronger model, invoked by @sdd after 2 failed attempts
    reviewer.md              read-only reviewer — slice-diff review + pre-gate spec/plan critique
    qa.md                    validates the finished feature against spec/contracts
adapters/
  opencode/              OpenCode-specific wiring
    opencode.jsonc       config — registers the checkpoint MCP server + guard plugin
    package.json         the one runtime dep the plugin can't bundle (@opencode-ai/plugin)
    agents.yml           per-agent frontmatter: mode, hidden, model, temperature, steps, permission
    plugin/sdd-guard.ts  thin: guard hooks + compact tool (imports core; checkpoint is the MCP server)
  cursor/                Cursor-specific wiring
    mcp.json             registers the checkpoint MCP server
    hooks.json            preToolUse (Write) + beforeShellExecution wiring
    hooks/*.ts             bundled guard scripts (import core/state-engine/guards)
    commands/setup-docs.md plain markdown, no frontmatter — Cursor's command format
    agents.yml            per-agent frontmatter: model (inherit), readonly
build/
  assemble.mjs           copies each adapter's static files into build/<harness>/
  agents.mjs             composes core/roles.yml + core/agents/*.md + adapters/<h>/agents.yml into
                         build/<harness>/agents/*.md; applies the {{#compact}} guard (see below)
  bundle.mjs             esbuild-bundles the plugin/hooks + MCP server into standalone JS (no npm
                         install needed in the consuming repo)
scripts/
  gen-manifest.sh         regenerates build/<harness>/manifest.txt from the built tree
  check.mjs               CI hygiene checks (roster/frontmatter schema, opencode.jsonc, README drift,
                         tree manifest — both harnesses)
test/
  e2e-install.sh          Tier 1 — installer lifecycle over a built tree, both harnesses, runs in CI
  e2e-pipeline.sh         Tier 2 — one real (cheap) opencode run, manual, not wired into CI
  fixture-repo/           tiny Node project e2e-pipeline.sh installs the harness into
```

Token substitution in agent bodies is deliberately minimal: the only one today is
`{{#compact}}…{{/compact}}`, a guard around the handful of sentences in `sdd.md` that only make sense
on a harness with a programmatic compact tool. `build/agents.mjs` keeps the guarded text (markers
stripped) for harnesses that declare `supportsCompact: true`, or drops it entirely (and collapses any
resulting blank-line run) for harnesses that don't. Prefer rewording the shared body to be
harness-neutral over adding new guards.

Build both install trees with `bun run build` (or `bun run build:opencode` / `bun run build:cursor`
individually) → `build/opencode/` / `build/cursor/`. Adapter-specific detail: `adapters/cursor/`
additionally ships `hooks.json` + `hooks/*.ts` (guardrails — see State enforcement below), `mcp.json`
(registers the checkpoint MCP server), and `commands/setup-docs.md` (plain markdown, no frontmatter —
Cursor's command format).

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

### OpenCode

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

This table is checked in CI (`scripts/check.mjs`) against `adapters/opencode/agents.yml` — it cannot
drift silently.

### Cursor

`adapters/cursor/agents.yml` pins every agent to `model: inherit` (uses whatever model the parent
session has selected). Cursor's model roster (composer-2.5, claude-opus-4-8, gpt-5.x, ...) changes
often and isn't something CI can verify against a live account, so per-role tiering mirroring the
OpenCode table above is left for you to configure once you've confirmed valid model IDs via the
Cursor model picker — see the comments in `adapters/cursor/agents.yml`. There's also no `implementer-
pro`-style hidden flag on Cursor (no confirmed equivalent); it ships as an ordinary agent file and
stays escalation-only in practice because only `sdd.md`'s prompt ever invokes it.

## Use

### Install

Run the installer from the root of the consuming repository:

```bash
curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | bash              # OpenCode (default)
curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | HARNESS=cursor bash # Cursor
```

The installable tree is generated (`build/<harness>/`, never committed) and published as a
`<harness>.tar.gz` release asset on each tagged release. The installer downloads and extracts that
tarball, verifies every file's sha256 against the manifest inside it, and only then installs into
`.<harness>/` — nothing is written unless every file checks out. Re-running is safe and idempotent:

- unchanged files are left alone
- files that changed upstream are updated
- files you edited locally are backed up under `.<harness>/.backup-<timestamp>/` before being replaced
- files removed upstream are pruned (backed up first if you'd modified them)

Options (environment variables):

- `HARNESS=opencode|cursor` — which harness to install for (default: auto-detect from an existing
  `.opencode/` or `.cursor/` if exactly one is present, else `opencode`)
- `VERSION=v0.2.0` — pin to a specific release tag (default: latest tag)
- `BRANCH=some-branch` — **not supported over the network** — release assets only exist for tagged
  releases, so there's no server-side artifact for an arbitrary branch; use `LOCAL_SOURCE` instead
- `LOCAL_SOURCE=/path/to/build/<harness>` — install from an already-built tree instead of downloading
  (CI/testing, or branch/local development installs)
- `TARGET_DIR=/path` — install into a directory other than the current one

Flags: `--dry-run` (show what would change without writing anything), `--doctor` (environment checks
only — this also runs automatically, warn-only, after a real install), `--harness=NAME` (same as
`HARNESS=NAME`).

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

Both adapters enforce the same hard, path/command-based guardrails — direct edits to
`state.yaml`/`journal.ndjson`, self-modification of the harness's own install dir, and cross-feature
writes — via each harness's own hook mechanism, both calling the identical predicates from
`core/state-engine/guards.ts`:

- **OpenCode**: the thin guard plugin (`adapters/opencode/plugin/sdd-guard.ts`, bundled to
  `.opencode/plugins/sdd-guard.js`) hooks `tool.execute.before` and throws to stop the write. It also
  exposes a `compact` tool — the programmatic equivalent of `/compact` — that `@sdd` calls at three
  points in the pipeline (after the plan gate, after every slice commit, after `verify` goes green) to
  summarize its own session context; failures/timeouts are journaled and swallowed, never block the
  workflow. Agent frontmatter (`permission.edit`) denies the same paths declaratively as a second
  layer, and `opencode.jsonc` denies force-pushes (`git push --force*`/`-f *`) while keeping
  `gh pr merge *` on `ask`.
- **Cursor**: `.cursor/hooks.json` registers two bundled command-hooks
  (`adapters/cursor/hooks/*.ts`) — `preToolUse` (matcher: `Write`) for the file-path guards, and
  `beforeShellExecution` for the dangerous-command deny list (`rm -rf`, `git reset --hard`,
  force-push, pipe-to-shell, ...) that OpenCode gets for free from its declarative `permission.bash`
  config but Cursor has no equivalent for, so the hook is the sole enforcer there. Deny responses are
  both a JSON body (`{"permission":"deny",...}`) and exit code `2`. Cursor has no `compact`-equivalent
  tool (no programmatic session summarization) — the `{{#compact}}` guard strips those `sdd.md`
  sentences from the assembled Cursor agent files entirely.

The `checkpoint` MCP tool can't see which agent calls it (MCP has no caller identity on either
harness), so the single-writer rule is prompt discipline — `@sdd` is the only agent told to call it,
and subagents always return reply blocks instead. On Cursor, per-agent write scoping (tester may only
touch test files, implementer may not touch them) is prompt discipline for the same reason — Cursor's
hook payloads carry no subagent identity to gate on, and its `readonly` flag is coarser than OpenCode's
path-scoped `permission.edit` globs (all-or-nothing, no per-agent glob allow list). The hard guardrails
above don't depend on caller identity, so they hold regardless on both harnesses.

## Notes

- No commands or scripts are required beyond the bundled `/setup-docs` command and the shipped
  `sdd-guard` plugin — `opencode` auto-installs the plugin's dependencies from `.opencode/package.json`.
- The workflow runs in the current repository checkout — no worktree isolation.
- `AGENTS.md` must list the project's install/dev/build/test/lint/typecheck commands; `sdd` and `qa`
  read them at the `verify` and `qa` stages respectively.
- GitHub integration is optional and off by default when unattended (`github: false`); `sdd` asks
  once at initialize time when interactive.
