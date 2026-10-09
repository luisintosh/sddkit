import { execFileSync } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { runInit, runPatch } from "./checkpoint.ts"
import { readState, statePath } from "./io.ts"
import { nextStep, runNext } from "./next.ts"
import { applyOps } from "./ops.ts"
import { mergeReview, runReviewMerge, techDebtFrom } from "./review.ts"
import { type Finding, scaffoldState, type SddState, validateState } from "./schema.ts"
import { runSnapshot, runTransition, transition } from "./transitions.ts"

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "solodev-transitions-test-"))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function state(over: Record<string, unknown> = {}): SddState {
  const r = validateState({ ...scaffoldState("feat", "arise"), ...over })
  if (!r.success) throw new Error(r.error)
  return r.data
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "C1",
    file: "src/a.ts",
    line: 3,
    severity: "major",
    category: "bug",
    summary: "s",
    fix: "f",
    ...over,
  }
}

describe("applyOps", () => {
  test("append skips strings already present and identical records, keeping same-id different records", () => {
    const s = state({
      completed: ["design"],
      review: { deferred_findings: [finding({ id: "H1", severity: "minor", summary: "old" })] },
    })
    const out = applyOps(s as unknown as Record<string, unknown>, {
      append: {
        completed: ["design", "design_critique"],
        review: {
          deferred_findings: [
            finding({ id: "H1", severity: "minor", summary: "old" }),
            finding({ id: "H1", severity: "minor", summary: "new defect after a delta" }),
          ],
        },
      },
    }) as unknown as SddState
    expect(out.completed).toEqual(["design", "design_critique"])
    expect(out.review.deferred_findings.map((f) => f.summary)).toEqual(["old", "new defect after a delta"])
  })

  test("drop removes strings by value and records by id", () => {
    const s = state({ blockers: ["a", "b"], review: { findings: [finding({ id: "C1" }), finding({ id: "C2" })] } })
    const out = applyOps(s as unknown as Record<string, unknown>, {
      drop: { blockers: ["a"], review: { findings: ["C1"] } },
    }) as unknown as SddState
    expect(out.blockers).toEqual(["b"])
    expect(out.review.findings.map((f) => f.id)).toEqual(["C2"])
  })

  test("inc adds to integers", () => {
    const s = state({ green_attempts: 1 })
    const out = applyOps(s as unknown as Record<string, unknown>, { inc: { green_attempts: 1, qa: { cycles: 1 } } })
    expect(out.green_attempts).toBe(2)
    expect((out.qa as { cycles: number }).cycles).toBe(1)
  })

  test("fails closed on a non-list or non-integer path", () => {
    const s = state() as unknown as Record<string, unknown>
    expect(() => applyOps(s, { append: { stage: ["x"] } })).toThrow(/not a list/)
    expect(() => applyOps(s, { append: { completed: "design" } })).toThrow(/must be a YAML list/)
    expect(() => applyOps(s, { inc: { stage: 1 } })).toThrow(/not an integer/)
    expect(() => applyOps(s, { inc: { green_attempts: "1" } })).toThrow(/must be an integer/)
  })

  test("runPatch applies set, drop, append, and inc in one write and one journal entry", async () => {
    await runInit(root, "f")
    await runPatch(root, "f", { blockers: ["x", "y"], completed: ["design"] })
    await runPatch(
      root,
      "f",
      { stage: "design" },
      { drop: { blockers: ["x"] }, append: { completed: ["design_critique"] }, inc: { green_attempts: 2 } },
    )
    const after = await readState(root, "f")
    expect(after?.stage).toBe("design")
    expect(after?.blockers).toEqual(["y"])
    expect(after?.completed).toEqual(["design", "design_critique"])
    expect(after?.green_attempts).toBe(2)
    const journal = (await fs.readFile(path.join(root, "docs/feats/f/journal.ndjson"), "utf8")).trim().split("\n")
    expect(journal).toHaveLength(3)
    expect(JSON.parse(journal[2]!).append).toEqual({ completed: ["design_critique"] })
  })

  test("a failing op writes nothing", async () => {
    await runInit(root, "f")
    await expect(runPatch(root, "f", { stage: "design" }, { inc: { stage: 1 } })).rejects.toThrow()
    expect((await readState(root, "f"))?.stage).toBe("initialized")
  })
})

describe("transition", () => {
  test("start-slice opens a journey slice and refuses bad or finished ids", () => {
    const s = transition(state({ stage: "design_gate" }), "start-slice", { slice: "J1,J2" })
    expect(s).toMatchObject({
      stage: "implementation",
      current_slice: "J1,J2",
      slice_phase: "green",
      green_attempts: 0,
    })
    expect(() => transition(state(), "start-slice", { slice: "verify-fix-1" })).toThrow(/not J<n>/)
    expect(() => transition(s, "start-slice", { slice: "J3" })).toThrow(/still in phase/)
    expect(() => transition(state({ completed_slices: ["J1"] }), "start-slice", { slice: "J1" })).toThrow(/already/)
  })

  test("start-slice leaves escalation alone — it is reset only by a delta", () => {
    const s = transition(state({ escalation: 1, completed_slices: ["J1"] }), "start-slice", { slice: "J2" })
    expect(s.escalation).toBe(1)
  })

  test("slice-done records every id of a batched slice", () => {
    const s = transition(state({ current_slice: "J1,J2", slice_phase: "targeted_test" }), "slice-done")
    expect(s.completed_slices).toEqual(["J1", "J2"])
    expect(s.current_slice).toBe("")
    expect(s.slice_phase).toBe("")
    expect(() => transition(state({ current_slice: "verify-fix-1" }), "slice-done")).toThrow()
  })

  test("verify-fix slices never touch stage or completed_slices", () => {
    const s = transition(state({ stage: "verify", green_attempts: 2 }), "start-verify-fix", { n: 1 })
    expect(s).toMatchObject({ stage: "verify", current_slice: "verify-fix-1", slice_phase: "green", green_attempts: 0 })
    const done = transition(s, "verify-fix-done")
    expect(done.current_slice).toBe("")
    expect(done.completed_slices).toEqual([])
    expect(() => transition(state({ current_slice: "J1" }), "verify-fix-done")).toThrow()
  })

  test("escalate refuses a second escalation in one pass", () => {
    expect(() => transition(state({ current_slice: "J1", escalation: 1 }), "escalate")).toThrow(/already 1/)
    const s = transition(state({ current_slice: "J1", slice_phase: "targeted_test", green_attempts: 2 }), "escalate")
    expect(s).toMatchObject({ current_slice: "J1", slice_phase: "green", green_attempts: 0, escalation: 1 })
  })

  test("review-enter sets iterations to at least 1, records implementation, and drops stale review blockers", () => {
    const s = transition(
      state({
        stage: "implementation",
        completed: ["design", "implementation"],
        blockers: ["review checklists missing at /x", "review blocked (health): bad", "other"],
      }),
      "review-enter",
    )
    expect(s.stage).toBe("review")
    expect(s.completed).toEqual(["design", "implementation"])
    expect(s.review.iterations).toBe(1)
    expect(s.blockers).toEqual(["other"])
    expect(transition(state({ review: { iterations: 2 } }), "review-enter").review.iterations).toBe(2)
    expect(() => transition(state({ current_slice: "J1" }), "review-enter")).toThrow()
  })

  test("design-approved on a first pass sets the review base", () => {
    const s = transition(state({ stage: "design_gate", pending_gate: "design" }), "design-approved", { commit: "abc" })
    expect(s).toMatchObject({ stage: "implementation", pending_gate: "" })
    expect(s.review.base).toBe("abc")
    expect(() => transition(state({ pending_gate: "" }), "design-approved", { commit: "abc" })).toThrow()
  })

  test("a qa-origin delta resets the pass and moves the review base", () => {
    let s = state({
      stage: "qa",
      completed: ["design", "design_critique", "implementation", "review", "verify", "pr", "docs_sync"],
      completed_slices: ["J1"],
      escalation: 1,
      green_attempts: 1,
      review: { iterations: 2, base: "old", fix_pending: true, findings: [finding()] },
      qa: { cycles: 1, findings: [finding({ category: "spec" })] },
    })
    s = transition(s, "design-delta", { origin: "qa", findings: [finding({ category: "spec" })] })
    expect(s).toMatchObject({ stage: "design", delta: { pending: true, origin: "qa" } })
    expect(() => transition({ ...s, pending_gate: "design" }, "design-approved", { commit: "new" })).toThrow(
      /not been revised/,
    )
    s = transition(s, "design-revised")
    s = transition({ ...s, stage: "design_gate", pending_gate: "design" }, "design-approved", { commit: "new" })
    expect(s.completed).toEqual(["design", "design_critique", "pr"])
    expect(s).toMatchObject({
      completed_slices: [],
      escalation: 0,
      green_attempts: 0,
      current_slice: "",
      slice_phase: "",
    })
    expect(s.review).toMatchObject({ iterations: 0, fix_pending: false, base: "new", findings: [] })
    expect(s.delta).toEqual({ pending: false, origin: "", findings: [] })
    expect(s.qa.findings).toHaveLength(1)
    expect(nextStep("feat", s).after_verify).toBe("9")
  })

  test("a review-origin delta keeps the review base so pre-delta code stays in the next review's diff", () => {
    let s = state({
      stage: "review",
      completed: ["design", "design_critique", "implementation"],
      review: { base: "orig", iterations: 1 },
    })
    s = transition(s, "design-delta", {
      origin: "review",
      findings: [finding({ category: "plan", file: "", line: 0 })],
    })
    s = transition(s, "design-revised")
    s = transition({ ...s, pending_gate: "design" }, "design-approved", { commit: "delta" })
    expect(s.review.base).toBe("orig")
    expect(nextStep("feat", s).after_verify).toBe("8")
  })

  test("design-delta needs an origin and findings", () => {
    expect(() => transition(state(), "design-delta", { origin: "qa", findings: [] })).toThrow()
    expect(() => transition(state(), "design-delta", { origin: "x", findings: [finding()] })).toThrow()
  })

  test("unknown events are rejected", () => {
    expect(() => transition(state(), "teleport")).toThrow(/unknown transition/)
  })
})

describe("snapshot + escalate", () => {
  function git(...args: string[]) {
    execFileSync("git", ["-C", root, ...args], { stdio: "ignore" })
  }

  test("escalate restores the pre-reset state, then escalates", async () => {
    git("init", "-q")
    git("config", "user.email", "t@t")
    git("config", "user.name", "t")
    await runInit(root, "f")
    await runPatch(root, "f", { stage: "design_gate", pending_gate: "design" })
    git("add", "-A")
    git("commit", "-qm", "design")
    // After the commit: approval and the slice — not in HEAD.
    await runTransition(root, "f", "design-approved", { commit: "sha1" })
    await runTransition(root, "f", "start-slice", { slice: "J1" })
    await runPatch(root, "f", { slice_phase: "targeted_test", green_attempts: 2 })
    await runSnapshot(root, "f")
    git("reset", "-q", "--hard", "HEAD")
    expect((await readState(root, "f"))?.pending_gate).toBe("design")
    await runTransition(root, "f", "escalate", {})
    const after = await readState(root, "f")
    expect(after).toMatchObject({
      stage: "implementation",
      pending_gate: "",
      current_slice: "J1",
      slice_phase: "green",
      green_attempts: 0,
      escalation: 1,
    })
    expect(after?.review.base).toBe("sha1")
    const journal = await fs.readFile(path.join(root, "docs/feats/f/journal.ndjson"), "utf8")
    expect(journal).toContain('"transition":"start-slice"')
    expect(journal).toContain('"transition":"escalate"')
    // The snapshot is consumed: a second escalate has nothing to restore.
    await expect(runTransition(root, "f", "escalate", {})).rejects.toThrow(/no snapshot/)
  })

  test("escalate without a snapshot refuses and writes nothing", async () => {
    git("init", "-q")
    await runInit(root, "f")
    await runPatch(root, "f", { stage: "implementation", current_slice: "J1", slice_phase: "targeted_test" })
    await expect(runTransition(root, "f", "escalate", {})).rejects.toThrow(/no snapshot/)
    expect((await readState(root, "f"))?.escalation).toBe(0)
  })
})

describe("next", () => {
  const cases: [string, Record<string, unknown>, Partial<ReturnType<typeof nextStep>>][] = [
    ["design gate pending", { stage: "design_gate", pending_gate: "design" }, { step: "4" }],
    ["dispute pending", { stage: "review", pending_gate: "dispute" }, { step: "6.5" }],
    [
      "opinion during a slice",
      { stage: "implementation", pending_gate: "opinion", current_slice: "J1", slice_phase: "green" },
      { step: "opinion", resume_step: "5" },
    ],
    [
      "opinion during the fix round",
      { stage: "review", pending_gate: "opinion", review: { fix_pending: true } },
      { resume_step: "6.4" },
    ],
    [
      "opinion during verify-fix",
      { stage: "verify", pending_gate: "opinion", current_slice: "verify-fix-1", slice_phase: "green" },
      { resume_step: "7" },
    ],
    ["opinion during the dispute apply round", { stage: "review", pending_gate: "opinion" }, { resume_step: "6.5" }],
    [
      "opinion during QA impl verify-fix",
      { stage: "qa", pending_gate: "opinion", current_slice: "verify-fix-2", slice_phase: "green" },
      { resume_step: "9" },
    ],
    ["fresh scaffold", { stage: "initialized", branch: "feat/f" }, { step: "2" }],
    ["design not written", { stage: "design" }, { step: "2" }],
    ["critique missing", { stage: "design", completed: ["design"] }, { step: "3" }],
    ["critique done", { stage: "design", completed: ["design", "design_critique"] }, { step: "4" }],
    [
      "interrupted delta",
      {
        stage: "design",
        completed: ["design", "design_critique", "implementation"],
        delta: { pending: true, origin: "qa", findings: [] },
      },
      { step: "9-delta" },
    ],
    [
      "slice mid-phase",
      { stage: "implementation", current_slice: "J2", slice_phase: "targeted_test" },
      { step: "5", phase: "targeted_test", slice: "J2" },
    ],
    ["next slice", { stage: "implementation", completed_slices: ["J1"] }, { step: "5" }],
    [
      "implementation finished, review not entered",
      { stage: "implementation", completed: ["implementation"] },
      { step: "6" },
    ],
    ["fix round interrupted", { stage: "review", review: { fix_pending: true } }, { step: "6.4", phase: "fix-resume" }],
    ["review rerun", { stage: "review" }, { step: "6", phase: "rerun" }],
    ["verify", { stage: "verify" }, { step: "7" }],
    [
      "verify-fix",
      { stage: "verify", current_slice: "verify-fix-1", slice_phase: "green" },
      { step: "7", phase: "green" },
    ],
    ["pr", { stage: "pr" }, { step: "8", after_verify: "8" }],
    ["qa missing both", { stage: "qa", completed: ["pr"] }, { step: "9", after_verify: "9" }],
    ["qa both done", { stage: "qa", completed: ["pr", "docs_sync", "qa"] }, { step: "10" }],
    ["complete", { stage: "complete" }, { step: "done" }],
  ]
  for (const [name, over, expected] of cases) {
    test(name, () => {
      expect(nextStep("feat", state(over))).toMatchObject(expected)
    })
  }

  test("a legacy state file resumes through normalization", async () => {
    await runInit(root, "old")
    await fs.writeFile(
      statePath(root, "old"),
      "feature: old\nworkflow: sdd\nstage: plan_gate\npending_gate: plan\nupdated: '2025-01-01T00:00:00.000Z'\n",
    )
    expect(await runNext(root, "old")).toMatchObject({ feature: "old", step: "4" })
  })

  test("with no slug, the newest feature wins even when complete", async () => {
    await runInit(root, "older")
    await new Promise((r) => setTimeout(r, 5))
    await runInit(root, "newer")
    await runPatch(root, "newer", { stage: "complete" })
    expect(await runNext(root, undefined)).toMatchObject({ feature: "newer", step: "done" })
  })
})

describe("review-merge", () => {
  const replies = (contract: Finding[], health: Finding[], design: Finding[]) => ({
    replies: [
      { area: "design", findings: design },
      { area: "contract", findings: contract },
      { area: "health", findings: health },
    ],
  })

  test("splits blockers and majors from minors, sorted, and sets status", () => {
    const s = state({ stage: "review", review: { iterations: 1 } })
    const { state: out, result } = mergeReview(
      s,
      replies(
        [finding({ id: "C1", severity: "minor" })],
        [finding({ id: "H1", severity: "blocker", line: 9 })],
        [finding({ id: "D1", line: 7 })],
      ),
    )
    expect(out.review.findings.map((f) => f.id)).toEqual(["H1", "D1"])
    expect(out.review.deferred_findings.map((f) => f.id)).toEqual(["C1"])
    expect(result).toMatchObject({ status: "findings", blocking: ["H1", "D1"], deferred: ["C1"] })
  })

  test("clean when nothing survives", () => {
    const { result, state: out } = mergeReview(state(), replies([], [], []))
    expect(result.status).toBe("clean")
    expect(out.review.status).toBe("clean")
  })

  test("a missing area is refused", () => {
    expect(() =>
      mergeReview(state(), {
        replies: [
          { area: "contract", findings: [] },
          { area: "health", findings: [] },
        ],
      }),
    ).toThrow(/missing area design/)
  })

  test("a duplicate pair keeps the higher severity, then the earlier area", () => {
    const { state: out, result } = mergeReview(state(), {
      ...replies(
        [finding({ id: "C1", severity: "minor" })],
        [finding({ id: "H1", severity: "major" })],
        [finding({ id: "D1", severity: "major" })],
      ),
      duplicates: [
        ["C1", "H1"],
        ["D1", "H1"],
      ],
    })
    expect(out.review.findings.map((f) => f.id)).toEqual(["H1"])
    expect(result.duplicates).toEqual(["duplicate C1 → H1", "duplicate D1 → H1"])
  })

  test("a duplicate pair must share file, line, and category", () => {
    expect(() =>
      mergeReview(state(), {
        ...replies([finding({ id: "C1" })], [finding({ id: "H1", line: 99 })], []),
        duplicates: [["C1", "H1"]],
      }),
    ).toThrow(/not duplicates/)
  })

  test("minors are not lost when a post-delta id matches an old deferred id", () => {
    const s = state({ review: { deferred_findings: [finding({ id: "H1", severity: "minor", summary: "old" })] } })
    const { state: out } = mergeReview(s, replies([], [finding({ id: "H1", severity: "minor", summary: "new" })], []))
    expect(out.review.deferred_findings.map((f) => f.summary)).toEqual(["old", "new"])
  })

  test("on iteration 2, an honored 4:/5: rebuttal becomes tech debt; a re-raised one does not", () => {
    const decorator = finding({
      id: "D1",
      category: "quality",
      file: "src/weather.js",
      line: 4,
      summary: "retry wrapper copied a third time",
      fix: "Decorator: create withRetry in src/lib/retry.js. In diff: src/weather.js:4. Migrate now: src/users.js:10. Tech debt: none. Rebuttal: 5: src/orders.js:22, src/billing.js:8 push the migration past the cap",
    })
    const reraised = finding({ id: "D2", fix: "Facade: reuse x in y. Rebuttal: 4: src/a.js:1 untested" })
    const s = state({ review: { iterations: 2, findings: [decorator, reraised] } })
    const { state: out, result } = mergeReview(
      s,
      replies([], [], [finding({ id: "D2", summary: "Re-raised: still duplicated" })]),
    )
    expect(result.tech_debt).toEqual(["D1-td"])
    const td = out.review.deferred_findings.find((f) => f.id === "D1-td")!
    expect(td).toMatchObject({ severity: "minor", category: "quality", file: "src/orders.js", line: 22 })
    expect(td.fix).toBe(
      "Tech debt: Decorator — migrate src/orders.js:22, src/billing.js:8 to withRetry; reason: over cap",
    )
    expect(out.review.findings.map((f) => f.id)).toEqual(["D2"])
  })

  test("tech debt is not carried on iteration 1 or twice", () => {
    const prior = finding({ id: "D1", fix: "Decorator: create w in p. Rebuttal: 4: src/x.js:3 untested" })
    expect(
      mergeReview(state({ review: { iterations: 1, findings: [prior] } }), replies([], [], [])).result.tech_debt,
    ).toEqual([])
    const already = state({ review: { iterations: 2, findings: [prior], deferred_findings: [techDebtFrom(prior)!] } })
    expect(mergeReview(already, replies([], [], [])).result.tech_debt).toEqual([])
  })

  test("runReviewMerge writes one journaled checkpoint", async () => {
    await runInit(root, "f")
    await runPatch(root, "f", { stage: "review", review: { iterations: 1 } })
    const { result } = await runReviewMerge(root, "f", replies([finding()], [], []))
    expect(result.blocking).toEqual(["C1"])
    expect((await readState(root, "f"))?.review.findings).toHaveLength(1)
  })
})
