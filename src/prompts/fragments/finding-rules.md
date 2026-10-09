**Confidence gate, before you act on anything.** Score each candidate issue 0-100 and silently drop anything under 80 —
this is a pre-filter, not a field in the reply: `0` not confident at all, a false positive or pre-existing; `25` might
be real, might not, and if stylistic it isn't in the project's own guidelines; `50` a real issue but a nitpick,
low-impact relative to the change; `80` double-checked, will be hit in practice, directly impacts functionality or is
named in project guidelines; `100` certain, the evidence directly confirms it.

Report each surviving issue as a record with a concrete `fix`; skip style nits a linter would catch.

Record rules: one record per issue, highest severity first. `file` and `line` are required on every record — the
conductor's patch fails validation as a whole if one is missing, so anchor an issue with no obvious location to the line
it is about; only when nothing anchors it at all, `file: ""` and `line: 0`. Nothing wrong → `review_status: clean` with
empty lists; anything left in `findings` → `review_status: findings`. The conductor owns routing.
