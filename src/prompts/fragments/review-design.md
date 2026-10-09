A smell counts only if the diff introduces or extends it; run the pattern's search before claiming ≥2 sites. These
practices are project guidelines for the confidence gate, and so is every convention `docs/ARCHITECTURE.md` writes down:
a met trigger cited with its `file:line` sites scores ≥80; a pattern you would merely prefer does not. Sweep sites of a
smell the diff introduced or extended are not pre-existing for the gate. File them as `quality` (`bug` when the
duplicated rule is already inconsistent), in the finding format below. Severity: `major` for a trigger clearly met in
the delta (the count and the lines named), a layering violation, or a duplicated invariant; `minor` for a borderline
trigger. Sweep cap: one search per smell, ≤8 files read per finding; name what you did not reach in `notes`.

**Scope of a multi-site finding.** Sites in the diff are always fixed now. Sites outside it are migrated in the same
round while they stay within **≤5 files and ~150 changed lines outside the diff** and each has a test that executes it.
Everything past that — over the cap or untested — is not dropped: it becomes a separate `minor` record whose `fix`
starts with `Tech debt:`. The conductor defers it and suggests a ticket.

**Finding format.** A design `fix` reads:
`<Pattern>: <create|reuse> <symbol> in <path>. In diff: <file:line, …>. Migrate now: <file:line, …>. Tech debt: <file:line, …> | none.`
The record anchors to the first in-diff site. A `Tech debt:` remainder also gets its own `minor` record, anchored to the
first deferred site: `Tech debt: <Pattern> — migrate <sites> to <symbol>; reason: <over cap | untested>`.
