// opencode-harness-toolkit — usage logger (optional, opt-in).
//
// Appends per-message model + token usage to `.opencode/usage.log` (git-ignored) so the 5-model
// tiering can be tuned with real data. Off by default; enable with `OC_USAGE_LOG=1`.
//
// Best-effort: opencode's event payload shape varies by version, so this reads defensively and simply
// skips anything it can't find. It never throws into the agent loop.

import { appendFileSync } from "node:fs";

export const UsageLogger = async ({ directory, worktree }: any) => {
  if (process.env.OC_USAGE_LOG !== "1") return {}; // opt-in: zero overhead unless enabled
  const root: string = worktree || directory || process.cwd();
  const logFile = `${root}/.opencode/usage.log`;

  const pick = (o: any, keys: string[]) => {
    for (const k of keys) if (o && o[k] != null) return o[k];
    return undefined;
  };

  return {
    event: async ({ event }: any) => {
      try {
        if (!event || typeof event !== "object") return;
        const type: string = event.type || "";
        if (!/message/.test(type)) return; // only message-level events carry usage
        const p = event.properties || event.data || event;
        const info = p.info || p.message || p;
        const model = pick(info, ["modelID", "model", "model_id"]);
        const tokens = pick(info, ["tokens", "usage"]);
        const cost = pick(info, ["cost"]);
        if (model == null && tokens == null) return;
        appendFileSync(
          logFile,
          JSON.stringify({ ts: new Date().toISOString(), type, model, tokens, cost }) + "\n",
        );
      } catch {
        /* never break the agent over logging */
      }
    },
  };
};
