export type OrcaAgent = "claude" | "cursor" | "codex"

export type OrcaRoute = {
  agent: OrcaAgent
  id: string
  effort?: string
}

export type OrcaRoutes = Record<string, OrcaRoute>

export const ORCA_AGENTS: readonly OrcaAgent[] = ["claude", "cursor", "codex"]

/** Agents the conductor never dispatches: itself and the standalone planner. */
export const ORCA_UNDISPATCHED = new Set(["sddkit", "sddkit-epic"])

type CatalogSlice = {
  orchestrators?: { orca?: { profiles?: OrcaRoutes } }
  agents?: Record<string, { profile?: string }>
}

/** Specialist name → route, in catalog order. Unrouted profiles are omitted. */
export function orcaRoutesByAgent(catalog: CatalogSlice): OrcaRoutes {
  const profiles = catalog.orchestrators?.orca?.profiles ?? {}
  const out: OrcaRoutes = {}
  for (const [name, agent] of Object.entries(catalog.agents ?? {})) {
    if (ORCA_UNDISPATCHED.has(name) || !agent.profile) continue
    const route = profiles[agent.profile]
    if (route) out[name] = route
  }
  return out
}

const BINARIES: Record<OrcaAgent, string> = {
  claude: "claude",
  cursor: "cursor-agent",
  codex: "codex",
}

export function orcaBinary(agent: OrcaAgent): string {
  return BINARIES[agent]
}

/** Agent file a worker reads as its instructions, relative to the repo or $HOME. */
export function orcaAgentFile(agent: OrcaAgent, name: string): string {
  if (agent === "codex") return `.codex/agents/${name}.toml`
  return `.${agent}/agents/${name}.md`
}

/**
 * Command the conductor starts in a split pane or tab it creates. Workers run
 * unattended, so each CLI skips its approval prompts: Claude in auto mode,
 * Cursor in --yolo, Codex with approvals off inside its workspace sandbox.
 */
export function orcaLaunchCommand(route: OrcaRoute): string {
  const parts = [orcaBinary(route.agent)]
  if (route.agent === "codex") {
    parts.push(`-m ${route.id}`)
    if (route.effort) parts.push(`-c model_reasoning_effort=${route.effort}`)
    // Sandboxed like the emitted Codex agents, so no-approval stays confined to the workspace.
    parts.push("--sandbox workspace-write --ask-for-approval never")
  } else {
    parts.push(`--model ${route.id}`)
    if (route.effort) parts.push(`--effort ${route.effort}`)
    parts.push(route.agent === "claude" ? "--permission-mode auto" : "--yolo")
  }
  return parts.join(" ")
}
