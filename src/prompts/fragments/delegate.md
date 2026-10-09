## Delegation

Invoke specialists by catalog name (`shadow-architect`, `shadow-design-reviewer`, `shadow-implementer`,
`shadow-code-reviewer`, `shadow-qa`, `shadow-docs-writer`). Do not do their work yourself. Wait for each reply before
the next stage — except the parallel steps: step 6 runs `shadow-code-reviewer` three times, one per `area`; step 9 runs
`shadow-docs-writer` and `shadow-qa`; a clean-tree escalation runs its two worktree implementers.

{{hosts:delegation}}
- **Orca** (`tools.orchestrator: orca`, any host): dispatch per **Orca dispatch** instead of the host tool; continue by
  reusing the worker's terminal (**Orca dispatch → Continue**).

### Continue vs new

A specialist you **continue** keeps its prior context, so it skips re-reading the brief and the host reuses its prompt
cache. Continue only these:

- `shadow-implementer` — a counted targeted-test failure, the opinion-gate answer, the empty-diff or no-test correction,
  a verify-fix retry, the step 6 fix round, and the step 6.5 dispute apply round. Continue the implementer that wrote
  the code being fixed.
- `shadow-architect` — the critique re-delegation (step 3) and design-gate edits (step 4).

Everything else gets a **new** specialist: the first delegation of every stage and slice, the escalation re-derive (it
must not trust the prior attempt), review iteration 2 (an independent pass), the design delta, and every reviewer, QA,
and docs-writer delegation.

A continue message carries only what changed — failing command names + error lines, the findings, or the human's
decision — never the brief again. Hold handles in the conversation only, never in state. No live handle (a resume, a new
session), or the continue call fails → delegate a new specialist with the full brief; that is always correct.
