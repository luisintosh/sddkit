# opencode-harness-toolkit

A thin [opencode](https://opencode.ai) harness for **spec-driven development (SDD)**: an approved
spec, spec-derived acceptance contracts (tagged `@S<n>` for traceability), TDD using the consuming
repo's own test stack, a multi-agent pipeline with a self-correcting escalation ladder, and a
file-based **`state.yaml` checkpoint** with exactly one writer — all driven by a single primary
agent, `sdd`, that runs an autonomous-but-human-in-the-loop workflow and is resumable from on-disk
state.

## Layout

```text
opencode.jsonc
package.json          plugin runtime deps (yaml, zod, @opencode-ai/plugin) — installed to .opencode/
manifest.txt           sha256 manifest of every installable file, CI-verified
agents/
  sdd.md                primary — sequences stages, owns gates, routes findings, checkpoints state
  spec.md               writes spec.md + acceptance contracts/*.feature (@S<n> tagged)
  architect.md           explores the codebase, writes plan.md + tasks.md (slice breakdown)
  tester.md               red phase — failing tests from acceptance contracts (test-only edits)
  implementer.md          green phase — minimal impl to pass tests (no test edits)
  implementer-pro.md      hidden escalation rung — stronger model, invoked after 2 failed attempts
  reviewer.md              read-only reviewer — slice-diff review + pre-gate spec/plan critique
  reviewer-2.md            hidden cross-family final reviewer for escalated slices
  qa.md                    validates the finished feature against spec/contracts
plugins/
  sdd-guard.ts           checkpoint + compact tools, guardrails, append-only journal (opencode plugin)
  sdd-guard.test.ts       bun test suite for the plugin's merge/validate/guard logic
scripts/
  gen-manifest.sh         regenerates manifest.txt
  check.mjs               CI hygiene checks (frontmatter schema, README drift, manifest freshness)
test/
  e2e-install.sh          Tier 1 — installer lifecycle, runs in CI, no network needed
  e2e-pipeline.sh         Tier 2 — one real (cheap) opencode run, manual, not wired into CI
  fixture-repo/           tiny Node project e2e-pipeline.sh installs the harness into
```

State lives in the **consuming repo's root**, owned by that repo:

```text
AGENTS.md                always-loaded project memory (install/dev/build/test/lint/typecheck commands)
docs/
  ARCHITECTURE.md        system design, module map, key decisions
  CONSTITUTION.md        governing principles (optional)
  feats/<feature>/
    state.yaml           the checkpoint — single writer (sdd, via the checkpoint tool), Zod-validated
    journal.ndjson       append-only audit trail of every checkpoint write
    spec.md
    contracts/*.feature  Given/When/Then scenarios tagged @S1, @S2, ...
    plan.md
    tasks.md
```

## Models

Each agent is pinned to a model chosen for its workload and cost, with a `steps` cap as thrash/budget
insurance. `implementer-pro` and `reviewer-2` are hidden escalation-only agents — `@sdd` invokes them,
you never delegate to them directly.

| agent | model | notes |
|---|---|---|
| `sdd` | `opencode-go/kimi-k2.7-code` | conductor — pure tool-calling/state management |
| `spec` | `opencode-go/glm-5.2` | low-volume, high-leverage reasoning and writing |
| `architect` | `opencode-go/glm-5.2` | best open coder + long context for codebase exploration |
| `tester` | `opencode-go/kimi-k2.7-code` | test-writing + run-loop heavy |
| `implementer` | `opencode-go/deepseek-v4-flash` | highest-iteration role; green phase has an oracle (failing tests) |
| `implementer-pro` | `opencode-go/deepseek-v4-pro` | hidden — escalation rung, same family as implementer |
| `reviewer` | `opencode-go/kimi-k2.7-code` | cross-provider vs. the implementer, for an independent perspective |
| `reviewer-2` | `opencode-go/minimax-m3` | hidden — third model family, final review on escalated slices only |
| `qa` | `opencode-go/glm-5.2` | terminal/browser-driven validation workload |

This table is checked in CI (`scripts/check.mjs`) against each agent's frontmatter — it cannot drift
silently.

## Use

### Install

Run the installer from the root of the consuming repository:

```bash
curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | bash
```

This downloads `manifest.txt` for the resolved ref, fetches every file it lists into a scratch
directory, verifies each sha256, and only then installs into `.opencode/` — nothing is written unless
every file checks out. Re-running is safe and idempotent:

- unchanged files are left alone
- files that changed upstream are updated
- files you edited locally are backed up under `.opencode/.backup-<timestamp>/` before being replaced
- files removed upstream are pruned (backed up first if you'd modified them)

Options (environment variables):

- `VERSION=v0.2.0` — pin to a specific release tag (default: latest tag, falling back to `master`)
- `BRANCH=some-branch` — install from a branch instead of a tag
- `LOCAL_SOURCE=/path/to/checkout` — install from a local copy instead of downloading (CI/testing)
- `TARGET_DIR=/path` — install into a directory other than the current one

Flags: `--dry-run` (show what would change without writing anything), `--doctor` (environment checks
only — this also runs automatically, warn-only, after a real install).

### Setup Docs

Run once in the consuming repo:

```text
/setup-docs
```

This creates the project AI working context: `AGENTS.md` (including a dev/run command, since `qa`
depends on it, and a single-test-file command, since the implementation slice loop depends on it),
`docs/ARCHITECTURE.md`, `docs/CONSTITUTION.md`, and `docs/feats/.gitkeep` if missing.

### Start a Feature

The default agent is `sdd` — start by typing a feature request:

```text
Add account export.
```

`sdd` asks once whether to use GitHub integration (draft PR + QA report as a PR comment) or stay
local (everything on the feature branch, QA report in chat + on disk). It then slugifies the feature,
scaffolds `docs/feats/<slug>/state.yaml`, and runs the pipeline below. To resume an interrupted or
gated run, ask `sdd` to continue.

## Pipeline

```
initialize → specify → spec critique → ⏸spec gate → acceptance contracts → plan → plan critique
  → ⏸plan gate → tasks → implementation slices → verify → docs-sync → pr → qa → complete
```

Each implementation slice is:

```
red(@tester) → green(@implementer) → targeted test → review loop(@reviewer) → commit
```

Gates pause for human approval. The reviewer is read-only and bounded (max 3 iterations per slice,
max 2 QA-driven fix cycles). Before each human gate, `@reviewer` also runs a one-shot artifact
critique on the spec/plan so gates see pre-hardened drafts.

**Escalation ladder**: if `@implementer` fails the slice's targeted tests twice, or a review loop
exhausts with unresolved blocker findings, `@sdd` sets `escalation: 1` and re-runs the green phase via
the hidden `@implementer-pro` (a stronger model in the same family). Once escalated, the slice's final
clean verdict must come from the hidden `@reviewer-2` — a third model family, so escalated code isn't
approved solely by the reviewer instance that passed earlier iterations. One rung only; a second
exhaustion pauses for the human.

"Done" is: all slices committed, `verify` green, docs synced, `qa` clean — plus a draft PR opened when
GitHub mode is on. `sdd` doesn't declare success otherwise.

## State enforcement

`docs/feats/<feature>/state.yaml` has exactly one writer: `@sdd`, and only through the `checkpoint`
custom tool shipped in `plugins/sdd-guard.ts` — never by editing the file. Subagents never touch
state; they return a YAML reply block that `@sdd` applies. The plugin:

- **validates** every write against a Zod schema (stage/slice_phase enums, required keys, finding
  records) before it touches disk, and writes atomically (tmp file + rename)
- **journals** every checkpoint to `docs/feats/<feature>/journal.ndjson` — a full audit trail
- **blocks** direct edits to `state.yaml`/`journal.ndjson`, any write into `.opencode/**`
  (self-modification), and writes into another feature's `docs/feats/<other>/` while a different
  feature is active — all via a `tool.execute.before` hook that throws to stop the write
- adds defense-in-depth against pushing straight to `main`/`master` from a bash tool call, beyond the
  declarative deny rules in `opencode.jsonc`
- exposes a `compact` tool — the programmatic equivalent of `/compact` — that `@sdd` calls at two
  points in the pipeline (after the plan gate, after `verify` goes green) to summarize its own session
  context. Callable only by `@sdd`; failures/timeouts are journaled and swallowed, never block the
  workflow.

Agent frontmatter (`permission.edit`) denies the same paths declaratively as a second layer, and
`opencode.jsonc` denies `git push* main*`/`git push* master*` outright while keeping `gh pr merge *`
on `ask`.

## Notes

- No commands or scripts are required beyond the bundled `/setup-docs` command and the shipped
  `sdd-guard` plugin — `opencode` auto-installs the plugin's dependencies from `.opencode/package.json`.
- The workflow runs in the current repository checkout — no worktree isolation.
- `AGENTS.md` must list the project's install/dev/build/test/lint/typecheck commands; `sdd` and `qa`
  read them at the `verify` and `qa` stages respectively.
- GitHub integration is optional and off by default when unattended (`github: false`); `sdd` asks
  once at initialize time when interactive.
