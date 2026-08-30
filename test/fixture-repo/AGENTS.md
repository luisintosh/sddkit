# fixture-repo

Tiny Node project used as a local smoke-test fixture. Not part of the published toolkit.

## Commands

- install: `npm install`
- dev/run: `npm run dev`
- build: `npm run build`
- test: `npm test` (single file: `npx vitest run <path>`)
- lint: `npm run lint` — n/a, no linter configured
- typecheck: `npm run typecheck` — n/a, plain JS

## Conventions

- Plain ES modules under `src/`, one file per concern.
- Tests live next to source as `*.test.js`, using `vitest`.
