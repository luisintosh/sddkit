// Shared stdin/stdout protocol for Cursor command-hooks (.cursor/hooks.json).
// Confirmed from Cursor's docs: hooks receive JSON on stdin and may write JSON
// to stdout; a deny decision is BOTH the JSON body {permission:"deny",...} AND
// exit code 2 (some Cursor versions/paths key off one or the other, so we emit
// both defensively rather than betting on a single signal).
import { readFileSync } from "node:fs"

export type HookInput = Record<string, unknown> & {
  workspace_roots?: string[]
}

export function readHookInput(): HookInput {
  const raw = readFileSync(0, "utf8")
  return raw.trim() ? JSON.parse(raw) : {}
}

export function resolveRoot(input: HookInput): string {
  return input.workspace_roots?.[0] ?? process.cwd()
}

export function allow(): never {
  process.exit(0)
}

export function deny(message: string): never {
  process.stdout.write(JSON.stringify({ permission: "deny", user_message: message, agent_message: message }))
  process.exit(2)
}
