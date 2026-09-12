export type QaRoute = "impl" | "spec" | "mixed"

export type SensorResult = "pass" | "fail" | "n/a"

const IMPLISH = new Set<string>(["bug", "quality", "perf", "test", "contract"])

export function routeQaFindings(findings: { category: string }[]): QaRoute {
  if (findings.length === 0) return "spec"
  const specish = findings.some((f) => !IMPLISH.has(f.category))
  const implish = findings.some((f) => IMPLISH.has(f.category))
  if (specish && implish) return "mixed"
  if (specish) return "spec"
  return "impl"
}

export function skipSpecGate(input: { specCritiqueClean: boolean; openQuestions: string[] }): boolean {
  return input.specCritiqueClean && input.openQuestions.length === 0
}

const CHEAP_ORACLES = new Set<string>(["boundary", "golden"])

export function skipPlanCritique(input: {
  specCritiqueClean: boolean
  onlyViableApproach: boolean
  playwrightFallback: boolean
  humanDecisions: string[]
  constitutionBlocker: boolean
  oracles: string[]
}): boolean {
  const cheap = input.oracles.length > 0 && input.oracles.every((o) => CHEAP_ORACLES.has(o))
  return (
    input.specCritiqueClean &&
    input.onlyViableApproach &&
    !input.playwrightFallback &&
    cheap &&
    input.humanDecisions.length === 0 &&
    !input.constitutionBlocker
  )
}

export function skipReviewIter1(input: {
  typecheck: SensorResult
  lint: SensorResult
  targetedTest: SensorResult
  escalation: 0 | 1
  iteration: number
}): boolean {
  if (input.iteration > 1) return false
  if (input.escalation !== 0) return false
  if (input.targetedTest !== "pass") return false
  if (input.typecheck === "fail" || input.lint === "fail") return false
  return true
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every((item): item is string => typeof item === "string")) return null
  return value
}

function asFindings(raw: unknown): { category: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { category: string }[] = []
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ category: item })
      continue
    }
    if (item && typeof item === "object" && "category" in item) {
      const category = (item as { category: unknown }).category
      if (typeof category === "string") out.push({ category })
    }
  }
  return out
}

function asSensor(value: unknown): SensorResult {
  if (value === "pass" || value === "fail" || value === "n/a") return value
  return "fail"
}

function asEscalation(value: unknown): 0 | 1 {
  if (value === undefined) return 1
  return value === 1 || value === "1" ? 1 : 0
}

function asIteration(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  if (n === 0) return 1
  if (Number.isFinite(n) && n >= 1) return n
  return 2
}

export function runDecide(event: string, input: Record<string, unknown>): string {
  switch (event) {
    case "qa-route": {
      return `route: ${routeQaFindings(asFindings(input.findings))}\n`
    }
    case "skip-spec-gate": {
      if (!("openQuestions" in input)) return "skip: false\n"
      const openQuestions = asStringArray(input.openQuestions)
      if (!openQuestions) return "skip: false\n"
      const skip = skipSpecGate({
        specCritiqueClean: Boolean(input.specCritiqueClean),
        openQuestions,
      })
      return `skip: ${skip}\n`
    }
    case "skip-plan-critique": {
      const required = [
        "specCritiqueClean",
        "onlyViableApproach",
        "playwrightFallback",
        "humanDecisions",
        "constitutionBlocker",
        "oracles",
      ]
      if (required.some((key) => !(key in input))) return "skip: false\n"
      const humanDecisions = asStringArray(input.humanDecisions)
      const oracles = asStringArray(input.oracles)
      if (!humanDecisions || !oracles) return "skip: false\n"
      const skip = skipPlanCritique({
        specCritiqueClean: Boolean(input.specCritiqueClean),
        onlyViableApproach: Boolean(input.onlyViableApproach),
        playwrightFallback: Boolean(input.playwrightFallback),
        humanDecisions,
        constitutionBlocker: Boolean(input.constitutionBlocker),
        oracles,
      })
      return `skip: ${skip}\n`
    }
    case "skip-review": {
      const skip = skipReviewIter1({
        typecheck: asSensor(input.typecheck),
        lint: asSensor(input.lint),
        targetedTest: asSensor(input.targetedTest),
        escalation: asEscalation(input.escalation),
        iteration: asIteration(input.iteration),
      })
      return `skip: ${skip}\n`
    }
    default:
      throw new Error(`sddkit-state: unknown decide event "${event}"`)
  }
}
