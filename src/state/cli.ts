#!/usr/bin/env node
import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import catalog from "../catalog.yaml"
import { runInit, runPatch } from "./checkpoint.ts"
import { runDecide } from "./decisions.ts"
import { readState } from "./io.ts"
import { orcaRoutesByAgent } from "./orca.ts"
import { type ProbeDeps, probeOrchestrator } from "./probe.ts"
import { validateState } from "./schema.ts"

function usage(): never {
  console.error(`Usage:
  sddkit-state init <feature>
  sddkit-state patch <feature> --yaml '<yaml>'
  sddkit-state patch <feature> --file <path>
  sddkit-state patch <feature>   # YAML patch on stdin
  sddkit-state show <feature>
  sddkit-state validate <feature>
  sddkit-state decide <feature> --event qa-route|skip-design-critique|batch-journeys --yaml '...'
  sddkit-state probe orchestrator`)
  process.exit(2)
}

function rootDir(): string {
  return process.env.SDD_ROOT || process.cwd()
}

async function readPatch(args: string[]): Promise<Record<string, unknown>> {
  const yamlIdx = args.indexOf("--yaml")
  if (yamlIdx !== -1) {
    const raw = args[yamlIdx + 1]
    if (!raw) throw new Error("sddkit-state: --yaml requires a value")
    const parsed = parseYaml(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("sddkit-state: patch must be a YAML mapping")
    }
    return parsed as Record<string, unknown>
  }
  const fileIdx = args.indexOf("--file")
  if (fileIdx !== -1) {
    const filePath = args[fileIdx + 1]
    if (!filePath) throw new Error("sddkit-state: --file requires a path")
    const raw = await fs.readFile(filePath, "utf8")
    const parsed = parseYaml(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("sddkit-state: patch must be a YAML mapping")
    }
    return parsed as Record<string, unknown>
  }
  if (process.stdin.isTTY) {
    throw new Error("sddkit-state: patch requires --yaml, --file, or YAML on stdin")
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString("utf8")
  const parsed = parseYaml(raw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("sddkit-state: patch must be a YAML mapping")
  }
  return parsed as Record<string, unknown>
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function nodeProbeDeps(root: string): ProbeDeps {
  return {
    env: process.env,
    platform: process.platform,
    root,
    home: os.homedir(),
    exec: (cmd, args) =>
      new Promise((resolve) => {
        execFile(cmd, args, { timeout: 15_000 }, (err, stdout) => {
          const code = (err as { code?: unknown } | null)?.code
          if (code === "ENOENT") resolve({ code: null, stdout: "" })
          else resolve({ code: typeof code === "number" ? code : err ? 1 : 0, stdout: String(stdout) })
        })
      }),
    which: async (bin) => {
      for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
        if (dir && (await exists(path.join(dir, bin)))) return true
      }
      return false
    },
    exists,
  }
}

async function main(): Promise<void> {
  const [, , cmd, feature, ...rest] = process.argv
  if (!cmd || !feature) usage()
  const root = rootDir()

  try {
    switch (cmd) {
      case "init": {
        console.log(await runInit(root, feature))
        break
      }
      case "patch": {
        const patch = await readPatch(rest)
        console.log(await runPatch(root, feature, patch))
        break
      }
      case "show": {
        const state = await readState(root, feature)
        if (!state) {
          console.error(`sddkit-state: docs/feats/${feature}/state.yaml does not exist`)
          process.exit(1)
        }
        const normalized = validateState(state)
        process.stdout.write(stringifyYaml(normalized.success ? normalized.data : state))
        break
      }
      case "validate": {
        const state = await readState(root, feature)
        if (!state) {
          console.error(`sddkit-state: docs/feats/${feature}/state.yaml does not exist`)
          process.exit(1)
        }
        const result = validateState(state)
        if (!result.success) {
          console.error(`invalid: ${result.error}`)
          process.exit(1)
        }
        console.log(`valid (stage=${result.data.stage}, slice_phase=${result.data.slice_phase})`)
        break
      }
      case "decide": {
        const eventIdx = rest.indexOf("--event")
        const event = eventIdx !== -1 ? rest[eventIdx + 1] : undefined
        if (!event) throw new Error("sddkit-state: decide requires --event")
        const input = await readPatch(rest)
        process.stdout.write(runDecide(event, input))
        break
      }
      case "probe": {
        if (feature !== "orchestrator") usage()
        const result = await probeOrchestrator(nodeProbeDeps(root), orcaRoutesByAgent(catalog))
        process.stdout.write(stringifyYaml(result))
        break
      }
      default:
        usage()
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

await main()
