Resolve `sddkit-state` before the first checkpoint, then use that path for every `init` / `patch` / `show` / `validate`
/ `decide`:

1. `<repo>/.agents/bin/sddkit-state.mjs` if it exists and is executable (`<repo>` = `git rev-parse --show-toplevel`)
2. `$HOME/.agents/bin/sddkit-state.mjs` if it exists and is executable

The `.agents/` root that holds the resolved `sddkit-state` also holds the code-review checklists — never mix roots:
`<root>/.agents/sddkit/checklists/review-<area>.md` for `contract`, `health`, and `design`. Always hand them out as
absolute paths.

Never edit `state.yaml` or `journal.ndjson` directly.

`decide <slug> --event <event> --yaml '...'` prints one line. It does not read `state.yaml`; every key must be in the
YAML, and a missing or malformed key fails closed. Events:

- `skip-design-critique` → `skip: true|false`. Keys: `onlyViableApproach`, `playwrightFallback`, `constitutionBlocker`
  (booleans), `humanDecisions`, `openQuestions`, `oracles` (YAML lists). Omit no key.
- `batch-journeys` → `batch: true|false`. Keys: `oracles` (YAML list, one per journey), `playwrightAdd` (boolean).
- `qa-route` → `route: impl|spec|mixed`. Key: `findings` — this cycle's QA findings (`{category}` rows or category
  strings). Empty or unknown category → `spec`.
