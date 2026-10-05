import { type OrcaRoutes, orcaAgentFile, orcaBinary } from "./orca.ts"

export type ProbeDeps = {
  env: Record<string, string | undefined>
  platform: string
  root: string
  home: string
  /** Run a command; never throws. `code` is null when the binary could not start. */
  exec: (cmd: string, args: string[]) => Promise<{ code: number | null; stdout: string }>
  which: (bin: string) => Promise<boolean>
  exists: (filePath: string) => Promise<boolean>
}

export type ProbeResult = {
  orchestrator: "orca" | "native"
  cli: string
  pane: string
  reason: string
}

/** Same resolution order as the Orca orchestration skill; never falls through on failure. */
export function resolveOrcaCli(env: ProbeDeps["env"], platform: string): string {
  if (env.ORCA_CLI_COMMAND) return env.ORCA_CLI_COMMAND
  if (env.ORCA_DEV_REPO_ROOT) return "orca-dev"
  // Bare `orca` on Linux outside Orca is usually the GNOME screen reader.
  if (platform === "linux" && !env.ORCA_TERMINAL_HANDLE) return "orca-ide"
  return "orca"
}

export async function probeOrchestrator(deps: ProbeDeps, routes: OrcaRoutes): Promise<ProbeResult> {
  const native = (reason: string, cli = ""): ProbeResult => ({ orchestrator: "native", cli, pane: "", reason })

  if (deps.env.SDDKIT_ORCHESTRATOR === "native") return native("SDDKIT_ORCHESTRATOR=native")
  if (!Object.keys(routes).length) return native("catalog has no orca routes")

  const cli = resolveOrcaCli(deps.env, deps.platform)
  const status = await deps.exec(cli, ["status", "--json"])
  if (status.code === null) return native(`${cli} not found`, cli)
  let parsed: {
    ok?: boolean
    result?: { runtime?: { state?: string } }
  }
  try {
    parsed = JSON.parse(status.stdout)
  } catch {
    return native(`${cli} status --json returned no JSON (exit ${status.code})`, cli)
  }
  const runtime = parsed.result?.runtime
  if (!parsed.ok || runtime?.state !== "ready") {
    return native(`${cli} runtime not ready (${runtime?.state ?? "unknown"})`, cli)
  }

  const agents = [...new Set(Object.values(routes).map((r) => r.agent))]
  for (const agent of agents) {
    const bin = orcaBinary(agent)
    if (!(await deps.which(bin))) return native(`${bin} not on PATH`, cli)
  }

  for (const [name, route] of Object.entries(routes)) {
    const rel = orcaAgentFile(route.agent, name)
    const found = (await deps.exists(`${deps.root}/${rel}`)) || (await deps.exists(`${deps.home}/${rel}`))
    if (!found) return native(`${rel} not installed in repo or $HOME`, cli)
  }

  return { orchestrator: "orca", cli, pane: deps.env.ORCA_TERMINAL_HANDLE ?? "", reason: "ok" }
}
