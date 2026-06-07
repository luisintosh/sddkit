# opencode-harness-toolkit

A reusable [opencode](https://opencode.ai) harness you drop into any repo. It bakes in
**spec-driven development**, **Gherkin acceptance contracts**, **TDD** (vitest/jest/playwright),
**git-worktree isolation**, a **multi-agent** pipeline, and a file-based **Markdown memory** —
all driven by a single command, `/doit`, that runs an autonomous-but-human-in-the-loop workflow and
is resumable with `/re-doit`.

The harness is consumed as a **pinned git submodule mounted directly at `.opencode/`**, so opencode
reads its agents/commands/plugins/skills natively — no symlink, no copy.

## Install

From inside the repo you want to equip:

```bash
curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | bash
```

This adds the harness as the `.opencode` submodule (pinned) and runs `init.sh`, which:

- renders `opencode.json` (model tiering + safe-by-default permissions),
- scaffolds a short `AGENTS.md` and the `docs/` tree (`ARCHITECTURE.md`, `memory/`, `feats/`),
- runs an **interactive skill picker** (configurable registry; recommends skills for your stack).

`opencode` and `gh` must be installed (`init.sh` checks and guides you).

## Use

```text
/doit "<feature description>"   # run the full pipeline (pauses at spec/plan gates)
/re-doit [feature]              # resume an interrupted/paused feature
```

Pipeline stages: worktree → specify → contracts (Gherkin) → plan → tasks → tdd-red →
implement(green) → review-loop → verify → docs-sync → draft PR.

## Update

```bash
.opencode/bin/update.sh [ref]   # bump the pinned submodule + re-sync skills; never touches your state
```

## Layout

This repo **is** the `.opencode/` payload: `agents/ commands/ plugins/ skills/` plus
`skills-catalog/`, `bin/`, and `templates/`. State lives in the **consuming repo's root**
(`opencode.json`, `AGENTS.md`, `docs/`), owned by that repo and decoupled from the harness version.

See the full design in the project plan.
