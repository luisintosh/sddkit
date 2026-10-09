export type QaRoute = "impl" | "spec" | "mixed"

const IMPLISH = new Set<string>(["bug", "quality", "perf", "test", "contract"])

export function routeQaFindings(findings: { category: string }[]): QaRoute {
  if (findings.length === 0) return "spec"
  const specish = findings.some((f) => !IMPLISH.has(f.category))
  const implish = findings.some((f) => IMPLISH.has(f.category))
  if (specish && implish) return "mixed"
  if (specish) return "spec"
  return "impl"
}

const CHEAP_ORACLES = new Set<string>(["boundary", "golden"])

export function skipDesignCritique(input: {
  onlyViableApproach: boolean
  playwrightFallback: boolean
  humanDecisions: string[]
  openQuestions: string[]
  constitutionBlocker: boolean
  oracles: string[]
}): boolean {
  return (
    input.onlyViableApproach &&
    !input.playwrightFallback &&
    !input.constitutionBlocker &&
    input.humanDecisions.length === 0 &&
    input.openQuestions.length === 0 &&
    input.oracles.length === 1 &&
    CHEAP_ORACLES.has(input.oracles[0]!)
  )
}

export function batchJourneys(input: { oracles: string[]; playwrightAdd: boolean }): boolean {
  return input.oracles.length === 2 && input.oracles.every((o) => CHEAP_ORACLES.has(o)) && !input.playwrightAdd
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

export function runDecide(event: string, input: Record<string, unknown>): string {
  switch (event) {
    case "qa-route": {
      return `route: ${routeQaFindings(asFindings(input.findings))}\n`
    }
    case "skip-design-critique": {
      const humanDecisions = asStringArray(input.humanDecisions)
      const openQuestions = asStringArray(input.openQuestions)
      const oracles = asStringArray(input.oracles)
      if (!humanDecisions || !openQuestions || !oracles) return "skip: false\n"
      const skip = skipDesignCritique({
        onlyViableApproach: input.onlyViableApproach === true,
        playwrightFallback: input.playwrightFallback !== false,
        constitutionBlocker: input.constitutionBlocker !== false,
        humanDecisions,
        openQuestions,
        oracles,
      })
      return `skip: ${skip}\n`
    }
    case "batch-journeys": {
      const oracles = asStringArray(input.oracles)
      if (!oracles) return "batch: false\n"
      return `batch: ${batchJourneys({ oracles, playwrightAdd: input.playwrightAdd !== false })}\n`
    }
    default:
      throw new Error(`quest-state: unknown decide event "${event}"`)
  }
}
