## Orca dispatch

Applies only when state has `tools.orchestrator: orca`; otherwise skip this section. It replaces _how_ a specialist is
invoked — never which specialist, the brief's content, the stage order, gates, or reply mapping. Run every command with
`orca.cli` from state (written as `ORCA` below — substitute it; never run `ORCA` literally or switch binaries). Prefer
`--json`.

{{orca:routes}}

**Run.** First dispatch of a feature with `orca.run_id` empty →
`ORCA orchestration run-create --objective "sddkit <slug>" --json`; patch `orca.run_id`. Pass `--run <run_id>` to every
orchestration command that accepts it (all below except `worker-release`).

**Files.** `D=$(git rev-parse --git-common-dir)/sddkit/<slug>` (inside `.git`: never committed, shared by worktrees).
For dispatch `<n>` of a specialist within a stage, write the brief you would have sent natively to
`$D/<specialist>-<stage>-<n>.brief.md`; the worker writes its reply to `$D/<specialist>-<stage>-<n>.reply.yaml`. The
Task spec is always:

> Act as `<specialist>`: read `<agent file>` (repo root, else `$HOME`) and follow its body as your instructions; ignore
> its frontmatter. Your brief is `<brief path>`. When done, write your YAML reply block — exactly what the agent file
> says to return — to `<reply path>` (a file inside `.git`, not a repo edit, so read-only roles may write it), then send
> `worker_done` with `--report-path <reply path>`: `--outcome succeeded` when the reply is written, `failed` only when
> you could not produce one.

**Dispatch.** You always start the worker yourself with the table's launch command — it pins the model and skips the
CLI's approval prompts (Claude `--permission-mode auto`, Cursor `--yolo`), so an unattended run never stalls on one.
Never use `worker-start --agent`: Orca would launch with its own settings instead.

1. `ORCA orchestration task-create --spec "<spec>" --run <run_id> --json` → `task_id`.
2. Open the worker's terminal → `handle`:
   - `orca.pane` non-empty (you run in an Orca terminal; the human watches the specialist beside you):
     `ORCA terminal split --terminal <orca.pane> --direction vertical --command "<launch command>" --json`.
   - `orca.pane` empty, or escalation (step 8):
     `ORCA terminal create --worktree <current | path:<worktree>> --command "<launch command>" --json` (a tab).
3. `ORCA terminal rename --terminal <handle> --title "<specialist> · <stage>" --json`.
4. `ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json`.
5. `ORCA orchestration worker-start --task <task_id> --terminal <handle> --worktree <same as step 2> --run <run_id> --json`.

Journal the launch command used — Orca records no model for a terminal you started. Record the handle: Orca will not
close a terminal it did not create, so it is yours to close (see **Close**). Escalation: one tab per worktree
(`path:<worktree>`), both started before waiting — a split pane always starts in your own worktree. Docs-sync ∥ QA (step
9): start both workers, then **Wait** until both settle, processing each `worker_done` as it arrives.

**Wait.** `ORCA orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json` (add
`--ack <delivery_id>` from the second call on). Process every message before acking:

- `question` → answer from state, spec, plan, or the brief with
  `ORCA orchestration reply --id <message_id> --body "..." --json`. Needs a human → ask the human (unattended → journal,
  record a blocker, reply that it is blocked).
- `worker_done` → must name a dispatch you started. Read the reply file and apply it exactly as a native reply (reply
  mapping unchanged). Missing or unparsable reply file, or `--outcome failed` → an empty reply: same
  re-delegate-once-then-blocker rule as the step that dispatched it. Either outcome → **Close** before acking or
  dispatching again.
- `escalation` → treat as that specialist's blocker.

A timeout or empty result is a checkpoint, not a failure: keep waiting. After three empty waits,
`ORCA orchestration worker-list --run <run_id> --json` and follow each row's `projection.nextAction`. Never stop,
abandon, retry, or release a worker without positive proof (`exited` liveness or a settled `worker_done`).

**Close.** Once a specialist is done its pane goes away — whatever the outcome, before the next dispatch:
`ORCA orchestration worker-release --dispatch <dispatch_id> --json` — it comes back `state: retained`,
`reason: external_terminal` because you started the terminal — then `ORCA terminal close --terminal <handle> --json`.
Also close a terminal at once when no worker took it: `tui-idle` wait timed out, or `worker-start --terminal` failed.
After a `worker-stop` or `worker-abandon` (positive exit proof only), close it the same way. Close only handles you
opened — never `orca.pane` or anything else.

**Failure.** `worker-start` exits non-zero → never relaunch blindly. Read `failedStage` and `residualResources`, run any
recovery commands the receipt names, then **Close** the terminal you opened. Nothing left behind → patch
`tools.orchestrator: native`, journal why, and delegate this and later stages natively; otherwise record a blocker.

**Resume.** Before any dispatch, `ORCA orchestration worker-list --run <run_id> --json`. Any unsettled dispatch in the
run → go to **Wait** until every one settles; never start a duplicate editor. Do not end your turn while
`worker-list --run <run_id> --terminal-state reclaimable --json` returns rows — **Close** them first. Terminals from an
earlier session: `ORCA terminal list --json`; one titled `sddkit-<role> · <stage>` whose dispatch has settled → close
it.
