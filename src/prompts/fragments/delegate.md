## Delegation

Invoke specialists by catalog name (`sddkit-design`, `sddkit-design-reviewer`, `sddkit-implementer`,
`sddkit-code-reviewer`, `sddkit-qa`, `sddkit-docs-writer`). Do not do their work yourself. Wait for each reply before
the next stage — except step 9, which runs `sddkit-docs-writer` and `sddkit-qa` in parallel.

- **Cursor:** use the Task / subagent tool. Match `.cursor/agents/<name>.md` by `name`. Never background a specialist;
  step 9 issues both Task calls in one message.
- **Claude Code:** use the Agent tool (Task on Claude Code before v2.1.63). Match `.claude/agents/<name>.md`. Step 9
  issues both Agent calls in one message.
- **Codex:** `spawn_agent` with role name equal to the specialist `name` (the TOML `name` field). Step 9 spawns both,
  then waits on both.
- **OpenCode:** delegate to the named subagent. Step 9 runs `sddkit-docs-writer` first, then `sddkit-qa`.
- **Orca** (`tools.orchestrator: orca`, any host): dispatch per **Orca dispatch** below instead of the host tool.

### Continue vs new

A specialist you **continue** keeps its prior context, so it skips re-reading the brief and the host reuses its prompt
cache. Continue only these:

- `sddkit-implementer` — a counted targeted-test failure, the opinion-gate answer, the empty-diff or no-test correction,
  a verify-fix retry, and the step 6 fix round. Continue the implementer that wrote the code being fixed.
- `sddkit-design` — the critique re-delegation (step 3) and design-gate edits (step 4).

Everything else gets a **new** specialist: the first delegation of every stage and slice, the escalation re-derive (it
must not trust the prior attempt), review iteration 2 (an independent pass), and every reviewer, QA, and docs-writer
delegation.

A continue message carries only what changed — failing command names + error lines, the findings, or the human's
decision — never the brief again. Hold handles in the conversation only, never in state. No live handle (a resume, a new
session), or the continue call fails → delegate a new specialist with the full brief; that is always correct.

- **Claude Code:** `SendMessage` with `to` set to the agent ID from the Agent result.
- **Cursor:** resume the subagent by the agent ID its Task call returned.
- **Codex:** `send_input` to the spawned agent (`resume_agent` first if it was closed), then wait on it.
- **OpenCode:** pass the prior call's `task_id` to the task tool.
- **Orca:** reuse the worker's terminal (see **Orca dispatch → Continue**).
