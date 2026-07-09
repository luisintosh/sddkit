# opencode-harness-toolkit

A thin [opencode](https://opencode.ai) harness for **spec-driven development (SDD)**: an approved
spec, spec-derived acceptance contracts, TDD using the consuming repo's test stack, a multi-agent
pipeline, and a file-based **`state.yaml` checkpoint** — all driven by a single primary agent, `sdd`,
that runs an autonomous-but-human-in-the-loop workflow and is resumable from on-disk state.

## Layout

```text
opencode.jsonc
agents/
  sdd.md         primary — sequences stages, owns gates, routes findings, opens the draft PR
  spec.md        writes spec.md + acceptance contracts/*
  architect.md   explores the codebase, writes plan.md + tasks.md (slice breakdown)
  tester.md      red phase — failing tests from acceptance contracts (test-only edits)
  implementer.md green phase — minimal impl to pass tests (no test edits)
  reviewer.md    read-only review of the active slice diff
  qa.md          validates the implementation against spec/contracts on the draft PR
```

State lives in the **consuming repo's root**, owned by that repo:

```text
AGENTS.md                always-loaded project memory (build/test/lint/typecheck commands, conventions)
docs/
  ARCHITECTURE.md        system design, module map, key decisions
  CONSTITUTION.md        governing principles (optional)
  memory/               durable facts (MEMORY.md index + one-fact files)
  feats/<feature>/
    state.yaml           shared checkpoint — updated by every agent after meaningful progress
    spec.md
    contracts/*.feature
    plan.md
    tasks.md
```

## Models

Each agent is pinned to a model by task complexity (effort tier), keeping cost and latency proportional to the reasoning load.

| agent | tier | model |
|---|---|---|
| spec | high | `opencode-go/glm-5.2` |
| architect | high | `opencode-go/glm-5.2` |
| reviewer | medium | `opencode-go/kimi-k2.7-code` |
| tester | medium | `opencode-go/kimi-k2.7-code` |
| sdd | medium | `opencode-go/kimi-k2.7-code` |
| qa | high | `opencode-go/glm-5.2` |
| implementer | low | `opencode-go/deepseek-v4-flash` |

The reviewer (`kimi`) deliberately runs on a different provider than the implementer (`deepseek`) for an independent second perspective.

## Use

### Install

Run the installer from the root of the consuming repository:

```bash
curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | bash
```

This copies `opencode.jsonc` and the agent instructions into `.opencode/`.

Alternatively, mount this repo as the consuming repo's `.opencode/` (git submodule pinned, or a copy), then open `opencode`.

### Setup Docs

Run once in the consuming repo:

```text
/setup-docs
```

This creates the project AI working context: `AGENTS.md`, `docs/ARCHITECTURE.md`,
`docs/CONSTITUTION.md`, and `docs/feats/.gitkeep` if missing.

### Start a Feature

The default agent is `sdd` — start by typing a feature request:

```text
Add account export.
```

That's it. `sdd` slugifies the feature, scaffolds `docs/feats/<slug>/state.yaml`, and runs the
pipeline below. To resume an interrupted or gated run, ask `sdd` to continue.

## Pipeline

```
initialize → specify → ⏸spec gate → acceptance contracts → plan → ⏸plan gate → tasks → implementation slices → verify → docs-sync → pr → qa → complete
```

Each implementation slice is:

```
red(@tester) → green(@implementer) → targeted test → review loop(@reviewer) → commit
```

Gates pause for human approval. The reviewer is read-only and bounded (max 3 iterations); the
only "done" is: all slices committed, `verify` green, docs synced, draft PR opened, `qa` clean.

## Notes

- No commands, skills, scripts, or plugins are required beyond the bundled `/setup-docs` command.
- The workflow runs in the current repository checkout — no worktree isolation.
- `AGENTS.md` must list the project's build/test/lint/typecheck commands; `sdd` reads them at the
  `verify` stage.
