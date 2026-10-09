import { deepMerge } from "./merge.ts"
import { appendJournal, readState, writeStateAtomic } from "./io.ts"
import { applyOps, hasOps, type PatchOps } from "./ops.ts"
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

export async function readExisting(root: string, feature: string): Promise<SddState> {
  if (!feature) throw new Error("sddkit-state: feature slug required")
  const current = await readState(root, feature)
  if (!current) {
    throw new Error(`sddkit-state: docs/feats/${feature}/state.yaml does not exist — run init first`)
  }
  return current
}

/** Normalizes a state document (defaults + legacy names), throwing when it cannot be made valid. */
export function normalized(state: unknown, what: string): SddState {
  const result = validateState(state)
  if (!result.success) throw new Error(`sddkit-state: ${what} would produce invalid state.yaml: ${result.error}`)
  return result.data
}

/** Validates, writes atomically, and journals one entry. Nothing is written when validation fails. */
export async function commitState(
  root: string,
  feature: string,
  next: Record<string, unknown>,
  journal: Record<string, unknown>,
  what = "patch",
): Promise<SddState> {
  const now = new Date().toISOString()
  const data = normalized({ ...next, updated: now, last_agent: AGENT }, what)
  await writeStateAtomic(root, feature, data)
  await appendJournal(root, feature, { ts: now, agent: AGENT, ...journal })
  return data
}

export function checkpointMessage(feature: string, state: SddState): string {
  return `Checkpointed docs/feats/${feature}/state.yaml (stage=${state.stage}, slice_phase=${state.slice_phase})`
}

/** Merge `patch`, then apply drop → append → inc, as one write and one journal entry. */
export async function runPatch(
  root: string,
  feature: string,
  patch: Record<string, unknown>,
  ops: PatchOps = {},
): Promise<string> {
  const current = await readExisting(root, feature)
  let next = deepMerge<Record<string, unknown>>(current, patch)
  if (hasOps(ops)) next = applyOps(normalized(next, "patch") as unknown as Record<string, unknown>, ops)
  const journal: Record<string, unknown> = { patch }
  if (ops.drop) journal.drop = ops.drop
  if (ops.append) journal.append = ops.append
  if (ops.inc) journal.inc = ops.inc
  return checkpointMessage(feature, await commitState(root, feature, next, journal))
}
