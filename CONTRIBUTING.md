# Contributing

## Source vs. generated

`core/` and `adapters/` are the only hand-edited source. Each harness's
installable tree is **generated** into `build/<harness>/` (gitignored) — the
static files copied by `build/assemble.mjs`, the plugin + checkpoint MCP server
bundled by `build/bundle.mjs`, and `build/<harness>/manifest.txt` regenerated
from the tree. Build it with:

```bash
bun run build:opencode      # -> build/opencode/
```

The manifest is a `sha256  path` list of every file in the built tree and is
always fresh by construction (regenerated from the tree on each build), so there
is no committed manifest to keep in sync.

`node scripts/check.mjs` validates:

- `adapters/opencode/opencode.jsonc` parses and has the expected shape
  (`default_agent: sdd`, a `permission` block, the `setup-docs` command, the
  `sdd-checkpoint` MCP server)
- every `agents/*.md` frontmatter matches the OpenCode agent schema
  (`description`, `mode: primary|subagent`, `model` prefixed
  `opencode-go/`, `temperature` in `[0,1]` if present, `steps` a positive
  integer if present, `hidden: true` agents must be `mode: subagent`)
- README's model table matches each agent's frontmatter exactly (kills doc
  drift structurally — update both together)
- when a `build/<harness>/` tree exists, its `manifest.txt` is internally
  consistent with the files on disk

It's wired into CI (`.github/workflows/ci.yml`) on every push (which builds
first), so a drifted README table or a stale built tree fails loud rather than
merging silently.

## Before committing

Run what CI runs:

```bash
find . -name '*.sh' -not -path './node_modules/*' -not -path './test/fixture-repo/node_modules/*' -print0 | xargs -0 -n1 bash -n
find . -name '*.sh' -not -path './node_modules/*' -not -path './test/fixture-repo/node_modules/*' -print0 | xargs -0 shellcheck
bun install && bun run build:opencode && node scripts/check.mjs
bun test core/ adapters/
bash test/e2e-install.sh
```

`test/e2e-pipeline.sh` (Tier 2) needs a real, billed `opencode run` and is
deliberately not part of CI — run it manually when you want to exercise the
full pipeline end to end.

If you're editing `adapters/opencode/plugin/sdd-guard.ts`, verify it still loads under
opencode's actual plugin loader, not just that it typechecks: opencode
first looks for a V1-shaped default export (`{ id, server() }`) and only
falls back to scanning every named export in the file — including things
like `StateSchema` that aren't plugin functions — if that's absent, which
throws. Keep the file's `export default { id: "sdd-guard", server: ... }`
shape intact; don't revert to a bare function default export.

## Releasing (git tags)

`install.sh` resolves the **latest git tag** by default (via the GitHub
tags API), falling back to `master` only if tag resolution fails. That
means a commit to `master` alone does **not** reach `curl | bash` installs
— you need to cut a tag.

```bash
git tag -a vX.Y.Z -m "one-line summary of what shipped"
git push origin vX.Y.Z
```

- Annotated tags (`-a`), not lightweight — the message shows up in `git tag
  -l -n1`.
- Tag after the commit(s) are pushed to `master`, not before.
- Once a tag is pushed, don't move it. If a fix lands after `vX.Y.0`
  shipped with a bug, cut `vX.Y.1` at the fix commit instead of
  re-tagging — moving a published tag silently changes what earlier
  `curl | bash` runs would have installed.
- Prefer a patch bump per fix over batching unrelated fixes into one tag;
  `LOCAL_SOURCE`/`VERSION` pinning means installs can target any tag
  precisely, so there's no cost to shipping small.

Bugfix example: `v0.2.0` shipped with `plugins/sdd-guard.ts` failing to
load under opencode's real plugin loader (wrong default-export shape). The
fix landed as a normal commit to `master`, then `v0.2.1` was tagged at that
commit — `v0.2.0` itself was left untouched and still points at the broken
commit, which is why a fresh default install now needs to resolve `v0.2.1`.
