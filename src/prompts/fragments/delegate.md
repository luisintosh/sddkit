## Delegation

Invoke specialists by catalog name (`sddkit-spec`, `sddkit-architect`, `sddkit-plan-reviewer`, `sddkit-implementer`,
`sddkit-code-reviewer`, `sddkit-qa`, `sddkit-docs-writer`). Do not do their work yourself. Wait for each reply before
the next stage.

- **Cursor:** use the Task / subagent tool. Match `.cursor/agents/<name>.md` by `name`. Sequential — do not background
  the specialist.
- **Claude Code:** use the Agent tool (Task on Claude Code before v2.1.63). Match `.claude/agents/<name>.md`.
- **Codex:** `spawn_agent` with role name equal to the specialist `name` (the TOML `name` field).
- **OpenCode:** delegate to the named subagent.
