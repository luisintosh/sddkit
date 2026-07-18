// Assemble core/agents/<id>.md (body only) + core/roles.yml (harness-agnostic
// identity) + adapters/<harness>/agents.yml (harness-specific fields) into a
// single frontmatter+body markdown file per agent, ready to install.
//
// Token substitution is deliberately minimal (see README/CONTRIBUTING): only
// the {{#compact}}...{{/compact}} guard exists today, because it's the only
// span of agent-body text that's genuinely harness-conditional (OpenCode has
// a programmatic compact tool; other harnesses don't). Prefer rewording the
// shared body to be harness-neutral over adding new guards/tokens.
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const COMPACT_GUARD_RE = /\{\{#compact\}\}([\s\S]*?)\{\{\/compact\}\}/g;

// harnessSupportsCompact: true keeps the guarded content (markers stripped,
// text kept); false drops the guarded span entirely, then collapses any
// resulting run of 3+ newlines down to a single blank line.
export function applyCompactGuard(body, harnessSupportsCompact) {
  if (harnessSupportsCompact) {
    return body.replace(COMPACT_GUARD_RE, "$1");
  }
  return body.replace(COMPACT_GUARD_RE, "").replace(/\n{3,}/g, "\n\n");
}

// `description` is the one field every harness's frontmatter schema actually
// shares (see core/roles.yml) — everything else (mode/hidden for OpenCode;
// name/readonly for Cursor; ...) is harness-specific and comes entirely from
// the adapter's own agents.yml, in whatever order that file declares it.
function buildFrontmatter(role, adapterFields) {
  return { description: role.description, ...adapterFields };
}

export async function loadRoles(repoRoot) {
  const raw = await readFile(path.join(repoRoot, "core", "roles.yml"), "utf8");
  return parseYaml(raw);
}

export async function loadAdapterAgents(repoRoot, harness) {
  const raw = await readFile(path.join(repoRoot, "adapters", harness, "agents.yml"), "utf8");
  return parseYaml(raw);
}

// Assemble every agent for one harness into outDir/agents/<id>.md.
// `harnessSupportsCompact` gates the {{#compact}} guard (see above).
export async function assembleAgents(repoRoot, harness, outDir, { supportsCompact }) {
  const roles = await loadRoles(repoRoot);
  const adapterAgents = await loadAdapterAgents(repoRoot, harness);

  const missingInAdapter = Object.keys(roles).filter((id) => !(id in adapterAgents));
  if (missingInAdapter.length) {
    throw new Error(`adapters/${harness}/agents.yml is missing entries for: ${missingInAdapter.join(", ")}`);
  }

  const agentsOutDir = path.join(outDir, "agents");
  await mkdir(agentsOutDir, { recursive: true });

  const bodiesDir = path.join(repoRoot, "core", "agents");
  const bodyFiles = (await readdir(bodiesDir)).filter((f) => f.endsWith(".md")).sort();

  // Each agent's read+assemble+write is independent — run them concurrently.
  await Promise.all(
    bodyFiles.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      if (!(id in roles)) throw new Error(`core/agents/${file} has no matching entry in core/roles.yml`);

      const rawBody = await readFile(path.join(bodiesDir, file), "utf8");
      const body = applyCompactGuard(rawBody, supportsCompact);
      const frontmatter = buildFrontmatter(roles[id], adapterAgents[id]);
      const assembled = `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${body}`;

      await writeFile(path.join(agentsOutDir, file), assembled, "utf8");
    }),
  );

  return bodyFiles.length;
}
