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
bin/sddkit-state            installed by install.sh
.opencode/               OpenCode agents + opencode.jsonc
.cursor/agents/          Cursor subagents
.cursor/skills/          sddkit + setup-* skills
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
`/setup-context`, installing [`gh`](https://cli.github.com/) for GitHub mode, and an optional
[rtk](https://github.com/rtk-ai/rtk) hint (never auto-installed).

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

`sddkit` asks once (branch, GitHub vs local, interactive vs autonomous), then scaffolds state with
`./bin/sddkit-state init` and runs the pipeline. Resume by asking to continue.

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
- Workflow runs in the current checkout (no worktree isolation).
- GitHub integration is optional (`github: false` when unattended).
