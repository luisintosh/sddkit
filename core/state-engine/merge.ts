// ---------------------------------------------------------------------------
// Deep merge — patch semantics: nested objects merge key-by-key, arrays and
// scalars from the patch replace the target wholesale.
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function deepMerge<T = unknown>(target: unknown, patch: unknown): T {
  if (!isPlainObject(patch)) return patch as T
  const result: Record<string, unknown> = { ...(isPlainObject(target) ? target : {}) }
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key]
    const targetVal = result[key]
    result[key] = isPlainObject(patchVal) && isPlainObject(targetVal) ? deepMerge(targetVal, patchVal) : patchVal
  }
  return result as T
}
