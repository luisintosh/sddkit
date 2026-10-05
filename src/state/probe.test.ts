import { describe, expect, test } from "bun:test"
import catalog from "../catalog.yaml"
import { orcaAgentFile, orcaLaunchCommand, orcaRoutesByAgent, type OrcaRoutes } from "./orca.ts"
import { type ProbeDeps, probeOrchestrator, resolveOrcaCli } from "./probe.ts"

const routes: OrcaRoutes = {
  "sddkit-architect": { agent: "claude", id: "opus", effort: "medium" },
  "sddkit-implementer": { agent: "cursor", id: "grok-4.7-high" },
}

const readyStatus = JSON.stringify({
  ok: true,
  result: { runtime: { state: "ready" } },
})

function deps(over: Partial<ProbeDeps> = {}): ProbeDeps {
  return {
    env: { ORCA_TERMINAL_HANDLE: "term_1" },
    platform: "darwin",
    root: "/repo",
    home: "/home/u",
    exec: async () => ({ code: 0, stdout: readyStatus }),
    which: async () => true,
    exists: async () => true,
    ...over,
  }
}

describe("probeOrchestrator", () => {
  test("all checks pass → orca with the caller's pane", async () => {
    expect(await probeOrchestrator(deps(), routes)).toEqual({
      orchestrator: "orca",
      cli: "orca",
      pane: "term_1",
      reason: "ok",
    })
  })

  test("no Orca terminal → orca without a pane", async () => {
    const result = await probeOrchestrator(deps({ env: {} }), routes)
    expect(result.orchestrator).toBe("orca")
    expect(result.pane).toBe("")
  })

  test("SDDKIT_ORCHESTRATOR=native opts out before probing", async () => {
    let called = false
    const result = await probeOrchestrator(
      deps({
        env: { SDDKIT_ORCHESTRATOR: "native" },
        exec: async () => {
          called = true
          return { code: 0, stdout: readyStatus }
        },
      }),
      routes,
    )
    expect(result.orchestrator).toBe("native")
    expect(called).toBe(false)
  })

  test("missing orca binary → native", async () => {
    const result = await probeOrchestrator(deps({ exec: async () => ({ code: null, stdout: "" }) }), routes)
    expect(result).toMatchObject({ orchestrator: "native", reason: "orca not found" })
  })

  test("runtime not ready → native", async () => {
    const stdout = JSON.stringify({ ok: true, result: { runtime: { state: "starting" } } })
    const result = await probeOrchestrator(deps({ exec: async () => ({ code: 0, stdout }) }), routes)
    expect(result.orchestrator).toBe("native")
    expect(result.reason).toContain("not ready")
  })

  test("non-JSON status → native", async () => {
    const result = await probeOrchestrator(deps({ exec: async () => ({ code: 1, stdout: "boom" }) }), routes)
    expect(result.orchestrator).toBe("native")
  })

  test("routed CLI missing from PATH → native", async () => {
    const result = await probeOrchestrator(deps({ which: async (bin) => bin !== "cursor-agent" }), routes)
    expect(result).toMatchObject({ orchestrator: "native", reason: "cursor-agent not on PATH" })
  })

  test("agent file in $HOME counts; missing everywhere → native", async () => {
    const homeOnly = await probeOrchestrator(deps({ exists: async (p) => p.startsWith("/home/u/") }), routes)
    expect(homeOnly.orchestrator).toBe("orca")
    const none = await probeOrchestrator(deps({ exists: async (p) => !p.endsWith("sddkit-implementer.md") }), routes)
    expect(none).toMatchObject({
      orchestrator: "native",
      reason: ".cursor/agents/sddkit-implementer.md not installed in repo or $HOME",
    })
  })

  test("no routes → native", async () => {
    expect((await probeOrchestrator(deps(), {})).orchestrator).toBe("native")
  })
})

describe("resolveOrcaCli", () => {
  test("follows the Orca skill's resolution order", () => {
    expect(resolveOrcaCli({ ORCA_CLI_COMMAND: "orca-wsl" }, "linux")).toBe("orca-wsl")
    expect(resolveOrcaCli({ ORCA_DEV_REPO_ROOT: "/src/orca" }, "darwin")).toBe("orca-dev")
    expect(resolveOrcaCli({}, "linux")).toBe("orca-ide")
    expect(resolveOrcaCli({ ORCA_TERMINAL_HANDLE: "term_1" }, "linux")).toBe("orca")
    expect(resolveOrcaCli({}, "darwin")).toBe("orca")
  })
})

describe("orca routes", () => {
  test("catalog routes every dispatched specialist, never the conductor or planner", () => {
    const byAgent = orcaRoutesByAgent(catalog)
    expect(byAgent.sddkit).toBeUndefined()
    expect(byAgent["sddkit-plan"]).toBeUndefined()
    expect(byAgent["sddkit-architect"]).toEqual({ agent: "claude", id: "opus", effort: "medium" })
    expect(byAgent["sddkit-plan-reviewer"]).toEqual({ agent: "claude", id: "sonnet", effort: "high" })
    expect(byAgent["sddkit-implementer"]).toEqual({ agent: "cursor", id: "grok-4.7-high" })
  })

  test("launch commands pick the model and skip approval prompts", () => {
    const opus = { agent: "claude", id: "opus", effort: "medium" } as const
    const grok = { agent: "cursor", id: "grok-4.7-high" } as const
    expect(orcaLaunchCommand(opus)).toBe("claude --model opus --effort medium --permission-mode auto")
    expect(orcaLaunchCommand(grok)).toBe("cursor-agent --model grok-4.7-high --yolo")
    expect(orcaAgentFile("cursor", "sddkit-qa")).toBe(".cursor/agents/sddkit-qa.md")
  })
})
