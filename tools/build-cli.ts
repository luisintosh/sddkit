#!/usr/bin/env bun
/**
 * Build portable Node ESM bundle into dist/bin/sddkit-state.mjs.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { $ } from "bun"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(root, "dist", "bin")
const entry = path.join(root, "src", "state", "cli.ts")
const outJs = path.join(outDir, "sddkit-state.mjs")

await fs.mkdir(outDir, { recursive: true })

await $`bun build ${entry} --outfile ${outJs} --target node --minify`
const js = await fs.readFile(outJs, "utf8")
const body = js.replace(/^#!.*\n/, "")
await fs.writeFile(outJs, `#!/usr/bin/env node\n${body}`, { mode: 0o755 })
await fs.chmod(outJs, 0o755)
await fs.rm(path.join(outDir, "sddkit-state"), { force: true })
await fs.rm(path.join(outDir, "sddkit-state.js"), { force: true })

console.log("build-cli: wrote portable dist/bin/sddkit-state.mjs")
