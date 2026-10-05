import { describe, test, expect } from "vitest"
import { batchJourneys, routeQaFindings, runDecide, skipDesignCritique } from "./decisions.ts"

describe("routeQaFindings", () => {
  test("impl-only categories route to impl", () => {
    expect(routeQaFindings([{ category: "bug" }, { category: "test" }])).toBe("impl")
    expect(routeQaFindings([{ category: "quality" }])).toBe("impl")
    expect(routeQaFindings([{ category: "perf" }, { category: "contract" }])).toBe("impl")
  })

  test("spec/plan-only categories route to spec", () => {
    expect(routeQaFindings([{ category: "spec" }])).toBe("spec")
    expect(routeQaFindings([{ category: "plan" }, { category: "spec" }])).toBe("spec")
  })

  test("mixed categories route to mixed", () => {
    expect(routeQaFindings([{ category: "spec" }, { category: "bug" }])).toBe("mixed")
    expect(routeQaFindings([{ category: "plan" }, { category: "contract" }])).toBe("mixed")
  })

  test("empty or unknown findings fail closed to spec", () => {
    expect(routeQaFindings([])).toBe("spec")
    expect(routeQaFindings([{ category: "nope" }])).toBe("spec")
  })

  test("unknown plus impl routes to mixed", () => {
    expect(routeQaFindings([{ category: "nope" }, { category: "bug" }])).toBe("mixed")
  })
})

describe("skipDesignCritique", () => {
  const clean = {
    onlyViableApproach: true,
    playwrightFallback: false,
    humanDecisions: [] as string[],
    openQuestions: [] as string[],
    constitutionBlocker: false,
    oracles: ["boundary"],
  }

  test("skips when every predicate holds", () => {
    expect(skipDesignCritique(clean)).toBe(true)
  })

  test("does not skip when more than one approach is live", () => {
    expect(skipDesignCritique({ ...clean, onlyViableApproach: false })).toBe(false)
  })

  test("does not skip when playwright is the planned oracle", () => {
    expect(skipDesignCritique({ ...clean, playwrightFallback: true })).toBe(false)
  })

  test("does not skip when the design flagged a human decision or open question", () => {
    expect(skipDesignCritique({ ...clean, humanDecisions: ["pick store"] })).toBe(false)
    expect(skipDesignCritique({ ...clean, openQuestions: ["auth provider?"] })).toBe(false)
  })

  test("does not skip on a constitution blocker", () => {
    expect(skipDesignCritique({ ...clean, constitutionBlocker: true })).toBe(false)
  })

  test("does not skip with more than one journey or a costly oracle", () => {
    expect(skipDesignCritique({ ...clean, oracles: ["boundary", "golden"] })).toBe(false)
    expect(skipDesignCritique({ ...clean, oracles: ["e2e"] })).toBe(false)
    expect(skipDesignCritique({ ...clean, oracles: [] })).toBe(false)
  })
})

describe("batchJourneys", () => {
  test("batches two cheap journeys without a playwright add", () => {
    expect(batchJourneys({ oracles: ["boundary", "golden"], playwrightAdd: false })).toBe(true)
  })

  test("does not batch a single journey or three journeys", () => {
    expect(batchJourneys({ oracles: ["boundary"], playwrightAdd: false })).toBe(false)
    expect(batchJourneys({ oracles: ["boundary", "golden", "boundary"], playwrightAdd: false })).toBe(false)
  })

  test("does not batch a costly oracle or a playwright add", () => {
    expect(batchJourneys({ oracles: ["boundary", "integration"], playwrightAdd: false })).toBe(false)
    expect(batchJourneys({ oracles: ["boundary", "golden"], playwrightAdd: true })).toBe(false)
  })
})

describe("runDecide", () => {
  test("prints route for qa-route", () => {
    expect(runDecide("qa-route", { findings: [{ category: "spec" }, { category: "bug" }] })).toBe("route: mixed\n")
    expect(runDecide("qa-route", { findings: [{ category: "test" }] })).toBe("route: impl\n")
    expect(runDecide("qa-route", { findings: ["spec", "bug"] })).toBe("route: mixed\n")
    expect(runDecide("qa-route", { findings: ["spec"] })).toBe("route: spec\n")
    expect(runDecide("qa-route", { findings: [] })).toBe("route: spec\n")
    expect(runDecide("qa-route", {})).toBe("route: spec\n")
    expect(runDecide("qa-route", { findings: [{ category: "nope" }] })).toBe("route: spec\n")
  })

  test("prints skip for skip-design-critique, failing closed", () => {
    const clean = {
      onlyViableApproach: true,
      playwrightFallback: false,
      humanDecisions: [],
      openQuestions: [],
      constitutionBlocker: false,
      oracles: ["golden"],
    }
    expect(runDecide("skip-design-critique", clean)).toBe("skip: true\n")
    expect(runDecide("skip-design-critique", { ...clean, openQuestions: undefined })).toBe("skip: false\n")
    expect(runDecide("skip-design-critique", { ...clean, humanDecisions: "none" })).toBe("skip: false\n")
    expect(runDecide("skip-design-critique", { ...clean, onlyViableApproach: "true" })).toBe("skip: false\n")
    expect(runDecide("skip-design-critique", { ...clean, playwrightFallback: "false" })).toBe("skip: false\n")
    const { constitutionBlocker: _omitted, ...missing } = clean
    expect(runDecide("skip-design-critique", missing)).toBe("skip: false\n")
  })

  test("prints batch for batch-journeys, failing closed", () => {
    expect(runDecide("batch-journeys", { oracles: ["boundary", "golden"], playwrightAdd: false })).toBe("batch: true\n")
    expect(runDecide("batch-journeys", { oracles: ["boundary", "golden"] })).toBe("batch: false\n")
    expect(runDecide("batch-journeys", { oracles: "boundary", playwrightAdd: false })).toBe("batch: false\n")
  })

  test("rejects an unknown event", () => {
    expect(() => runDecide("vibes", {})).toThrow(/unknown decide event/)
  })
})
