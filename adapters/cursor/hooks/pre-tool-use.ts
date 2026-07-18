// Cursor preToolUse hook (registered with matcher: "Write" in hooks.json) —
// the Cursor-side equivalent of OpenCode's tool.execute.before guard for file
// writes. Enforces the three attribution-free, path-based guardrails: never
// edit state.yaml/journal.ndjson directly, never write into .cursor/** (self-
// modification), never touch another feature's docs/feats/<other>/ while one
// is active. (checkpoint single-writer and tester/implementer test-file
// scoping are NOT enforced here — Cursor's hook payloads carry no subagent
// identity to gate on; see core/roles.yml / the plan's §0.5 note. Those stay
// prompt discipline.)
import {
  isProtectedStateFile,
  isSelfWrite,
  isCrossFeatureWrite,
  resolveActiveFeature,
  extractFilePath,
} from "../../../core/state-engine/index"
import { readHookInput, resolveRoot, allow, deny } from "./hook-io"

const HARNESS_DIR = ".cursor"

async function main(): Promise<void> {
  const input = readHookInput()
  const root = resolveRoot(input)
  // tool_input's exact shape for a Write call isn't fully documented; multiple
  // independent sources agree on `file_path`, so we hedge with the same
  // tolerant lookup the OpenCode adapter uses (filePath | path | file_path).
  const filePath = extractFilePath(input.tool_input)
  if (!filePath) allow()

  if (isProtectedStateFile(filePath, root)) {
    deny(`${filePath} is managed by the checkpoint tool — never edit docs/feats/**/state.yaml or journal.ndjson directly. @sdd must use the checkpoint tool.`)
  }
  if (isSelfWrite(filePath, root, HARNESS_DIR)) {
    deny(`${filePath} is inside ${HARNESS_DIR}/** — agents may not modify the harness itself.`)
  }
  const active = await resolveActiveFeature(root)
  if (isCrossFeatureWrite(filePath, root, active)) {
    deny(`${filePath} belongs to a different feature than the active one (${active}) — never touch another feature's docs/feats/<other>/.`)
  }

  allow()
}

main().catch((err) => {
  // Fail open on an unexpected error — a guard bug should never itself brick
  // every file write in the session. Errors still surface (non-JSON stderr).
  console.error("pre-tool-use hook error:", err)
  process.exit(0)
})
