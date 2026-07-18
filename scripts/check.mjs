#!/usr/bin/env node
// Toolkit hygiene checks, run in CI (Tier 0) on every push:
//   1. adapters/opencode/opencode.jsonc parses and has the expected shape.
//   2. Every agents/*.md frontmatter matches the OpenCode agent schema.
//   3. README's model table doesn't drift from agent frontmatter.
//   4. If a build tree exists, its manifest.txt is internally consistent.
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { harnessNames } from "../build/harnesses.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(msg) {
  errors.push(msg);
}

// Bidirectional existence check shared by every adapter's agents.yml: every
// role must have an adapter entry, and every adapter entry must map to a
// real role. Per-field schema validation (model format, mode, etc.) differs
// per harness and stays in each caller's own loop.
function checkRosterCorrespondence(agentsMap, label, roles) {
  for (const id of Object.keys(roles)) {
    if (!(id in agentsMap)) fail(`${label}: missing entry for "${id}"`);
  }
  for (const id of Object.keys(agentsMap)) {
    if (!(id in roles)) fail(`${label}: lists "${id}", which has no core/roles.yml entry`);
  }
}

// ---------------------------------------------------------------------------
// JSONC (comments + trailing commas) -> JSON
// ---------------------------------------------------------------------------

function stripJsonComments(input) {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (c === "\n") {
        inLineComment = false;
        out += c;
      }
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (escapeNext) escapeNext = false;
      else if (c === "\\") escapeNext = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

function stripTrailingCommas(input) {
  return input.replace(/,(\s*[}\]])/g, "$1");
}

function parseJsonc(raw) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(raw)));
}

// ---------------------------------------------------------------------------
// 1. opencode.jsonc
// ---------------------------------------------------------------------------

const opencodeJsoncPath = path.join(root, "adapters", "opencode", "opencode.jsonc");
let config;
try {
  config = parseJsonc(await readFile(opencodeJsoncPath, "utf8"));
} catch (err) {
  fail(`adapters/opencode/opencode.jsonc: failed to parse — ${err.message}`);
}

const OJ = "adapters/opencode/opencode.jsonc";
if (config) {
  if (config.default_agent !== "sdd") fail(`${OJ}: default_agent should be "sdd", got ${JSON.stringify(config.default_agent)}`);
  if (!config.permission || typeof config.permission !== "object") fail(`${OJ}: missing permission block`);
  if (!config.command?.["setup-docs"]) fail(`${OJ}: missing command.setup-docs`);
  if (!config.mcp?.["sdd-checkpoint"]) fail(`${OJ}: missing mcp.sdd-checkpoint (the core checkpoint server)`);
}

// ---------------------------------------------------------------------------
// 2. core/roles.yml (harness-agnostic roster) + adapters/opencode/agents.yml
//    (OpenCode-specific frontmatter fields), and core/agents/*.md bodies
// ---------------------------------------------------------------------------

const MODE_VALUES = new Set(["primary", "subagent"]);

const rolesPath = path.join(root, "core", "roles.yml");
let roles = {};
try {
  roles = parseYaml(await readFile(rolesPath, "utf8")) ?? {};
} catch (err) {
  fail(`core/roles.yml: failed to parse — ${err.message}`);
}

const bodiesDir = path.join(root, "core", "agents");
const bodyFiles = (await readdir(bodiesDir)).filter((f) => f.endsWith(".md")).sort();
for (const file of bodyFiles) {
  const id = file.replace(/\.md$/, "");
  if (!(id in roles)) fail(`core/agents/${file}: no matching entry in core/roles.yml`);
}
for (const id of Object.keys(roles)) {
  if (!bodyFiles.includes(`${id}.md`)) fail(`core/roles.yml: "${id}" has no core/agents/${id}.md body`);
}

for (const [id, role] of Object.entries(roles)) {
  if (typeof role.description !== "string" || role.description.trim() === "") {
    fail(`core/roles.yml: "${id}".description must be a non-empty string`);
  }
}

const opencodeAgentsPath = path.join(root, "adapters", "opencode", "agents.yml");
let opencodeAgents = {};
try {
  opencodeAgents = parseYaml(await readFile(opencodeAgentsPath, "utf8")) ?? {};
} catch (err) {
  fail(`adapters/opencode/agents.yml: failed to parse — ${err.message}`);
}

checkRosterCorrespondence(opencodeAgents, "adapters/opencode/agents.yml", roles);

for (const [id, oc] of Object.entries(opencodeAgents)) {
  if (!MODE_VALUES.has(oc.mode)) {
    fail(`adapters/opencode/agents.yml: "${id}".mode must be "primary" or "subagent", got ${JSON.stringify(oc.mode)}`);
  }
  if (oc.hidden === true && oc.mode !== "subagent") {
    fail(`adapters/opencode/agents.yml: "${id}" is hidden but not mode: subagent`);
  }
  if (typeof oc.model !== "string" || !oc.model.startsWith("opencode-go/")) {
    fail(`adapters/opencode/agents.yml: "${id}".model must start with "opencode-go/", got ${JSON.stringify(oc.model)}`);
  }
  if (oc.temperature !== undefined) {
    if (typeof oc.temperature !== "number" || oc.temperature < 0 || oc.temperature > 1) {
      fail(`adapters/opencode/agents.yml: "${id}".temperature must be a number in [0, 1], got ${JSON.stringify(oc.temperature)}`);
    }
  }
  if (oc.steps !== undefined) {
    if (!Number.isInteger(oc.steps) || oc.steps <= 0) {
      fail(`adapters/opencode/agents.yml: "${id}".steps must be a positive integer, got ${JSON.stringify(oc.steps)}`);
    }
  }
}
if (opencodeAgents.sdd?.mode !== "primary") {
  fail('adapters/opencode/agents.yml: "sdd" (the conductor) must be mode: primary');
}

const cursorAgentsPath = path.join(root, "adapters", "cursor", "agents.yml");
let cursorAgents = {};
try {
  cursorAgents = parseYaml(await readFile(cursorAgentsPath, "utf8")) ?? {};
} catch (err) {
  fail(`adapters/cursor/agents.yml: failed to parse — ${err.message}`);
}

checkRosterCorrespondence(cursorAgents, "adapters/cursor/agents.yml", roles);

for (const [id, cu] of Object.entries(cursorAgents)) {
  if (typeof cu.model !== "string" || cu.model.trim() === "") {
    fail(`adapters/cursor/agents.yml: "${id}".model must be a non-empty string, got ${JSON.stringify(cu.model)}`);
  }
  if (cu.readonly !== undefined && typeof cu.readonly !== "boolean") {
    fail(`adapters/cursor/agents.yml: "${id}".readonly must be a boolean if present, got ${JSON.stringify(cu.readonly)}`);
  }
  // No mode/hidden checks here: Cursor has no confirmed equivalent (see
  // core/roles.yml's header comment) — every .cursor/agents/*.md file is
  // implicitly a subagent.
}

// ---------------------------------------------------------------------------
// 3. README model table vs adapters/opencode/agents.yml
// ---------------------------------------------------------------------------

const readmePath = path.join(root, "README.md");
const readme = await readFile(readmePath, "utf8");

// Rows look like: | `sdd` | `opencode-go/kimi-k2.7-code` | ... |
const rowRe = /^\|\s*`([a-z0-9-]+)`\s*\|\s*`([a-z0-9./-]+)`\s*\|/gm;
const readmeModels = new Map();
for (const m of readme.matchAll(rowRe)) {
  readmeModels.set(m[1], m[2]);
}

if (readmeModels.size === 0) {
  fail("README.md: no model table rows found (expected `| `<agent>` | `<model>` | ...` rows)");
} else {
  for (const [id, oc] of Object.entries(opencodeAgents)) {
    const readmeModel = readmeModels.get(id);
    if (!readmeModel) {
      fail(`README.md: model table is missing a row for "${id}"`);
      continue;
    }
    if (readmeModel !== oc.model) {
      fail(`README.md: model table says ${id} -> ${readmeModel}, but adapters/opencode/agents.yml says ${oc.model}`);
    }
  }
  for (const id of readmeModels.keys()) {
    if (!(id in opencodeAgents)) {
      fail(`README.md: model table lists "${id}", which has no adapters/opencode/agents.yml entry`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. built tree manifest integrity (when a build exists)
//
// The installable trees are generated (build/<harness>/, gitignored) and their
// manifest.txt is regenerated from the tree on every build, so there is no
// committed manifest to drift. When a build is present we verify the manifest
// is internally consistent: every tree file is listed with a matching hash and
// vice-versa. On a fresh checkout with no build, this check is skipped.
// ---------------------------------------------------------------------------

async function sha256(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function walkFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(abs, base)));
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

let builtHarnesses = 0;
for (const harness of harnessNames()) {
  const treeDir = path.join(root, "build", harness);
  let exists = false;
  try {
    exists = (await stat(treeDir)).isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) continue;
  builtHarnesses++;

  const label = `build/${harness}`;
  let manifestRaw;
  try {
    manifestRaw = await readFile(path.join(treeDir, "manifest.txt"), "utf8");
  } catch {
    fail(`${label}/manifest.txt: missing — run the build (bun run build:${harness})`);
    continue;
  }

  const listed = new Map();
  let malformed = false;
  for (const line of manifestRaw.trim().split("\n").filter(Boolean)) {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
    if (!m) {
      malformed = true;
      break;
    }
    listed.set(m[2], m[1]);
  }
  if (malformed) {
    fail(`${label}/manifest.txt: contains a malformed line (expected \`<sha256>  <path>\`)`);
    continue;
  }

  const onDisk = (await walkFiles(treeDir)).filter((rel) => rel !== "manifest.txt" && rel !== ".harness-manifest");
  for (const rel of onDisk) {
    if (!listed.has(rel)) fail(`${label}/manifest.txt: missing entry for ${rel} — rebuild`);
    else if (listed.get(rel) !== (await sha256(path.join(treeDir, rel)))) fail(`${label}/manifest.txt: stale hash for ${rel} — rebuild`);
  }
  const onDiskSet = new Set(onDisk);
  for (const rel of listed.keys()) {
    if (!onDiskSet.has(rel)) fail(`${label}/manifest.txt: lists ${rel}, which is not in the tree — rebuild`);
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`check.mjs: ${errors.length} problem(s) found\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const manifestNote = builtHarnesses ? `${builtHarnesses} built tree(s) verified` : "no build tree (skipped manifest check)";
console.log(`check.mjs: ok (${bodyFiles.length} agents, ${readmeModels.size} README rows, ${manifestNote})`);
