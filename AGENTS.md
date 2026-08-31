# AGENTS.md

This file provides guidance to coding agents when working with code in this repository. `CLAUDE.md` is a symlink to this
file.

## What this is

sddkit ships no runtime app. It ships agent prompts plus a small state CLI that `install.sh` installs into a _consuming_
repo (`.opencode/`, `.cursor/agents/`, `.agents/skills/`, `.agents/bin/sddkit-state`). Transpile also emits Claude Code
and Codex specialists under `dist/claude/` and `dist/codex/`. Nothing here runs against this repo's own code.

## Generation model

`src/catalog.yaml` (host × profile models; per-agent mode, temperature, steps, permissions) and `src/prompts/**` are the
**only** sources of truth. `tools/transpile.ts` emits OpenCode, Cursor, Claude Code, Codex, and shared skills.

- Never hand-edit `dist/` or `manifest.txt` — both are generated and **tracked**. Fix the catalog or the prompt body,
  then `bun run build` before commit.
- Prompt bodies in `src/prompts/agents/*.md` carry **no frontmatter**; transpile adds it.
- `{{include:fragments/<name>.md}}` in a prompt body is resolved at transpile time.

## Checked artifacts

`bun run check` fails the build (and CI) on drift, so these must be updated together:

- Changing a host profile in `src/catalog.yaml` requires editing the profile × host matrix in `README.md` to match — the
  check compares the matrix and each agent's `profile`.
- Any `src/` change requires a `bun run build` before `bun run check`; check compares against `dist/` and against
  `manifest.txt` hashes.

## Build, test, release

@CONTRIBUTING.md

Do **not** run `test/e2e-pipeline.sh` unless explicitly asked. It spends real opencode-go budget, requires an installed
and authenticated `opencode`, and is deliberately excluded from CI.

## Code style

Biome lints `src/**/*.ts` and `tools/**/*.ts` (`bun run lint`, `bun run lint:fix`). Prettier formats those same files
plus all `**/*.md` (`bun run format`). Shell scripts are covered by `bash -n` + `shellcheck` only. Both are configured
to match the conventions already in the tree, so keep to them:

- No semicolons, double quotes, 2-space indent.
- `.ts` extension in relative imports (`import { deepMerge } from "./merge.ts"`).
- Node builtins namespaced: `import * as fs from "node:fs/promises"`.
- `tools/*.ts` use a `#!/usr/bin/env bun` shebang and top-level `await main()`.

## Commits

Conventional Commits, lowercase, imperative, no scope:
`fix: allow openai/ model prefix for opencode agents, sync README`. Types in use: `feat`, `fix`, `refactor`, `chore`,
`docs`. Feature branches are `feat/<slug>`.
