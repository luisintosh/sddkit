# sddkit review checklist: contract

- **Correctness** — each changed path does what its scenario's Given/When/Then says, not what the code looks like it
  intends: no inverted condition, off-by-one, or error branch that returns success.
- **Contract coverage** — both directions. Every changed code path maps to one of the briefs' `@S<n>` scenarios, and
  every brief scenario is asserted by its journey oracle — a public-boundary, golden, integration, e2e, or approved
  Playwright test, not a unit test of an internal helper. The second direction is the one that ships untested. Sites
  changed to apply a routed design finding are exempt from the first direction; they need only an existing test that
  executes them.
- **Silent failure** — errors propagate: no swallowed exception, empty catch, fallback or default that masks a failed
  call, or throw downgraded to a logged warning. On a green-phase diff this comes first: the fastest way to make a
  failing test pass is to stop propagating the error.
