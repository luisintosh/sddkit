export type Host = "opencode" | "cursor" | "claude" | "codex"

export type ModelRef = {
  id: string
  effort?: string
}

export const PROFILE_NAMES = ["conduct", "think", "execute", "test", "review", "critique", "validate", "write"] as const

export type ProfileName = (typeof PROFILE_NAMES)[number]

export function formatCursorModel(ref: ModelRef): string {
  if (ref.id === "inherit") return "inherit"
  if (ref.effort) return `${ref.id}[effort=${ref.effort}]`
  return `${ref.id}[]`
}

export function formatClaudeModel(ref: ModelRef): string {
  return ref.id
}

export function formatOpenCodeModel(ref: ModelRef): string {
  return ref.id
}

export function formatCodexModel(ref: ModelRef): { model: string; reasoning?: string } {
  if (ref.id === "inherit") return { model: "inherit" }
  return ref.effort ? { model: ref.id, reasoning: ref.effort } : { model: ref.id }
}

export function formatCodexDisplay(ref: ModelRef): string {
  const resolved = formatCodexModel(ref)
  return resolved.reasoning ? `${resolved.model}[${resolved.reasoning}]` : resolved.model
}

export const GOLDEN_MODELS = {
  cursor: {
    think: "grok-4.6[effort=xhigh]",
    test: "composer-2.5[]",
    execute: "gpt-5.6-luna[effort=high]",
  },
  claude: {
    think: "opus",
    execute: "sonnet",
  },
  codex: {
    think: { model: "gpt-5.6-sol" },
    execute: { model: "gpt-5.6-luna", reasoning: "high" },
  },
} as const
