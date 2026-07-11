import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import {
  deepMerge,
  validateState,
  scaffoldState,
  readState,
  writeStateAtomic,
  appendJournal,
  resolveActiveFeature,
  runCheckpoint,
  isProtectedStateFile,
  isOpencodeSelfWrite,
  isCrossFeatureWrite,
  isPushToMainCommand,
  statePath,
  journalPath,
} from "./sdd-guard"

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "sdd-guard-test-"))
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
      expect(result.data.escalation).toBe(0)
      expect(result.data.pending_gate).toBe("")
      expect(result.data.artifacts).toEqual({ spec: "", contracts: [], plan: "", tasks: "" })
    }
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

  test("rejects a malformed finding record", () => {
    const result = validateState({
      feature: "x",
      workflow: "sdd",
      stage: "implementation",
      updated: new Date().toISOString(),
      review: { findings: [{ id: "F1", file: "a.ts" /* missing required keys */ }] },
    })
    expect(result.success).toBe(false)
  })
})

describe("scaffoldState", () => {
  test("produces a document that validates and defaults stage to initialized", () => {
    const state = scaffoldState("account-export", "sdd")
    expect(state.stage).toBe("initialized")
    expect(state.feature).toBe("account-export")
    expect(state.last_agent).toBe("sdd")
    expect(validateState(state).success).toBe(true)
  })
})

describe("atomic write + read round-trip", () => {
  test("writeStateAtomic then readState returns an equivalent document", async () => {
    const state = scaffoldState("account-export", "sdd")
    await writeStateAtomic(root, "account-export", state)
    const readBack = await readState(root, "account-export")
    expect(readBack).toEqual(state)
  })

  test("writeStateAtomic leaves no tmp file behind", async () => {
    const state = scaffoldState("account-export", "sdd")
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
    await appendJournal(root, "account-export", { ts: "t1", agent: "sdd", action: "init" })
    await appendJournal(root, "account-export", { ts: "t2", agent: "sdd", patch: { stage: "specify" } })
    const raw = await fs.readFile(journalPath(root, "account-export"), "utf8")
    const lines = raw.trim().split("\n").map((l) => JSON.parse(l))
    expect(lines).toHaveLength(2)
    expect(lines[0].action).toBe("init")
    expect(lines[1].patch.stage).toBe("specify")
  })
})

describe("runCheckpoint", () => {
  test("init scaffolds a new feature", async () => {
    const message = await runCheckpoint(root, { feature: "account-export", init: true }, "sdd")
    expect(message).toContain("Initialized")
    const state = await readState(root, "account-export")
    expect(state?.stage).toBe("initialized")
  })

  test("init refuses to clobber an existing feature", async () => {
    await runCheckpoint(root, { feature: "account-export", init: true }, "sdd")
    await expect(runCheckpoint(root, { feature: "account-export", init: true }, "sdd")).rejects.toThrow(/already exists/)
  })

  test("patch merges into existing state and bumps updated/last_agent", async () => {
    await runCheckpoint(root, { feature: "account-export", init: true }, "sdd")
    const before = await readState(root, "account-export")
    await new Promise((r) => setTimeout(r, 5))
    await runCheckpoint(root, { feature: "account-export", patch: { stage: "specify", completed: ["specify"] } }, "sdd")
    const after = await readState(root, "account-export")
    expect(after?.stage).toBe("specify")
    expect(after?.completed).toEqual(["specify"])
    expect(after?.last_agent).toBe("sdd")
    expect(after?.updated).not.toBe(before?.updated)
  })

  test("patch against a missing feature throws", async () => {
    await expect(runCheckpoint(root, { feature: "ghost", patch: { stage: "specify" } }, "sdd")).rejects.toThrow(/does not exist/)
  })

  test("patch that would produce an invalid document is rejected and not written", async () => {
    await runCheckpoint(root, { feature: "account-export", init: true }, "sdd")
    await expect(
      runCheckpoint(root, { feature: "account-export", patch: { stage: "not-a-real-stage" } }, "sdd"),
    ).rejects.toThrow(/invalid state\.yaml/)
    const state = await readState(root, "account-export")
    expect(state?.stage).toBe("initialized") // unchanged
  })

  test("non-sdd agents may not call checkpoint", async () => {
    await expect(runCheckpoint(root, { feature: "account-export", init: true }, "implementer")).rejects.toThrow(
      /only be called by @sdd/,
    )
  })
})

describe("resolveActiveFeature", () => {
  test("returns null when no features exist", async () => {
    expect(await resolveActiveFeature(root)).toBeNull()
  })

  test("returns the in-progress feature with the most recent update", async () => {
    await runCheckpoint(root, { feature: "old-feature", init: true }, "sdd")
    await runCheckpoint(root, { feature: "old-feature", patch: { stage: "complete" } }, "sdd")
    await new Promise((r) => setTimeout(r, 5))
    await runCheckpoint(root, { feature: "new-feature", init: true }, "sdd")
    expect(await resolveActiveFeature(root)).toBe("new-feature")
  })
})

describe("guard predicates", () => {
  test("isProtectedStateFile matches state.yaml and journal.ndjson under any feature", () => {
    expect(isProtectedStateFile(path.join(root, "docs/feats/account-export/state.yaml"), root)).toBe(true)
    expect(isProtectedStateFile(path.join(root, "docs/feats/account-export/journal.ndjson"), root)).toBe(true)
    expect(isProtectedStateFile(path.join(root, "docs/feats/account-export/plan.md"), root)).toBe(false)
  })

  test("isOpencodeSelfWrite matches anything under .opencode/", () => {
    expect(isOpencodeSelfWrite(path.join(root, ".opencode/agents/sdd.md"), root)).toBe(true)
    expect(isOpencodeSelfWrite(path.join(root, "src/index.ts"), root)).toBe(false)
  })

  test("isCrossFeatureWrite blocks writes into a different feature's docs while one is active", () => {
    expect(
      isCrossFeatureWrite(path.join(root, "docs/feats/other-feature/plan.md"), root, "account-export"),
    ).toBe(true)
    expect(
      isCrossFeatureWrite(path.join(root, "docs/feats/account-export/plan.md"), root, "account-export"),
    ).toBe(false)
  })

  test("isCrossFeatureWrite is inert when there is no active feature", () => {
    expect(isCrossFeatureWrite(path.join(root, "docs/feats/other-feature/plan.md"), root, null)).toBe(false)
  })

  test("isPushToMainCommand catches direct pushes to main/master", () => {
    expect(isPushToMainCommand("git push origin main")).toBe(true)
    expect(isPushToMainCommand("git push origin master")).toBe(true)
    expect(isPushToMainCommand("git push origin HEAD:main")).toBe(true)
    expect(isPushToMainCommand("git push -u origin feature/foo")).toBe(false)
    expect(isPushToMainCommand("git push origin main-backup")).toBe(false)
  })
})
