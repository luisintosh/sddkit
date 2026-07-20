import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { SddState } from "./schema.ts"

export function featureDir(root: string, feature: string): string {
  return path.join(root, "docs", "feats", feature)
}

export function statePath(root: string, feature: string): string {
  return path.join(featureDir(root, feature), "state.yaml")
}

export function journalPath(root: string, feature: string): string {
  return path.join(featureDir(root, feature), "journal.ndjson")
}

export async function readState(root: string, feature: string): Promise<SddState | null> {
  try {
    const raw = await fs.readFile(statePath(root, feature), "utf8")
    return (parseYaml(raw) ?? {}) as SddState
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

export async function writeStateAtomic(root: string, feature: string, state: SddState): Promise<void> {
  const dir = featureDir(root, feature)
  await fs.mkdir(dir, { recursive: true })
  const target = statePath(root, feature)
  const tmp = path.join(dir, `.state.yaml.tmp-${process.pid}-${Date.now()}`)
  await fs.writeFile(tmp, stringifyYaml(state), "utf8")
  await fs.rename(tmp, target)
}

export async function appendJournal(root: string, feature: string, entry: Record<string, unknown>): Promise<void> {
  const dir = featureDir(root, feature)
  await fs.mkdir(dir, { recursive: true })
  await fs.appendFile(journalPath(root, feature), JSON.stringify(entry) + "\n", "utf8")
}

export async function resolveActiveFeature(root: string): Promise<string | null> {
  let entries: string[]
  try {
    entries = await fs.readdir(path.join(root, "docs", "feats"))
  } catch {
    return null
  }
  let best: { feature: string; updated: string } | null = null
  for (const entry of entries) {
    const state = await readState(root, entry)
    if (!state || state.stage === "complete") continue
    if (!best || state.updated > best.updated) best = { feature: entry, updated: state.updated }
  }
  return best?.feature ?? null
}
