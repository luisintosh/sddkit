- **Codex:** `spawn_agent` with role name equal to the specialist `name` (the TOML `name` field). A parallel step spawns
  all its agents, then waits on all. Continue: `send_input` to the spawned agent (`resume_agent` first if it was
  closed), then wait on it.
