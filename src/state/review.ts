import { checkpointMessage, commitState, normalized, readExisting } from "./checkpoint.ts"
import { applyOps } from "./ops.ts"
import { FindingSchema, type Finding, type SddState } from "./schema.ts"

/**
 * Merges the three code-review replies into state. The conductor judges which records describe the same defect (that
 * takes reading the summaries); this does the bookkeeping: tech debt from honored rebuttals, duplicate resolution,
 * ordering, and the split between review.findings and review.deferred_findings.
 */

export const REVIEW_AREAS = ["contract", "health", "design"] as const
const SEVERITY_RANK = { blocker: 0, major: 1, minor: 2 } as const
const SITE_RE = /[\w./@-]+\.[A-Za-z0-9]+:\d+/g

export type ReviewMergeResult = {
  status: "clean" | "findings"
  blocking: string[]
  deferred: string[]
  tech_debt: string[]
  duplicates: string[]
}

function fail(why: string): never {
  throw new Error(`sddkit-state: review-merge refused — ${why}`)
}

/**
 * A prior finding whose rebuttal used reason 4 (untested site) or 5 (over cap) and that this pass did not re-raise
 * becomes a deferred tech-debt record: the sites are real, just not migratable now.
 */
export function techDebtFrom(prior: Finding): Finding | null {
  const m = prior.fix.match(/Rebuttal:\s*([45]):\s*(.*)$/s)
  if (!m) return null
  const reason = m[1] === "4" ? "untested" : "over cap"
  const rebuttal = m[2]!.trim()
  const original = prior.fix.slice(0, prior.fix.indexOf("Rebuttal:")).trim()
  const sites = rebuttal.match(SITE_RE) ?? []
  const first = sites[0]
  const [file, line] = first
    ? [first.slice(0, first.lastIndexOf(":")), Number(first.slice(first.lastIndexOf(":") + 1))]
    : [prior.file, prior.line]
  // Design fix format: `<Pattern>: <create|reuse> <symbol> in <path>. …`
  const shape = original.match(/^([A-Z][\w /-]*?):\s*(?:create|reuse)\s+(\S+?)\s+in\s/)
  const fix = shape
    ? `Tech debt: ${shape[1]} — migrate ${sites.length ? sites.join(", ") : "the rebutted sites"} to ${shape[2]}; reason: ${reason}`
    : `Tech debt: ${original} — rebutted sites: ${sites.length ? sites.join(", ") : rebuttal}; reason: ${reason}`
  return {
    id: `${prior.id}-td`,
    severity: "minor",
    category: prior.category,
    file,
    line,
    summary: prior.summary,
    fix,
  }
}

type Reply = { area: (typeof REVIEW_AREAS)[number]; findings: Finding[] }

function parseReplies(input: Record<string, unknown>): Reply[] {
  const replies = input.replies
  if (!Array.isArray(replies)) fail("`replies` must be a list of {area, findings}")
  const byArea = new Map<string, Reply>()
  for (const raw of replies) {
    const area = (raw as { area?: unknown })?.area
    if (typeof area !== "string" || !(REVIEW_AREAS as readonly string[]).includes(area)) {
      fail(`unknown area ${JSON.stringify(area)}`)
    }
    if (byArea.has(area)) fail(`area ${area} appears twice`)
    const findings = (raw as { findings?: unknown }).findings ?? []
    if (!Array.isArray(findings)) fail(`area ${area}: findings must be a list`)
    const parsed = findings.map((f, i) => {
      const r = FindingSchema.safeParse(f)
      if (!r.success)
        fail(
          `area ${area} finding ${i + 1}: ${r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`,
        )
      return r.data
    })
    byArea.set(area, { area: area as Reply["area"], findings: parsed })
  }
  const missing = REVIEW_AREAS.filter((a) => !byArea.has(a))
  if (missing.length) fail(`missing area ${missing.join(", ")} — a missing area is not a clean one`)
  return REVIEW_AREAS.map((a) => byArea.get(a)!)
}

export function mergeReview(
  state: SddState,
  input: Record<string, unknown>,
): { state: SddState; result: ReviewMergeResult } {
  const replies = parseReplies(input)
  const records = replies.flatMap((r, areaIdx) => r.findings.map((f, i) => ({ f, areaIdx, i })))
  const ids = new Set<string>()
  for (const { f } of records) {
    if (ids.has(f.id)) fail(`id ${f.id} appears twice across replies`)
    ids.add(f.id)
  }

  // Re-raised = a prior id the reviewers reported again; read before duplicates drop anything.
  const reRaised = new Set(records.map((r) => r.f.id).filter((id) => state.review.findings.some((p) => p.id === id)))
  const techDebt: Finding[] = []
  if (state.review.iterations >= 2) {
    for (const prior of state.review.findings) {
      if (reRaised.has(prior.id)) continue
      const td = techDebtFrom(prior)
      if (td && !state.review.deferred_findings.some((d) => d.id === td.id)) techDebt.push(td)
    }
  }

  const dropped = new Set<string>()
  const duplicates: string[] = []
  const pairs = input.duplicates ?? []
  if (!Array.isArray(pairs)) fail("`duplicates` must be a list of [id, id] pairs")
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) fail(`duplicate ${JSON.stringify(pair)} is not an [id, id] pair`)
    const [a, b] = pair.map(
      (id) => records.find((r) => r.f.id === String(id)) ?? fail(`duplicate names unknown id ${id}`),
    )
    if (a!.f.file !== b!.f.file || a!.f.line !== b!.f.line || a!.f.category !== b!.f.category) {
      fail(`${a!.f.id} and ${b!.f.id} differ in file, line, or category — not duplicates`)
    }
    const rank = (r: typeof a) => [SEVERITY_RANK[r!.f.severity], r!.areaIdx, r!.i]
    const [ka, kb] = [rank(a), rank(b)]
    const aFirst = ka[0]! - kb[0]! || ka[1]! - kb[1]! || ka[2]! - kb[2]!
    const [keep, drop] = aFirst <= 0 ? [a!, b!] : [b!, a!]
    if (dropped.has(keep.f.id)) fail(`${keep.f.id} was already dropped as a duplicate`)
    dropped.add(drop.f.id)
    duplicates.push(`duplicate ${drop.f.id} → ${keep.f.id}`)
  }

  const survivors = records
    .filter((r) => !dropped.has(r.f.id))
    .sort((x, y) => SEVERITY_RANK[x.f.severity] - SEVERITY_RANK[y.f.severity])
    .map((r) => r.f)
  const blocking = survivors.filter((f) => f.severity !== "minor")
  const minors = survivors.filter((f) => f.severity === "minor")
  const status = survivors.length ? "findings" : "clean"

  const withLists = applyOps(state as unknown as Record<string, unknown>, {
    append: { review: { deferred_findings: [...techDebt, ...minors] } },
  }) as unknown as SddState
  const next: SddState = {
    ...withLists,
    review: { ...withLists.review, findings: blocking, status },
  }
  return {
    state: next,
    result: {
      status,
      blocking: blocking.map((f) => f.id),
      deferred: minors.map((f) => f.id),
      tech_debt: techDebt.map((f) => f.id),
      duplicates,
    },
  }
}

export async function runReviewMerge(
  root: string,
  feature: string,
  input: Record<string, unknown>,
): Promise<{ message: string; result: ReviewMergeResult }> {
  const current = normalized(await readExisting(root, feature), "state.yaml")
  const { state, result } = mergeReview(current, input)
  const written = await commitState(
    root,
    feature,
    state as unknown as Record<string, unknown>,
    { review_merge: result },
    "review-merge",
  )
  return { message: checkpointMessage(feature, written), result }
}
