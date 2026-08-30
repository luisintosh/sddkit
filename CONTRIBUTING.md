# Contributing

## Source of truth

| Edit                                 | Then run                     |
| ------------------------------------ | ---------------------------- |
| `src/prompts/**`, `src/catalog.yaml` | `bun run build`              |
| `src/state/**`                       | `bun run build` + `bun test` |

`dist/` and `manifest.txt` are **generated and tracked** so clients install without a build. Never hand-edit them. After
any `src/` change run `bun run build` before commit; CI fails if they drift.

## Hygiene (`bun run check`)

Requires a prior `bun run build`. Validates:

- `src/catalog.yaml` shape (no `implementer-pro`, every host × profile present)
- Emitted dist frontmatter / Codex TOML matches catalog profiles
- README profile × host matrix and agent → profile table match catalog
- `manifest.txt` hashes match `dist/`

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

| Script                      | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `bun tools/transpile.ts`    | `src/` → `dist/{opencode,cursor,claude,codex}` + `dist/agents/skills` |
| `bun tools/install-tui.ts`  | Clack TUI used by `install.sh` when stdin is a TTY                    |
| `bun tools/build-cli.ts`    | portable `dist/bin/sddkit-state` (+ `--compile` for mac binaries)     |
| `bun tools/gen-manifest.ts` | `manifest.txt` from `dist/`                                           |
| `bun tools/check.ts`        | hygiene                                                               |

`bun run build` runs transpile + build-cli + gen-manifest.

## Releasing

```bash
git tag -a vX.Y.Z -m "one-line summary"
git push origin vX.Y.Z
```

Publishing a GitHub Release runs CI’s `release-assets` job, which uploads:

- `sddkit-dist.tar.gz` (`dist/` + `manifest.txt`) — preferred by `install.sh` for tags
- `sddkit-state-darwin-arm64` / `sddkit-state-darwin-x64`

If the release asset is missing, the installer downloads the source tarball and uses the committed `dist/` — it never
runs `bun run build` on the client.

- Annotated tags; don’t move published tags — cut a new patch instead.
- Default interactive install resolves the latest tag, then falls back to `master`.
