// opencode-harness-toolkit — verify-gate plugin.
//
// Responsibilities (the TDD/reviewer write-restrictions are enforced declaratively via each agent's
// `permission` block in agents/*.md — this plugin covers what permissions can't express cleanly):
//
//   1. Sibling-feature guard: while working a feature (branch `feat/<slug>`), refuse edits to
//      another feature's `docs/feats/<other>/` — protects parallel worktrees and the docs-sync stage.
//   2. Optional after-edit lint backpressure (opt-in via OC_AFTER_EDIT_LINT=1): runs the project's
//      lint after a source edit and surfaces failures, so the agent corrects within the turn.
//
// Defensive throughout: any internal error is swallowed except our own intentional denials.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const DENY_PREFIX = "opencode-harness-toolkit:";

function currentFeature(cwd: string): string | null {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
    const m = branch.match(/^feat\/(.+)$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function editedPath(tool: string, args: any): string | null {
  if (!args) return null;
  if (tool === "edit" || tool === "write" || tool === "patch") {
    return args.filePath || args.path || args.file || null;
  }
  return null;
}

function lintCommand(cwd: string): string | null {
  try {
    const pj = JSON.parse(readFileSync(`${cwd}/package.json`, "utf8"));
    if (pj?.scripts?.lint) {
      const pm = existsSync(`${cwd}/pnpm-lock.yaml`) ? "pnpm"
        : existsSync(`${cwd}/yarn.lock`) ? "yarn"
        : existsSync(`${cwd}/bun.lockb`) || existsSync(`${cwd}/bun.lock`) ? "bun run"
        : "npm run";
      return `${pm} lint`;
    }
  } catch { /* no package.json / no lint */ }
  return null;
}

export const VerifyGate = async ({ directory, worktree }: any) => {
  const root: string = worktree || directory || process.cwd();

  return {
    "tool.execute.before": async (input: any, output: any) => {
      try {
        const path = editedPath(input?.tool, output?.args);
        if (!path) return;
        const feat = currentFeature(root);
        const m = String(path).match(/docs\/feats\/([^/]+)\//);
        if (feat && m && m[1] !== feat) {
          throw new Error(
            `${DENY_PREFIX} refusing to modify another feature's docs (docs/feats/${m[1]}/). ` +
            `Current feature is '${feat}'. Only the current feature + shared docs may change.`,
          );
        }
      } catch (e: any) {
        if (e instanceof Error && e.message.startsWith(DENY_PREFIX)) throw e; // intentional denial
        // otherwise ignore — never break the agent over a guard error
      }
    },

    "tool.execute.after": async (input: any, output: any) => {
      if (process.env.OC_AFTER_EDIT_LINT !== "1") return;
      try {
        const path = editedPath(input?.tool, output?.args);
        if (!path) return;
        if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(String(path))) return;
        const cmd = lintCommand(root);
        if (!cmd) return;
        try {
          execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
        } catch (err: any) {
          const out = (err?.stdout?.toString() || "") + (err?.stderr?.toString() || "");
          // surface to the model via the tool result metadata if available
          if (output && typeof output === "object") {
            output.metadata = output.metadata || {};
            output.metadata.lint = `lint failed after editing ${path}:\n${out.slice(-2000)}`;
          }
        }
      } catch { /* best-effort */ }
    },
  };
};
