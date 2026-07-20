#!/usr/bin/env bun
/**
 * Emit dist/opencode and dist/cursor from src/catalog.yaml + src/prompts/.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const srcDir = path.join(root, "src")
const distDir = path.join(root, "dist")

type AgentCatalog = {
  description: string
  opencode: {
    mode: "primary" | "subagent"
    model: string
    temperature?: number
    steps?: number
    permission?: unknown
  }
  cursor: {
    model: string
    readonly?: boolean
    skill?: boolean
  }
}

type Catalog = {
  agents: Record<string, AgentCatalog>
  commands: Record<string, { description: string }>
  opencode_config: {
    model: string
    small_model: string
    default_agent: string
    instructions: string[]
  }
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
  return resolveIncludes(raw.trim() + "\n")
}

function yamlFrontmatter(obj: Record<string, unknown>): string {
  const yaml = stringifyYaml(obj, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n\n`
}

function cursorModel(model: string): string {
  return model.endsWith("[]") ? model : `${model}[]`
}

function cursorRestrictions(name: string, oc: AgentCatalog["opencode"]): string {
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
    if (denies.length && map["*"] !== "deny") {
      lines.push(`- Never edit: ${denies.join(", ")}.`)
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
    mcp: {
      codesight: {
        type: "local",
        command: ["npx", "codesight", "--mcp"],
        enabled: true,
      },
    },
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
      bash: {
        "*": "allow",
        "rm -rf *": "deny",
        "rm -fr *": "deny",
        "rm -r *": "ask",
        "git clean *": "ask",
        "git reset --hard*": "deny",
        "git checkout -- *": "ask",
        "git restore *": "ask",
        "git push --force*": "deny",
        "git push -f *": "deny",
        "git push* main*": "deny",
        "git push* master*": "deny",
        "gh pr merge *": "ask",
        "sudo *": "ask",
        "chmod -R *": "ask",
        "chown -R *": "ask",
        "* | sh": "deny",
        "* | bash": "deny",
        "curl * | *": "deny",
        "wget * | *": "deny",
      },
    },
  }

  // JSONC-ish: pretty JSON is fine for OpenCode
  await writeFile(path.join(outRoot, "opencode.jsonc"), JSON.stringify(cfg, null, 2) + "\n")

  for (const [name, agent] of Object.entries(catalog.agents)) {
    const body = await readPrompt(`agents/${name}.md`)
    const fm: Record<string, unknown> = {
      description: agent.description,
      mode: agent.opencode.mode,
      model: agent.opencode.model,
    }
    if (agent.opencode.temperature !== undefined) fm.temperature = agent.opencode.temperature
    if (agent.opencode.steps !== undefined) fm.steps = agent.opencode.steps
    if (agent.opencode.permission !== undefined) fm.permission = agent.opencode.permission
    await writeFile(path.join(outRoot, "agents", `${name}.md`), yamlFrontmatter(fm) + body)
  }
}

async function emitCursor(catalog: Catalog) {
  const outRoot = path.join(distDir, "cursor")
  await rmrf(outRoot)

  for (const [name, agent] of Object.entries(catalog.agents)) {
    const body = await readPrompt(`agents/${name}.md`)
    const restrictions = cursorRestrictions(name, agent.opencode)
    const fullBody = body.trimEnd() + restrictions + "\n"

    if (agent.cursor.skill) {
      const skillFm = {
        name,
        description: agent.description,
      }
      await writeFile(
        path.join(outRoot, "skills", name, "SKILL.md"),
        yamlFrontmatter(skillFm) + fullBody,
      )
      continue
    }

    const fm: Record<string, unknown> = {
      name,
      description: agent.description,
      model: cursorModel(agent.cursor.model),
      is_background: true,
    }
    if (agent.cursor.readonly) fm.readonly = true
    await writeFile(path.join(outRoot, "agents", `${name}.md`), yamlFrontmatter(fm) + fullBody)
  }

  for (const [name, meta] of Object.entries(catalog.commands)) {
    const body = await readPrompt(`commands/${name}.md`)
    const fm = {
      name,
      description: meta.description,
      "disable-model-invocation": true,
    }
    await writeFile(path.join(outRoot, "skills", name, "SKILL.md"), yamlFrontmatter(fm) + body)
  }
}

async function main() {
  const catalog = await loadCatalog()
  await fs.mkdir(distDir, { recursive: true })
  await emitOpencode(catalog)
  await emitCursor(catalog)
  console.log("transpile: wrote dist/opencode and dist/cursor")
}

await main()
