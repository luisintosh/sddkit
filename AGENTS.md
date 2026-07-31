# AGENTS.md

This file provides guidance to coding agents when working with code in this repository. `CLAUDE.md` is a symlink to this
file.

## What this is

sddkit ships no runtime app. It ships agent prompts plus a small state CLI that `install.sh` installs into a _consuming_
repo (`.opencode/`, `.cursor/`, `bin/sddkit-state`). Nothing here runs against this repo's own code.

## Generation model

`src/catalog.yaml` (per-agent model, mode, temperature, steps, permissions) and `src/prompts/**` are the **only**
sources of truth. `tools/transpile.ts` emits two targets from them — `dist/opencode/` (YAML frontmatter +
`opencode.jsonc`) and `dist/cursor/` (frontmatter with a `[]`-suffixed model and a `## Tool restrictions (Cursor)`
section synthesized from the OpenCode permission map, since Cursor has no permission config).

- Never hand-edit `dist/` or `manifest.txt` — both are generated and gitignored. Fix the catalog or the prompt body and
  rebuild.
- Prompt bodies in `src/prompts/agents/*.md` carry **no frontmatter**; transpile adds it.
- `{{include:fragments/<name>.md}}` in a prompt body is resolved at transpile time.

## Checked artifacts

`bun run check` fails the build (and CI) on drift, so these must be updated together:

- Changing an agent's model in `src/catalog.yaml` requires editing the dual-model table in `README.md` to match — the
  check compares them row by row.
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
