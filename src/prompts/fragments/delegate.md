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
