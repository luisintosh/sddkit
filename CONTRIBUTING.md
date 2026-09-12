# Contributing

## Source of truth

| Edit                                 | Then run                     |
| ------------------------------------ | ---------------------------- |
| `src/prompts/**`, `src/catalog.yaml` | `bun run build`              |
| `src/state/**`                       | `bun run build` + `bun test` |
| `tools/install.ts`                   | `bun run build`              |

`dist/` and `manifest.txt` are **generated and tracked** so clients install without a build. Never hand-edit them. After
any `src/` change run `bun run build` before commit; CI fails if they drift.

New catalog agents must be named `sddkit-<role>` so they cannot collide with host built-ins (Cursor's `code-reviewer`,
and similarly generic IDs on Codex/Claude/OpenCode). The conductor (`sddkit`) and planner (`sddkit-plan`) already follow
that rule.

## Hygiene (`bun run check`)

Requires a prior `bun run build`. Validates:

- `src/catalog.yaml` shape (agents are `sddkit` or `sddkit-*`; no `implementer-pro` or `tester`; every host × profile
  present)
- Emitted dist frontmatter / Codex TOML matches catalog profiles
- README profile × host matrix and agent → profile table match catalog
- `manifest.txt` hashes match `dist/`
- `dist/install.js` is present and matches a rebuild of `tools/install.ts`

## Before committing

```bash
bun run build
bun run check
find . -name '*.sh' -not -path './node_modules/*' -not -path './test/fixture-repo/node_modules/*' -print0 | xargs -0 -n1 bash -n
find . -name '*.sh' -not -path './node_modules/*' -not -path './test/fixture-repo/node_modules/*' -print0 | xargs -0 shellcheck
bun test
bash test/e2e-install.sh
```

## Tooling (Bun TypeScript)

| Script                       | Purpose                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `bun tools/transpile.ts`     | `src/` → `dist/{opencode,cursor,claude,codex}` + `dist/agents/skills` |
| `bun tools/install.ts`       | installer source (Clack + copy); emitted as `dist/install.js`         |
| `bun tools/build-cli.ts`     | portable Node ESM `dist/bin/sddkit-state.mjs`                         |
| `bun tools/build-install.ts` | `tools/install.ts` → `dist/install.js` (`--target node` for npx/bunx) |
| `bun tools/gen-manifest.ts`  | `manifest.txt` from `dist/`                                           |
| `bun tools/check.ts`         | hygiene                                                               |
| `bun run release`            | tag HEAD, push, publish a GitHub Release                              |

`bun run build` runs transpile + build-cli + gen-manifest + build-install.

## Releasing

Tags HEAD (the latest commit), pushes the branch and tag, and publishes a GitHub Release. Installers pin a ref with
`npx -y github:luisintosh/sddkit#vX.Y.Z` or `bunx github:luisintosh/sddkit#vX.Y.Z` (default branch is `master`).

```bash
bun run release            # patch bump from the latest tag (v1.2.0 → v1.2.1)
bun run release -- --minor
bun run release -- --major
bun run release -- v1.3.0  # explicit version
```

Publishing a GitHub Release runs CI’s `release-assets` job, which uploads `sddkit-dist.tar.gz` (`dist/` +
`manifest.txt`). Annotated tags; don’t move published tags — cut a new patch instead.
