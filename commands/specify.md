---
description: Write the spec (what & why) for a feature.
agent: spec
subtask: true
---
Write the specification for this feature: **$ARGUMENTS**

- Slugify the feature name (kebab-case) and write to `docs/feats/<slug>/spec.md` using the spec
  template's structure (problem, user stories, functional + non-functional requirements, out-of-scope,
  open questions).
- The *what & why* only — no implementation or tech choices.
- List genuine ambiguities under "open questions" for the spec gate.

Return a 3–5 line summary and the path written. Do not paste the whole document back.
