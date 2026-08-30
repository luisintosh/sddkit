#!/usr/bin/env bun
/** Interactive installer prompts. Writes KEY='value' lines for install.sh to source. */
import * as fs from "node:fs/promises"
import * as p from "@clack/prompts"

const HOSTS = ["cursor", "claude", "codex", "opencode"] as const
type Host = (typeof HOSTS)[number]

function writeUsage(): never {
  console.error("usage: bun tools/install-tui.ts --write-env <file>")
  process.exit(2)
}

function parseArgs(): string {
  const idx = process.argv.indexOf("--write-env")
  const dest = idx >= 0 ? process.argv[idx + 1] : undefined
  if (!dest) writeUsage()
  return dest
}

function onPath(...bins: string[]): boolean {
  return bins.some((bin) => Boolean(Bun.which(bin)))
}

function detect(): Record<Host, boolean> {
  return {
    cursor: onPath("cursor", "cursor-agent"),
    claude: onPath("claude"),
    codex: onPath("codex"),
    opencode: onPath("opencode"),
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function abort(): never {
  p.cancel("Aborted")
  process.exit(1)
}

async function writeEnv(file: string, env: Record<string, string>) {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${shellQuote(value)}`)
  await fs.writeFile(file, `${lines.join("\n")}\n`, "utf8")
}

async function main() {
  const dest = parseArgs()
  const detected = detect()
  p.intro("SDD harness installer")

  const scope = await p.select({
    message: "Install where?",
    options: [
      { value: "project", label: "This repository", hint: process.env.TARGET_DIR || process.cwd() },
      { value: "global", label: "User home (all repos)", hint: process.env.HOME },
    ],
    initialValue: "project",
  })
  if (p.isCancel(scope)) abort()

  const detectedHosts = HOSTS.filter((host) => detected[host])
  const targets = await p.multiselect({
    message: "Which hosts? Undetected ones can still be installed.",
    options: HOSTS.map((host) => ({
      value: host,
      label: host,
      hint: detected[host] ? "detected" : "not on PATH",
    })),
    initialValues: detectedHosts.length > 0 ? [...detectedHosts] : [...HOSTS],
    required: true,
  })
  if (p.isCancel(targets)) abort()

  const env: Record<string, string> = {
    INSTALL_SCOPE: String(scope),
    INSTALL_TARGET: targets.join(","),
  }

  const versionPreset = process.env.VERSION || process.env.BRANCH || process.env.LOCAL_SOURCE
  if (!versionPreset) {
    const source = await p.select({
      message: "Version source",
      options: [
        { value: "latest", label: "Latest release tag" },
        { value: "tag", label: "Specific tag" },
        { value: "branch", label: "Git branch" },
        { value: "local", label: "Local checkout (must already contain dist/)" },
      ],
      initialValue: "latest",
    })
    if (p.isCancel(source)) abort()
    if (source === "tag") {
      const tag = await p.text({ message: "Tag", placeholder: "v0.3.0" })
      if (p.isCancel(tag) || !String(tag).trim()) abort()
      env.VERSION = String(tag).trim()
    } else if (source === "branch") {
      const branch = await p.text({ message: "Branch", defaultValue: "master" })
      if (p.isCancel(branch) || !String(branch).trim()) abort()
      env.BRANCH = String(branch).trim()
    } else if (source === "local") {
      const local = await p.text({ message: "Local checkout path" })
      if (p.isCancel(local) || !String(local).trim()) abort()
      env.LOCAL_SOURCE = String(local).trim()
    }
  }

  const destHint = scope === "global" ? process.env.HOME || "$HOME" : process.env.TARGET_DIR || process.cwd()
  const confirmed = await p.confirm({
    message: `Install ${targets.join(", ")} into ${destHint}?`,
    initialValue: true,
  })
  if (p.isCancel(confirmed) || !confirmed) abort()

  await writeEnv(dest, env)
  p.outro("Starting install")
}

await main()
