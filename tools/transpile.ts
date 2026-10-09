#!/usr/bin/env node
/**
 * Emit dist/opencode, dist/cursor, dist/claude, dist/codex, and dist/agents/skills.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import {
  formatClaudeModel,
  formatCodexModel,
  formatCursorModel,
  formatOpenCodeModel,
  type Host,
  type ModelRef,
} from "./models.ts"
import { type OrcaRoutes, orcaAgentFile, orcaLaunchCommand, orcaRoutesByAgent } from "../src/state/orca.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const srcDir = path.join(root, "src")
const distDir = path.join(root, "dist")

type AgentCatalog = {
  profile: string
  description: string
  opencode: {
    mode: "primary" | "subagent"
    temperature?: number
    steps?: number
    permission?: unknown
  }
  cursor?: {
    readonly?: boolean
    skill?: boolean
  }
  claude?: {
    /** Only for agents the conductor continues: a longer TTL costs 2x per write and pays off only on reuse. */
    cache_ttl?: "5m" | "1h"
  }
}

type Catalog = {
  hosts: Record<Host, { profiles: Record<string, ModelRef> }>
  orchestrators?: { orca?: { profiles?: OrcaRoutes } }
  agents: Record<string, AgentCatalog>
  commands: Record<string, { description: string }>
  opencode_config: {
    model: string
    small_model: string
    default_agent: string
    instructions: string[]
  }
}

function resolveModel(catalog: Catalog, host: Host, agent: AgentCatalog): ModelRef {
  const ref = catalog.hosts[host]?.profiles[agent.profile]
  if (!ref?.id) {
    throw new Error(`catalog: hosts.${host}.profiles.${agent.profile} missing`)
  }
  return ref
}

function isReadonly(agent: AgentCatalog): boolean {
  if (agent.cursor?.readonly) return true
  const edit = (agent.opencode.permission as { edit?: unknown } | undefined)?.edit
  return edit === "deny"
}

function bashDenied(agent: AgentCatalog): boolean {
  return (agent.opencode.permission as { bash?: unknown } | undefined)?.bash === "deny"
}

function claudeTools(agent: AgentCatalog): string {
  const tools = isReadonly(agent) ? ["Read", "Glob", "Grep"] : ["Read", "Glob", "Grep", "Edit", "Write"]
  if (!bashDenied(agent)) tools.push("Bash")
  return tools.join(", ")
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

async function loadCatalog(): Promise<Catalog> {
  const raw = await fs.readFile(path.join(srcDir, "catalog.yaml"), "utf8")
  return parseYaml(raw) as Catalog
}

function orcaRoutesTable(catalog: Catalog): string {
  const rows = Object.entries(orcaRoutesByAgent(catalog)).map(([name, route]) => {
    const profile = catalog.agents[name]!.profile
    return `| \`${name}\` | ${profile} | \`${orcaLaunchCommand(route)}\` | \`${orcaAgentFile(route.agent, name)}\` |`
  })
  return ["| Specialist | Profile | Launch command | Agent file |", "| --- | --- | --- | --- |", ...rows].join("\n")
}

async function inlineIncludes(body: string, depth: number): Promise<string> {
  // Fragments may include fragments; the depth cap stops an include cycle.
  if (depth > 4) throw new Error("transpile: {{include:}} nested deeper than 4 — cycle?")
  const re = /\{\{include:([^}]+)\}\}/g
  let out = body
  for (const m of [...body.matchAll(re)]) {
    const rel = m[1]!.trim()
    const frag = await fs.readFile(path.join(srcDir, "prompts", rel), "utf8")
    const inlined = await inlineIncludes(frag.trim(), depth + 1)
    out = out.replace(m[0], () => inlined)
  }
  return out
}

async function resolveIncludes(body: string, catalog: Catalog): Promise<string> {
  const out = await inlineIncludes(body, 0)
  // Generated after includes so fragments may carry it.
  return out.replaceAll("{{orca:routes}}", orcaRoutesTable(catalog))
}

async function readPrompt(rel: string, catalog: Catalog): Promise<string> {
  const raw = await fs.readFile(path.join(srcDir, "prompts", rel), "utf8")
  return resolveIncludes(`${raw.trim()}\n`, catalog)
}

function yamlFrontmatter(obj: Record<string, unknown>): string {
  const yaml = stringifyYaml(obj, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n\n`
}

function cursorRestrictions(agent: AgentCatalog): string {
  const perm = agent.opencode.permission
  if (!perm || typeof perm !== "object") return ""
  const edit = (perm as { edit?: unknown }).edit
  const lines: string[] = []
  if (edit === "deny") {
    lines.push("- Do not edit or write any files (read-only).")
  } else if (edit && typeof edit === "object") {
    const map = edit as Record<string, string>
    const denies = Object.entries(map)
      .filter(([, v]) => v === "deny")
      .map(([k]) => k)
    const allows = Object.entries(map)
      .filter(([k, v]) => v === "allow" && k !== "*")
      .map(([k]) => k)
    if (map["*"] === "deny" && allows.length) {
      lines.push(`- Edit only: ${allows.join(", ")}.`)
    }
    // Cursor has no permission config, so deny carve-outs have to survive into
    // the prose even when the allow list is already narrow.
    const carveOuts = denies.filter((k) => k !== "*")
    if (carveOuts.length) {
      lines.push(`- Never edit: ${carveOuts.join(", ")}.`)
    }
  }
  if (bashDenied(agent)) lines.push("- Do not run shell commands.")
  if (!lines.length) return ""
  return `\n## Tool restrictions (Cursor)\n${lines.join("\n")}\n`
}

async function rmrf(dir: string) {
  await fs.rm(dir, { recursive: true, force: true })
}

async function writeFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
}

async function emitOpencode(catalog: Catalog) {
  const outRoot = path.join(distDir, "opencode")
  await rmrf(outRoot)

  const commands: Record<string, { description: string; template: string }> = {}
  for (const [name, meta] of Object.entries(catalog.commands)) {
    const template = (await readPrompt(`commands/${name}.md`, catalog)).trimEnd()
    commands[name] = { description: meta.description, template }
  }

  const cfg = {
    $schema: "https://opencode.ai/config.json",
    model: catalog.opencode_config.model,
    small_model: catalog.opencode_config.small_model,
    default_agent: catalog.opencode_config.default_agent,
    instructions: catalog.opencode_config.instructions,
    command: commands,
    lsp: true,
    formatter: true,
    permission: {
      edit: {
        "*": "allow",
        "docs/feats/**/state.yaml": "deny",
        "**/journal.ndjson": "deny",
        ".opencode/**": "deny",
      },
      read: "allow",
      webfetch: "allow",
      // No entry may be "ask": `opencode run` has no responder for a bash/edit
      // permission request, so an unattended run would stall mid-turn with
      // nobody to answer. Dangerous commands are hard denies instead — a denial
      // is refused and the model adapts. Enforced by tools/check.ts. Merge
      // authority is governed by prompts, not this map.
      bash: {
        "*": "allow",
        "rm -rf *": "deny",
        "rm -fr *": "deny",
        "rm -r *": "deny",
        "git clean *": "deny",
        "git reset --hard*": "deny",
        "git checkout -- *": "deny",
        "git restore *": "deny",
        "git push --force*": "deny",
        "git push -f *": "deny",
        "git push* main*": "deny",
        "git push* master*": "deny",
        "sudo *": "deny",
        "chmod -R *": "deny",
        "chown -R *": "deny",
        "* | sh": "deny",
        "* | bash": "deny",
        "curl * | *": "deny",
        "wget * | *": "deny",
      },
    },
  }

  // JSONC-ish: pretty JSON is fine for OpenCode
  await writeFile(path.join(outRoot, "opencode.jsonc"), `${JSON.stringify(cfg, null, 2)}\n`)

  for (const [name, agent] of Object.entries(catalog.agents)) {
    const body = await readPrompt(`agents/${name}.md`, catalog)
    const fm: Record<string, unknown> = {
      description: agent.description,
      mode: agent.opencode.mode,
      model: formatOpenCodeModel(resolveModel(catalog, "opencode", agent)),
    }
    if (agent.opencode.temperature !== undefined) fm.temperature = agent.opencode.temperature
    if (agent.opencode.steps !== undefined) fm.steps = agent.opencode.steps
    if (agent.opencode.permission !== undefined) fm.permission = agent.opencode.permission
    await writeFile(path.join(outRoot, "agents", `${name}.md`), yamlFrontmatter(fm) + body)
  }
}

// Fragments a shared skill loads on demand: the SKILL.md body keeps the pointer, the
// fragment moves to references/<file>.
const SKILL_REFERENCES: Record<string, string[]> = {
  "reply-mapping.md": [
    "## Applying subagent replies",
    "",
    "Reply keys are not state keys. Read [references/reply-mapping.md](references/reply-mapping.md) before the first",
    "patch — translate every reply; never pass one through verbatim.",
  ],
  "orca.md": [
    "## Orca dispatch",
    "",
    "Applies only when state has `tools.orchestrator: orca`; otherwise skip it. Then read",
    "[references/orca.md](references/orca.md) before the first dispatch, resume, or close.",
  ],
}

// Per-area review checklists, installed to <agentsRoot>/sddkit/checklists/. The conductor passes the absolute path of
// one to each sddkit-code-reviewer run; the header line lets the reviewer reject a wrong file.
const REVIEW_CHECKLISTS: Record<string, string[]> = {
  contract: ["fragments/review-contract.md"],
  health: ["fragments/review-health.md"],
  design: ["fragments/review-design.md", "fragments/design-practices.md"],
}

async function emitReviewChecklists(catalog: Catalog) {
  const outRoot = path.join(distDir, "agents", "sddkit", "checklists")
  await rmrf(outRoot)
  for (const [area, fragments] of Object.entries(REVIEW_CHECKLISTS)) {
    const parts: string[] = []
    for (const rel of fragments) parts.push((await readPrompt(rel, catalog)).trim())
    await writeFile(
      path.join(outRoot, `review-${area}.md`),
      `# sddkit review checklist: ${area}\n\n${parts.join("\n\n")}\n`,
    )
  }
}

async function emitSharedSkills(catalog: Catalog) {
  const outRoot = path.join(distDir, "agents", "skills")
  await rmrf(outRoot)

  for (const [name, agent] of Object.entries(catalog.agents)) {
    if (!agent.cursor?.skill) continue
    let raw = await fs.readFile(path.join(srcDir, "prompts", "agents", `${name}.md`), "utf8")
    for (const [file, pointer] of Object.entries(SKILL_REFERENCES)) {
      const tag = `{{include:fragments/${file}}}`
      if (!raw.includes(tag)) continue
      raw = raw.replace(tag, `${pointer.join("\n")}\n`)
      await writeFile(path.join(outRoot, name, "references", file), await readPrompt(`fragments/${file}`, catalog))
    }
    const body = await resolveIncludes(`${raw.trim()}\n`, catalog)
    const restrictions = cursorRestrictions(agent)
    const skillFm = {
      name,
      description: agent.description,
    }
    await writeFile(
      path.join(outRoot, name, "SKILL.md"),
      `${yamlFrontmatter(skillFm)}${body.trimEnd() + restrictions}\n`,
    )
  }

  for (const [name, meta] of Object.entries(catalog.commands)) {
    const body = await readPrompt(`commands/${name}.md`, catalog)
    const fm = {
      name,
      description: meta.description,
      "disable-model-invocation": true,
    }
    await writeFile(path.join(outRoot, name, "SKILL.md"), yamlFrontmatter(fm) + body)
  }
}

async function emitCursor(catalog: Catalog) {
  const outRoot = path.join(distDir, "cursor")
  await rmrf(outRoot)

  for (const [name, agent] of Object.entries(catalog.agents)) {
    if (agent.cursor?.skill) continue
    const body = await readPrompt(`agents/${name}.md`, catalog)
    const restrictions = cursorRestrictions(agent)
    const fullBody = `${body.trimEnd() + restrictions}\n`

    const fm: Record<string, unknown> = {
      name,
      description: agent.description,
      model: formatCursorModel(resolveModel(catalog, "cursor", agent)),
    }
    if (agent.cursor?.readonly) fm.readonly = true
    await writeFile(path.join(outRoot, "agents", `${name}.md`), yamlFrontmatter(fm) + fullBody)
  }
}

async function emitClaude(catalog: Catalog) {
  const outRoot = path.join(distDir, "claude")
  await rmrf(outRoot)

  for (const [name, agent] of Object.entries(catalog.agents)) {
    if (agent.cursor?.skill) continue
    const body = await readPrompt(`agents/${name}.md`, catalog)
    const ref = resolveModel(catalog, "claude", agent)
    const fm: Record<string, unknown> = {
      name,
      description: agent.description,
      model: formatClaudeModel(ref),
    }
    if (ref.effort) fm.effort = ref.effort
    // Keeps a continued agent's prompt cache alive past the 5m subagent default; Claude Code < 2.1.248 ignores the key.
    if (agent.claude?.cache_ttl) fm.experimental = { cacheTtl: agent.claude.cache_ttl }
    fm.tools = claudeTools(agent)
    await writeFile(path.join(outRoot, "agents", `${name}.md`), yamlFrontmatter(fm) + body)
  }
}

async function emitCodex(catalog: Catalog) {
  const outRoot = path.join(distDir, "codex")
  await rmrf(outRoot)

  for (const [name, agent] of Object.entries(catalog.agents)) {
    if (agent.cursor?.skill) continue
    const body = await readPrompt(`agents/${name}.md`, catalog)
    const resolved = formatCodexModel(resolveModel(catalog, "codex", agent))
    const sandbox = isReadonly(agent) ? "read-only" : "workspace-write"
    const lines = [
      `name = ${tomlString(name)}`,
      `description = ${tomlString(agent.description)}`,
      `developer_instructions = ${tomlString(body.trim())}`,
    ]
    if (resolved.model !== "inherit") {
      lines.push(`model = ${tomlString(resolved.model)}`)
      if (resolved.reasoning) lines.push(`model_reasoning_effort = ${tomlString(resolved.reasoning)}`)
    }
    lines.push(`sandbox_mode = ${tomlString(sandbox)}`)
    await writeFile(path.join(outRoot, "agents", `${name}.toml`), `${lines.join("\n")}\n`)
  }
}

async function main() {
  const catalog = await loadCatalog()
  await fs.mkdir(distDir, { recursive: true })
  await emitOpencode(catalog)
  await emitSharedSkills(catalog)
  await emitReviewChecklists(catalog)
  await emitCursor(catalog)
  await emitClaude(catalog)
  await emitCodex(catalog)
  console.log(
    "transpile: wrote dist/opencode, dist/cursor, dist/claude, dist/codex, dist/agents/skills, and dist/agents/sddkit/checklists",
  )
}

await main()
