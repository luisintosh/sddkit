# Contributing

## Changing an installable file

`manifest.txt` is generated, not hand-edited. It's a `sha256  path` list of
every file `install.sh` downloads and installs: `opencode.jsonc`,
`package.json`, `agents/*.md`, and `plugins/*.ts` (excluding `*.test.ts`).

Whenever you touch one of those files, regenerate it:

```bash
bash scripts/gen-manifest.sh
```

If you forget, `node scripts/check.mjs` catches it — it recomputes every
hash and fails with `stale hash for <path> — run scripts/gen-manifest.sh`
(or `missing entry for <path>`, or `lists <path>, which no longer exists`).
That check also validates:

- `opencode.jsonc` parses and has the expected shape (`default_agent: sdd`,
  a `permission` block, the `setup-docs` command)
- every `agents/*.md` frontmatter matches the harness's agent schema
  (`description`, `mode: primary|subagent`, `model` prefixed
  `opencode-go/`, `temperature` in `[0,1]` if present, `steps` a positive
  integer if present, `hidden: true` agents must be `mode: subagent`)
- README's model table matches each agent's frontmatter exactly (kills doc
  drift structurally — update both together)

It's wired into CI (`.github/workflows/ci.yml`) on every push, so a stale
manifest or a drifted README table fails loud rather than merging silently.

## Before committing

Run what CI runs:

```bash
find . -name '*.sh' -not -path './node_modules/*' -not -path './test/fixture-repo/node_modules/*' -print0 | xargs -0 -n1 bash -n
find . -name '*.sh' -not -path './node_modules/*' -not -path './test/fixture-repo/node_modules/*' -print0 | xargs -0 shellcheck
bun install && node scripts/check.mjs
bun test plugins/
bash test/e2e-install.sh
```

`test/e2e-pipeline.sh` (Tier 2) needs a real, billed `opencode run` and is
deliberately not part of CI — run it manually when you want to exercise the
full pipeline end to end.

If you're editing `plugins/sdd-guard.ts`, verify it still loads under
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
