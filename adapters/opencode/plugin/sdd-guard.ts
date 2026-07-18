import { tool, type Plugin, type PluginModule } from "@opencode-ai/plugin"
import {
  runCompactSession,
  resolveActiveFeature,
  isProtectedStateFile,
  isSelfWrite,
  isCrossFeatureWrite,
  extractFilePath,
} from "../../../core/state-engine"

// ---------------------------------------------------------------------------
// OpenCode adapter plugin — thin wrapper over the harness-agnostic core state
// engine. It supplies ONLY what's OpenCode-specific:
//   - the `compact` tool (programmatic /compact via opencode's session client)
//   - the `tool.execute.before` guardrails (path/command based)
//   - the compaction autocontinue tweak
// checkpoint is NOT here — it's the core MCP server, registered in
// opencode.jsonc. Single-writer is prompt discipline (opencode's
// tool.execute.before has no `agent` field, so it can't gate the MCP call).
// ---------------------------------------------------------------------------

const HARNESS_DIR = ".opencode"

export const SddGuardPlugin: Plugin = async ({ directory, worktree, client }) => {
  const root = worktree || directory

  return {
    tool: {
      compact: tool({
        description:
          "Summarize and compact this session's context — the programmatic equivalent of /compact (POST /session/{id}/summarize). Call at low-information-loss points in the SDD pipeline (after the plan gate, after verify goes green, after each slice commit). Callable only by @sdd. Never blocks the workflow: failures/timeouts are journaled and swallowed, not thrown.",
        args: {
          feature: tool.schema.string().describe("Feature slug, for journaling."),
          trigger: tool.schema
            .enum(["plan_gate", "verify", "slice_commit"])
            .describe("Which pipeline checkpoint triggered this compaction."),
        },
        async execute(args, context) {
          return runCompactSession(client, root, args, context.agent, context.sessionID, context.abort)
        },
      }),
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool === "edit" || input.tool === "write") {
        const filePath = extractFilePath(output.args)
        if (!filePath) return

        if (isProtectedStateFile(filePath, root)) {
          throw new Error(
            `sdd-guard: ${filePath} is managed by the checkpoint tool — never edit docs/feats/**/state.yaml or journal.ndjson directly. @sdd must use the checkpoint tool.`,
          )
        }
        if (isSelfWrite(filePath, root, HARNESS_DIR)) {
          throw new Error(`sdd-guard: ${filePath} is inside ${HARNESS_DIR}/** — agents may not modify the harness itself.`)
        }
        const active = await resolveActiveFeature(root)
        if (isCrossFeatureWrite(filePath, root, active)) {
          throw new Error(
            `sdd-guard: ${filePath} belongs to a different feature than the active one (${active}) — never touch another feature's docs/feats/<other>/.`,
          )
        }
      }
    },
    // @sdd's compact calls happen mid-turn, inside its own active generation —
    // the synthetic "continue" turn opencode may inject after compaction is
    // meant for context-overflow compaction between turns, and would be
    // redundant with sdd.md's own step-by-step prompt. Scoped to @sdd only.
    "experimental.compaction.autocontinue": async (input, output) => {
      if (input.agent === "sdd") output.enabled = false
    },
  }
}

// opencode's plugin loader first looks for a V1-shaped default export
// (`{ id, server() }`); only if that's absent does it fall back to scanning
// every named export. Exporting the V1 shape makes the loader take the first
// branch and return before ever reaching that scan.
export default {
  id: "sdd-guard",
  server: SddGuardPlugin,
} satisfies PluginModule
