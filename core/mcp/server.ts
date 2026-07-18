import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { runCheckpoint } from "../state-engine/checkpoint"

// ---------------------------------------------------------------------------
// checkpoint MCP server — the single sanctioned writer of
// docs/feats/<feature>/state.yaml, shared by every harness. OpenCode and Cursor
// both register it (stdio, launched at the repo root). It exposes exactly one
// tool, `checkpoint`, wrapping the core state engine.
//
// The MCP transport cannot see which agent issued the call, so single-writer
// enforcement lives in the adapter's hook layer (see core/state-engine/
// checkpoint.ts). `agent` here is optional provenance for the journal.
// ---------------------------------------------------------------------------

export const CheckpointInput = {
  feature: z.string().describe("Feature slug, e.g. account-export"),
  init: z.boolean().optional().describe("Scaffold a new feature's state.yaml. Errors if it already exists."),
  patch: z
    .record(z.string(), z.any())
    .optional()
    .describe("Partial state document to deep-merge into the existing state.yaml (nested objects merge, arrays/scalars replace)."),
  agent: z.string().optional().describe("Calling agent, for journal provenance. Defaults to sdd."),
}

type CheckpointArgs = {
  feature: string
  init?: boolean
  patch?: Record<string, unknown>
  agent?: string
}

// Extracted so it can be unit-tested without a live stdio transport.
export async function handleCheckpoint(root: string, args: CheckpointArgs): Promise<string> {
  return runCheckpoint(root, { feature: args.feature, init: args.init, patch: args.patch }, args.agent ?? "sdd")
}

const CHECKPOINT_DESCRIPTION =
  "Read-merge-validate-write docs/feats/<feature>/state.yaml. The only sanctioned way to update SDD checkpoint state — never edit state.yaml directly. init:true scaffolds a new feature (errors if it already exists); patch deep-merges into the existing document. Every call is validated against the state schema and journaled. In the SDD pipeline only @sdd calls this."

export function createCheckpointServer(root: string): McpServer {
  const server = new McpServer({ name: "sdd-checkpoint", version: "0.1.0" })
  server.registerTool(
    "checkpoint",
    { title: "SDD checkpoint", description: CHECKPOINT_DESCRIPTION, inputSchema: CheckpointInput },
    async (args) => {
      const message = await handleCheckpoint(root, args as CheckpointArgs)
      return { content: [{ type: "text" as const, text: message }] }
    },
  )
  return server
}

// Resolve the consuming repo root: --root=<path>, then SDD_ROOT, then cwd.
export function resolveRoot(argv: string[], env: NodeJS.ProcessEnv, cwd: string): string {
  const flag = argv.find((a) => a.startsWith("--root="))
  if (flag) return flag.slice("--root=".length)
  return env.SDD_ROOT || cwd
}

// Wire the checkpoint server to stdio and connect. Called by the bundled entry
// (core/mcp/bin.ts); kept out of module top-level so importing this file (tests,
// the adapters) has no side effects.
export async function runStdioServer(): Promise<void> {
  const root = resolveRoot(process.argv.slice(2), process.env, process.cwd())
  const server = createCheckpointServer(root)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
