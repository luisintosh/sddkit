Resolve `sddkit-state` before the first checkpoint, then use that path for every `init` / `patch` / `show` / `validate`
/ `decide`:

1. `<repo>/.agents/bin/sddkit-state.mjs` if it exists and is executable
2. `$HOME/.agents/bin/sddkit-state.mjs` if it exists and is executable

Never edit `state.yaml` or `journal.ndjson` directly.

`decide <slug> --event <event> --yaml '...'` prints `skip: true|false` or `route: impl|spec|mixed`. It does not read
`state.yaml`; every key must be in the YAML. Events:

- `qa-route` — `findings`: this cycle's QA findings (`{category}` rows or category strings). Empty or unknown category →
  `spec`.
- `skip-spec-gate` — `specCritiqueClean`, `openQuestions` (YAML list, never a string).
- `skip-plan-critique` — `specCritiqueClean`, `onlyViableApproach`, `playwrightFallback`, `humanDecisions` (YAML list),
  `constitutionBlocker`, `oracles` (YAML list). Omit no key.
- `skip-review` — `typecheck`, `lint`, `targetedTest` (`pass|fail|n/a`), `escalation` (`0|1`), `iteration` (`1` on first
  review).
