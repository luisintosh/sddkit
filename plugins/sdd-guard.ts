import { tool, type Plugin, type PluginModule } from "@opencode-ai/plugin"
import { z } from "zod"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import * as fs from "node:fs/promises"
import * as path from "node:path"

// ---------------------------------------------------------------------------
// state.yaml schema — the single source of truth for what a valid checkpoint
// looks like. Every write (init or patch) is validated against this before
// it touches disk.
// ---------------------------------------------------------------------------

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
  "contracts",
  "plan",
  "plan_gate",
  "tasks",
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
  github: z.boolean().default(false),
  current_slice: z.string().default(""),
  slice_phase: z.enum(SLICE_PHASES).default(""),
  escalation: z.union([z.literal(0), z.literal(1)]).default(0),
  completed_slices: z.array(z.string()).default([]),
  last_agent: z.string().default(""),
  updated: z.string().min(1),
  blockers: z.array(z.string()).default([]),
  artifacts: z
    .object({
      spec: z.string().default(""),
      contracts: z.array(z.string()).default([]),
      plan: z.string().default(""),
      tasks: z.string().default(""),
    })
    .default({ spec: "", contracts: [], plan: "", tasks: "" }),
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
    })
    .default({ iterations: 0, status: "", findings: [] }),
  qa: z
    .object({
      status: z.string().default(""),
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
      mode: z.enum(["", "github", "local"]).default(""),
    })
    .default({ url: "", mode: "" }),
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

// ---------------------------------------------------------------------------
// Deep merge — patch semantics: nested objects merge key-by-key, arrays and
// scalars from the patch replace the target wholesale.
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function deepMerge<T = unknown>(target: unknown, patch: unknown): T {
  if (!isPlainObject(patch)) return patch as T
  const result: Record<string, unknown> = { ...(isPlainObject(target) ? target : {}) }
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key]
    const targetVal = result[key]
    result[key] = isPlainObject(patchVal) && isPlainObject(targetVal) ? deepMerge(targetVal, patchVal) : patchVal
  }
  return result as T
}

// ---------------------------------------------------------------------------
// Disk I/O — atomic writes (tmp file + rename) and the append-only journal.
// ---------------------------------------------------------------------------

export function featureDir(root: string, feature: string): string {
  return path.join(root, "docs", "feats", feature)
}

export function statePath(root: string, feature: string): string {
  return path.join(featureDir(root, feature), "state.yaml")
}

export function journalPath(root: string, feature: string): string {
  return path.join(featureDir(root, feature), "journal.ndjson")
}

export async function readState(root: string, feature: string): Promise<SddState | null> {
  try {
    const raw = await fs.readFile(statePath(root, feature), "utf8")
    return (parseYaml(raw) ?? {}) as SddState
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

export async function writeStateAtomic(root: string, feature: string, state: SddState): Promise<void> {
  const dir = featureDir(root, feature)
  await fs.mkdir(dir, { recursive: true })
  const target = statePath(root, feature)
  const tmp = path.join(dir, `.state.yaml.tmp-${process.pid}-${Date.now()}`)
  await fs.writeFile(tmp, stringifyYaml(state), "utf8")
  await fs.rename(tmp, target)
}

export async function appendJournal(root: string, feature: string, entry: Record<string, unknown>): Promise<void> {
  const dir = featureDir(root, feature)
  await fs.mkdir(dir, { recursive: true })
  await fs.appendFile(journalPath(root, feature), JSON.stringify(entry) + "\n", "utf8")
}

export async function resolveActiveFeature(root: string): Promise<string | null> {
  let entries: string[]
  try {
    entries = await fs.readdir(path.join(root, "docs", "feats"))
  } catch {
    return null
  }
  let best: { feature: string; updated: string } | null = null
  for (const entry of entries) {
    const state = await readState(root, entry)
    if (!state || state.stage === "complete") continue
    if (!best || state.updated > best.updated) best = { feature: entry, updated: state.updated }
  }
  return best?.feature ?? null
}

// ---------------------------------------------------------------------------
// checkpoint tool — the only sanctioned writer of state.yaml. Single-writer
// model: only @sdd may call it; subagents return reply blocks that @sdd
// applies via this tool.
// ---------------------------------------------------------------------------

export async function runCheckpoint(
  root: string,
  args: { feature: string; init?: boolean; patch?: Record<string, unknown> },
  agent: string,
): Promise<string> {
  if (agent && agent !== "sdd") {
    throw new Error(
      `sdd-guard: checkpoint may only be called by @sdd (called by @${agent}). Subagents return a reply block for @sdd to apply.`,
    )
  }

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
// Guardrails — tool.execute.before predicates. Pure functions so they're
// testable without the opencode runtime.
// ---------------------------------------------------------------------------

const STATE_YAML_RE = /^docs\/feats\/[^/]+\/state\.yaml$/
const JOURNAL_RE = /^docs\/feats\/[^/]+\/journal\.ndjson$/
const FEATURE_SCOPE_RE = /^docs\/feats\/([^/]+)\//
const GIT_PUSH_RE = /\bgit\s+push\b/

function normalizeRel(filePath: string, root: string): string {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
  return path.relative(root, abs).split(path.sep).join("/")
}

export function isProtectedStateFile(filePath: string, root: string): boolean {
  const rel = normalizeRel(filePath, root)
  return STATE_YAML_RE.test(rel) || JOURNAL_RE.test(rel)
}

export function isOpencodeSelfWrite(filePath: string, root: string): boolean {
  const rel = normalizeRel(filePath, root)
  return rel === ".opencode" || rel.startsWith(".opencode/")
}

export function isCrossFeatureWrite(filePath: string, root: string, activeFeature: string | null): boolean {
  if (!activeFeature) return false
  const rel = normalizeRel(filePath, root)
  const match = rel.match(FEATURE_SCOPE_RE)
  if (!match) return false
  return match[1] !== activeFeature
}

// A ref token like "main", "HEAD:main", "refs/heads/main", or ":main" (branch
// delete) all resolve to "main" as the candidate branch name.
function refCandidates(token: string): string[] {
  const afterColon = token.includes(":") ? token.split(":").pop()! : token
  const segments = afterColon.split("/")
  return [afterColon, segments[segments.length - 1]]
}

// Defense-in-depth beyond opencode.jsonc's declarative "git push* main*"/"git
// push* master*" deny rules — catches remotes/refspecs those globs might miss
// (e.g. `git push origin HEAD:main`) while not flagging unrelated branches
// like "main-backup".
export function isPushToMainCommand(command: string): boolean {
  if (!GIT_PUSH_RE.test(command)) return false
  const tokens = command.split(/\s+/)
  return tokens.some((tok) => refCandidates(tok).some((ref) => ref === "main" || ref === "master"))
}

function extractFilePath(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined
  const a = args as Record<string, unknown>
  const candidate = a.filePath ?? a.path ?? a.file_path
  return typeof candidate === "string" ? candidate : undefined
}

// ---------------------------------------------------------------------------
// Plugin entrypoint
// ---------------------------------------------------------------------------

export const SddGuardPlugin: Plugin = async ({ directory, worktree }) => {
  const root = worktree || directory

  return {
    tool: {
      checkpoint: tool({
        description:
          "Read-merge-validate-write docs/feats/<feature>/state.yaml. The only sanctioned way to update SDD checkpoint state — never edit state.yaml directly. init:true scaffolds a new feature (errors if it already exists); patch deep-merges into the existing document (nested objects merge, arrays/scalars replace). Every call is validated against the state schema and journaled. Callable only by @sdd.",
        args: {
          feature: tool.schema.string().describe("Feature slug, e.g. account-export"),
          init: tool.schema.boolean().optional().describe("Scaffold a new feature's state.yaml. Errors if it already exists."),
          patch: tool.schema
            .record(tool.schema.string(), tool.schema.any())
            .optional()
            .describe("Partial state document to deep-merge into the existing state.yaml."),
        },
        async execute(args, context) {
          const message = await runCheckpoint(root, args, context.agent)
          return message
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
        if (isOpencodeSelfWrite(filePath, root)) {
          throw new Error(`sdd-guard: ${filePath} is inside .opencode/** — agents may not modify the harness itself.`)
        }
        const active = await resolveActiveFeature(root)
        if (isCrossFeatureWrite(filePath, root, active)) {
          throw new Error(
            `sdd-guard: ${filePath} belongs to a different feature than the active one (${active}) — never touch another feature's docs/feats/<other>/.`,
          )
        }
      }

      if (input.tool === "bash") {
        const command = (output.args as { command?: unknown } | undefined)?.command
        if (typeof command === "string" && isPushToMainCommand(command)) {
          throw new Error("sdd-guard: pushing directly to main/master is blocked — open a pull request instead.")
        }
      }
    },
  }
}

// opencode's plugin loader first looks for a V1-shaped default export
// (`{ id, server() }`); only if that's absent does it fall back to scanning
// every named export in this module and requiring each one to itself be a
// plugin function — which throws on this file's non-plugin exports (Zod
// schemas, helpers). Exporting the V1 shape makes the loader take the first
// branch and return before ever reaching that scan.
export default {
  id: "sdd-guard",
  server: SddGuardPlugin,
} satisfies PluginModule
