#!/usr/bin/env bun
/**
 * Hygiene checks (run after `bun run build`):
 *   1. catalog.yaml shape + prompt files
 *   2. dist/ frontmatter matches catalog models
 *   3. README profile × host matrix matches catalog
 *   4. manifest.txt matches dist/ hashes
 *   5. dist/install.js (npx/bunx CLI) is present and not stale
 */
import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import { readFile, readdir, rm, stat } from "node:fs/promises"
import * as os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"
import { parse as parseYaml } from "yaml"
import {
  formatClaudeModel,
  formatCodexDisplay,
  formatCodexModel,
  formatCursorModel,
  formatOpenCodeModel,
  GOLDEN_MODELS,
  type Host,
  type ModelRef,
  PROFILE_NAMES,
} from "./models.ts"

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
  profile?: string
  description?: string
  opencode?: { mode?: string; temperature?: number; steps?: number; permission?: unknown }
  cursor?: { skill?: boolean }
}

type Catalog = {
  hosts?: Record<string, { profiles?: Record<string, ModelRef> }>
  agents?: Record<string, AgentCatalog>
  commands?: Record<string, unknown>
}

function resolveRef(catalog: Catalog, host: Host, profile: string): ModelRef | undefined {
  return catalog.hosts?.[host]?.profiles?.[profile]
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
    if (!a.profile) fail(`catalog: agents.${name}.profile required`)
    else {
      for (const host of ["opencode", "cursor", "claude", "codex"] as const) {
        const ref = resolveRef(catalog, host, a.profile)
        if (!ref?.id) fail(`catalog: hosts.${host}.profiles.${a.profile} required for agents.${name}`)
      }
    }
    if (!ASK_ALLOWED.has(name)) failOnAsk(`catalog: agents.${name}`, a.opencode?.permission)
    try {
      await stat(path.join(root, "src", "prompts", "agents", `${name}.md`))
    } catch {
      fail(`src/prompts/agents/${name}.md missing`)
    }
  }
  for (const host of ["opencode", "cursor", "claude", "codex"] as const) {
    for (const profile of PROFILE_NAMES) {
      if (!resolveRef(catalog, host, profile)?.id) {
        fail(`catalog: hosts.${host}.profiles.${profile} required`)
      }
    }
  }
  const goldenCursorThink = formatCursorModel(resolveRef(catalog, "cursor", "think")!)
  if (goldenCursorThink !== GOLDEN_MODELS.cursor.think) {
    fail(`catalog: cursor think formatted as ${goldenCursorThink} != golden ${GOLDEN_MODELS.cursor.think}`)
  }
  const goldenCursorTest = formatCursorModel(resolveRef(catalog, "cursor", "test")!)
  if (goldenCursorTest !== GOLDEN_MODELS.cursor.test) {
    fail(`catalog: cursor test formatted as ${goldenCursorTest} != golden ${GOLDEN_MODELS.cursor.test}`)
  }
  const goldenCursorExecute = formatCursorModel(resolveRef(catalog, "cursor", "execute")!)
  if (goldenCursorExecute !== GOLDEN_MODELS.cursor.execute) {
    fail(`catalog: cursor execute formatted as ${goldenCursorExecute} != golden ${GOLDEN_MODELS.cursor.execute}`)
  }
  const goldenClaudeThink = formatClaudeModel(resolveRef(catalog, "claude", "think")!)
  if (goldenClaudeThink !== GOLDEN_MODELS.claude.think) {
    fail(`catalog: claude think formatted as ${goldenClaudeThink} != golden ${GOLDEN_MODELS.claude.think}`)
  }
  const goldenClaudeExecute = formatClaudeModel(resolveRef(catalog, "claude", "execute")!)
  if (goldenClaudeExecute !== GOLDEN_MODELS.claude.execute) {
    fail(`catalog: claude execute formatted as ${goldenClaudeExecute} != golden ${GOLDEN_MODELS.claude.execute}`)
  }
  const goldenCodexThink = formatCodexModel(resolveRef(catalog, "codex", "think")!)
  if (goldenCodexThink.model !== GOLDEN_MODELS.codex.think.model || goldenCodexThink.reasoning) {
    fail(`catalog: codex think formatted as ${JSON.stringify(goldenCodexThink)} != golden`)
  }
  const goldenCodexExecute = formatCodexModel(resolveRef(catalog, "codex", "execute")!)
  if (
    goldenCodexExecute.model !== GOLDEN_MODELS.codex.execute.model ||
    goldenCodexExecute.reasoning !== GOLDEN_MODELS.codex.execute.reasoning
  ) {
    fail(`catalog: codex execute formatted as ${JSON.stringify(goldenCodexExecute)} != golden`)
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
      const wantOc = formatOpenCodeModel(resolveRef(catalog, "opencode", catalog.agents![name]!.profile!)!)
      if (fm.model !== wantOc) {
        fail(`dist drift: opencode ${name} model ${fm.model} != catalog ${wantOc} — run bun run build`)
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
        const wantModel = formatCursorModel(resolveRef(catalog, "cursor", agent.profile!)!)
        if (fm.model !== wantModel) {
          fail(`dist drift: cursor ${name} model ${fm.model} != catalog ${wantModel} — run bun run build`)
        }
        if (fm.is_background === true) {
          fail(`dist drift: cursor ${name} must not set is_background — conductor is sequential`)
        }
      } catch {
        fail(`dist/cursor/agents/${name}.md missing — run bun run build`)
      }
      try {
        const raw = await readFile(path.join(root, "dist", "claude", "agents", `${name}.md`), "utf8")
        const m = raw.match(/^---\n([\s\S]*?)\n---\n/)
        if (!m) {
          fail(`dist/claude/agents/${name}.md: missing frontmatter`)
        } else {
          const fm = parseYaml(m[1]!) as { model?: string }
          const wantModel = formatClaudeModel(resolveRef(catalog, "claude", agent.profile!)!)
          if (fm.model !== wantModel) {
            fail(`dist drift: claude ${name} model ${fm.model} != catalog ${wantModel} — run bun run build`)
          }
        }
      } catch {
        fail(`dist/claude/agents/${name}.md missing — run bun run build`)
      }
      try {
        const raw = await readFile(path.join(root, "dist", "codex", "agents", `${name}.toml`), "utf8")
        const want = formatCodexModel(resolveRef(catalog, "codex", agent.profile!)!)
        const model = raw.match(/^model = "(.*)"$/m)?.[1]
        const reasoning = raw.match(/^model_reasoning_effort = "(.*)"$/m)?.[1]
        if (want.model === "inherit") {
          if (model) fail(`dist drift: codex ${name} must omit model when inherit`)
        } else if (model !== want.model) {
          fail(`dist drift: codex ${name} model ${model} != catalog ${want.model} — run bun run build`)
        }
        if ((reasoning ?? undefined) !== want.reasoning) {
          fail(
            `dist drift: codex ${name} model_reasoning_effort ${reasoning} != catalog ${want.reasoning} — run bun run build`,
          )
        }
      } catch {
        fail(`dist/codex/agents/${name}.toml missing — run bun run build`)
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
const modelsSection = readme.split("## Models")[1]?.split(/^## /m)[0] ?? ""
const profileRowRe = /^\|\s*`([a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm
const agentRowRe = /^\|\s*`([a-z0-9-]+)`\s*\|\s*`([a-z0-9-]+)`\s*\|/gm
const readmeProfiles = new Map<string, { opencode: string; cursor: string; claude: string; codex: string }>()
const readmeAgents = new Map<string, string>()
for (const m of modelsSection.matchAll(profileRowRe)) {
  readmeProfiles.set(m[1]!, { opencode: m[2]!, cursor: m[3]!, claude: m[4]!, codex: m[5]! })
}
for (const m of modelsSection.matchAll(agentRowRe)) {
  if (readmeProfiles.has(m[1]!)) continue
  readmeAgents.set(m[1]!, m[2]!)
}

if (catalog) {
  if (readmeProfiles.size === 0) {
    fail("README.md: no profile × host matrix rows found")
  } else {
    for (const profile of PROFILE_NAMES) {
      const row = readmeProfiles.get(profile)
      if (!row) {
        fail(`README.md: profile matrix missing row for "${profile}"`)
        continue
      }
      const wantOc = formatOpenCodeModel(resolveRef(catalog, "opencode", profile)!)
      const wantCu = formatCursorModel(resolveRef(catalog, "cursor", profile)!)
      const wantCl = formatClaudeModel(resolveRef(catalog, "claude", profile)!)
      const wantCx = formatCodexDisplay(resolveRef(catalog, "codex", profile)!)
      if (row.opencode !== wantOc) fail(`README.md: ${profile} OpenCode ${row.opencode} != catalog ${wantOc}`)
      if (row.cursor !== wantCu) fail(`README.md: ${profile} Cursor ${row.cursor} != catalog ${wantCu}`)
      if (row.claude !== wantCl) fail(`README.md: ${profile} Claude ${row.claude} != catalog ${wantCl}`)
      if (row.codex !== wantCx) fail(`README.md: ${profile} Codex ${row.codex} != catalog ${wantCx}`)
    }
    for (const profile of readmeProfiles.keys()) {
      if (!PROFILE_NAMES.includes(profile as (typeof PROFILE_NAMES)[number])) {
        fail(`README.md: profile matrix lists "${profile}" not in catalog`)
      }
    }
  }
  if (readmeAgents.size === 0) {
    fail("README.md: no agent → profile table rows found")
  } else {
    for (const name of agentNames) {
      const profile = readmeAgents.get(name)
      if (!profile) {
        fail(`README.md: agent table missing row for "${name}"`)
        continue
      }
      if (profile !== catalog.agents![name]!.profile) {
        fail(`README.md: ${name} profile ${profile} != catalog ${catalog.agents![name]!.profile}`)
      }
    }
    for (const name of readmeAgents.keys()) {
      if (!catalog.agents![name]) fail(`README.md: agent table lists "${name}" not in catalog`)
    }
  }
}

async function expectedManifestEntries() {
  const files = [
    ...(await walkFiles(path.join(root, "dist", "opencode"))),
    ...(await walkFiles(path.join(root, "dist", "cursor"))),
    ...(await walkFiles(path.join(root, "dist", "claude"))),
    ...(await walkFiles(path.join(root, "dist", "codex"))),
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
    if (actualSet.has("install.js")) fail("manifest.txt: lists install.js, which shouldn't be installed")
  }
}

{
  const dest = path.join(root, "dist", "install.js")
  let current: string | undefined
  try {
    current = await readFile(dest, "utf8")
  } catch {
    fail("dist/install.js missing — run bun run build")
  }
  if (current !== undefined) {
    if (!current.startsWith("#!/usr/bin/env node\n")) {
      fail("dist/install.js missing node shebang — run bun run build")
    }
    const tmp = path.join(os.tmpdir(), `sddkit-install-check-${process.pid}.js`)
    try {
      await $`bun ${path.join(root, "tools", "build-install.ts")} --outfile ${tmp}`.quiet()
      const expected = await readFile(tmp, "utf8")
      if (current !== expected) fail("dist/install.js stale — run bun run build")
    } catch {
      fail("dist/install.js rebuild failed — run bun run build")
    } finally {
      await rm(tmp, { force: true })
    }
  }
}

if (errors.length > 0) {
  console.error(`check: ${errors.length} problem(s) found\n`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(
  `check: ok (${agentNames.length} agents, ${readmeProfiles.size} profile rows, ${readmeAgents.size} agent rows, manifest fresh)`,
)
