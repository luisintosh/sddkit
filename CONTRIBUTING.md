# Contributing

Requires Node ≥22.18 (runs `tools/*.ts` directly via type stripping) and pnpm (`corepack enable`). Run `pnpm install`
once; tests use Vitest and bundles use esbuild.

## Source of truth

| Edit                                 | Then run                       |
| ------------------------------------ | ------------------------------ |
| `src/prompts/**`, `src/catalog.yaml` | `pnpm run build`               |
| `src/state/**`                       | `pnpm run build` + `pnpm test` |
| `tools/install.ts`                   | `pnpm run build`               |

`dist/` and `manifest.txt` are **generated and tracked** so clients install without a build. Never hand-edit them. After
any `src/` change run `pnpm run build` before commit; CI fails if they drift.

New catalog agents must be named `sddkit-<role>` so they cannot collide with host built-ins (Cursor's `code-reviewer`,
and similarly generic IDs on Codex/Claude/OpenCode). The conductor (`sddkit`) and planner (`sddkit-epic`) already follow
that rule.

## Hygiene (`pnpm run check`)

Requires a prior `pnpm run build`. Validates:

- `src/catalog.yaml` shape (agents are `sddkit` or `sddkit-*`; no `implementer-pro` or `tester`; every host × profile
  present)
- Emitted dist frontmatter / Codex TOML matches catalog profiles
- README profile × host matrix and agent → profile table match catalog
- Prompt contracts, read from the built prompts: required phrases, and every reference a conductor pointer names is
  emitted (skill `references/` and `dist/agents/sddkit/references/` for OpenCode) with no unresolved `{{…}}`
- `manifest.txt` hashes match `dist/`
- `dist/install.js` is present and matches a rebuild of `tools/install.ts`

## Before committing

```bash
pnpm run build
pnpm run check
find . -name '*.sh' -not -path './node_modules/*' -not -path './test/fixture-repo/node_modules/*' -print0 | xargs -0 -n1 bash -n
find . -name '*.sh' -not -path './node_modules/*' -not -path './test/fixture-repo/node_modules/*' -print0 | xargs -0 shellcheck
pnpm test
bash test/e2e-install.sh
```

## Evals

`evals/<skill>/` holds prompt-behavior evals in the skill-creator format, run against a copy of `test/fixture-repo`:
`evals.json` (task prompts + expectations) and `trigger-evals.json` (should/shouldn't-trigger queries for the
description optimizer). After changing a prompt or a catalog `description`, rerun the matching set with the
skill-creator skill.

## Tooling (TypeScript on Node)

| Script                        | Purpose                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `node tools/transpile.ts`     | `src/` → `dist/{opencode,cursor,claude,codex}` + `dist/agents/skills`   |
| `node tools/install.ts`       | installer source (Clack + copy); emitted as `dist/install.js`           |
| `node tools/build-cli.ts`     | portable Node ESM `dist/bin/sddkit-state.mjs`                           |
| `node tools/build-install.ts` | `tools/install.ts` → `dist/install.js` (esbuild, Node ESM for npx/bunx) |
| `node tools/gen-manifest.ts`  | `manifest.txt` from `dist/`                                             |
| `node tools/check.ts`         | hygiene                                                                 |
| `pnpm run release`            | tag HEAD, push, publish a GitHub Release                                |

`pnpm run build` runs transpile + build-cli + gen-manifest + build-install.

## Releasing

Tags HEAD (the latest commit), pushes the branch and tag, and publishes a GitHub Release. Installers pin a ref with
`npx -y github:luisintosh/sddkit#vX.Y.Z` or `bunx github:luisintosh/sddkit#vX.Y.Z` (default branch is `master`).

```bash
pnpm run release            # patch bump from the latest tag (v1.2.0 → v1.2.1)
pnpm run release --minor
pnpm run release --major
pnpm run release v1.3.0  # explicit version
```

Publishing a GitHub Release runs CI’s `release-assets` job, which uploads `sddkit-dist.tar.gz` (`dist/` +
`manifest.txt`). Annotated tags; don’t move published tags — cut a new patch instead.
