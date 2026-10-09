import * as fs from "node:fs/promises"
import * as path from "node:path"
import { normalized } from "./checkpoint.ts"
import { readState } from "./io.ts"
import type { SddState } from "./schema.ts"

/** Where a resumed run continues. Read-only: it never writes state. */
export type NextStep = {
  feature: string
  step: string
  phase?: string
  slice?: string
  resume_step?: string
  after_verify: "8" | "9"
  note: string
}

const VERIFY_FIX_RE = /^verify-fix-\d+$/

/** The feature with the newest `updated`, finished ones included — "continue" right after a run lands on that run. */
export async function resolveNewestFeature(root: string): Promise<string | null> {
  let entries: string[]
  try {
    entries = await fs.readdir(path.join(root, "docs", "feats"))
  } catch {
    return null
  }
  let best: { feature: string; updated: string } | null = null
  for (const entry of entries) {
    const state = await readState(root, entry).catch(() => null)
    if (!state?.updated) continue
    if (!best || String(state.updated) > best.updated) best = { feature: entry, updated: String(state.updated) }
  }
  return best?.feature ?? null
}

export function nextStep(feature: string, state: SddState): NextStep {
  const done = (marker: string) => state.completed.includes(marker)
  const verifyFix = VERIFY_FIX_RE.test(state.current_slice)
  const base = { feature, after_verify: (done("pr") ? "9" : "8") as "8" | "9" }
  const at = (step: string, note: string, extra: Partial<NextStep> = {}): NextStep => ({
    ...base,
    step,
    ...extra,
    note,
  })

  if (state.pending_gate === "design") return at("4", "re-present the design gate and wait")
  if (state.pending_gate === "dispute") {
    return at(
      "6.5",
      "dispute open: re-present only the blockers entries not yet ending `— ruled:`; all ruled → carry out",
    )
  }
  if (state.pending_gate === "opinion") {
    const resume = verifyFix
      ? state.stage === "qa"
        ? "9"
        : "7"
      : state.review.fix_pending
        ? "6.4"
        : state.stage === "review"
          ? "6.5"
          : "5"
    return at(
      "opinion",
      "an sddkit-implementer opinion gate is unanswered; the question is in blockers — ask the human",
      {
        phase: "opinion",
        resume_step: resume,
        ...(state.current_slice ? { slice: state.current_slice } : {}),
      },
    )
  }

  switch (state.stage) {
    case "initialized":
      return at(
        "2",
        state.branch ? "scaffold done; start design" : "branch not recorded — finish step 1's scaffold patches first",
      )
    case "design":
      if (state.delta.pending)
        return at("9-delta", "design delta pending: re-delegate sddkit-design with delta.findings")
      if (!done("design")) return at("2", "design not written yet")
      if (!done("design_critique")) return at("3", "design written; critique not run")
      return at("4", "design and critique done; present the gate")
    case "design_gate":
      return at("4", "present the design gate")
    case "implementation":
      if (state.slice_phase) {
        return at("5", "resume this slice phase; do not reset green_attempts or escalation", {
          phase: state.slice_phase,
          slice: state.current_slice,
        })
      }
      if (done("implementation")) return at("6", "implementation finished; run transition review-enter")
      return at("5", "start the next Test strategy slice not in completed_slices")
    case "review":
      if (state.review.fix_pending) {
        return at("6.4", "fix round interrupted before its commit: revert stray edits, rerun the fix round", {
          phase: "fix-resume",
        })
      }
      return at("6", "rerun the review pass from the top (all three areas); the iteration count stays", {
        phase: "rerun",
      })
    case "verify":
      if (verifyFix) {
        return at("7", "verify-fix in progress", { phase: state.slice_phase || "green", slice: state.current_slice })
      }
      return at("7", "run verify")
    case "pr":
      return at("8", "open the draft PR")
    case "qa": {
      if (verifyFix) {
        return at("9", "QA impl-route verify-fix in progress", {
          phase: state.slice_phase || "green",
          slice: state.current_slice,
        })
      }
      const missing = ["docs_sync", "qa"].filter((m) => !done(m))
      if (!missing.length) return at("10", "docs-sync and QA done; finalize the PR")
      return at("9", `run ${missing.join(" and ")}`)
    }
    case "complete":
      return at("done", "feature complete; nothing to resume")
    default:
      return at(state.stage, "continue at this stage")
  }
}

export async function runNext(root: string, feature: string | undefined): Promise<NextStep> {
  const slug = feature || (await resolveNewestFeature(root))
  if (!slug) throw new Error("sddkit-state: no feature under docs/feats/ to resume")
  const raw = await readState(root, slug)
  if (!raw) throw new Error(`sddkit-state: docs/feats/${slug}/state.yaml does not exist`)
  return nextStep(slug, normalized(raw, "state.yaml"))
}
