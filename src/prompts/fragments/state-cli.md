Resolve `sddkit-state` at the start of step 1, then use that path for every command:

1. `<repo>/.agents/bin/sddkit-state.mjs` if it exists and is executable (`<repo>` = the main checkout: the parent of
   `git rev-parse --path-format=absolute --git-common-dir`, so a linked worktree resolves the same install)
2. `$HOME/.agents/bin/sddkit-state.mjs` if it exists and is executable

The `.agents/` root that holds the resolved `sddkit-state` also holds the code-review checklists — never mix roots:
`<root>/.agents/sddkit/checklists/review-<area>.md` for `contract`, `health`, and `design`. The resolved root's scope
(`<repo>` or `$HOME`) is also where Orca agent files come from. Always hand paths out as absolute.

Never edit `state.yaml` or `journal.ndjson` directly. Commands: `init`, `patch`, `show`, `validate`, `next`, `snapshot`,
`transition`, `review-merge`, `decide`, `probe orchestrator`, `version`.

`decide <slug> --event <event> --yaml '...'` prints one line. It does not read `state.yaml`; every key must be in the
YAML, and a missing or malformed key fails closed. Events:

- `skip-design-critique` → `skip: true|false`. Keys: `onlyViableApproach`, `playwrightFallback`, `constitutionBlocker`
  (booleans), `humanDecisions`, `openQuestions`, `oracles` (YAML lists). Omit no key.
- `batch-journeys` → `batch: true|false`. Keys: `oracles` (YAML list, one per journey), `playwrightAdd` (boolean).
- `qa-route` → `route: impl|spec|mixed`. Key: `findings` — this cycle's QA findings (`{category}` rows or category
  strings). Empty or unknown category → `spec`.
