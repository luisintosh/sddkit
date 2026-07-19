#!/usr/bin/env bun
/**
 * Build portable bun bundle + optional mac compiled binaries into dist/bin/.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { $ } from "bun"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(root, "dist", "bin")
const entry = path.join(root, "src", "state", "cli.ts")

await fs.mkdir(outDir, { recursive: true })

// Portable JS runnable via `bun dist/bin/sdd-state.js` (and shebang wrapper).
const tmpJs = path.join(outDir, "sdd-state.js")
await $`bun build ${entry} --outfile ${tmpJs} --target=bun`
const js = await fs.readFile(tmpJs, "utf8")
const withShebang = js.startsWith("#!") ? js : `#!/usr/bin/env bun\n${js}`
await fs.writeFile(path.join(outDir, "sdd-state"), withShebang, { mode: 0o755 })
await fs.chmod(path.join(outDir, "sdd-state"), 0o755)
await fs.rm(tmpJs, { force: true })

const compile = process.argv.includes("--compile")
if (compile) {
  await $`bun build ${entry} --compile --outfile ${path.join(outDir, "sdd-state-darwin-arm64")} --target=bun-darwin-arm64`
  await $`bun build ${entry} --compile --outfile ${path.join(outDir, "sdd-state-darwin-x64")} --target=bun-darwin-x64`
  console.log("build-cli: wrote portable sdd-state + darwin arm64/x64 binaries")
} else {
  console.log("build-cli: wrote portable dist/bin/sdd-state (pass --compile for mac binaries)")
}
