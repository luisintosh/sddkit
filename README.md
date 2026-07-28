# sddkit

A thin harness for **spec-driven development (SDD)** on [OpenCode](https://opencode.ai) and
[Cursor](https://cursor.com): an approved spec, tagged acceptance contracts (`@S<n>`), TDD with the
consuming repo's test stack, a multi-agent pipeline with a one-rung escalation loop, and a
file-based **`state.yaml` checkpoint** written only through `./bin/sddkit-state`.

Prompts live once under `src/prompts/`; `bun run build` transpiles them into OpenCode and Cursor
formats under `dist/` (gitignored; packaged on release).

## Layout

```text
src/
  catalog.yaml           per-agent models/permissions for both targets
  prompts/agents/        canonical agent bodies (no app frontmatter)
  prompts/commands/      setup-docs / setup-context
  prompts/fragments/     shared includes
  state/                 sddkit-state CLI (schema, merge, io)
tools/
  transpile.ts           → dist/opencode + dist/cursor
  build-cli.ts           → dist/bin/sddkit-state (+ optional mac binaries)
  gen-manifest.ts        → manifest.txt
  check.ts               hygiene
dist/                    generated install payload (gitignored)
install.sh               interactive installer
```

State lives in the **consuming repo**:

```text
AGENTS.md
docs/ARCHITECTURE.md
docs/CONSTITUTION.md
docs/feats/<feature>/
  state.yaml             checkpoint — sole writer: ./bin/sddkit-state (via conductor)
  journal.ndjson         append-only audit trail
  spec.md
  contracts/*.feature
  plan.md
docs/product/<slug>/
  roadmap.md             optional, written by sddkit-plan
  ship.yaml              run cache, written by sddkit-ship (left untracked)
bin/sddkit-state            installed by install.sh
.opencode/               OpenCode agents + opencode.jsonc
.cursor/agents/          Cursor subagents
.cursor/skills/          sddkit, sddkit-plan, sddkit-ship + setup-* skills
```

## Models

| agent | OpenCode | Cursor | notes |
|---|---|---|---|
| `sddkit` | `opencode-go/kimi-k2.7-code` | `inherit` | conductor (Cursor: `/sddkit` skill) |
| `spec` | `opencode-go/glm-5.2` | `grok-4.5` | what & why + contracts |
| `architect` | `opencode-go/glm-5.2` | `grok-4.5` | plan + slices |
| `tester` | `opencode-go/kimi-k2.7-code` | `kimi-k2.7-code` | TDD red |
| `implementer` | `opencode-go/deepseek-v4-flash` | `composer-2.5` | TDD green (+ escalation re-run) |
| `reviewer` | `opencode-go/kimi-k2.7-code` | `kimi-k2.7-code` | read-only review / critique |
| `qa` | `opencode-go/glm-5.2` | `composer-2.5` | end-to-end validation |
| `sddkit-plan` | `opencode-go/qwen3.7-max` | `inherit` | product owner → roadmap (Cursor: `/sddkit-plan` skill) |
| `sddkit-ship` | `opencode-go/kimi-k2.7-code` | `inherit` | roadmap orchestrator (Cursor: `/sddkit-ship` skill) |

Checked in CI against `src/catalog.yaml` and emitted frontmatter.

## Install

From the root of the consuming repository:

```bash
curl -fsSL https://raw.githubusercontent.com/luisintosh/sddkit/refs/heads/master/install.sh | bash
```

On a TTY the installer asks for **target** (`all` / `opencode` / `cursor`), **version** (latest /
tag / branch / local), and confirmation. Non-interactive runs default to `all` + latest tag.

Re-running is idempotent: unchanged files skip, upstream updates apply, local edits are backed up
under `.opencode/.backup-*/` or `.cursor/.backup-*/` before replace, removed upstream files are pruned.

Flags: `--dry-run`, `--doctor`.

After install, ensure `bun` is on `PATH` (portable `bin/sddkit-state` is a Bun script) and prefer
invoking `./bin/sddkit-state` from the repo root. The installer prints next steps: `/setup-docs`,
`/setup-context`, installing [`gh`](https://cli.github.com/) (required — the pipeline verifies it
at start), and an optional [rtk](https://github.com/rtk-ai/rtk) hint (never auto-installed).

### Setup Docs

```text
/setup-docs
```

Creates `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONSTITUTION.md`, and `docs/feats/.gitkeep` if
missing. `AGENTS.md` must include install/dev/build/test/lint/typecheck (and a single-test-file
command).

### Setup Context (optional)

```text
/setup-context
```

Runs [`codesight`](https://github.com/Houseofmvps/codesight) to generate `.codesight/wiki/`.

### Start a Feature

**OpenCode:** default agent is `sddkit` — type a feature request.

**Cursor:** run the `/sddkit` skill (or ask the Agent to follow the SDD skill), then describe the feature.

`sddkit` verifies `gh` + the target repo, creates `feat/<slug>`, and asks once (interactive vs
autonomous), then scaffolds state with `./bin/sddkit-state init` and runs the pipeline. Resume by
asking to continue.

### Plan a Product (optional)

**OpenCode:** Tab-switch to the `sddkit-plan` agent and describe the idea.

**Cursor:** run the `/sddkit-plan` skill (it inherits your session model — use your most capable
one for this).

Explores the codebase to answer what it can before asking anything, refines the idea into a
measurable goal, explores candidate approaches, then writes a feature roadmap — each feature with
a Definition of Done and dependency-derived parallel/sequential waves — to
`docs/product/<slug>/roadmap.md`. Offers to commit it and to create GitHub issues (one epic +
one per feature, wired with `Blocked by #N`). Standalone — doesn't touch the SDD pipeline; each
resulting feature is meant to be run through `sddkit` on its own.

### Ship a Roadmap (optional)

**OpenCode:** Tab-switch to the `sddkit-ship` agent and point it at a roadmap or its epic issue.

**Cursor:** run the `/sddkit-ship` skill. Either way the **OpenCode CLI must be installed** — it is
the runner for child feature runs (`opencode run --agent sddkit`).

Executes the whole roadmap from its GitHub issues without further input, **one feature at a time in
your checkout**. Per feature it switches to the base branch, pulls, cuts `feat/<slug>`, launches an
autonomous `sddkit` run, waits, then — once QA is clean and CI is green — brings the PR up to date
(`gh pr update-branch`, never a force-push), squash-merges it, closes the issue via `Closes #N`,
ticks the epic checkbox, and returns to a freshly pulled base before starting the next one.

Strictly sequential by design: a dependent feature only becomes eligible once its blockers' issues
close, so it branches from a base that already contains them — a blocker isn't merely earlier, it's
an ancestor, and dependencies can't conflict. Running in the main checkout (rather than worktrees)
means untracked build state like `node_modules/` is reused across features instead of reinstalled
per feature. The trade: **the checkout is unusable while it runs**, and it refuses to start on a
dirty tree.

It holds no state in conversation: every iteration re-derives progress from `gh issue`/`gh pr` plus
`docs/feats/<slug>/state.yaml`, with `docs/product/<slug>/ship.yaml` as a rebuildable cache of the
feature→branch mapping. Kill it any time and relaunch — it reconciles and continues. Features that
exhaust their retries are **parked** (reason commented on the issue, branch left intact) so the rest
keep shipping. It never discards uncommitted work to unblock itself; a tree too dirty to leave is
handed back to you. Finishes only when every issue is closed, every PR merged, the base branch
verifies green, and `qa` has validated the roadmap's success criteria on the epic — then it closes
the epic.

## Pipeline

```
initialize → specify (spec + contracts) → spec critique → ⏸spec gate
  → plan (incl. Slices) → plan critique → ⏸plan gate
  → implementation slices → verify → docs-sync → pr → qa → complete
```

```
standard: red(tester) → green(implementer) → targeted test → review loop → commit
low:                    green(implementer) → targeted test → single review → commit
```

**Escalation:** if green fails twice or review exhausts with `blocker`/`major`, set `escalation: 1`
and re-run the same `implementer` with failure history (re-derive from plan+tests). One rung; then
pause for a human.

## State

`docs/feats/<feature>/state.yaml` is written only via:

```bash
./bin/sddkit-state init <feature>
./bin/sddkit-state patch <feature> --yaml 'stage: specify'
./bin/sddkit-state show <feature>
./bin/sddkit-state validate <feature>
```

The conductor applies subagent reply YAML through `patch`. OpenCode also denies direct edits to
`state.yaml` / `journal.ndjson` in `opencode.jsonc`.

## Editing prompts

1. Edit `src/prompts/` and/or `src/catalog.yaml`
2. `bun run build && bun run check && bun test`

## Notes

- No OpenCode plugin — state is the CLI only.
- Everything runs in the current checkout (no worktree isolation) — including `sddkit-ship`, which
  is therefore strictly one feature at a time.
- `sddkit` never merges its own PR — merging is the human's, or `sddkit-ship`'s, call.
