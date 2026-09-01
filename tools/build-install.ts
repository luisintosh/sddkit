#!/usr/bin/env bun
/** Bundle tools/install.ts for npx/bunx (`--target node`). */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const entry = path.join(root, "tools", "install.ts")

function parseOutfile(argv: string[]): string {
  const idx = argv.indexOf("--outfile")
  if (idx >= 0 && argv[idx + 1]) return path.resolve(argv[idx + 1])
  return path.join(root, "dist", "install.js")
}

const out = parseOutfile(process.argv.slice(2))
await fs.mkdir(path.dirname(out), { recursive: true })
const tmp = `${out}.tmp`
await $`bun build ${entry} --outfile ${tmp} --target node`
const js = await fs.readFile(tmp, "utf8")
const body = js.replace(/^#!.*\n/, "")
await fs.writeFile(out, `#!/usr/bin/env node\n${body}`, { mode: 0o755 })
await fs.chmod(out, 0o755)
await fs.rm(tmp, { force: true })
console.error(`build-install: wrote ${path.relative(root, out)}`)
