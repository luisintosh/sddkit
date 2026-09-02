## Host tools

Commands here name `gh` because GitHub is the default. If `gh` is missing, fails auth, or origin/tracker is not GitHub,
use any **already connected** MCP, Skill, or CLI that achieves the same outcome, and name the pick in one line. Do not
install tools. Do not invent APIs, close/merge keywords, or comment URLs. Probe the substitute once up front (conductor:
initialize; planner: before creating items). The conductor records both picks in `tools.repo` (PR/MR) and
`tools.tracker` (work items) — later steps and resume use those values and do not rediscover. Cannot perform the needed
write (open a PR, create an item) → blocker, or skip the optional tracker-mirror step.

**Handoff** (epic markdown checklist auto-tick + `Closes #<n>`) is GitHub-only. Other trackers: skip step 13; if
`roadmap.path` is set, point at the next feature in that file. Never parse checkboxes on a host that does not auto-tick
them.

**Close-on-merge:** GitHub or GitLab → `Closes #<n>`. Tracker is not the git host → put the tracker's native ref in the
PR body as `Work item: <ref>`, do not invent a keyword, tell the human to close it. Anything else → same plain line.

**QA:** use the repo tool the conductor named (`tools.repo`). Missing from the delegation → `blocked`. `pr_comment_url`
may be `""` when the tool returns no URL (`report_path` still required). No draft concept → skip `pr ready`;
`pr_ready: true` if the PR/MR is already reviewable.
