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
import { runNext } from "./next.ts"
import { orcaRoutesByAgent } from "./orca.ts"
import { type ProbeDeps, probeOrchestrator } from "./probe.ts"
import { runReviewMerge } from "./review.ts"
import { validateState } from "./schema.ts"
import { EVENTS, runSnapshot, runTransition } from "./transitions.ts"

/** Bumped whenever the conductor prompt starts relying on a new command; the prompt checks it at step 1. */
export const PROTOCOL = 2

function usage(): never {
  console.error(`Usage:
  sddkit-state init <feature>
  sddkit-state patch <feature> --yaml '<yaml>'
  sddkit-state patch <feature> --file <path>
  sddkit-state patch <feature>   # YAML patch on stdin
  sddkit-state patch <feature> [--yaml '<yaml>'] [--drop '<yaml>'] [--append '<yaml>'] [--inc '<yaml>']
  sddkit-state show <feature>
  sddkit-state validate <feature>
  sddkit-state next [<feature>]
  sddkit-state snapshot <feature>
  sddkit-state transition <feature> --event ${EVENTS.join("|")} [--yaml '...']
  sddkit-state review-merge <feature> --file <replies.yaml> | --yaml '...'
  sddkit-state decide <feature> --event qa-route|skip-design-critique|batch-journeys --yaml '...'
  sddkit-state probe orchestrator
  sddkit-state version`)
  process.exit(2)
}

function rootDir(): string {
  return process.env.SDD_ROOT || process.cwd()
}

function asMapping(raw: string, what: string): Record<string, unknown> {
  const parsed = parseYaml(raw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`sddkit-state: ${what} must be a YAML mapping`)
  }
  return parsed as Record<string, unknown>
}

/** The YAML mapping after `flag`, or undefined when the flag is absent. */
function flagMapping(args: string[], flag: string): Record<string, unknown> | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  const raw = args[idx + 1]
  if (!raw) throw new Error(`sddkit-state: ${flag} requires a value`)
  return asMapping(raw, flag)
}

async function readPatch(args: string[], optional = false): Promise<Record<string, unknown>> {
  const fromFlag = flagMapping(args, "--yaml")
  if (fromFlag) return fromFlag
  const fileIdx = args.indexOf("--file")
  if (fileIdx !== -1) {
    const filePath = args[fileIdx + 1]
    if (!filePath) throw new Error("sddkit-state: --file requires a path")
    return asMapping(await fs.readFile(filePath, "utf8"), "patch")
  }
  if (optional) return {}
  if (process.stdin.isTTY) {
    throw new Error("sddkit-state: patch requires --yaml, --file, or YAML on stdin")
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return asMapping(Buffer.concat(chunks).toString("utf8"), "patch")
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
  if (cmd === "version") {
    console.log(`protocol: ${PROTOCOL}`)
    return
  }
  // `next` alone resumes the feature with the newest update.
  if (!cmd || (!feature && cmd !== "next")) usage()
  const root = rootDir()

  try {
    switch (cmd) {
      case "init": {
        console.log(await runInit(root, feature!))
        break
      }
      case "patch": {
        const ops = {
          drop: flagMapping(rest, "--drop"),
          append: flagMapping(rest, "--append"),
          inc: flagMapping(rest, "--inc"),
        }
        const patch = await readPatch(rest, Boolean(ops.drop || ops.append || ops.inc))
        console.log(await runPatch(root, feature!, patch, ops))
        break
      }
      case "next": {
        process.stdout.write(stringifyYaml(await runNext(root, feature)))
        break
      }
      case "snapshot": {
        console.log(await runSnapshot(root, feature!))
        break
      }
      case "transition": {
        const eventIdx = rest.indexOf("--event")
        const event = eventIdx !== -1 ? rest[eventIdx + 1] : undefined
        if (!event) throw new Error("sddkit-state: transition requires --event")
        console.log(await runTransition(root, feature!, event, await readPatch(rest, true)))
        break
      }
      case "review-merge": {
        const { message, result } = await runReviewMerge(root, feature!, await readPatch(rest))
        console.error(message)
        process.stdout.write(stringifyYaml(result))
        break
      }
      case "show": {
        const state = await readState(root, feature!)
        if (!state) {
          console.error(`sddkit-state: docs/feats/${feature}/state.yaml does not exist`)
          process.exit(1)
        }
        const normalized = validateState(state)
        process.stdout.write(stringifyYaml(normalized.success ? normalized.data : state))
        break
      }
      case "validate": {
        const state = await readState(root, feature!)
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
