import { z } from "zod"

export const FindingSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number().int(),
  severity: z.enum(["blocker", "major", "minor"]),
  category: z.enum(["bug", "quality", "perf", "test", "contract", "spec", "plan"]),
  summary: z.string(),
  fix: z.string(),
})

const STAGES = [
  "initialized",
  "design",
  "design_gate",
  "implementation",
  "review",
  "verify",
  "pr",
  "qa",
  "complete",
] as const

const SLICE_PHASES = ["", "green", "targeted_test"] as const

/** Stage names written by earlier pipeline versions, mapped to the stage that resumes them. */
const LEGACY_STAGES: Record<string, string> = {
  specify: "design",
  spec_gate: "design",
  plan: "design",
  plan_gate: "design_gate",
  docs_sync: "pr",
}

/** Legacy `completed` entries; `null` drops the entry. */
const LEGACY_COMPLETED: Record<string, string | null> = {
  specify: "design",
  plan: "design",
  spec_gate: null,
  plan_gate: null,
}

/** Rewrites a state document from an earlier pipeline version so an in-flight feature resumes. */
export function normalizeLegacy(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw
  const state = { ...(raw as Record<string, unknown>) }
  if (typeof state.stage === "string" && state.stage in LEGACY_STAGES) {
    state.stage = LEGACY_STAGES[state.stage]
  }
  if (state.pending_gate === "spec" || state.pending_gate === "plan") {
    state.pending_gate = state.stage === "design_gate" ? "design" : ""
  }
  if (state.slice_phase === "review") state.slice_phase = "targeted_test"
  if (Array.isArray(state.completed)) {
    const mapped = state.completed.map((entry) =>
      typeof entry === "string" && entry in LEGACY_COMPLETED ? LEGACY_COMPLETED[entry] : entry,
    )
    state.completed = [...new Set(mapped.filter((entry) => entry !== null))]
  }
  return state
}

const StateObject = z.object({
  feature: z.string().min(1),
  workflow: z.literal("sdd").default("sdd"),
  stage: z.enum(STAGES),
  completed: z.array(z.string()).default([]),
  pending_gate: z.enum(["", "design", "opinion", "dispute"]).default(""),
  branch: z.string().default(""),
  tools: z
    .object({
      repo: z.string().default("gh"),
      tracker: z.string().default("gh"),
      orchestrator: z.enum(["native", "orca"]).default("native"),
    })
    .default({ repo: "gh", tracker: "gh", orchestrator: "native" }),
  orca: z
    .object({
      cli: z.string().default(""),
      pane: z.string().default(""),
      run_id: z.string().default(""),
    })
    .default({ cli: "", pane: "", run_id: "" }),
  current_slice: z.string().default(""),
  slice_phase: z.enum(SLICE_PHASES).default(""),
  escalation: z.union([z.literal(0), z.literal(1)]).default(0),
  green_attempts: z.number().int().default(0),
  completed_slices: z.array(z.string()).default([]),
  last_agent: z.string().default(""),
  updated: z.string().min(1),
  blockers: z.array(z.string()).default([]),
  artifacts: z
    .object({
      spec: z.string().default(""),
      contracts: z.array(z.string()).default([]),
      plan: z.string().default(""),
      docs: z.array(z.string()).default([]),
    })
    .default({ spec: "", contracts: [], plan: "", docs: [] }),
  verification: z
    .object({
      status: z.string().default(""),
      commands: z.array(z.string()).default([]),
    })
    .default({ status: "", commands: [] }),
  review: z
    .object({
      iterations: z.number().int().default(0),
      base: z.string().default(""),
      status: z.string().default(""),
      findings: z.array(FindingSchema).default([]),
      deferred_findings: z.array(FindingSchema).default([]),
      // true while a review fix round is uncommitted, so a resume reruns it instead of a review pass
      fix_pending: z.boolean().default(false),
    })
    .default({ iterations: 0, base: "", status: "", findings: [], deferred_findings: [], fix_pending: false }),
  qa: z
    .object({
      status: z.string().default(""),
      cycles: z.number().int().default(0),
      scenarios_total: z.number().int().default(0),
      scenarios_passed: z.number().int().default(0),
      scenarios_failed: z.number().int().default(0),
      findings: z.array(FindingSchema).default([]),
      report_path: z.string().default(""),
      pr_comment_url: z.string().default(""),
      pr_ready: z.boolean().default(false),
    })
    .default({
      status: "",
      cycles: 0,
      scenarios_total: 0,
      scenarios_passed: 0,
      scenarios_failed: 0,
      findings: [],
      report_path: "",
      pr_comment_url: "",
      pr_ready: false,
    }),
  pr: z
    .object({
      url: z.string().default(""),
    })
    .default({ url: "" }),
  // An in-flight design delta: pending until sddkit-design replies to `findings`; `origin` decides whether the delta
  // reset moves review.base (qa) or keeps it so the next review still covers code written before the delta (review).
  delta: z
    .object({
      pending: z.boolean().default(false),
      origin: z.enum(["", "review", "qa"]).default(""),
      findings: z.array(FindingSchema).default([]),
    })
    .default({ pending: false, origin: "", findings: [] }),
  roadmap: z
    .object({
      issue: z.number().int().default(0),
      epic: z.number().int().default(0),
      feature_id: z.string().default(""),
      path: z.string().default(""),
    })
    .default({ issue: 0, epic: 0, feature_id: "", path: "" }),
})

export const StateSchema = z.preprocess(normalizeLegacy, StateObject)

export type SddState = z.infer<typeof StateObject>
export type Finding = z.infer<typeof FindingSchema>

export function validateState(
  candidate: unknown,
): { success: true; data: SddState } | { success: false; error: string } {
  const result = StateSchema.safeParse(candidate)
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    error: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
  }
}

export function scaffoldState(feature: string, agent: string): SddState {
  const now = new Date().toISOString()
  return StateSchema.parse({
    feature,
    workflow: "sdd",
    stage: "initialized",
    updated: now,
    last_agent: agent,
  })
}
