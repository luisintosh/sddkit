#!/usr/bin/env bun
/** Write manifest.txt (sha256 + dist-relative path) from dist/. */
import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const root = process.env.HARNESS_ROOT
  ? path.resolve(process.env.HARNESS_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(d: string) {
    let entries: Dirent[]
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
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

async function sha256(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  return createHash("sha256").update(buf).digest("hex")
}

const distRoots = ["opencode", "cursor", "claude", "codex", "agents"].map((d) => path.join(root, "dist", d))
const bin = path.join(root, "dist", "bin", "sddkit-state")

try {
  for (const d of distRoots) await fs.stat(d)
  await fs.stat(bin)
} catch {
  console.error("ERROR: dist/ incomplete — run: bun tools/transpile.ts && bun tools/build-cli.ts")
  process.exit(1)
}

const files = [...(await Promise.all(distRoots.map(walkFiles))).flat(), bin]
const lines: string[] = []
for (const abs of files) {
  const rel = path.relative(path.join(root, "dist"), abs).split(path.sep).join("/")
  lines.push(`${await sha256(abs)}  ${rel}`)
}
lines.sort((a, b) => a.split("  ")[1]!.localeCompare(b.split("  ")[1]!))

const outPath = path.join(root, "manifest.txt")
await fs.writeFile(outPath, `${lines.join("\n")}\n`, "utf8")
console.error(`Wrote manifest.txt (${lines.length} files)`)
