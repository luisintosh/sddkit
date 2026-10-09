# solodev review checklist: health

- **Blast radius** — a changed shared symbol, signature, default, or export has every caller Grepped and updated. The
  delta is where the check starts, not where it stops; a green targeted test says nothing about callers nobody read.
- **Security** — authorization on every newly reachable path, validation for input crossing a trust boundary, no secrets
  or tokens in code or logs.
- **Test quality** — tests assert behavior, not implementation, and stay independent: none passes only because a mock
  was called, none relies on another's order or leftover state. A test weakened to go green is a `blocker`.
- **Residue** — no comments narrating the diff's own history ("changed from X per review") and no commented-out prior
  implementations; the diff is the history. Fix rounds and the escalation loop are what produce these.
