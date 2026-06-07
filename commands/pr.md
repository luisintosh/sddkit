---
description: Open a review-friendly draft pull request for the current feature (uses the gh-cli skill).
---
Open a pull request for: **$ARGUMENTS**

Current branch / status:
!`git rev-parse --abbrev-ref HEAD; echo '---'; git status --short; echo '--- commits ahead ---'; git log --oneline @{u}..HEAD 2>/dev/null || git log --oneline -5`

Preconditions (verify, don't bypass):
- `/verify` is `VERIFY: GREEN` and the review loop is clean. If not, stop and report.
- You are on the feature's `feat/<slug>` branch (created at /doit stage 0).

Steps (use the **gh-cli** skill):
1. Stage + commit any pending work with Conventional-Commit messages (`feat: …`, `fix: …`).
2. Push the branch: `git push -u origin HEAD`.
3. Build the PR body from `.opencode/templates/pr-template.md`, filling: Summary/Why, What changed,
   the **Acceptance criteria checklist taken from `docs/feats/<slug>/contracts/*.feature`**, How to
   test (the verify commands), gate checkboxes (review done, verify green, docs updated), out-of-scope,
   and links to `docs/feats/<slug>/{spec,plan}.md` + `contracts/`.
4. Create the PR as a **draft** requesting review:
   `gh pr create --draft --title "feat: <slug>" --body-file <filled-template>`.
   **Never** merge (`gh pr merge` is gated to ask).

Return the PR URL.
