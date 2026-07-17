import * as path from "node:path"

// ---------------------------------------------------------------------------
// Guardrails — pure predicates over a tool call's file path or command.
// Harness-agnostic: an adapter's hook layer (OpenCode plugin
// `tool.execute.before`, Cursor `.cursor/hooks.json` scripts) calls these and
// decides how to deny. None of them need to know which agent is calling, so
// they enforce identically on every harness.
// ---------------------------------------------------------------------------

const STATE_YAML_RE = /^docs\/feats\/[^/]+\/state\.yaml$/
const JOURNAL_RE = /^docs\/feats\/[^/]+\/journal\.ndjson$/
const FEATURE_SCOPE_RE = /^docs\/feats\/([^/]+)\//
const GIT_PUSH_RE = /\bgit\s+push\b/

function normalizeRel(filePath: string, root: string): string {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
  return path.relative(root, abs).split(path.sep).join("/")
}

export function isProtectedStateFile(filePath: string, root: string): boolean {
  const rel = normalizeRel(filePath, root)
  return STATE_YAML_RE.test(rel) || JOURNAL_RE.test(rel)
}

// True when the write targets the harness's own install directory
// (`.opencode/` or `.cursor/`) — agents may not modify the harness itself.
// `harnessDir` is the leading path segment, e.g. ".opencode" or ".cursor".
export function isSelfWrite(filePath: string, root: string, harnessDir: string): boolean {
  const rel = normalizeRel(filePath, root)
  const dir = harnessDir.replace(/\/+$/, "")
  return rel === dir || rel.startsWith(`${dir}/`)
}

export function isCrossFeatureWrite(filePath: string, root: string, activeFeature: string | null): boolean {
  if (!activeFeature) return false
  const rel = normalizeRel(filePath, root)
  const match = rel.match(FEATURE_SCOPE_RE)
  if (!match) return false
  return match[1] !== activeFeature
}

// A ref token like "main", "HEAD:main", "refs/heads/main", or ":main" (branch
// delete) all resolve to "main" as the candidate branch name.
function refCandidates(token: string): string[] {
  const afterColon = token.includes(":") ? token.split(":").pop()! : token
  const segments = afterColon.split("/")
  return [afterColon, segments[segments.length - 1]]
}

// Catches remotes/refspecs that a simple "git push* main*" glob might miss
// (e.g. `git push origin HEAD:main`) while not flagging unrelated branches
// like "main-backup".
export function isPushToMainCommand(command: string): boolean {
  if (!GIT_PUSH_RE.test(command)) return false
  const tokens = command.split(/\s+/)
  return tokens.some((tok) => refCandidates(tok).some((ref) => ref === "main" || ref === "master"))
}

export function extractFilePath(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined
  const a = args as Record<string, unknown>
  const candidate = a.filePath ?? a.path ?? a.file_path
  return typeof candidate === "string" ? candidate : undefined
}

// The "deny" tier of OpenCode's opencode.jsonc permission.bash block, as glob
// patterns (`*` = any characters), matched against the full command string.
// OpenCode enforces these declaratively via that config; Cursor has no
// declarative bash-permission mechanism, so its hook calls this directly as
// the sole enforcer. git push-to-main is deliberately excluded — that's
// isPushToMainCommand's job, which parses ref tokens instead of glob-matching.
const DANGEROUS_BASH_GLOBS = [
  "rm -rf *",
  "rm -fr *",
  "git reset --hard*",
  "git push --force*",
  "git push -f *",
  "* | sh",
  "* | bash",
  "curl * | *",
  "wget * | *",
]

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp(`^${escaped}$`)
}

const DANGEROUS_BASH_PATTERNS = DANGEROUS_BASH_GLOBS.map(globToRegExp)

export function isDangerousBashCommand(command: string): boolean {
  const trimmed = command.trim()
  return DANGEROUS_BASH_PATTERNS.some((re) => re.test(trimmed))
}
