**Current state only.** Never narrate a document's own history — no changelog, no dates, no "updated because", no
"previously this used", no feature or PR reference. **Every line earns its place**: cut throat-clearing intros, "this
section describes…", restatements of what the reader just read, and "note that" preambles; a named symbol, path,
command, or number beats an adjective, and "fast", "robust", "handled properly" say nothing. **Never restate what
another document owns** — `AGENTS.md` owns commands and conventions, `docs/ARCHITECTURE.md` owns the system-wide map,
`docs/feats/<slug>/` owns per-feature spec and plan; link, never copy, because two copies drift apart. **Omit a section
with nothing to say** rather than writing "N/A" or "None yet" — a missing section is itself information. The one
exception is `Configuration`: when something genuinely needs none, `None.` on one line, because that absence is the
answer the reader came for.
