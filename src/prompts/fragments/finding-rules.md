One finding per issue, highest severity first. Nothing wrong → `review_status: clean` with an empty `findings` list.
`file` and `line` are required on every record — the conductor's patch fails validation as a whole if one is missing, so
anchor a finding with no obvious location to the line it is about rather than dropping either field; only when nothing
anchors it at all, `file: ""` and `line: 0`. Skip style nits a linter would catch. You route nothing and fix nothing —
the conductor owns routing.
