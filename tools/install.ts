#!/usr/bin/env node
/** Install the SDD harness into a repository (project) or $HOME (global). */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import * as fsSync from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import * as p from "@clack/prompts"

const HOSTS = ["cursor", "claude", "codex", "opencode"] as const
type Host = (typeof HOSTS)[number]
type Scope = "project" | "global"
type Manifest = Map<string, string>

const REPO_NAME = "sddkit"

function log(message: string) {
  console.error(message)
}

function die(message: string): never {
  log(`ERROR: ${message}`)
  process.exit(1)
}

function onPath(...bins: string[]): boolean {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""]
  return bins.some((bin) => dirs.some((dir) => exts.some((ext) => fsSync.existsSync(path.join(dir, `${bin}${ext}`)))))
}

function detect(): Record<Host, boolean> {
  return {
    cursor: onPath("cursor", "cursor-agent"),
    claude: onPath("claude"),
    codex: onPath("codex"),
    opencode: onPath("opencode"),
  }
}

function hostOnPath(host: Host): boolean {
  return detect()[host]
}

function fromPosix(root: string, rel: string): string {
  return path.join(root, ...rel.split("/"))
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  return createHash("sha256").update(buf).digest("hex")
}

function parseManifest(raw: string): Manifest {
  const map: Manifest = new Map()
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    const idx = line.indexOf("  ")
    if (idx < 0) continue
    map.set(line.slice(idx + 2), line.slice(0, idx))
  }
  return map
}

function backupStamp(): string {
  const d = new Date()
  const p2 = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
}

function findPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const manifest = path.join(dir, "manifest.txt")
    const distBin = path.join(dir, "dist", "bin", "sddkit-state")
    if (fsSync.existsSync(manifest) && fsSync.existsSync(distBin)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  die("could not find sddkit payload (manifest.txt + dist/) — run bun run build in the toolkit checkout")
}

function requirePayload(src: string) {
  const ok =
    fsSync.existsSync(path.join(src, "manifest.txt")) &&
    fsSync.existsSync(path.join(src, "dist")) &&
    fsSync.existsSync(path.join(src, "dist", "bin", "sddkit-state"))
  if (!ok) {
    die(
      `${src} is missing dist/ + manifest.txt — clients copy a committed payload (run bun run build in the toolkit checkout)`,
    )
  }
}

function normalizeTargets(raw: string): string {
  const target = raw.replaceAll(" ", "")
  if (!target) die("INSTALL_TARGET is empty")
  if (target === "all") return target
  for (const part of target.split(",")) {
    if (!(HOSTS as readonly string[]).includes(part)) {
      die(`invalid INSTALL_TARGET host: ${part} (use all or comma list: cursor,claude,codex,opencode)`)
    }
  }
  return target
}

function wantsHost(installTarget: string, host: Host): boolean {
  if (installTarget === "all") return true
  return `,${installTarget},`.includes(`,${host},`)
}

function abort(): never {
  p.cancel("Aborted")
  process.exit(1)
}

function shouldPrompt(scope: string, target: string): boolean {
  if (process.env.CI) return false
  if (scope || target) return false
  return Boolean(process.stdout.isTTY)
}

async function promptInteractive(targetDir: string): Promise<{ scope: Scope; target: string }> {
  const detected = detect()
  p.intro("SDD harness installer")

  const scope = await p.select({
    message: "Install where?",
    options: [
      { value: "project", label: "This repository", hint: targetDir },
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

  const destHint = scope === "global" ? process.env.HOME || "$HOME" : targetDir
  const confirmed = await p.confirm({
    message: `Install ${targets.join(", ")} into ${destHint}?`,
    initialValue: true,
  })
  if (p.isCancel(confirmed) || !confirmed) abort()

  p.outro("Starting install")
  return { scope: scope as Scope, target: targets.join(",") }
}

function parseArgs(argv: string[]): { dryRun: boolean; doctorOnly: boolean } {
  let dryRun = false
  let doctorOnly = false
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true
    else if (arg === "--doctor") doctorOnly = true
  }
  return { dryRun, doctorOnly }
}

function isGitRepo(dir: string): boolean {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
  return r.status === 0 && r.stdout.trim() === "true"
}

function ghStatus(): "ok" | "logged-out" | "missing" {
  if (!onPath("gh")) return "missing"
  const r = spawnSync("gh", ["auth", "status"], { stdio: "ignore" })
  return r.status === 0 ? "ok" : "logged-out"
}

function stateBinInUse(targetDir: string, home: string): string | undefined {
  const project = path.join(targetDir, ".agents", "bin", "sddkit-state")
  const global = path.join(home, ".agents", "bin", "sddkit-state")
  if (fsSync.existsSync(project)) return project
  if (fsSync.existsSync(global)) return global
}

function resolveDests(scope: Scope, targetDir: string, home: string) {
  if (scope === "global") {
    return {
      agentsRoot: path.join(home, ".agents"),
      cursorAgents: path.join(home, ".cursor", "agents"),
      claudeAgents: path.join(home, ".claude", "agents"),
      claudeSkills: path.join(home, ".claude", "skills"),
      codexAgents: path.join(process.env.CODEX_HOME || path.join(home, ".codex"), "agents"),
      opencodeDest: path.join(home, ".config", "opencode", "agents"),
      opencodePrefix: "opencode/agents",
    }
  }
  return {
    agentsRoot: path.join(targetDir, ".agents"),
    cursorAgents: path.join(targetDir, ".cursor", "agents"),
    claudeAgents: path.join(targetDir, ".claude", "agents"),
    claudeSkills: path.join(targetDir, ".claude", "skills"),
    codexAgents: path.join(targetDir, ".codex", "agents"),
    opencodeDest: path.join(targetDir, ".opencode"),
    opencodePrefix: "opencode",
  }
}

async function installTree(opts: {
  prefix: string
  destRoot: string
  stageDir: string
  newManifest: Manifest
  dryRun: boolean
}) {
  const { prefix, destRoot, stageDir, newManifest, dryRun } = opts
  const oldManifestPath = path.join(destRoot, ".harness-manifest")
  let oldManifest: Manifest = new Map()
  try {
    oldManifest = parseManifest(await fs.readFile(oldManifestPath, "utf8"))
  } catch {
    oldManifest = new Map()
  }

  const backupDir = path.join(destRoot, `.backup-${backupStamp()}`)
  let backupUsed = false
  let installed = 0
  let updated = 0
  let backedUp = 0
  let pruned = 0
  let skipped = 0
  const prefixSlash = `${prefix}/`

  for (const relPath of newManifest.keys()) {
    if (!relPath.startsWith(prefixSlash)) continue
    const destRel = relPath.slice(prefixSlash.length)
    const dest = fromPosix(destRoot, destRel)
    const wantHash = newManifest.get(relPath) ?? ""

    if (!fsSync.existsSync(dest) || !fsSync.statSync(dest).isFile()) {
      if (!dryRun) {
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.copyFile(fromPosix(stageDir, relPath), dest)
      }
      log(`  + install  ${prefix}/${destRel}`)
      installed++
      continue
    }

    const haveHash = await sha256File(dest)
    if (haveHash === wantHash) {
      skipped++
      continue
    }

    const prevHash = oldManifest.get(destRel)
    if (prevHash && haveHash !== prevHash) {
      if (!dryRun) {
        const backupDest = fromPosix(backupDir, destRel)
        await fs.mkdir(path.dirname(backupDest), { recursive: true })
        await fs.copyFile(dest, backupDest)
      }
      backupUsed = true
      backedUp++
      log(`  ~ modified ${prefix}/${destRel} (locally changed — backed up, then updated)`)
    } else {
      log(`  ~ update   ${prefix}/${destRel}`)
      updated++
    }
    if (!dryRun) {
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.copyFile(fromPosix(stageDir, relPath), dest)
    }
  }

  for (const destRel of oldManifest.keys()) {
    if (newManifest.has(`${prefix}/${destRel}`)) continue
    const dest = fromPosix(destRoot, destRel)
    if (!fsSync.existsSync(dest) || !fsSync.statSync(dest).isFile()) continue
    if (destRel === ".harness-manifest") continue

    const haveHash = await sha256File(dest)
    const prevHash = oldManifest.get(destRel)
    if (prevHash && haveHash !== prevHash) {
      if (!dryRun) {
        const backupDest = fromPosix(backupDir, destRel)
        await fs.mkdir(path.dirname(backupDest), { recursive: true })
        await fs.copyFile(dest, backupDest)
      }
      backupUsed = true
      log(`  ~ prune    ${prefix}/${destRel} (locally changed — backed up, then removed)`)
    } else {
      log(`  - prune    ${prefix}/${destRel}`)
    }
    if (!dryRun) await fs.rm(dest)
    pruned++
  }

  if (!dryRun) {
    await fs.mkdir(destRoot, { recursive: true })
    const lines: string[] = []
    for (const relPath of newManifest.keys()) {
      if (!relPath.startsWith(prefixSlash)) continue
      const destRel = relPath.slice(prefixSlash.length)
      lines.push(`${newManifest.get(relPath)}  ${destRel}`)
    }
    lines.sort((a, b) => (a.split("  ")[1] ?? "").localeCompare(b.split("  ")[1] ?? ""))
    await fs.writeFile(oldManifestPath, lines.length > 0 ? `${lines.join("\n")}\n` : "")
  }

  log(
    `  ${prefix}: installed ${installed}, updated ${updated}, backed up ${backedUp}, pruned ${pruned}, unchanged ${skipped}.`,
  )
  if (backupUsed) {
    log(`  Locally modified files preserved under ${destRoot}/.backup-*/`)
  }
}

async function installBin(opts: {
  scope: Scope
  targetDir: string
  home: string
  stageDir: string
  newManifest: Manifest
  dryRun: boolean
}) {
  const dest =
    opts.scope === "global"
      ? path.join(opts.home, ".agents", "bin", "sddkit-state")
      : path.join(opts.targetDir, ".agents", "bin", "sddkit-state")
  const src = path.join(opts.stageDir, "bin", "sddkit-state")
  const wantHash = opts.newManifest.get("bin/sddkit-state")
  if (!wantHash) die("manifest missing bin/sddkit-state")

  if (fsSync.existsSync(dest) && (await sha256File(dest)) === wantHash) {
    log("  .agents/bin/sddkit-state unchanged")
  } else {
    if (fsSync.existsSync(dest)) log("  ~ update   .agents/bin/sddkit-state")
    else log("  + install  .agents/bin/sddkit-state")
    if (!opts.dryRun) {
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.copyFile(src, dest)
      await fs.chmod(dest, 0o755)
    }
  }

  if (opts.scope === "project") {
    for (const leftover of [
      path.join(opts.targetDir, "bin", "sddkit-state"),
      path.join(opts.targetDir, "bin", "sdd-state"),
    ]) {
      if (!fsSync.existsSync(leftover)) continue
      if (!opts.dryRun) await fs.rm(leftover)
      log(`  - prune    ${leftover.slice(opts.targetDir.length + 1)} (moved to .agents/bin/sddkit-state)`)
    }
  }
}

async function pruneLegacyCursorSkills(scope: Scope, targetDir: string, home: string, dryRun: boolean) {
  const dest = scope === "global" ? path.join(home, ".cursor", "skills") : path.join(targetDir, ".cursor", "skills")
  if (!fsSync.existsSync(dest)) return
  for (const name of ["sddkit", "sddkit-plan", "setup-docs"]) {
    const pth = path.join(dest, name)
    if (!fsSync.existsSync(pth)) continue
    if (!dryRun) await fs.rm(pth, { recursive: true, force: true })
    log(`  - prune    .cursor/skills/${name} (moved to .agents/skills/)`)
  }
}

function doctor(targetDir: string, home: string) {
  log("")
  log("Doctor:")

  for (const host of HOSTS) {
    if (hostOnPath(host)) log(`  [ok]   ${host} CLI is on PATH`)
    else log(`  [warn] ${host} CLI not detected (install still allowed)`)
  }

  if (isGitRepo(targetDir)) log(`  [ok]   ${targetDir} is a git repository`)
  else log(`  [warn] ${targetDir} is not a git repository`)

  if (fsSync.existsSync(path.join(targetDir, "AGENTS.md"))) log("  [ok]   AGENTS.md present")
  else log("  [warn] AGENTS.md missing — run /setup-docs first")

  log("  paths:")
  log(`    skills          ${targetDir}/.agents/skills/  or  ${home}/.agents/skills/`)
  log(`    sddkit-state    ${targetDir}/.agents/bin/  or  ${home}/.agents/bin/`)
  log(`    cursor agents   ${targetDir}/.cursor/agents/  or  ${home}/.cursor/agents/`)
  log(`    claude agents   ${targetDir}/.claude/agents/  or  ${home}/.claude/agents/`)
  log(`    claude skills   ${targetDir}/.claude/skills/  or  ${home}/.claude/skills/`)
  log(`    codex agents    ${targetDir}/.codex/agents/  or  \${CODEX_HOME:-${home}/.codex}/agents/`)
  log(`    opencode        ${targetDir}/.opencode/  or  ${home}/.config/opencode/agents/ (no jsonc)`)

  const stateBin = stateBinInUse(targetDir, home)
  if (stateBin) log(`  [ok]   sddkit-state: ${stateBin}`)
  else log("  [warn] sddkit-state missing — re-run the installer")

  if (onPath("bun")) log("  [ok]   bun is on PATH (needed to run the portable sddkit-state script)")
  else log("  [warn] bun not found — install from https://bun.sh to run sddkit-state")

  const gh = ghStatus()
  if (gh === "ok") log("  [ok]   gh installed and authenticated")
  else if (gh === "logged-out") log("  [warn] gh installed but not logged in — run 'gh auth login'")
  else log("  [warn] gh not found — required by the pipeline: brew install gh && gh auth login")

  log("")
}

function suggestNextSteps() {
  log("Next steps:")
  log("  1. /setup-docs       — scaffold AGENTS.md + docs/ARCHITECTURE.md + CONSTITUTION")
  if (!onPath("gh")) {
    log("  2. Install gh (required by the pipeline):")
    log("       brew install gh && gh auth login")
    log("       # or: https://cli.github.com/")
  } else {
    log("  2. gh is on PATH — run 'gh auth login' if you aren't logged in")
  }
  log("")
  log("Optional: sddkit-plan — Product Owner planner (/sddkit-plan skill, or the")
  log("  OpenCode sddkit-plan agent) turns a raw idea into a feature roadmap at")
  log("  docs/product/<slug>/roadmap.md. Run each feature through sddkit one at a")
  log("  time — it hands you the next feature's invocation when one is done.")
  log("")
  log("Optional: rtk (filters noisy bash output for agents)")
  log("  brew install rtk   # or see https://github.com/rtk-ai/rtk")
  log("  rtk init --opencode   # OpenCode")
  log("  # Quick start: exclude git diff/show from rewriting so code-reviewer")
  log("  # and docs-writer see full diffs — in ~/.config/rtk/config.toml:")
  log("  #   [hooks]")
  log('  #   exclude_commands = ["git diff", "git show"]')
  log("")
}

async function stagePayload(payloadDir: string): Promise<{ stageDir: string; manifest: Manifest; fileCount: number }> {
  const raw = await fs.readFile(path.join(payloadDir, "manifest.txt"), "utf8")
  if (!raw.trim()) die("manifest.txt is empty")
  const manifest = parseManifest(raw)
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), "sddkit-install-"))
  let fileCount = 0
  try {
    for (const [relPath, expectedHash] of manifest) {
      const src = fromPosix(path.join(payloadDir, "dist"), relPath)
      if (!fsSync.existsSync(src)) {
        await fs.rm(stageDir, { recursive: true, force: true })
        die(`missing ${path.join(payloadDir, "dist", relPath)}`)
      }
      const dest = fromPosix(stageDir, relPath)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.copyFile(src, dest)
      const actualHash = await sha256File(dest)
      if (actualHash !== expectedHash) {
        await fs.rm(stageDir, { recursive: true, force: true })
        die(`checksum mismatch for ${relPath} — aborting, nothing installed`)
      }
      fileCount++
    }
  } catch (err) {
    await fs.rm(stageDir, { recursive: true, force: true })
    throw err
  }
  return { stageDir, manifest, fileCount }
}

async function main() {
  const { dryRun, doctorOnly } = parseArgs(process.argv.slice(2))
  const targetDir = path.resolve(process.env.TARGET_DIR || process.cwd())
  const home = process.env.HOME || os.homedir()

  if (doctorOnly) {
    doctor(targetDir, home)
    return
  }

  if (!fsSync.existsSync(targetDir) || !fsSync.statSync(targetDir).isDirectory()) {
    die(`target directory does not exist: ${targetDir}`)
  }

  let scopeRaw = process.env.INSTALL_SCOPE ?? ""
  let targetRaw = process.env.INSTALL_TARGET ?? ""

  if (shouldPrompt(scopeRaw, targetRaw)) {
    const picked = await promptInteractive(targetDir)
    scopeRaw = picked.scope
    targetRaw = picked.target
  } else {
    if (!scopeRaw) scopeRaw = "project"
    if (!targetRaw) targetRaw = "all"
  }

  if (scopeRaw !== "project" && scopeRaw !== "global") {
    die(`invalid INSTALL_SCOPE: ${scopeRaw} (use project or global)`)
  }
  const scope: Scope = scopeRaw
  const installTarget = normalizeTargets(targetRaw)

  const localSource = process.env.LOCAL_SOURCE || ""
  let payloadDir: string
  if (localSource) {
    if (!fsSync.existsSync(localSource) || !fsSync.statSync(localSource).isDirectory()) {
      die(`LOCAL_SOURCE does not exist: ${localSource}`)
    }
    requirePayload(localSource)
    payloadDir = localSource
    log(`Installing from local source: ${localSource} (scope=${scope} target=${installTarget})`)
  } else {
    payloadDir = findPackageRoot()
    requirePayload(payloadDir)
    log(`Installing ${REPO_NAME} (scope=${scope} target=${installTarget})...`)
  }

  const { stageDir, manifest, fileCount } = await stagePayload(payloadDir)
  try {
    log(`Verified ${fileCount} files against manifest.txt`)

    const dests = resolveDests(scope, targetDir, home)
    await installTree({
      prefix: "agents",
      destRoot: dests.agentsRoot,
      stageDir,
      newManifest: manifest,
      dryRun,
    })
    if (wantsHost(installTarget, "cursor")) {
      await installTree({
        prefix: "cursor/agents",
        destRoot: dests.cursorAgents,
        stageDir,
        newManifest: manifest,
        dryRun,
      })
    }
    if (wantsHost(installTarget, "claude")) {
      await installTree({
        prefix: "claude/agents",
        destRoot: dests.claudeAgents,
        stageDir,
        newManifest: manifest,
        dryRun,
      })
      await installTree({
        prefix: "agents/skills",
        destRoot: dests.claudeSkills,
        stageDir,
        newManifest: manifest,
        dryRun,
      })
    }
    if (wantsHost(installTarget, "codex")) {
      await installTree({
        prefix: "codex/agents",
        destRoot: dests.codexAgents,
        stageDir,
        newManifest: manifest,
        dryRun,
      })
    }
    if (wantsHost(installTarget, "opencode")) {
      await installTree({
        prefix: dests.opencodePrefix,
        destRoot: dests.opencodeDest,
        stageDir,
        newManifest: manifest,
        dryRun,
      })
    }

    await installBin({ scope, targetDir, home, stageDir, newManifest: manifest, dryRun })
    await pruneLegacyCursorSkills(scope, targetDir, home, dryRun)

    if (dryRun) {
      log("")
      log(`Dry run complete (scope=${scope} target=${installTarget}).`)
      return
    }

    log("")
    log(
      "Done. Invoke .agents/bin/sddkit-state (or $HOME/.agents/bin/sddkit-state) so the conductor can checkpoint state.",
    )
    log("")
    suggestNextSteps()
    doctor(targetDir, home)
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true })
  }
}

await main()
