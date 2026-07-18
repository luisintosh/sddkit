#!/usr/bin/env node
// Bundle a harness's JS entries into build/<harness>/ with esbuild.
// Each entry is bundled to a single self-contained ESM file so the consuming
// repo needs no `npm install` (except externals it declares, e.g. opencode's
// plugin runtime). Run after assemble.mjs. Usage: node build/bundle.mjs <harness>
import { mkdir } from "node:fs/promises"
import path from "node:path"
import * as esbuild from "esbuild"
import { repoRoot, buildRoot, requireHarness, harnessNames } from "./harnesses.mjs"

async function bundle(harness) {
  const spec = requireHarness(harness)
  const out = path.join(buildRoot, harness)

  // Each entry is an independent esbuild invocation (own entry point, own
  // output file) — run them concurrently.
  await Promise.all(
    spec.bundle.map(async ({ entry, to, external }) => {
      const outfile = path.join(out, to)
      await mkdir(path.dirname(outfile), { recursive: true })
      await esbuild.build({
        entryPoints: [path.join(repoRoot, entry)],
        outfile,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node18",
        external: external ?? [],
        // Some bundled deps (yaml) are CJS and dynamically `require()` Node
        // builtins. In ESM output esbuild's `__require` throws unless a real
        // `require` is in scope — provide one so those calls resolve.
        banner: { js: "import{createRequire as __sddCreateRequire}from'node:module';const require=__sddCreateRequire(import.meta.url);" },
        logLevel: "warning",
      })
      console.log(`bundle: ${entry} -> build/${harness}/${to}${external?.length ? ` (external: ${external.join(", ")})` : ""}`)
    }),
  )
}

const harness = process.argv[2]
if (!harness) {
  console.error(`usage: node build/bundle.mjs <${harnessNames().join("|")}>`)
  process.exit(1)
}
await bundle(harness)
