## Design rules

What a sound design contains — `shadow-design` writes to these rules and `shadow-design-reviewer` checks against them.

### Spec (`spec.md`)

- Sections: problem, motivation, user stories, functional + non-functional requirements, explicit out-of-scope, a
  numbered `## Assumptions` ledger, open questions.
- No tech or implementation choices — those live in `plan.md`.
- Every requirement is testable as written; concrete examples over adjectives ("fast" and "robust" need a number, a
  threshold, or a named behavior).
- **Assumptions ledger.** Each entry resolves an ambiguity with a stated default: numbered, the default stated, and what
  breaks if it is wrong named. An assumption that would change scope or observable behavior if wrong is an open question
  instead. No entry that Grep against the code or prior specs already answers. An empty section is valid — written as
  empty, not padded.
- Genuine ambiguities are open questions for the design gate, not guesses.

### Contracts (`contracts/*.feature`)

- Each happy path has its counterparts: absent or empty input, permission denied, the duplicate or concurrent action,
  the upstream dependency failing, the limit being hit.
- Every scenario carries a stable ID: `@S1`, `@S2`, …. IDs are append-only — never renumbered or reused; plans, briefs,
  and tests cite them.
- Scenarios are externally reachable: `shadow-qa` validates from outside the system, so a scenario observable only
  through a private internal cannot be validated end-to-end.
- After the design gate, contracts change only through an explicit conductor re-delegation.

### Plan (`plan.md`)

Sections: **Approaches considered**, approach, affected modules/files, **existing code to reuse** (`file:symbol`),
data/API changes, risks/trade-offs, **Test strategy**, **Implementation waypoints**.

- **Approaches considered.** 2-3 genuinely distinct candidates, each a one-line trade-off grounded in cited code, plus a
  recommendation with rationale and one line per rejected option. Only one viable approach → said in one line; never
  manufactured strawmen. The rest of `plan.md` implements the recommendation.
- **Test strategy** — the acceptance mechanism. Cheap oracles, not helper-level TDD:
  - The runner comes from `AGENTS.md` and the existing tests.
  - Each scenario is pinned by the cheapest sensor that can fail its Then, in this order; a rung is skipped only when it
    cannot assert that Then:
    1. `boundary` — in-process test of the **public boundary** (exported API, CLI parser, HTTP handler), never an
       internal helper.
    2. `golden` — CLI / HTTP transcript or committed golden file.
    3. `integration` — an existing integration suite already in the tree.
    4. `e2e` — an existing e2e suite already in the tree.
    5. `playwright` — **last resort**: only when the feature is UI-only and nothing cheaper exists (QA checks other UI
       paths ad hoc with `agent-browser`; that is not a committed oracle). The add (`@playwright/test`), the config
       path, and the command are named. The design gate is the human approval to introduce it.
  - Every `@S<n>` is grouped into **at most 3 journeys**. One journey is the default; a second or third only when a
    scenario cannot be reached from the previous journey's oracle — each extra justified in one line.
  - Per journey: `id` (`J1`, `J2`, …), claimed `@S<n>`, repo-relative test path, exact command, `oracle` kind,
    `file:symbol` targets, a `reading:` list (3–5 paths with a short why), and one **observable** done-when line.
  - A **fenced YAML block** whose first key is `journeys:` holds the reply's rows (`id`, `scenarios`, `test_path`,
    `test_command`, `oracle`). The conductor parses this block on resume; `### J1` headings may repeat it in prose but
    never replace it.
  - Each command comes from `AGENTS.md` (or the named Playwright add), and its script or runner exists. A wrong runner,
    wrong path, or missing script with no named add is a blocker.
- **Implementation waypoints.** One subsection per journey (or one block for `J1` alone) repeating its `file:symbol`,
  `reading:`, and done-when, plus a one-line feature-level rollback hint. No `risk:` tags; no per-waypoint test commands
  — the journey command is the only command.
- No placeholders: "TBD" and "handle errors properly" are defects. A competent implementer can write the failing oracle
  and the implementation without asking a question.
- Existing functions and patterns are reused where they already do the job; no new module parallel to one in the tree.
- The plan is minimal and reversible; human-decision items are flagged, not guessed.
