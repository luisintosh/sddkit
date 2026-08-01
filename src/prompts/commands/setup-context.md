Bootstrap the CodeSight AI context map.

Skip if `.codesight/wiki/` already exists, unless explicitly asked to refresh.

Requires Node >= 18 / `npx`; if missing, report and stop — never fabricate a wiki by hand.

Run `npx codesight --wiki` at the repo root to generate `.codesight/wiki/` (index.md + topic articles) that `spec`,
`architect`, and `implementer` read before Grep/Glob.

Stage `.codesight/` for commit; don't commit automatically.

Return a compact summary: generated/skipped, article count, npx availability.
