// Cursor beforeShellExecution hook — the Cursor-side equivalent of OpenCode's
// declarative opencode.jsonc permission.bash deny rules PLUS the plugin's
// push-to-main defense-in-depth. Cursor has no declarative bash-permission
// config, so this hook is the sole enforcer here (not defense-in-depth).
import { isPushToMainCommand, isDangerousBashCommand } from "../../../core/state-engine/index"
import { readHookInput, allow, deny } from "./hook-io"

function main(): void {
  const input = readHookInput()
  const command = typeof input.command === "string" ? input.command : undefined
  if (!command) allow()

  if (isPushToMainCommand(command)) {
    deny("pushing directly to main/master is blocked — open a pull request instead.")
  }
  if (isDangerousBashCommand(command)) {
    deny(`command is blocked by the SDD harness's guardrails: ${command}`)
  }

  allow()
}

main()
