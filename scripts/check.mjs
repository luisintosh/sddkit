#!/usr/bin/env node
// Toolkit hygiene checks, run in CI (Tier 0) on every push:
//   1. opencode.jsonc parses and has the expected shape.
//   2. Every agents/*.md frontmatter matches the harness's agent schema.
//   3. README's model table doesn't drift from agent frontmatter.
//   4. manifest.txt is up to date with the files it should cover.
import { readFile, readdir } from "node:fs/promises";
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

const opencodeJsoncPath = path.join(root, "opencode.jsonc");
let config;
try {
  config = parseJsonc(await readFile(opencodeJsoncPath, "utf8"));
} catch (err) {
  fail(`opencode.jsonc: failed to parse — ${err.message}`);
}

if (config) {
  if (config.default_agent !== "sdd") fail(`opencode.jsonc: default_agent should be "sdd", got ${JSON.stringify(config.default_agent)}`);
  if (!config.permission || typeof config.permission !== "object") fail("opencode.jsonc: missing permission block");
  if (!config.command?.["setup-docs"]) fail("opencode.jsonc: missing command.setup-docs");
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
// 4. manifest.txt freshness
// ---------------------------------------------------------------------------

async function sha256(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function expectedManifestEntries() {
  const entries = [];
  entries.push("opencode.jsonc");
  entries.push("package.json");
  for (const f of agentFiles) entries.push(path.join("agents", f));

  const pluginsDir = path.join(root, "plugins");
  const pluginFiles = (await readdir(pluginsDir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
  for (const f of pluginFiles) entries.push(path.join("plugins", f));

  entries.sort();
  const withHashes = [];
  for (const rel of entries) {
    withHashes.push([await sha256(path.join(root, rel)), rel]);
  }
  return withHashes;
}

const manifestPath = path.join(root, "manifest.txt");
let manifestRaw;
try {
  manifestRaw = await readFile(manifestPath, "utf8");
} catch {
  fail("manifest.txt: missing — run scripts/gen-manifest.sh");
}

if (manifestRaw !== undefined) {
  const actualLines = manifestRaw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
      if (!m) return null;
      return [m[1], m[2]];
    });

  if (actualLines.some((l) => l === null)) {
    fail("manifest.txt: contains a malformed line (expected `<sha256>  <path>`)");
  } else {
    const expected = await expectedManifestEntries();
    const expectedSet = new Map(expected.map(([hash, rel]) => [rel, hash]));
    const actualSet = new Map(actualLines.map(([hash, rel]) => [rel, hash]));

    for (const [rel, hash] of expectedSet) {
      if (!actualSet.has(rel)) fail(`manifest.txt: missing entry for ${rel} — run scripts/gen-manifest.sh`);
      else if (actualSet.get(rel) !== hash) fail(`manifest.txt: stale hash for ${rel} — run scripts/gen-manifest.sh`);
    }
    for (const rel of actualSet.keys()) {
      if (!expectedSet.has(rel)) fail(`manifest.txt: lists ${rel}, which no longer exists or shouldn't be installed`);
    }
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`check.mjs: ${errors.length} problem(s) found\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`check.mjs: ok (${agentFiles.length} agents, ${readmeModels.size} README rows, manifest.txt fresh)`);
