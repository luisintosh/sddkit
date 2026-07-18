// Cursor beforeShellExecution hook — the Cursor-side equivalent of OpenCode's
// declarative opencode.jsonc permission.bash deny rules. Cursor has no
// declarative bash-permission config, so this hook is the sole enforcer here.
import { isDangerousBashCommand } from "../../../core/state-engine/index"
import { readHookInput, allow, deny } from "./hook-io"

function main(): void {
  const input = readHookInput()
  const command = typeof input.command === "string" ? input.command : undefined
  if (!command) allow()

  if (isDangerousBashCommand(command)) {
    deny(`command is blocked by the SDD harness's guardrails: ${command}`)
  }

  allow()
}

main()
