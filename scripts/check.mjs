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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(msg) {
  errors.push(msg);
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
// 2. agents/*.md frontmatter schema
// ---------------------------------------------------------------------------

const MODE_VALUES = new Set(["primary", "subagent"]);
const agentsDir = path.join(root, "agents");
const agentFiles = (await readdir(agentsDir)).filter((f) => f.endsWith(".md")).sort();
const agentFrontmatter = new Map(); // name -> frontmatter object

for (const file of agentFiles) {
  const name = file.replace(/\.md$/, "");
  const raw = await readFile(path.join(agentsDir, file), "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`agents/${file}: missing frontmatter block`);
    continue;
  }

  let fm;
  try {
    fm = parseYaml(match[1]);
  } catch (err) {
    fail(`agents/${file}: frontmatter is not valid YAML — ${err.message}`);
    continue;
  }

  agentFrontmatter.set(name, fm);

  if (typeof fm.description !== "string" || fm.description.trim() === "") {
    fail(`agents/${file}: description must be a non-empty string`);
  }
  if (!MODE_VALUES.has(fm.mode)) {
    fail(`agents/${file}: mode must be "primary" or "subagent", got ${JSON.stringify(fm.mode)}`);
  }
  if (typeof fm.model !== "string" || !fm.model.startsWith("opencode-go/")) {
    fail(`agents/${file}: model must start with "opencode-go/", got ${JSON.stringify(fm.model)}`);
  }
  if (fm.temperature !== undefined) {
    if (typeof fm.temperature !== "number" || fm.temperature < 0 || fm.temperature > 1) {
      fail(`agents/${file}: temperature must be a number in [0, 1], got ${JSON.stringify(fm.temperature)}`);
    }
  }
  if (fm.steps !== undefined) {
    if (!Number.isInteger(fm.steps) || fm.steps <= 0) {
      fail(`agents/${file}: steps must be a positive integer, got ${JSON.stringify(fm.steps)}`);
    }
  }
  if (fm.hidden === true && fm.mode !== "subagent") {
    fail(`agents/${file}: hidden agents must be mode: subagent`);
  }
}

if (agentFrontmatter.get("sdd")?.mode !== "primary") {
  fail('agents/sdd.md: the conductor must be mode: primary');
}

// ---------------------------------------------------------------------------
// 3. README model table vs frontmatter
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
  for (const [name, fm] of agentFrontmatter) {
    const readmeModel = readmeModels.get(name);
    if (!readmeModel) {
      fail(`README.md: model table is missing a row for "${name}"`);
      continue;
    }
    if (readmeModel !== fm.model) {
      fail(`README.md: model table says ${name} -> ${readmeModel}, but agents/${name}.md says ${fm.model}`);
    }
  }
  for (const name of readmeModels.keys()) {
    if (!agentFrontmatter.has(name)) {
      fail(`README.md: model table lists "${name}", which has no agents/${name}.md`);
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
for (const harness of ["opencode", "cursor"]) {
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
console.log(`check.mjs: ok (${agentFiles.length} agents, ${readmeModels.size} README rows, ${manifestNote})`);
