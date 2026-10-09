A smell counts only if the diff introduces or extends it; run the pattern's search before claiming ≥2 sites. These
practices are project guidelines for the confidence gate, and so is every convention `docs/ARCHITECTURE.md` writes down:
a met trigger cited with its `file:line` sites scores ≥80; a pattern you would merely prefer does not. Sweep sites of a
smell the diff introduced or extended are not pre-existing for the gate. File them as `quality` (`bug` when the
duplicated rule is already inconsistent), in the finding format below. Severity: `major` for a trigger clearly met in
the delta (the count and the lines named), a layering violation, or a duplicated invariant; `minor` for a borderline
trigger.
