// Single source of truth for what each harness's installable tree contains.
// `assemble.mjs` copies the static files; `bundle.mjs` produces the JS entries.
import path from "node:path"
import { fileURLToPath } from "node:url"

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const buildRoot = path.join(repoRoot, "build")

export const HARNESSES = {
  opencode: {
    // Static files copied verbatim into build/opencode/<dest>.
    copy: [
      { from: "adapters/opencode/opencode.jsonc", to: "opencode.jsonc" },
      { from: "adapters/opencode/package.json", to: "package.json" },
    ],
    // esbuild bundles: entry -> dest, with optional externals.
    bundle: [
      {
        entry: "adapters/opencode/plugin/sdd-guard.ts",
        to: "plugins/sdd-guard.js",
        external: ["@opencode-ai/plugin"],
      },
      { entry: "core/mcp/bin.ts", to: "mcp/server.js", external: [] },
    ],
    // Agents are ASSEMBLED (core/agents/*.md body + core/roles.yml +
    // adapters/opencode/agents.yml), not copied — see build/agents.mjs.
    // OpenCode has a programmatic compact tool, so the {{#compact}} guard is
    // kept (markers stripped, content preserved).
    agents: { supportsCompact: true },
  },
  cursor: {
    copy: [
      { from: "adapters/cursor/mcp.json", to: "mcp.json" },
      { from: "adapters/cursor/hooks.json", to: "hooks.json" },
      { from: "adapters/cursor/package.json", to: "package.json" },
      { from: "adapters/cursor/commands", to: "commands" },
    ],
    bundle: [
      { entry: "adapters/cursor/hooks/pre-tool-use.ts", to: "hooks/pre-tool-use.js", external: [] },
      { entry: "adapters/cursor/hooks/before-shell-execution.ts", to: "hooks/before-shell-execution.js", external: [] },
      { entry: "core/mcp/bin.ts", to: "mcp/server.js", external: [] },
    ],
    // Cursor has no programmatic compact tool (no equivalent to OpenCode's
    // session.summarize) — drop the {{#compact}}-guarded sentences entirely.
    agents: { supportsCompact: false },
  },
}

export function harnessNames() {
  return Object.keys(HARNESSES)
}

export function requireHarness(name) {
  const h = HARNESSES[name]
  if (!h) {
    throw new Error(`unknown harness "${name}" — known: ${harnessNames().join(", ")}`)
  }
  return h
}
