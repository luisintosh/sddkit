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
bin/sddkit-state            installed by install.sh
.opencode/               OpenCode agents + opencode.jsonc
.cursor/agents/          Cursor subagents
.cursor/skills/          sddkit, sddkit-plan + setup-* skills
```

## Models

| agent | OpenCode | Cursor | notes |
|---|---|---|---|
| `sddkit` | `opencode-go/qwen3.7-plus` | `inherit` | conductor (Cursor: `/sddkit` skill) |
| `spec` | `openai/gpt-5.6-sol` | `grok-4.5` | what & why + contracts |
| `architect` | `openai/gpt-5.6-sol` | `grok-4.5` | plan + slices |
| `tester` | `opencode-go/kimi-k2.7-code` | `kimi-k2.7-code` | TDD red |
| `implementer` | `openai/gpt-5.6-luna` | `composer-2.5` | TDD green (+ escalation re-run) |
| `reviewer` | `opencode-go/kimi-k2.7-code` | `kimi-k2.7-code` | read-only review / critique |
| `qa` | `opencode-go/deepseek-v4-pro` | `composer-2.5` | end-to-end validation |
| `sddkit-plan` | `openai/gpt-5.6-sol` | `inherit` | product owner → roadmap (Cursor: `/sddkit-plan` skill) |

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

Name a GitHub issue (`gh issue view` number or URL) and `sddkit` links to it: scope comes from its
Definition of Done, the slug is derived from the issue title, and completion prints a **handoff** —
a paste-ready invocation for the roadmap's next feature, plus anything this run learned that the
next one needs.

### Plan a Product (optional)

**OpenCode:** Tab-switch to the `sddkit-plan` agent and describe the idea.

**Cursor:** run the `/sddkit-plan` skill (it inherits your session model — use your most capable
one for this).

Explores the codebase to answer what it can before asking anything, refines the idea into a
measurable goal, explores candidate approaches, then writes a feature roadmap — each feature with
a Definition of Done and dependency-derived parallel/sequential waves — to
`docs/product/<slug>/roadmap.md`. Offers to commit it and to create GitHub issues (one epic +
one per feature, wired with `Blocked by #N`). Standalone — doesn't touch the SDD pipeline; each
resulting feature is meant to be run through `sddkit` on its own. Ends by printing a paste-ready
invocation for the roadmap's first feature.

### Run a Roadmap

There's no separate orchestrator — one `sddkit` run per feature, chained by copy/paste. Run a
feature by naming its GitHub issue; when it completes, `sddkit` prints the next feature's
invocation (skipped if that feature's blockers haven't merged yet — merge the open PR first).
Paste it into a fresh chat and continue. Each run starts with a clean context; the handoff carries
forward only what the next run actually needs.

## Pipeline

```
initialize → specify (spec + contracts) → spec critique → ⏸spec gate
  → plan (incl. Slices) → plan critique → ⏸plan gate
  → implementation slices → verify → docs-sync → pr → qa → complete → handoff
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
- Everything runs in the current checkout (no worktree isolation).
- `sddkit` never merges its own PR — that's the human's call, every time. That rule lives in the prompts, not the permission config: `gh pr merge` is allowed at the config level, so branch protection is your hard backstop.
- No permission is `ask`. An unattended `opencode run` has no responder for a bash/edit permission request, so a reachable `ask` would stall it indefinitely. Dangerous commands are hard denies instead — refused, so the agent adapts. `bun run check` enforces this; only `sddkit-plan`, which is interactive-only, is exempt.
