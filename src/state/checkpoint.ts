import { deepMerge } from "./merge.ts"
import { appendJournal, readState, writeStateAtomic } from "./io.ts"
import { scaffoldState, validateState, type SddState } from "./schema.ts"

const AGENT = "sddkit"

export async function runInit(root: string, feature: string): Promise<string> {
  if (!feature) throw new Error("sddkit-state: feature slug required")
  const existing = await readState(root, feature)
  if (existing) {
    throw new Error(`sddkit-state: docs/feats/${feature}/state.yaml already exists — init refuses to clobber it`)
  }
  const scaffold = scaffoldState(feature, AGENT)
  const validated = validateState(scaffold)
  if (!validated.success) throw new Error(`sddkit-state: scaffold failed validation: ${validated.error}`)
  await writeStateAtomic(root, feature, validated.data)
  await appendJournal(root, feature, { ts: validated.data.updated, agent: AGENT, action: "init" })
  return `Initialized docs/feats/${feature}/state.yaml`
}

export async function runPatch(root: string, feature: string, patch: Record<string, unknown>): Promise<string> {
  if (!feature) throw new Error("sddkit-state: feature slug required")
  const current = await readState(root, feature)
  if (!current) {
    throw new Error(`sddkit-state: docs/feats/${feature}/state.yaml does not exist — run init first`)
  }
  const now = new Date().toISOString()
  const merged = deepMerge<SddState>(current, { ...patch, updated: now, last_agent: AGENT })
  const validated = validateState(merged)
  if (!validated.success) {
    throw new Error(`sddkit-state: patch would produce invalid state.yaml: ${validated.error}`)
  }
  await writeStateAtomic(root, feature, validated.data)
  await appendJournal(root, feature, { ts: now, agent: AGENT, patch })
  return `Checkpointed docs/feats/${feature}/state.yaml (stage=${validated.data.stage}, slice_phase=${validated.data.slice_phase})`
}
