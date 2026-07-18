import { validateState, scaffoldState, type SddState } from "./schema"
import { deepMerge } from "./merge"
import { readState, writeStateAtomic, appendJournal } from "./io"

// ---------------------------------------------------------------------------
// checkpoint — read-merge-validate-write docs/feats/<feature>/state.yaml.
//
// Single-writer enforcement (only @sdd may write) is NOT done here: when this
// runs behind an MCP server the caller's agent identity isn't visible. The
// gate moves to the adapter's hook layer — OpenCode's `tool.execute.before`
// (which has `context.agent`) denies non-@sdd checkpoint calls; Cursor relies
// on prompt discipline (subagents return reply blocks and never call
// checkpoint). `agent` is still threaded through for `last_agent`/journal
// provenance.
// ---------------------------------------------------------------------------

export async function runCheckpoint(
  root: string,
  args: { feature: string; init?: boolean; patch?: Record<string, unknown> },
  agent: string,
): Promise<string> {
  const { feature, init, patch } = args
  if (!feature) throw new Error("sdd-guard: checkpoint requires a feature slug")

  if (init) {
    const existing = await readState(root, feature)
    if (existing) {
      throw new Error(`sdd-guard: docs/feats/${feature}/state.yaml already exists — checkpoint(init) refuses to clobber it`)
    }
    const scaffold = scaffoldState(feature, agent)
    const validated = validateState(scaffold)
    if (!validated.success) throw new Error(`sdd-guard: scaffold failed validation: ${validated.error}`)
    await writeStateAtomic(root, feature, validated.data)
    await appendJournal(root, feature, { ts: validated.data.updated, agent, action: "init" })
    return `Initialized docs/feats/${feature}/state.yaml`
  }

  const current = await readState(root, feature)
  if (!current) {
    throw new Error(`sdd-guard: docs/feats/${feature}/state.yaml does not exist — call checkpoint({feature, init: true}) first`)
  }

  const now = new Date().toISOString()
  const merged = deepMerge<SddState>(current, { ...(patch ?? {}), updated: now, last_agent: agent })
  const validated = validateState(merged)
  if (!validated.success) {
    throw new Error(`sdd-guard: patch would produce invalid state.yaml: ${validated.error}`)
  }
  await writeStateAtomic(root, feature, validated.data)
  await appendJournal(root, feature, { ts: now, agent, patch: patch ?? {} })
  return `Checkpointed docs/feats/${feature}/state.yaml (stage=${validated.data.stage}, slice_phase=${validated.data.slice_phase})`
}

// ---------------------------------------------------------------------------
// compact — programmatic session summarization. OpenCode-only in practice
// (driven by its plugin, which owns a client with `session.summarize`); Cursor
// has no programmatic equivalent and relies on native auto-compaction. Kept in
// core because it's written against an abstract SummarizeClient, and its @sdd
// gate is a pure guard on the passed-in agent string.
// ---------------------------------------------------------------------------

const COMPACT_TIMEOUT_MS = 20_000

export type SummarizeClient = {
  session: {
    summarize(opts: { path: { id: string }; signal?: AbortSignal }): Promise<{ error?: unknown } | void>
  }
}

// Treated as a pure optimization: any failure (API error, network error, hang)
// is caught, journaled as compact_skipped, and swallowed rather than thrown, so
// a bad compaction never blocks @sdd's workflow. Restricted to @sdd — only @sdd
// knows when its own session is at a safe point to summarize.
export async function runCompactSession(
  client: SummarizeClient,
  root: string,
  args: { feature: string; trigger: "plan_gate" | "verify" | "slice_commit" },
  agent: string,
  sessionID: string,
  parentSignal?: AbortSignal,
): Promise<string> {
  if (agent && agent !== "sdd") {
    throw new Error(`sdd-guard: compact may only be called by @sdd (called by @${agent}).`)
  }

  const { feature, trigger } = args
  if (!feature) throw new Error("sdd-guard: compact requires a feature slug")

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error(`sdd-guard: compact timed out after ${COMPACT_TIMEOUT_MS}ms`)),
    COMPACT_TIMEOUT_MS,
  )
  const onParentAbort = () => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener("abort", onParentAbort)

  try {
    const result = await client.session.summarize({ path: { id: sessionID }, signal: controller.signal })
    if (result && typeof result === "object" && "error" in result && result.error) {
      throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error))
    }
    await appendJournal(root, feature, { ts: new Date().toISOString(), agent, action: "compact", trigger })
    return `Compacted session context (trigger: ${trigger}).`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await appendJournal(root, feature, {
      ts: new Date().toISOString(),
      agent,
      action: "compact_skipped",
      trigger,
      error: message,
    })
    return `Compaction skipped (${trigger}): ${message} — continuing without it.`
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener("abort", onParentAbort)
  }
}
