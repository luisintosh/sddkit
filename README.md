# sddkit

A thin harness for **spec-driven development (SDD)** on [OpenCode](https://opencode.ai), [Cursor](https://cursor.com),
[Claude Code](https://code.claude.com), and [Codex](https://developers.openai.com/codex): an approved spec, tagged
acceptance contracts (`@S<n>`), TDD with the consuming repo's test stack, a multi-agent pipeline with a one-rung
escalation loop, and a file-based **`state.yaml` checkpoint** written only through `.agents/bin/sddkit-state`.

Prompts live once under `src/prompts/`; `bun run build` transpiles them into OpenCode, Cursor, Claude Code, Codex, and
shared skill formats under `dist/` (tracked so install does not need a client-side build).

## Layout

```text
src/
  catalog.yaml           host × profile models + per-agent adapters
  prompts/agents/        canonical agent bodies (no app frontmatter)
  prompts/commands/      setup-docs
  prompts/fragments/     shared includes
  state/                 sddkit-state CLI (schema, merge, io)
tools/
  transpile.ts           → dist/{opencode,cursor,claude,codex} + dist/agents/skills
  install-tui.ts         Clack TUI (TTY + bun checkout)
  build-cli.ts           → dist/bin/sddkit-state (+ optional mac binaries)
  gen-manifest.ts        → manifest.txt
  check.ts               hygiene
dist/                    generated install payload (tracked; never hand-edit)
install.sh               multi-host installer (TUI or bash menus)
```

State lives in the **consuming repo**:

```text
AGENTS.md
docs/ARCHITECTURE.md
docs/CONSTITUTION.md
docs/feats/<feature>/
  state.yaml             checkpoint — sole writer: .agents/bin/sddkit-state (via conductor)
  journal.ndjson         append-only audit trail
  spec.md
  contracts/*.feature
  plan.md
docs/product/<slug>/
  roadmap.md             optional, written by sddkit-plan
src/<domain>/README.md   domain doc, written by docs-writer at docs-sync
docs/domains/<domain>.md same, for a domain too cross-cutting to own a directory
.agents/bin/sddkit-state    installed by install.sh
.agents/skills/          sddkit, sddkit-plan + setup-docs
.opencode/               OpenCode agents + opencode.jsonc
.cursor/agents/          Cursor specialists
.claude/agents/          Claude Code specialists
.claude/skills/          copy of shared skills (Claude does not load .agents/skills/)
.codex/agents/           Codex specialists
```

## Models

Models live in `src/catalog.yaml` as a host × profile matrix. Agents declare a `profile`; emitters format the host's
entry. Skills (`sddkit`, `sddkit-plan`) inherit the session model — run `/sddkit` on Grok 4.6 Extra High, Claude opus,
or Codex sol.

| profile    | OpenCode                      | Cursor                       | Claude    | Codex                 |
| ---------- | ----------------------------- | ---------------------------- | --------- | --------------------- |
| `conduct`  | `opencode-go/qwen3.7-plus`    | `inherit`                    | `inherit` | `inherit`             |
| `think`    | `openai/gpt-5.6-sol`          | `grok-4.6[effort=xhigh]`     | `opus`    | `gpt-5.6-sol`         |
| `execute`  | `openai/gpt-5.6-luna`         | `gpt-5.6-luna[effort=high]`  | `sonnet`  | `gpt-5.6-luna[high]`  |
| `test`     | `opencode-go/kimi-k2.7-code`  | `composer-2.5[]`             | `sonnet`  | `gpt-5.6-luna[high]`  |
| `review`   | `opencode-go/kimi-k3`         | `gpt-5.6-terra[effort=high]` | `opus`    | `gpt-5.6-terra[high]` |
| `critique` | `opencode-go/kimi-k2.7-code`  | `gpt-5.6-terra[effort=high]` | `opus`    | `gpt-5.6-terra[high]` |
| `validate` | `opencode-go/deepseek-v4-pro` | `grok-4.6[effort=medium]`    | `sonnet`  | `gpt-5.6-luna[high]`  |
| `write`    | `opencode-go/kimi-k3`         | `gpt-5.6-luna[effort=high]`  | `sonnet`  | `gpt-5.6-luna[high]`  |

| agent           | profile    |
| --------------- | ---------- |
| `sddkit`        | `conduct`  |
| `spec`          | `think`    |
| `architect`     | `think`    |
| `plan-reviewer` | `review`   |
| `tester`        | `test`     |
| `implementer`   | `execute`  |
| `code-reviewer` | `critique` |
| `qa`            | `validate` |
| `docs-writer`   | `write`    |
| `sddkit-plan`   | `think`    |

Checked in CI against `src/catalog.yaml` and emitted frontmatter / Codex TOML.

## Install

From the root of the consuming repository:

```bash
curl -fsSL https://raw.githubusercontent.com/luisintosh/sddkit/refs/heads/master/install.sh | bash
```

On a TTY the installer asks for **scope** (this repo vs `$HOME`), **hosts** (Cursor / Claude Code / Codex / OpenCode —
one, many, or all), **version** (latest / tag / branch / local), and confirmation. Detected CLIs are pre-checked; you
can still install a host that is not on `PATH`. Non-interactive runs default to `project` + `all` + latest tag.

A local checkout used as `LOCAL_SOURCE` must already contain `dist/` and `manifest.txt` — the installer never builds on
the client.

Re-running is idempotent: unchanged files skip, upstream updates apply, local edits are backed up under the dest leaf
(`.cursor/agents/.backup-*/`, `.claude/agents/.backup-*/`, …) before replace, removed upstream files are pruned.

Flags: `--dry-run`, `--doctor`.

Env (CI / scripts): `INSTALL_SCOPE=project|global`, `INSTALL_TARGET=all|cursor,claude,codex,opencode`. Global OpenCode
writes only `~/.config/opencode/agents/` — never `opencode.jsonc`. Claude skills are a **copy** of `.agents/skills/`.

After install, ensure `bun` is on `PATH` (portable `.agents/bin/sddkit-state` is a Bun script) and invoke
`.agents/bin/sddkit-state` from the repo root. The installer prints next steps: `/setup-docs`, installing
[`gh`](https://cli.github.com/) (required — the pipeline verifies it at start), and an optional
[rtk](https://github.com/rtk-ai/rtk) hint (never auto-installed).

### Setup Docs

```text
/setup-docs
```

Creates `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONSTITUTION.md`, and `docs/feats/.gitkeep` if missing. `AGENTS.md`
must include install/dev/build/test/lint/typecheck (and a single-test-file command). It does **not** backfill domain
READMEs for existing code — `docs-writer` creates each one as a feature touches that domain.

### Start a Feature

**OpenCode:** default agent is `sddkit` — type a feature request.

**Cursor / Claude / Codex:** run the `/sddkit` skill (or ask the Agent to follow the SDD skill) on your most capable
session model (Grok Extra High / opus / sol), then describe the feature.

`sddkit` verifies `gh` + the target repo, creates `feat/<slug>`, scaffolds state with `.agents/bin/sddkit-state init`,
and runs the pipeline, stopping at the spec and plan gates for review. Resume by asking to continue.

Not for a confined, no-behavior-branch change — a typo, a comment, a version bump, a single-line config value, a pure
rename. A fresh run flags these and asks before scaffolding state; an unattended run, or one naming a GitHub issue,
always runs the full pipeline regardless.

Name a GitHub issue (`gh issue view` number or URL) and `sddkit` links to it: scope comes from its Definition of Done,
the slug is derived from the issue title, and completion prints a **handoff** — a paste-ready invocation for the
roadmap's next feature, plus anything this run learned that the next one needs.

### Plan a Product (optional)

**OpenCode:** Tab-switch to the `sddkit-plan` agent and describe the idea.

**Cursor:** run the `/sddkit-plan` skill (it inherits your session model — use your most capable one for this).

Explores the codebase to answer what it can before asking anything, refines the idea into a measurable goal, explores
candidate approaches, then writes a feature roadmap — each feature with a Definition of Done and dependency-derived
parallel/sequential waves — to `docs/product/<slug>/roadmap.md`. Offers to commit it and to create GitHub issues (one
epic + one per feature, wired with `Blocked by #N`). Standalone — doesn't touch the SDD pipeline; each resulting feature
is meant to be run through `sddkit` on its own. Ends by printing a paste-ready invocation for the roadmap's first
feature.

### Run a Roadmap

There's no separate orchestrator — one `sddkit` run per feature, chained by copy/paste. Run a feature by naming its
GitHub issue; when it completes, `sddkit` prints the next feature's invocation (skipped if that feature's blockers
haven't merged yet — merge the open PR first). Paste it into a fresh chat and continue. Each run starts with a clean
context; the handoff carries forward only what the next run actually needs.

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

**Escalation:** if green fails twice or review exhausts with `blocker`/`major`, set `escalation: 1` and re-run the same
`implementer` with failure history (re-derive from plan+tests). One rung; then pause for a human.

**Docs:** `docs-sync` delegates to `docs-writer`, which writes the touched domain's `README.md` — co-located with the
code, or `docs/domains/<domain>.md` when the domain is cross-cutting — to a fixed skeleton (purpose, how it works,
usage, configuration, gotchas), capped at 120 lines, current state only, never a changelog. Environment variables and
external service setup are grepped out of the feature's own diff and repeated in the PR body under `## Setup required`,
since that part is work only a human can do.

## State

`docs/feats/<feature>/state.yaml` is written only via:

```bash
.agents/bin/sddkit-state init <feature>
.agents/bin/sddkit-state patch <feature> --yaml 'stage: specify'
.agents/bin/sddkit-state show <feature>
.agents/bin/sddkit-state validate <feature>
```

The conductor applies subagent reply YAML through `patch`. OpenCode also denies direct edits to `state.yaml` /
`journal.ndjson` in `opencode.jsonc`.

## Editing prompts

1. Edit `src/prompts/` and/or `src/catalog.yaml`
2. `bun run build && bun run check && bun test`

## Notes

- No OpenCode plugin — state is the CLI only.
- Everything runs in the current checkout (no worktree isolation).
- `sddkit` never merges its own PR — that's the human's call, every time. That rule lives in the prompts, not the
  permission config: `gh pr merge` is allowed at the config level, so branch protection is your hard backstop.
- No permission is `ask`. An unattended `opencode run` has no responder for a bash/edit permission request, so a
  reachable `ask` would stall it indefinitely. Dangerous commands are hard denies instead — refused, so the agent
  adapts. `bun run check` enforces this; only `sddkit-plan`, which is interactive-only, is exempt.
