#!/usr/bin/env node
// Assemble a harness's static install tree into build/<harness>/.
// Cleans the target first so removed files never linger. JS entries are added
// separately by bundle.mjs. Usage: node build/assemble.mjs <harness>
import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { repoRoot, buildRoot, requireHarness, harnessNames } from "./harnesses.mjs"

async function assemble(harness) {
  const spec = requireHarness(harness)
  const out = path.join(buildRoot, harness)
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })

  for (const { from, to } of spec.copy) {
    const src = path.join(repoRoot, from)
    const dest = path.join(out, to)
    await mkdir(path.dirname(dest), { recursive: true })
    await cp(src, dest, { recursive: true })
  }
  console.log(`assemble: wrote build/${harness}/ (${spec.copy.length} static entries)`)
}

const harness = process.argv[2]
if (!harness) {
  console.error(`usage: node build/assemble.mjs <${harnessNames().join("|")}>`)
  process.exit(1)
}
await assemble(harness)
