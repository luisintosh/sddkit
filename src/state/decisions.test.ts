import { describe, test, expect } from "bun:test"
import { routeQaFindings, runDecide, skipPlanCritique, skipReviewIter1, skipSpecGate } from "./decisions.ts"

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

describe("skipSpecGate", () => {
  test("skips when critique is clean and there are no open questions", () => {
    expect(skipSpecGate({ specCritiqueClean: true, openQuestions: [] })).toBe(true)
  })

  test("does not skip when critique is dirty", () => {
    expect(skipSpecGate({ specCritiqueClean: false, openQuestions: [] })).toBe(false)
  })

  test("does not skip when open questions remain", () => {
    expect(skipSpecGate({ specCritiqueClean: true, openQuestions: ["auth provider?"] })).toBe(false)
  })
})

describe("skipPlanCritique", () => {
  const clean = {
    specCritiqueClean: true,
    onlyViableApproach: true,
    playwrightFallback: false,
    humanDecisions: [] as string[],
    constitutionBlocker: false,
    oracles: ["boundary"],
  }

  test("skips when every predicate holds", () => {
    expect(skipPlanCritique(clean)).toBe(true)
  })

  test("does not skip when spec critique is dirty", () => {
    expect(skipPlanCritique({ ...clean, specCritiqueClean: false })).toBe(false)
  })

  test("does not skip when more than one approach is live", () => {
    expect(skipPlanCritique({ ...clean, onlyViableApproach: false })).toBe(false)
  })

  test("does not skip when playwright is the planned oracle", () => {
    expect(skipPlanCritique({ ...clean, playwrightFallback: true })).toBe(false)
  })

  test("does not skip when the architect flagged a human decision", () => {
    expect(skipPlanCritique({ ...clean, humanDecisions: ["pick store"] })).toBe(false)
  })

  test("does not skip on a constitution blocker", () => {
    expect(skipPlanCritique({ ...clean, constitutionBlocker: true })).toBe(false)
  })

  test("does not skip when a journey oracle is integration or e2e", () => {
    expect(skipPlanCritique({ ...clean, oracles: ["boundary", "e2e"] })).toBe(false)
  })

  test("does not skip when oracles are omitted", () => {
    expect(skipPlanCritique({ ...clean, oracles: [] })).toBe(false)
  })
})

describe("skipReviewIter1", () => {
  test("skips when sensors are green or n/a on iteration 1 and this is not an escalation", () => {
    expect(skipReviewIter1({ typecheck: "pass", lint: "n/a", targetedTest: "pass", escalation: 0, iteration: 1 })).toBe(
      true,
    )
  })

  test("does not skip on a failing targeted test", () => {
    expect(
      skipReviewIter1({ typecheck: "pass", lint: "pass", targetedTest: "fail", escalation: 0, iteration: 1 }),
    ).toBe(false)
  })

  test("does not skip on a failing typecheck or lint", () => {
    expect(
      skipReviewIter1({ typecheck: "fail", lint: "pass", targetedTest: "pass", escalation: 0, iteration: 1 }),
    ).toBe(false)
    expect(
      skipReviewIter1({ typecheck: "pass", lint: "fail", targetedTest: "pass", escalation: 0, iteration: 1 }),
    ).toBe(false)
  })

  test("does not skip on an escalation pass", () => {
    expect(
      skipReviewIter1({ typecheck: "pass", lint: "pass", targetedTest: "pass", escalation: 1, iteration: 1 }),
    ).toBe(false)
  })

  test("does not skip after a fix-round iteration", () => {
    expect(
      skipReviewIter1({ typecheck: "pass", lint: "pass", targetedTest: "pass", escalation: 0, iteration: 2 }),
    ).toBe(false)
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

  test("prints skip for skip events", () => {
    expect(runDecide("skip-spec-gate", { specCritiqueClean: true, openQuestions: [] })).toBe("skip: true\n")
    expect(runDecide("skip-spec-gate", { specCritiqueClean: true })).toBe("skip: false\n")
    expect(runDecide("skip-spec-gate", { specCritiqueClean: true, openQuestions: "none" })).toBe("skip: false\n")
    expect(
      runDecide("skip-plan-critique", {
        specCritiqueClean: true,
        onlyViableApproach: true,
        playwrightFallback: false,
        humanDecisions: [],
        constitutionBlocker: false,
        oracles: ["golden"],
      }),
    ).toBe("skip: true\n")
    expect(
      runDecide("skip-plan-critique", {
        specCritiqueClean: true,
        onlyViableApproach: true,
        playwrightFallback: false,
        oracles: ["golden"],
      }),
    ).toBe("skip: false\n")
    expect(
      runDecide("skip-plan-critique", {
        specCritiqueClean: true,
        onlyViableApproach: true,
        playwrightFallback: false,
        humanDecisions: "none",
        constitutionBlocker: false,
        oracles: ["golden"],
      }),
    ).toBe("skip: false\n")
    expect(
      runDecide("skip-review", {
        typecheck: "n/a",
        lint: "pass",
        targetedTest: "pass",
        escalation: 0,
        iteration: 1,
      }),
    ).toBe("skip: true\n")
    expect(
      runDecide("skip-review", {
        typecheck: "pass",
        lint: "pass",
        targetedTest: "pass",
        escalation: 0,
        iteration: 0,
      }),
    ).toBe("skip: true\n")
    expect(
      runDecide("skip-review", {
        typecheck: "pass",
        lint: "pass",
        targetedTest: "pass",
        iteration: 1,
      }),
    ).toBe("skip: false\n")
    expect(
      runDecide("skip-review", {
        typecheck: "pass",
        lint: "pass",
        targetedTest: "pass",
        escalation: 0,
        iteration: 2,
      }),
    ).toBe("skip: false\n")
  })

  test("rejects an unknown event", () => {
    expect(() => runDecide("vibes", {})).toThrow(/unknown decide event/)
  })
})
