#!/usr/bin/env bun
/**
 * Hygiene checks (run after `bun run build`):
 *   1. catalog.yaml shape + prompt files
 *   2. dist/ frontmatter matches catalog models
 *   3. README dual-model table matches catalog
 *   4. manifest.txt matches dist/ hashes
 */
import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const errors: string[] = []

function fail(msg: string) {
  errors.push(msg)
}

async function sha256(filePath: string) {
  const buf = await readFile(filePath)
  return createHash("sha256").update(buf).digest("hex")
}

async function walkFiles(dir: string) {
  const out: string[] = []
  async function walk(d: string) {
    let entries: Dirent[]
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) out.push(p)
    }
  }
  await walk(dir)
  return out.sort()
}

type AgentCatalog = {
  description?: string
  opencode?: { mode?: string; model?: string; temperature?: number; steps?: number; permission?: unknown }
  cursor?: { model?: string; skill?: boolean }
}

/**
 * Agents whose permission maps may contain "ask". Only interactive-only agents
 * qualify: an "ask" anywhere else can be reached by an unattended `opencode run`
 * with no human to answer it, stalling that run indefinitely. See tools/transpile.ts.
 */
const ASK_ALLOWED = new Set(["sddkit-plan"])

/** Every permission value in a nested map, flattened to "path -> value" pairs. */
function permissionValues(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === "string") return [[path.join("."), node]]
  if (!node || typeof node !== "object" || Array.isArray(node)) return []
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => permissionValues(v, [...path, k]))
}

function failOnAsk(label: string, permission: unknown) {
  for (const [where, value] of permissionValues(permission)) {
    if (value === "ask") {
      fail(`${label}: permission "${where}" is "ask" — a detached opencode run cannot answer it; use allow or deny`)
    }
  }
}

/** Key-sorted JSON so comparisons don't depend on YAML key order. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
}

type Catalog = {
  agents?: Record<string, AgentCatalog>
  commands?: Record<string, unknown>
}

const catalogPath = path.join(root, "src", "catalog.yaml")
let catalog: Catalog | undefined
try {
  catalog = parseYaml(await readFile(catalogPath, "utf8")) as Catalog
} catch (err) {
  fail(`src/catalog.yaml: failed to parse — ${(err as Error).message}`)
}

const agentNames = catalog ? Object.keys(catalog.agents || {}).sort() : []

if (catalog) {
  if (!catalog.agents?.sddkit) fail("catalog: missing agents.sddkit")
  else if (catalog.agents.sddkit.opencode?.mode !== "primary") fail("catalog: sddkit.opencode.mode must be primary")
  if (catalog.agents?.["implementer-pro"]) fail("catalog: implementer-pro must be removed")
  for (const name of agentNames) {
    const a = catalog.agents![name]!
    if (!a.description?.trim()) fail(`catalog: agents.${name}.description required`)
    if (!a.opencode?.model?.startsWith("opencode-go/") && !a.opencode?.model?.startsWith("openai/")) {
      fail(`catalog: agents.${name}.opencode.model must start with opencode-go/ or openai/`)
    }
    if (!a.cursor?.model) fail(`catalog: agents.${name}.cursor.model required`)
    if (!ASK_ALLOWED.has(name)) failOnAsk(`catalog: agents.${name}`, a.opencode?.permission)
    try {
      await stat(path.join(root, "src", "prompts", "agents", `${name}.md`))
    } catch {
      fail(`src/prompts/agents/${name}.md missing`)
    }
  }
  for (const cmd of Object.keys(catalog.commands || {})) {
    try {
      await stat(path.join(root, "src", "prompts", "commands", `${cmd}.md`))
    } catch {
      fail(`src/prompts/commands/${cmd}.md missing`)
    }
    try {
      await stat(path.join(root, "dist", "agents", "skills", cmd, "SKILL.md"))
    } catch {
      fail(`dist/agents/skills/${cmd}/SKILL.md missing — run bun run build`)
    }
  }
}

const distOc = path.join(root, "dist", "opencode")
const distCu = path.join(root, "dist", "cursor")

let ocConfig: { permission?: unknown } | undefined
try {
  ocConfig = JSON.parse(await readFile(path.join(distOc, "opencode.jsonc"), "utf8"))
} catch {
  fail("dist/opencode/opencode.jsonc missing or unparseable — run bun run build")
}
if (ocConfig) failOnAsk("dist/opencode/opencode.jsonc", ocConfig.permission)

if (catalog) {
  for (const name of agentNames) {
    const ocPath = path.join(distOc, "agents", `${name}.md`)
    try {
      const raw = await readFile(ocPath, "utf8")
      const m = raw.match(/^---\n([\s\S]*?)\n---\n/)
      if (!m) {
        fail(`dist/opencode/agents/${name}.md: missing frontmatter`)
        continue
      }
      const fm = parseYaml(m[1]!) as {
        model?: string
        temperature?: number
        steps?: number
        permission?: unknown
      }
      const oc = catalog.agents![name]!.opencode!
      if (fm.model !== oc.model) {
        fail(`dist drift: opencode ${name} model ${fm.model} != catalog ${oc.model} — run bun run build`)
      }
      if (fm.temperature !== oc.temperature) {
        fail(
          `dist drift: opencode ${name} temperature ${fm.temperature} != catalog ${oc.temperature} — run bun run build`,
        )
      }
      if (fm.steps !== oc.steps) {
        fail(`dist drift: opencode ${name} steps ${fm.steps} != catalog ${oc.steps} — run bun run build`)
      }
      if (stable(fm.permission) !== stable(oc.permission)) {
        fail(`dist drift: opencode ${name} permission block != catalog — run bun run build`)
      }
    } catch {
      fail(`dist/opencode/agents/${name}.md missing — run bun run build`)
    }

    const agent = catalog.agents![name]!
    if (agent.cursor?.skill) {
      try {
        await stat(path.join(root, "dist", "agents", "skills", name, "SKILL.md"))
      } catch {
        fail(`dist/agents/skills/${name}/SKILL.md missing — run bun run build`)
      }
    } else {
      const cuPath = path.join(distCu, "agents", `${name}.md`)
      try {
        const raw = await readFile(cuPath, "utf8")
        const m = raw.match(/^---\n([\s\S]*?)\n---\n/)
        if (!m) {
          fail(`dist/cursor/agents/${name}.md: missing frontmatter`)
          continue
        }
        const fm = parseYaml(m[1]!) as { model?: string; is_background?: boolean }
        const wantModel = agent.cursor!.model!.endsWith("[]") ? agent.cursor!.model! : `${agent.cursor!.model!}[]`
        if (fm.model !== wantModel) {
          fail(`dist drift: cursor ${name} model ${fm.model} != catalog ${wantModel} — run bun run build`)
        }
        if (fm.is_background === true) {
          fail(`dist drift: cursor ${name} must not set is_background — conductor is sequential`)
        }
      } catch {
        fail(`dist/cursor/agents/${name}.md missing — run bun run build`)
      }
    }
  }
}

try {
  await stat(path.join(root, "dist", "bin", "sddkit-state"))
} catch {
  fail("dist/bin/sddkit-state missing — run bun run build")
}

const readme = await readFile(path.join(root, "README.md"), "utf8")
const rowRe = /^\|\s*`([a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm
const readmeRows = new Map<string, { opencode: string; cursor: string }>()
for (const m of readme.matchAll(rowRe)) {
  readmeRows.set(m[1]!, { opencode: m[2]!, cursor: m[3]! })
}

if (catalog) {
  if (readmeRows.size === 0) {
    fail("README.md: no dual-model table rows found")
  } else {
    for (const name of agentNames) {
      const row = readmeRows.get(name)
      if (!row) {
        fail(`README.md: model table missing row for "${name}"`)
        continue
      }
      const wantOc = catalog.agents![name]!.opencode!.model!
      const wantCu = catalog.agents![name]!.cursor!.model!
      if (row.opencode !== wantOc) fail(`README.md: ${name} OpenCode model ${row.opencode} != catalog ${wantOc}`)
      if (row.cursor !== wantCu) fail(`README.md: ${name} Cursor model ${row.cursor} != catalog ${wantCu}`)
    }
    for (const name of readmeRows.keys()) {
      if (!catalog.agents![name]) fail(`README.md: model table lists "${name}" not in catalog`)
    }
  }
}

async function expectedManifestEntries() {
  const files = [
    ...(await walkFiles(path.join(root, "dist", "opencode"))),
    ...(await walkFiles(path.join(root, "dist", "cursor"))),
    ...(await walkFiles(path.join(root, "dist", "agents"))),
    path.join(root, "dist", "bin", "sddkit-state"),
  ]
  const entries: [string, string][] = []
  for (const abs of files.sort()) {
    const rel = path.relative(path.join(root, "dist"), abs).split(path.sep).join("/")
    entries.push([await sha256(abs), rel])
  }
  return entries
}

const manifestPath = path.join(root, "manifest.txt")
let manifestRaw: string | undefined
try {
  manifestRaw = await readFile(manifestPath, "utf8")
} catch {
  fail("manifest.txt: missing — run bun tools/gen-manifest.ts (or bun run build)")
}

if (manifestRaw !== undefined) {
  const actualLines = manifestRaw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/)
      if (!m) return null
      return [m[1]!, m[2]!] as [string, string]
    })

  if (actualLines.some((l) => l === null)) {
    fail("manifest.txt: contains a malformed line")
  } else {
    const expected = await expectedManifestEntries()
    const expectedSet = new Map(expected.map(([hash, rel]) => [rel, hash]))
    const actualSet = new Map((actualLines as [string, string][]).map(([hash, rel]) => [rel, hash]))

    for (const [rel, hash] of expectedSet) {
      if (!actualSet.has(rel)) fail(`manifest.txt: missing ${rel} — run bun tools/gen-manifest.ts`)
      else if (actualSet.get(rel) !== hash) fail(`manifest.txt: stale hash for ${rel} — run bun tools/gen-manifest.ts`)
    }
    for (const rel of actualSet.keys()) {
      if (!expectedSet.has(rel)) fail(`manifest.txt: lists ${rel}, which shouldn't be installed`)
    }
  }
}

if (errors.length > 0) {
  console.error(`check: ${errors.length} problem(s) found\n`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(`check: ok (${agentNames.length} agents, ${readmeRows.size} README rows, manifest fresh)`)
