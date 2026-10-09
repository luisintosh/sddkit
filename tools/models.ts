export type Host = "opencode" | "cursor" | "claude" | "codex"

export type ModelRef = {
  id: string
  effort?: string
}

export const PROFILE_NAMES = [
  "conduct",
  "think",
  "execute",
  "design-review",
  "code-review",
  "validate",
  "write",
] as const

export type ProfileName = (typeof PROFILE_NAMES)[number]

export function formatCursorModel(ref: ModelRef): string {
  if (ref.id === "inherit") return "inherit"
  if (ref.effort) return `${ref.id}[effort=${ref.effort}]`
  return `${ref.id}[]`
}

export function formatClaudeModel(ref: ModelRef): string {
  return ref.id
}

export function formatClaudeDisplay(ref: ModelRef): string {
  if (ref.id === "inherit") return "inherit"
  return ref.effort ? `${ref.id}[effort=${ref.effort}]` : ref.id
}

export function formatOpenCodeModel(ref: ModelRef): string {
  return ref.id
}

// OpenCode takes effort as the agent's `variant` (a key of the model's variants map, e.g. "max" on deepseek-v4*).
export function formatOpenCodeDisplay(ref: ModelRef): string {
  return ref.effort ? `${ref.id}[${ref.effort}]` : ref.id
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
    think: "grok-4.7[effort=xhigh]",
    execute: "grok-4.7[effort=high]",
  },
  claude: {
    think: "opus[effort=medium]",
    execute: "sonnet[effort=high]",
  },
  codex: {
    think: { model: "gpt-6.1-sol", reasoning: "xhigh" },
    execute: { model: "gpt-6.1-sol", reasoning: "high" },
  },
} as const
