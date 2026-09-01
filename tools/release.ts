#!/usr/bin/env bun
/**
 * Tag HEAD and publish a GitHub Release (npx/bunx pin a git ref; default is master).
 *
 *   bun run release              # patch bump from the latest vX.Y.Z
 *   bun run release -- --minor
 *   bun run release -- --major
 *   bun run release -- v1.3.0
 */
import { $ } from "bun"

type Bump = "major" | "minor" | "patch"

function die(message: string): never {
  console.error(`release: ${message}`)
  process.exit(1)
}

function parseArgs(argv: string[]): { bump: Bump; explicit?: string } {
  const flags = argv.filter((a) => a.startsWith("--"))
  const positionals = argv.filter((a) => !a.startsWith("--"))
  if (positionals.length > 1) die("expected at most one version argument")
  if (positionals[0]) {
    if (flags.length) die("pass either a version or a bump flag, not both")
    if (!/^v\d+\.\d+\.\d+$/.test(positionals[0])) {
      die(`invalid version ${positionals[0]} — expected vX.Y.Z`)
    }
    return { bump: "patch", explicit: positionals[0] }
  }
  const bumpFlags = flags.filter((f) => f === "--major" || f === "--minor" || f === "--patch")
  if (bumpFlags.length > 1) die("pass only one of --major, --minor, --patch")
  const unknown = flags.filter((f) => f !== "--major" && f !== "--minor" && f !== "--patch")
  if (unknown.length) die(`unknown flag ${unknown[0]}`)
  const bump = (bumpFlags[0]?.slice(2) as Bump | undefined) ?? "patch"
  return { bump }
}

function bumpVersion(tag: string, bump: Bump): string {
  const m = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/)
  if (!m) die(`latest tag ${tag} is not vX.Y.Z`)
  let major = Number(m[1])
  let minor = Number(m[2])
  let patch = Number(m[3])
  if (bump === "major") {
    major += 1
    minor = 0
    patch = 0
  } else if (bump === "minor") {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `v${major}.${minor}.${patch}`
}

async function latestTag(): Promise<string | undefined> {
  await $`git fetch --tags origin`
  const raw = (await $`git tag -l ${"v*.*.*"} --sort=-v:refname`.text()).trim()
  if (!raw) return undefined
  return raw.split("\n").find((t) => /^v\d+\.\d+\.\d+$/.test(t))
}

async function main() {
  const { bump, explicit } = parseArgs(process.argv.slice(2))

  const dirty = (await $`git status --porcelain`.text()).trim()
  if (dirty) die("working tree is dirty — commit or stash first")

  if (!(await Bun.which("gh"))) die("gh is required to publish the GitHub Release")

  const previous = await latestTag()
  const tag = explicit ?? (previous ? bumpVersion(previous, bump) : "v0.1.0")

  const existsLocal = (await $`git tag -l ${tag}`.text()).trim()
  if (existsLocal) die(`tag ${tag} already exists locally`)

  const remote = (await $`git ls-remote --tags origin ${`refs/tags/${tag}`}`.text()).trim()
  if (remote) die(`tag ${tag} already exists on origin`)

  const subject = (await $`git log -1 --format=%s`.text()).trim()
  const sha = (await $`git rev-parse HEAD`.text()).trim()

  console.error(`release: tagging ${sha.slice(0, 7)} as ${tag}${previous ? ` (was ${previous})` : ""}`)
  await $`git tag -a ${tag} -m ${subject}`
  await $`git push origin HEAD`
  await $`git push origin ${tag}`
  await $`gh release create ${tag} --title ${tag} --generate-notes --verify-tag`
  console.error(`release: published ${tag} — pin with npx/bunx github:luisintosh/sddkit#${tag}`)
}

await main()
