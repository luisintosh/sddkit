import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { stringify as stringifyYaml } from "yaml"
import { applyCompactGuard, assembleAgents } from "./agents.mjs"

describe("applyCompactGuard", () => {
  test("keeps guarded content and strips only the markers when the harness supports compact", () => {
    const body = "before {{#compact}}middle{{/compact}} after"
    expect(applyCompactGuard(body, true)).toBe("before middle after")
  })

  test("drops the entire guarded span when the harness does not support compact", () => {
    const body = "before {{#compact}}middle{{/compact}} after"
    expect(applyCompactGuard(body, false)).toBe("before  after")
  })

  test("handles multiple non-contiguous guards independently", () => {
    const body = "A {{#compact}}X{{/compact}} B {{#compact}}Y{{/compact}} C"
    expect(applyCompactGuard(body, true)).toBe("A X B Y C")
    expect(applyCompactGuard(body, false)).toBe("A  B  C")
  })

  test("a standalone guarded bullet line collapses cleanly, no doubled blank line", () => {
    const body = "- keep this bullet\n{{#compact}}- compact-only bullet{{/compact}}\n\n## Next section\n"
    expect(applyCompactGuard(body, false)).toBe("- keep this bullet\n\n## Next section\n")
  })

  test("is a no-op on text with no guards", () => {
    const body = "nothing to see here"
    expect(applyCompactGuard(body, true)).toBe(body)
    expect(applyCompactGuard(body, false)).toBe(body)
  })
})

describe("assembleAgents", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "assemble-agents-test-"))
    await fs.mkdir(path.join(root, "core", "agents"), { recursive: true })
    await fs.mkdir(path.join(root, "adapters", "fixture"), { recursive: true })

    await fs.writeFile(
      path.join(root, "core", "agents", "widget.md"),
      "Widget body.{{#compact}} Compact-only tail.{{/compact}}\n",
      "utf8",
    )
    await fs.writeFile(
      path.join(root, "core", "roles.yml"),
      stringifyYaml({ widget: { description: "Does widget things.", mode: "subagent" } }),
      "utf8",
    )
    await fs.writeFile(
      path.join(root, "adapters", "fixture", "agents.yml"),
      stringifyYaml({ widget: { model: "fixture-model/x", steps: 10 } }),
      "utf8",
    )
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  test("composes frontmatter (roles.yml + adapter fields) and body into one file", async () => {
    const out = path.join(root, "out")
    const count = await assembleAgents(root, "fixture", out, { supportsCompact: true })
    expect(count).toBe(1)

    const assembled = await fs.readFile(path.join(out, "agents", "widget.md"), "utf8")
    expect(assembled).toContain("description: Does widget things.")
    expect(assembled).toContain("mode: subagent")
    expect(assembled).toContain("model: fixture-model/x")
    expect(assembled).toContain("steps: 10")
    expect(assembled).toContain("Widget body. Compact-only tail.")
  })

  test("strips compact-guarded content for a harness that doesn't support it", async () => {
    const out = path.join(root, "out")
    await assembleAgents(root, "fixture", out, { supportsCompact: false })
    const assembled = await fs.readFile(path.join(out, "agents", "widget.md"), "utf8")
    expect(assembled).toContain("Widget body.")
    expect(assembled).not.toContain("Compact-only tail.")
    expect(assembled).not.toContain("{{#compact}}")
  })

  test("hidden: true is carried into the assembled frontmatter", async () => {
    await fs.writeFile(
      path.join(root, "core", "roles.yml"),
      stringifyYaml({ widget: { description: "Does widget things.", mode: "subagent", hidden: true } }),
      "utf8",
    )
    const out = path.join(root, "out")
    await assembleAgents(root, "fixture", out, { supportsCompact: true })
    const assembled = await fs.readFile(path.join(out, "agents", "widget.md"), "utf8")
    expect(assembled).toContain("hidden: true")
  })

  test("throws when an adapter is missing an entry for a role", async () => {
    await fs.writeFile(path.join(root, "adapters", "fixture", "agents.yml"), stringifyYaml({}), "utf8")
    await expect(assembleAgents(root, "fixture", path.join(root, "out"), { supportsCompact: true })).rejects.toThrow(
      /missing entries for: widget/,
    )
  })

  test("throws when a core agent body has no matching role", async () => {
    await fs.writeFile(
      path.join(root, "core", "agents", "orphan.md"),
      "Orphan body.\n",
      "utf8",
    )
    await expect(assembleAgents(root, "fixture", path.join(root, "out"), { supportsCompact: true })).rejects.toThrow(
      /core\/agents\/orphan\.md has no matching entry/,
    )
  })
})
