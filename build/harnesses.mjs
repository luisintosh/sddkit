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
