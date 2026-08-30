#!/usr/bin/env bun
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
}

type Catalog = {
  hosts: Record<Host, { profiles: Record<string, ModelRef> }>
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

function claudeTools(agent: AgentCatalog): string {
  if (isReadonly(agent)) return "Read, Glob, Grep, Bash"
  return "Read, Glob, Grep, Edit, Write, Bash"
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

async function loadCatalog(): Promise<Catalog> {
  const raw = await fs.readFile(path.join(srcDir, "catalog.yaml"), "utf8")
  return parseYaml(raw) as Catalog
}

async function resolveIncludes(body: string): Promise<string> {
  const re = /\{\{include:([^}]+)\}\}/g
  let out = body
  const matches = [...body.matchAll(re)]
  for (const m of matches) {
    const rel = m[1]!.trim()
    const frag = await fs.readFile(path.join(srcDir, "prompts", rel), "utf8")
    out = out.replace(m[0], frag.trim())
  }
  return out
}

async function readPrompt(rel: string): Promise<string> {
  const raw = await fs.readFile(path.join(srcDir, "prompts", rel), "utf8")
  return resolveIncludes(`${raw.trim()}\n`)
}

function yamlFrontmatter(obj: Record<string, unknown>): string {
  const yaml = stringifyYaml(obj, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n\n`
}

function cursorRestrictions(oc: AgentCatalog["opencode"]): string {
  const perm = oc.permission
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
    const template = (await readPrompt(`commands/${name}.md`)).trimEnd()
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
    const body = await readPrompt(`agents/${name}.md`)
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

async function emitSharedSkills(catalog: Catalog) {
  const outRoot = path.join(distDir, "agents", "skills")
  await rmrf(outRoot)

  const replyMapping = await fs.readFile(path.join(srcDir, "prompts", "fragments", "reply-mapping.md"), "utf8")

  for (const [name, agent] of Object.entries(catalog.agents)) {
    if (!agent.cursor?.skill) continue
    let raw = await fs.readFile(path.join(srcDir, "prompts", "agents", `${name}.md`), "utf8")
    if (raw.includes("{{include:fragments/reply-mapping.md}}")) {
      raw = raw.replace("{{include:fragments/reply-mapping.md}}", replyMappingPointer())
      await writeFile(path.join(outRoot, name, "references", "reply-mapping.md"), `${replyMapping.trim()}\n`)
    }
    const body = await resolveIncludes(`${raw.trim()}\n`)
    const restrictions = cursorRestrictions(agent.opencode)
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
    const body = await readPrompt(`commands/${name}.md`)
    const fm = {
      name,
      description: meta.description,
      "disable-model-invocation": true,
    }
    await writeFile(path.join(outRoot, name, "SKILL.md"), yamlFrontmatter(fm) + body)
  }
}

function replyMappingPointer(): string {
  return [
    "## Applying subagent replies",
    "",
    "Reply keys are not state keys. Read [references/reply-mapping.md](references/reply-mapping.md) before the first",
    "patch — translate every reply; never pass one through verbatim.",
    "",
  ].join("\n")
}

async function emitCursor(catalog: Catalog) {
  const outRoot = path.join(distDir, "cursor")
  await rmrf(outRoot)

  for (const [name, agent] of Object.entries(catalog.agents)) {
    if (agent.cursor?.skill) continue
    const body = await readPrompt(`agents/${name}.md`)
    const restrictions = cursorRestrictions(agent.opencode)
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
    const body = await readPrompt(`agents/${name}.md`)
    const fm: Record<string, unknown> = {
      name,
      description: agent.description,
      model: formatClaudeModel(resolveModel(catalog, "claude", agent)),
      tools: claudeTools(agent),
    }
    await writeFile(path.join(outRoot, "agents", `${name}.md`), yamlFrontmatter(fm) + body)
  }
}

async function emitCodex(catalog: Catalog) {
  const outRoot = path.join(distDir, "codex")
  await rmrf(outRoot)

  for (const [name, agent] of Object.entries(catalog.agents)) {
    if (agent.cursor?.skill) continue
    const body = await readPrompt(`agents/${name}.md`)
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
  await emitCursor(catalog)
  await emitClaude(catalog)
  await emitCodex(catalog)
  console.log("transpile: wrote dist/opencode, dist/cursor, dist/claude, dist/codex, and dist/agents/skills")
}

await main()
