# Tasks — {{FEATURE}}

> Single source of truth for progress. The orchestrator advances slice-by-slice. Each slice is a
> reviewable red→green→targeted-test→review→commit loop. `[ ]` pending · `[~]` in progress · `[x]`
> done.

## Slices

### [ ] S1: _<feature-sized slice>_

- Tasks: T1, T2
- Contracts: _<scenario names or files>_
- Targeted test: _<command or file scope once tests exist>_
- [ ] T1: _<task>_
- [ ] T2: _<task>_

### [ ] S2: _<feature-sized slice>_

- Tasks: T3
- Contracts: _<scenario names or files>_
- Targeted test: _<command or file scope once tests exist>_
- [ ] T3: _<task>_

## Done when

- [ ] All Gherkin scenarios in `contracts/` have passing tests
- [ ] All slices committed
- [ ] `/verify` is green (build + test + lint + typecheck)
- [ ] Per-slice `/review` findings resolved
- [ ] Docs synced (ARCHITECTURE / memory / this feature)
