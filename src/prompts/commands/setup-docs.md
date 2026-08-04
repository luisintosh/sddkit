Set up the project's AI working context.

Create missing files only; never overwrite existing files unless the user explicitly asks to refresh.

Inspect the repository enough to infer project name, purpose, stack, commands, conventions, architecture, and durable
constraints.

Create:

- AGENTS.md: concise always-loaded AI instructions with project commands, conventions, and links to docs/ARCHITECTURE.md
  and docs/CONSTITUTION.md.
- docs/ARCHITECTURE.md: concise system overview, module map, data flow, key decisions, dependencies, and testing
  strategy.
- docs/CONSTITUTION.md: concise governing principles for implementation and review.
- docs/feats/.gitkeep: ensure the feature artifact directory exists.

AGENTS.md must include these commands, using n/a when genuinely unknown: install, dev/run (how to start the app locally
— the QA agent depends on this), build, test (plus how to run a single test file), lint, typecheck.

Verify, don't guess: where possible confirm each command exists in the project manifest/scripts before writing it.

Record the domain-doc convention in docs/ARCHITECTURE.md, one line: a domain's `README.md` lives in the directory that
owns it, and `docs/domains/<domain>.md` covers a domain too cross-cutting to have one. Do **not** write those domain
docs now — the pipeline's `docs-writer` creates each one as a feature touches that domain, from a diff it can actually
read. Guessing them from an unfamiliar tree produces exactly the filler these documents exist to avoid.

Write everything you create to these rules:

{{include:fragments/doc-style.md}}

Return a compact summary: created, skipped, inferred commands, and unknowns.
