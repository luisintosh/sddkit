# Constitution — {{PROJECT_NAME}}

> Non-negotiable principles that govern how features are built here. Seeded by `init.sh`; refine via
> `/constitution`. The orchestrator and agents treat these as hard constraints.

1. **Spec first.** No code without an approved spec and Gherkin acceptance contracts.
2. **TDD.** Write failing tests from the contracts before implementation; never weaken tests to pass.
3. **Small, reviewable changes.** One feature per branch/PR; isolate work in a worktree.
4. **Deterministic done.** A feature is done only when `/verify` (build+test+lint+typecheck) is green.
5. **Independent review.** A read-only reviewer (different model/provider) must sign off; it never
   edits source — findings route back to the implementer/tester.
6. **Docs stay current.** Update `AGENTS.md` / `docs/ARCHITECTURE.md` / `docs/memory/` with the change.
7. **Safe by default.** Secrets only via env vars; destructive shell denied; network/installs prompt.
