import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { parse as parseYaml } from "yaml"
import { checkpointMessage, commitState, normalized, readExisting } from "./checkpoint.ts"
import { featureDir, journalPath, statePath } from "./io.ts"
import type { Finding, SddState } from "./schema.ts"

/**
 * Named state transitions. Each is a pure function of the current state and its input; a precondition that does not
 * hold throws, so a wrong call writes nothing instead of corrupting the loop counters.
 */

const SLICE_RE = /^J\d+(,J\d+)*$/
const VERIFY_FIX_RE = /^verify-fix-\d+$/
/** Blockers step 6 re-checks on every entry, so a stale one from an interrupted pass never blocks a rerun. */
const REVIEW_ENTRY_BLOCKERS = ["review checklists missing", "review blocked"]

export const EVENTS = [
  "start-slice",
  "escalate",
  "slice-done",
  "start-verify-fix",
  "verify-fix-done",
  "review-enter",
  "design-delta",
  "design-revised",
  "design-approved",
] as const

export type TransitionEvent = (typeof EVENTS)[number]

function refuse(event: string, why: string): never {
  throw new Error(`quest-state: transition ${event} refused — ${why}`)
}

function withUnique(list: string[], items: string[]): string[] {
  return [...list, ...items.filter((item, i) => !list.includes(item) && items.indexOf(item) === i)]
}

function str(input: Record<string, unknown>, key: string, event: string): string {
  const value = input[key]
  if (typeof value !== "string" || value === "") refuse(event, `--yaml needs a non-empty \`${key}\``)
  return value
}

/** Pure part of every event except the snapshot restore that `escalate` adds in runTransition. */
export function transition(state: SddState, event: string, input: Record<string, unknown> = {}): SddState {
  const s = structuredClone(state)
  switch (event) {
    case "start-slice": {
      const slice = str(input, "slice", event)
      if (!SLICE_RE.test(slice)) refuse(event, `slice "${slice}" is not J<n> or a comma-joined batch (J1,J2)`)
      if (s.slice_phase) refuse(event, `slice ${s.current_slice} is still in phase ${s.slice_phase}`)
      const done = slice.split(",").filter((id) => s.completed_slices.includes(id))
      if (done.length) refuse(event, `${done.join(", ")} already in completed_slices`)
      return { ...s, stage: "implementation", current_slice: slice, slice_phase: "green", green_attempts: 0 }
    }
    case "escalate": {
      if (s.escalation === 1) refuse(event, "escalation is already 1 for this implementation pass")
      if (!SLICE_RE.test(s.current_slice)) refuse(event, "no journey slice in progress")
      return { ...s, stage: "implementation", slice_phase: "green", green_attempts: 0, escalation: 1 }
    }
    case "slice-done": {
      if (!SLICE_RE.test(s.current_slice)) refuse(event, "no journey slice in progress")
      return {
        ...s,
        completed_slices: withUnique(s.completed_slices, s.current_slice.split(",")),
        current_slice: "",
        slice_phase: "",
      }
    }
    case "start-verify-fix": {
      const n = input.n
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1) refuse(event, "--yaml needs `n`, an integer ≥ 1")
      if (s.slice_phase) refuse(event, `slice ${s.current_slice} is still in phase ${s.slice_phase}`)
      return { ...s, current_slice: `verify-fix-${n}`, slice_phase: "green", green_attempts: 0 }
    }
    case "verify-fix-done": {
      if (!VERIFY_FIX_RE.test(s.current_slice)) refuse(event, "no verify-fix in progress")
      return { ...s, current_slice: "", slice_phase: "" }
    }
    case "review-enter": {
      if (s.current_slice) refuse(event, `slice ${s.current_slice} is still in progress`)
      return {
        ...s,
        stage: "review",
        completed: withUnique(s.completed, ["implementation"]),
        blockers: s.blockers.filter((b) => !REVIEW_ENTRY_BLOCKERS.some((prefix) => b.startsWith(prefix))),
        review: { ...s.review, iterations: Math.max(1, s.review.iterations) },
      }
    }
    case "design-delta": {
      const origin = str(input, "origin", event)
      if (origin !== "review" && origin !== "qa") refuse(event, "`origin` must be review or qa")
      const findings = input.findings
      if (!Array.isArray(findings) || findings.length === 0) refuse(event, "`findings` must be a non-empty list")
      return {
        ...s,
        stage: "design",
        pending_gate: "",
        delta: { pending: true, origin, findings: findings as Finding[] },
      }
    }
    case "design-revised": {
      if (!s.delta.pending) refuse(event, "no design delta is pending")
      return { ...s, delta: { ...s.delta, pending: false } }
    }
    case "design-approved": {
      const commit = str(input, "commit", event)
      if (s.pending_gate !== "design") refuse(event, "pending_gate is not design")
      if (s.delta.pending) refuse(event, "the design delta has not been revised yet")
      const approved: SddState = {
        ...s,
        stage: "implementation",
        pending_gate: "",
        review: { ...s.review, findings: [] },
      }
      if (!s.completed.includes("implementation")) {
        return { ...approved, review: { ...approved.review, base: commit } }
      }
      // Delta reset. A review-origin delta keeps review.base so the next review still covers code written before it.
      const reset = new Set(["implementation", "review", "verify", "docs_sync"])
      return {
        ...approved,
        completed: s.completed.filter((c) => !reset.has(c)),
        completed_slices: [],
        current_slice: "",
        slice_phase: "",
        green_attempts: 0,
        escalation: 0,
        delta: { pending: false, origin: "", findings: [] },
        review: {
          ...approved.review,
          iterations: 0,
          fix_pending: false,
          base: s.delta.origin === "review" ? s.review.base : commit,
        },
      }
    }
    default:
      throw new Error(`quest-state: unknown transition event "${event}" (one of ${EVENTS.join(", ")})`)
  }
}

/** `$(git rev-parse --git-common-dir)/solodev/<feature>/snapshot` — inside .git, so `git reset --hard` leaves it. */
export async function snapshotDir(root: string, feature: string): Promise<string> {
  const commonDir = await new Promise<string>((resolve, reject) => {
    execFile(
      "git",
      ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { timeout: 15_000 },
      (err, stdout) =>
        err ? reject(new Error(`quest-state: not a git repository at ${root}`)) : resolve(stdout.trim()),
    )
  })
  return path.join(commonDir, "solodev", feature, "snapshot")
}

/** Saves state.yaml and journal.ndjson where `git reset --hard` cannot reach them. */
export async function runSnapshot(root: string, feature: string): Promise<string> {
  await readExisting(root, feature)
  const dir = await snapshotDir(root, feature)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  await fs.copyFile(statePath(root, feature), path.join(dir, "state.yaml"))
  await fs.copyFile(journalPath(root, feature), path.join(dir, "journal.ndjson")).catch(() => undefined)
  return `Snapshot of docs/feats/${feature}/state.yaml saved to ${dir}`
}

export async function runTransition(
  root: string,
  feature: string,
  event: string,
  input: Record<string, unknown>,
): Promise<string> {
  let current = normalized(await readExisting(root, feature), "state.yaml")
  let restoredFrom = ""
  if (event === "escalate") {
    // `git reset --hard HEAD` just rolled state back to the last commit; the snapshot holds the real loop state.
    const dir = await snapshotDir(root, feature)
    let raw: string
    try {
      raw = await fs.readFile(path.join(dir, "state.yaml"), "utf8")
    } catch {
      refuse(event, `no snapshot at ${dir} — run \`quest-state snapshot ${feature}\` before git reset --hard`)
    }
    current = normalized(parseYaml(raw), "snapshot")
    restoredFrom = dir
  }
  const next = transition(current, event, input)
  if (restoredFrom) {
    await fs.mkdir(featureDir(root, feature), { recursive: true })
    await fs.copyFile(path.join(restoredFrom, "journal.ndjson"), journalPath(root, feature)).catch(() => undefined)
  }
  const written = await commitState(
    root,
    feature,
    next as unknown as Record<string, unknown>,
    {
      transition: event,
      ...(Object.keys(input).length ? { input } : {}),
    },
    `transition ${event}`,
  )
  if (restoredFrom) await fs.rm(restoredFrom, { recursive: true, force: true })
  return checkpointMessage(feature, written)
}
