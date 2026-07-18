import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { SddGuardPlugin } from "./sdd-guard"

// The pure state-engine logic is covered in core/state-engine/state-engine.test.ts.
// This suite covers the OpenCode-specific glue: that the plugin wires the core
// guard predicates into `tool.execute.before` and denies the right operations.

let root: string
const mockClient = { session: { summarize: async () => ({}) } } as any

async function makeHooks(r: string) {
  return SddGuardPlugin({ directory: r, worktree: r, client: mockClient } as any)
}

async function runEdit(hooks: Awaited<ReturnType<typeof makeHooks>>, filePath: string) {
  await hooks["tool.execute.before"]!({ tool: "edit", sessionID: "s", callID: "c" }, { args: { filePath } })
}

async function runBash(hooks: Awaited<ReturnType<typeof makeHooks>>, command: string) {
  await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s", callID: "c" }, { args: { command } })
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "sdd-opencode-plugin-"))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("tool.execute.before guardrails", () => {
  test("blocks direct edits to state.yaml", async () => {
    const hooks = await makeHooks(root)
    await expect(runEdit(hooks, path.join(root, "docs/feats/x/state.yaml"))).rejects.toThrow(/checkpoint tool/)
  })

  test("blocks direct edits to journal.ndjson", async () => {
    const hooks = await makeHooks(root)
    await expect(runEdit(hooks, path.join(root, "docs/feats/x/journal.ndjson"))).rejects.toThrow(/checkpoint tool/)
  })

  test("blocks self-writes into .opencode/", async () => {
    const hooks = await makeHooks(root)
    await expect(runEdit(hooks, path.join(root, ".opencode/plugins/sdd-guard.js"))).rejects.toThrow(/harness itself/)
  })

  test("blocks cross-feature writes while another feature is active", async () => {
    // Make "active" the in-progress feature.
    await fs.mkdir(path.join(root, "docs/feats/active"), { recursive: true })
    await fs.writeFile(
      path.join(root, "docs/feats/active/state.yaml"),
      "feature: active\nworkflow: sdd\nstage: implementation\nupdated: 2026-01-01T00:00:00.000Z\n",
    )
    const hooks = await makeHooks(root)
    await expect(runEdit(hooks, path.join(root, "docs/feats/other/plan.md"))).rejects.toThrow(/different feature/)
  })

  test("allows an ordinary source edit", async () => {
    const hooks = await makeHooks(root)
    await expect(runEdit(hooks, path.join(root, "src/index.ts"))).resolves.toBeUndefined()
  })

  test("allows an ordinary bash command", async () => {
    const hooks = await makeHooks(root)
    await expect(runBash(hooks, "git push origin feature/foo")).resolves.toBeUndefined()
  })
})

describe("plugin surface", () => {
  test("registers the compact tool but NOT checkpoint (checkpoint is the MCP server)", async () => {
    const hooks = await makeHooks(root)
    expect(hooks.tool?.compact).toBeDefined()
    expect(hooks.tool?.checkpoint).toBeUndefined()
  })
})
