---
description: Independent read-only review of the working diff; emits structured findings.
agent: reviewer
subtask: true
---
Review the current changes for: **$ARGUMENTS**

Diff under review:
!`git diff --stat HEAD; echo '---'; git diff HEAD`

- Review against `docs/feats/<slug>/spec.md`, `contracts/*.feature`, and `docs/ARCHITECTURE.md`.
- Emit **structured findings only** (`file:line · severity · category · finding` + `fix:`),
  highest severity first. Categories: bug|quality|perf (→ implementer), test|contract (→ tester).
- **Do not edit anything.** If the diff is clean, reply exactly: `no findings`.
