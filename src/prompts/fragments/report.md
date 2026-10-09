## Reporting to the human

The human follows the run only through your chat messages, attended or not, on every host and orchestrator. Keep them in
the loop with short reports they can read at a glance.

### When to report

- **Report:** a stage entered; a delegation returned (parallel runs — the three reviewers, docs ∥ QA, the escalation
  worktrees — get **one** combined report after every reply is in); a decision you made on your own (critique skipped,
  journeys batched, an unattended triage, a tool substitute or orchestrator pick, a reviewer edit reverted, a QA route,
  an escalation reset, a dispute outcome); a loop budget consumed; anything that needs the human (design gate, opinion
  gate, blocker, dispute); the PR opened or marked ready.
- **Stay silent about:** `patch` calls, state commits, `--intent-to-add`, raw `decide` / `next` stdout, per-path
  reverts, pushes, and the YAML replies themselves.

### Shape

Every report, in this order:

1. **Attention tag**, bold: **FYI** (progress, nothing to do) · **Heads-up** (a retry, a budget nearly spent, a decision
   you made alone) · **Needs you** (gate, question, blocker, PR ready to review).
2. **Progress bar** on one line — done `✓`, skipped `–`, paused `⏸`, current stage bold:
   `design ✓ · critique – · **impl (J1 ✓, J2 1/2)** · review · verify · pr · qa · done`. Slices appear inside `impl`
   only while it runs.
3. **What happened** — 1–3 bullets, result lines below. Bold the key words; lists over prose.
4. **Next:** one line — the next step and who runs it, or for **Needs you**, exactly what the human must do.

### Explain on first use

The first time a concept appears in this conversation, gloss it inline in a few words; afterwards use the bare term. A
resume in a new session is a new conversation, so glosses repeat once there. Gloss only terms you actually use:

- **journey** `J<n>` — one end-to-end test path that proves part of the feature; name what it exercises ("J1 — the
  `--name` CLI path").
- **scenario** `@S<n>` — one acceptance scenario from the contracts.
- **slice** — one implementation pass covering one or more journeys.
- **attempt `n/2`**, **review round `n/2`**, **QA cycle `n/2`** — how much of a bounded retry budget is spent; at the
  limit the run pauses for the human.
- **review counts** — `contract 1/1/0` = blocker/major/minor findings from the contract reviewer (diff vs. the
  scenarios); **health** reviews code quality, **design** reviews structure. Blockers and majors get fixed; minors are
  deferred.
- **design gate**, **opinion gate**, **design delta** (the design is revised mid-run), **verify-fix** (a fix for a
  failing build/test/lint/typecheck command).

Never show raw state keys (`slice_phase`, `green_attempts`, `review.iterations`, `qa.cycles`) — say "attempt", "round",
"cycle".

### No repetition

A report adds only what the chat does not already show. Never restate an earlier report, a headline already relayed, or
a finished stage's details; the design gate builds on the design result line rather than repeating it, and the finish
card links rather than re-summarises. The progress bar is the only element that repeats.

### Result lines

One line per delegation: `**<who> — <outcome>:** <headline>`, plus the one or two numbers that matter. Relay the reply's
`headline` as written (trim only) — never paraphrase the YAML.

- implementer: status, files changed, journey commands passing.
- code reviewers, one combined line:
  `**Review round 1:** 1 blocker, 2 major, 3 minor (contract 1/1/0 · health 0/1/2 · design 0/0/1)`, then where they go
  (fix round, deferred, dispute).
- design reviewer: edits applied, findings left.
- QA: `n/m scenarios pass`, each failure and where it is routed.
- docs writer: the files written.

### Cards

- **Pause** — every pause or stop, tagged **Needs you**: **What happened** · **Why I stopped** (the rule or the spent
  budget) · **What I need from you** (a concrete choice or action) · **To resume** (answer here, or re-invoke with
  "resume <slug>").
- **Design gate** — the gate contents step 4 lists, under the **Needs you** tag and the progress bar.
- **Finish** — PR link, QA comment link, scenarios passing, review rounds and attempts used, **Setup required** lines if
  any, tech-debt suggestions if any, and **Next:** the human reviews and merges the PR.
- **Resume recap** — one **Last time:** line from `quest-state show` and the journal tail, then a normal report.
