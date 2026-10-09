/** List and counter operations applied on top of a merged state, so callers never rewrite a whole array by hand. */

export type PatchOps = {
  append?: Record<string, unknown>
  drop?: Record<string, unknown>
  inc?: Record<string, unknown>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Every non-mapping value in a nested mapping, with its dotted path. */
function leaves(mapping: Record<string, unknown>, prefix: string[] = []): [string[], unknown][] {
  const out: [string[], unknown][] = []
  for (const [key, value] of Object.entries(mapping)) {
    const at = [...prefix, key]
    if (isPlainObject(value)) out.push(...leaves(value, at))
    else out.push([at, value])
  }
  return out
}

function getAt(state: Record<string, unknown>, at: string[]): unknown {
  let node: unknown = state
  for (const key of at) node = isPlainObject(node) ? node[key] : undefined
  return node
}

function setAt(state: Record<string, unknown>, at: string[], value: unknown): void {
  let node = state
  for (const key of at.slice(0, -1)) {
    if (!isPlainObject(node[key])) node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  node[at[at.length - 1]!] = value
}

/** Key-order-independent identity, so a re-appended record is recognized whatever order its keys arrive in. */
function identity(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(identity).join(",")}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${identity(value[k])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function listAt(state: Record<string, unknown>, at: string[], op: string): unknown[] {
  const current = getAt(state, at)
  if (!Array.isArray(current)) throw new Error(`sddkit-state: --${op} ${at.join(".")} is not a list in state.yaml`)
  return current
}

function asList(value: unknown, at: string[], op: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`sddkit-state: --${op} ${at.join(".")} must be a YAML list`)
  return value
}

/**
 * Applies drop → append → inc to a copy of `state`. Drop removes strings by value and records by `id`. Append skips
 * strings already present and records identical to one already present — never by `id` alone, because review ids
 * restart after a design delta. Throws on a path that is not a list (drop/append) or an integer (inc).
 */
export function applyOps<T extends Record<string, unknown>>(state: T, ops: PatchOps): T {
  const out = structuredClone(state) as Record<string, unknown>
  for (const [at, value] of leaves(ops.drop ?? {})) {
    const remove = new Set(asList(value, at, "drop").map(String))
    const kept = listAt(out, at, "drop").filter((item) => {
      const key = isPlainObject(item) ? String(item.id) : String(item)
      return !remove.has(key)
    })
    setAt(out, at, kept)
  }
  for (const [at, value] of leaves(ops.append ?? {})) {
    const list = [...listAt(out, at, "append")]
    const seen = new Set(list.map(identity))
    for (const item of asList(value, at, "append")) {
      const key = identity(item)
      if (seen.has(key)) continue
      seen.add(key)
      list.push(item)
    }
    setAt(out, at, list)
  }
  for (const [at, value] of leaves(ops.inc ?? {})) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error(`sddkit-state: --inc ${at.join(".")} must be an integer`)
    }
    const current = getAt(out, at)
    if (typeof current !== "number" || !Number.isInteger(current)) {
      throw new Error(`sddkit-state: --inc ${at.join(".")} is not an integer in state.yaml`)
    }
    setAt(out, at, current + value)
  }
  return out as T
}

export function hasOps(ops: PatchOps): boolean {
  return Boolean(ops.append || ops.drop || ops.inc)
}
