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
  "specify",
  "spec_gate",
  "plan",
  "plan_gate",
  "implementation",
  "verify",
  "docs_sync",
  "pr",
  "qa",
  "complete",
] as const

const SLICE_PHASES = ["", "red", "green", "targeted_test", "review"] as const

export const StateSchema = z.object({
  feature: z.string().min(1),
  workflow: z.literal("sdd").default("sdd"),
  stage: z.enum(STAGES),
  completed: z.array(z.string()).default([]),
  pending_gate: z.enum(["", "spec", "plan"]).default(""),
  branch: z.string().default(""),
  mode: z.enum(["interactive", "autonomous"]).default("interactive"),
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
    })
    .default({ spec: "", contracts: [], plan: "" }),
  verification: z
    .object({
      status: z.string().default(""),
      commands: z.array(z.string()).default([]),
    })
    .default({ status: "", commands: [] }),
  review: z
    .object({
      iterations: z.number().int().default(0),
      status: z.string().default(""),
      findings: z.array(FindingSchema).default([]),
      deferred_findings: z.array(FindingSchema).default([]),
    })
    .default({ iterations: 0, status: "", findings: [], deferred_findings: [] }),
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
  roadmap: z
    .object({
      issue: z.number().int().default(0),
      epic: z.number().int().default(0),
      feature_id: z.string().default(""),
      path: z.string().default(""),
    })
    .default({ issue: 0, epic: 0, feature_id: "", path: "" }),
})

export type SddState = z.infer<typeof StateSchema>

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
