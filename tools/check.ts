#!/usr/bin/env bun
/**
 * Hygiene checks (run after `bun run build`):
 *   1. catalog.yaml shape + prompt files
 *   2. dist/ frontmatter matches catalog models
 *   3. README dual-model table matches catalog
 *   4. manifest.txt matches dist/ hashes
 */
import { createHash } from "node:crypto"
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
    let entries
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
  opencode?: { mode?: string; model?: string }
  cursor?: { model?: string; skill?: boolean }
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
  if (!catalog.agents?.sdd) fail("catalog: missing agents.sdd")
  else if (catalog.agents.sdd.opencode?.mode !== "primary") fail("catalog: sdd.opencode.mode must be primary")
  if (catalog.agents?.["implementer-pro"]) fail("catalog: implementer-pro must be removed")
  for (const name of agentNames) {
    const a = catalog.agents![name]!
    if (!a.description?.trim()) fail(`catalog: agents.${name}.description required`)
    if (!a.opencode?.model?.startsWith("opencode-go/")) {
      fail(`catalog: agents.${name}.opencode.model must start with opencode-go/`)
    }
    if (!a.cursor?.model) fail(`catalog: agents.${name}.cursor.model required`)
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
  }
}

const distOc = path.join(root, "dist", "opencode")
const distCu = path.join(root, "dist", "cursor")

try {
  await stat(path.join(distOc, "opencode.jsonc"))
} catch {
  fail("dist/opencode/opencode.jsonc missing — run bun run build")
}

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
      const fm = parseYaml(m[1]!) as { model?: string }
      if (fm.model !== catalog.agents![name]!.opencode!.model) {
        fail(
          `dist drift: opencode ${name} model ${fm.model} != catalog ${catalog.agents![name]!.opencode!.model} — run bun run build`,
        )
      }
    } catch {
      fail(`dist/opencode/agents/${name}.md missing — run bun run build`)
    }

    const agent = catalog.agents![name]!
    if (agent.cursor?.skill) {
      try {
        await stat(path.join(distCu, "skills", name, "SKILL.md"))
      } catch {
        fail(`dist/cursor/skills/${name}/SKILL.md missing — run bun run build`)
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
        const fm = parseYaml(m[1]!) as { model?: string }
        if (fm.model !== agent.cursor!.model) {
          fail(`dist drift: cursor ${name} model ${fm.model} != catalog ${agent.cursor!.model} — run bun run build`)
        }
      } catch {
        fail(`dist/cursor/agents/${name}.md missing — run bun run build`)
      }
    }
  }
}

try {
  await stat(path.join(root, "dist", "bin", "sdd-state"))
} catch {
  fail("dist/bin/sdd-state missing — run bun run build")
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
    path.join(root, "dist", "bin", "sdd-state"),
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
