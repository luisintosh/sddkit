import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { deepMerge } from "./merge.ts"
import { validateState, scaffoldState } from "./schema.ts"
import { readState, writeStateAtomic, appendJournal, resolveActiveFeature, statePath, journalPath } from "./io.ts"
import { runInit, runPatch } from "./checkpoint.ts"

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "sddkit-state-test-"))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("deepMerge", () => {
  test("merges nested objects key by key", () => {
    const target = { artifacts: { spec: "spec.md", plan: "" }, stage: "specify" }
    const patch = { artifacts: { plan: "plan.md" } }
    expect(deepMerge(target, patch)).toEqual({
      artifacts: { spec: "spec.md", plan: "plan.md" },
      stage: "specify",
    })
  })

  test("replaces arrays wholesale rather than concatenating", () => {
    const target = { completed: ["specify", "contracts"] }
    const patch = { completed: ["specify"] }
    expect(deepMerge(target, patch)).toEqual({ completed: ["specify"] })
  })

  test("replaces scalars", () => {
    expect(deepMerge({ stage: "specify" }, { stage: "plan" })).toEqual({ stage: "plan" })
  })

  test("leaves untouched keys intact", () => {
    const target = { a: 1, b: 2 }
    expect(deepMerge(target, { b: 3 })).toEqual({ a: 1, b: 3 })
  })
})

describe("validateState", () => {
  test("accepts a minimal valid document, filling defaults", () => {
    const result = validateState({
      feature: "account-export",
      workflow: "sdd",
      stage: "initialized",
      updated: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.completed).toEqual([])
      expect(result.data.upgraded_slices).toEqual([])
      expect(result.data.escalation).toBe(0)
      expect(result.data.green_attempts).toBe(0)
      expect(result.data.qa.cycles).toBe(0)
      expect(result.data.pending_gate).toBe("")
      expect(result.data.artifacts).toEqual({ spec: "", contracts: [], plan: "", docs: [] })
      expect(result.data.roadmap).toEqual({ issue: 0, epic: 0, feature_id: "", path: "" })
    }
  })

  test("accepts an opinion gate parked mid-slice", () => {
    const result = validateState({
      feature: "account-export",
      workflow: "sdd",
      stage: "implementation",
      pending_gate: "opinion",
      current_slice: "S2-export-writer",
      slice_phase: "green",
      updated: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.pending_gate).toBe("opinion")
  })

  test("rejects an unknown pending_gate", () => {
    const result = validateState({
      feature: "x",
      workflow: "sdd",
      stage: "implementation",
      pending_gate: "vibes",
      updated: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
  })

  test("rejects an unknown stage", () => {
    const result = validateState({
      feature: "x",
      workflow: "sdd",
      stage: "not-a-real-stage",
      updated: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
  })

  test("rejects a missing feature slug", () => {
    const result = validateState({
      workflow: "sdd",
      stage: "initialized",
      updated: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
  })

  test("rejects escalation values outside 0|1", () => {
    const result = validateState({
      feature: "x",
      workflow: "sdd",
      stage: "initialized",
      updated: new Date().toISOString(),
      escalation: 2,
    })
    expect(result.success).toBe(false)
  })

  test("records docs-sync paths without disturbing sibling artifacts", () => {
    const result = validateState({
      feature: "x",
      workflow: "sdd",
      stage: "docs_sync",
      updated: new Date().toISOString(),
      artifacts: { spec: "docs/feats/x/spec.md", docs: ["src/billing/README.md", "AGENTS.md"] },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.artifacts.docs).toEqual(["src/billing/README.md", "AGENTS.md"])
      expect(result.data.artifacts.spec).toBe("docs/feats/x/spec.md")
      expect(result.data.artifacts.contracts).toEqual([])
    }
  })

  test("rejects a malformed finding record", () => {
    const result = validateState({
      feature: "x",
      workflow: "sdd",
      stage: "implementation",
      updated: new Date().toISOString(),
      review: { findings: [{ id: "F1", file: "a.ts" }] },
    })
    expect(result.success).toBe(false)
  })
})

describe("scaffoldState", () => {
  test("produces a document that validates and defaults stage to initialized", () => {
    const state = scaffoldState("account-export", "sddkit")
    expect(state.stage).toBe("initialized")
    expect(state.feature).toBe("account-export")
    expect(state.last_agent).toBe("sddkit")
    expect(validateState(state).success).toBe(true)
  })
})

describe("atomic write + read round-trip", () => {
  test("writeStateAtomic then readState returns an equivalent document", async () => {
    const state = scaffoldState("account-export", "sddkit")
    await writeStateAtomic(root, "account-export", state)
    const readBack = await readState(root, "account-export")
    expect(readBack).toEqual(state)
  })

  test("writeStateAtomic leaves no tmp file behind", async () => {
    const state = scaffoldState("account-export", "sddkit")
    await writeStateAtomic(root, "account-export", state)
    const dir = path.dirname(statePath(root, "account-export"))
    const files = await fs.readdir(dir)
    expect(files).toEqual(["state.yaml"])
  })

  test("readState returns null when the file does not exist", async () => {
    expect(await readState(root, "nonexistent")).toBeNull()
  })
})

describe("appendJournal", () => {
  test("appends newline-delimited JSON entries", async () => {
    await appendJournal(root, "account-export", { ts: "t1", agent: "sddkit", action: "init" })
    await appendJournal(root, "account-export", { ts: "t2", agent: "sddkit", patch: { stage: "specify" } })
    const raw = await fs.readFile(journalPath(root, "account-export"), "utf8")
    const lines = raw
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
    expect(lines).toHaveLength(2)
    expect(lines[0].action).toBe("init")
    expect(lines[1].patch.stage).toBe("specify")
  })
})

describe("runInit / runPatch", () => {
  test("init scaffolds a new feature", async () => {
    const message = await runInit(root, "account-export")
    expect(message).toContain("Initialized")
    const state = await readState(root, "account-export")
    expect(state?.stage).toBe("initialized")
  })

  test("init refuses to clobber an existing feature", async () => {
    await runInit(root, "account-export")
    await expect(runInit(root, "account-export")).rejects.toThrow(/already exists/)
  })

  test("patch merges into existing state and bumps updated/last_agent", async () => {
    await runInit(root, "account-export")
    const before = await readState(root, "account-export")
    await new Promise((r) => setTimeout(r, 5))
    await runPatch(root, "account-export", { stage: "specify", completed: ["specify"] })
    const after = await readState(root, "account-export")
    expect(after?.stage).toBe("specify")
    expect(after?.completed).toEqual(["specify"])
    expect(after?.last_agent).toBe("sddkit")
    expect(after?.updated).not.toBe(before?.updated)
  })

  test("patch against a missing feature throws", async () => {
    await expect(runPatch(root, "ghost", { stage: "specify" })).rejects.toThrow(/does not exist/)
  })

  test("loop counters survive a round-trip so a resume reads them back", async () => {
    await runInit(root, "account-export")
    await runPatch(root, "account-export", { green_attempts: 2, escalation: 1 })
    await runPatch(root, "account-export", { qa: { cycles: 1 } })
    const after = await readState(root, "account-export")
    expect(after?.green_attempts).toBe(2)
    expect(after?.escalation).toBe(1)
    expect(after?.qa.cycles).toBe(1)
  })

  test("a risk upgrade survives a round-trip so a resume doesn't re-read plan.md's stale tag", async () => {
    await runInit(root, "account-export")
    await runPatch(root, "account-export", { upgraded_slices: ["S2"], slice_phase: "red" })
    const after = await readState(root, "account-export")
    expect(after?.upgraded_slices).toEqual(["S2"])
  })

  test("a partial roadmap patch preserves sibling keys", async () => {
    await runInit(root, "account-export")
    await runPatch(root, "account-export", { roadmap: { issue: 7, epic: 3, feature_id: "F2" } })
    await runPatch(root, "account-export", { roadmap: { path: "docs/product/billing/roadmap.md" } })
    const after = await readState(root, "account-export")
    expect(after?.roadmap).toEqual({
      issue: 7,
      epic: 3,
      feature_id: "F2",
      path: "docs/product/billing/roadmap.md",
    })
  })

  test("patch that would produce an invalid document is rejected and not written", async () => {
    await runInit(root, "account-export")
    await expect(runPatch(root, "account-export", { stage: "not-a-real-stage" })).rejects.toThrow(/invalid state\.yaml/)
    const state = await readState(root, "account-export")
    expect(state?.stage).toBe("initialized")
  })
})

describe("resolveActiveFeature", () => {
  test("returns null when no features exist", async () => {
    expect(await resolveActiveFeature(root)).toBeNull()
  })

  test("returns the in-progress feature with the most recent update", async () => {
    await runInit(root, "old-feature")
    await runPatch(root, "old-feature", { stage: "complete" })
    await new Promise((r) => setTimeout(r, 5))
    await runInit(root, "new-feature")
    expect(await resolveActiveFeature(root)).toBe("new-feature")
  })
})
