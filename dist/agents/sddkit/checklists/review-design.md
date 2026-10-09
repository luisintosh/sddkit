# sddkit review checklist: design

A smell counts only if the diff introduces or extends it; run the pattern's search before claiming ≥2 sites. These
practices are project guidelines for the confidence gate, and so is every convention `docs/ARCHITECTURE.md` writes down:
a met trigger cited with its `file:line` sites scores ≥80; a pattern you would merely prefer does not. Sweep sites of a
smell the diff introduced or extended are not pre-existing for the gate. File them as `quality` (`bug` when the
duplicated rule is already inconsistent), in the finding format below. Severity: `major` for a trigger clearly met in
the delta (the count and the lines named), a layering violation, or a duplicated invariant; `minor` for a borderline
trigger.

Apply a pattern only when its trigger is present in code this change writes or touches — never for code the change only
reads, never "for later". Follow the repo's existing idiom first (`docs/ARCHITECTURE.md`, neighbouring modules); in
functional code prefer the function form (a map of functions, a higher-order wrapper) over class hierarchies. Rule of
three: one occurrence is code, two is a coincidence, the third is a pattern.

_Creational — how objects get built:_

- **Factory** — the same `if`/`switch` on a kind deciding which thing to construct, at ≥2 call sites → one
  `create<X>(kind)` returning the shared interface; callers stop knowing the concrete types.
- **Builder / options object** — a constructor or function with >4 params, positional booleans, or an object assembled
  across many statements → a named options object with defaults (a builder only when assembly is genuinely stepwise or
  validated at the end).
- **Abstract factory** — families of objects that must match (per-provider client + serializer + error mapper) chosen
  separately at each use → one factory per family, chosen once.
- **Singleton (anti-pattern check)** — new module-level mutable state, or a global instance reached from inside logic →
  construct once at the composition root and pass it in (dependency injection), so tests can substitute it.

_Structural — how parts fit together._ A structural smell in the diff starts a sweep: run that pattern's **search**
across the repo, read each hit, and keep only sites with the **same intent** — they would change together for the same
reason. Text that only looks alike stays. Cap: one search per smell, ≤8 files read per finding; name what you did not
reach in `notes`.

- **Adapter** — smell: an SDK, ORM, or HTTP type used past the module that calls it. Search: Grep imports of that
  package and its type names. Valid: ≥2 modules depend on the vendor shape. Not when: one module already wraps it, or it
  is a single call. Move: an interface the caller owns; translate at the edge.
- **Facade** — smell: the same ≥3-call sequence against a subsystem. Search: Grep the first call; read ±10 lines at each
  hit. Valid: same order and arguments; callers want the outcome. Not when: callers vary the steps or use intermediate
  results. Move: one function that performs the sequence.
- **Decorator / middleware** — smell: retry, cache, log, auth, or timing wrapped around a call. Search: Grep the markers
  (`retry`, `cache.get`, `finally`, timer and auth helpers). Valid: the wrapper is identical apart from the wrapped
  call. Not when: the policy differs per site (timeouts, keys) and would need a flag for each one. Move: one wrapper
  applied to each.
- **Composite** — smell: leaf-vs-group checks (`children`, `isGroup`, `instanceof`). Search: Grep the discriminant and
  every recursive walker over the type. Valid: ≥2 walkers repeat the branch. Not when: a flat list or a single walker.
  Move: one interface both implement; recursion lives in the group.
- **Proxy** — smell: the same guard (lazy init, permission check, rate limit) before calls to one object. Search: Grep
  the object's methods and read what precedes each call. Valid: the guard is identical. Not when: the guard depends on
  the caller's context. Move: a stand-in with the same interface that applies the guard.
- **Bridge** — smell: variants multiplying across two axes (`EmailUrgentNotifier`, `SmsUrgentNotifier`). Search: Glob or
  Grep names built from both axes. Valid: adding one value forces N new types. Not when: only one axis varies. Move:
  split the axes; one holds a reference to the other.
- Flyweight is deliberately left out — a performance pattern only profiling justifies.

**Scope of a multi-site finding.** Sites in the diff are always fixed now. Sites outside it are migrated in the same
round while they stay within **≤5 files and ~150 changed lines outside the diff** and each has a test that executes it.
Everything past that — over the cap or untested — is not dropped: it becomes a separate `minor` record whose `fix`
starts with `Tech debt:`. The conductor defers it and suggests a ticket. The implementer files no records: it reports
sites it cannot migrate through `rebutted_findings` reasons 4–5.

**Finding format.** A design `fix` reads:
`<Pattern>: <create|reuse> <symbol> in <path>. In diff: <file:line, …>. Migrate now: <file:line, …>. Tech debt: <file:line, …> | none.`
The record anchors to the first in-diff site. A `Tech debt:` remainder also gets its own `minor` record, anchored to the
first deferred site: `Tech debt: <Pattern> — migrate <sites> to <symbol>; reason: <over cap | untested>`.

_Behavioral — how responsibility and control flow:_

- **Strategy** — a branch on the same discriminant selecting an algorithm, in ≥2 places or with ≥3 arms likely to grow →
  a map `kind → handler` (or polymorphism); adding a kind becomes adding an entry.
- **State machine** — a status field or boolean-flag combination checked across functions, transitions set ad hoc → a
  discriminated union or enum plus one `transition(state, event)` that rejects illegal moves.
- **Observer / domain event** — an action that directly calls ≥2 unrelated follow-ups (email, audit, cache bust) → emit
  one event; the follow-ups subscribe. Not for a single follow-up that must succeed with the action.
- **Command** — an operation that must be queued, retried, undone, or audited → a value describing it plus one handler.
- **Template method / pipeline** — ≥2 functions sharing a skeleton that differs in one step → one skeleton taking the
  step as a function; sequential validators with early returns → an ordered list of checks.

_Over-engineering — equally a smell:_ an interface, factory, or strategy map with exactly one implementation and no
second named by the brief; a pass-through layer that adds no rule; an event with one subscriber that must run in-line →
inline it.

_Lightweight DDD — only where the code holds business rules; CRUD glue, scripts, and config skip it:_

- **Ubiquitous language** — types, functions, and fields use the nouns and verbs of the `@S<n>` scenarios and spec; a
  synonym (`client` in code, `customer` in the spec) is a rename.
- **Value object** — a primitive carrying a rule (email, money + currency, id, date range, quantity ≥ 0) validated in ≥2
  places, or passed where a sibling primitive also fits → an immutable type validated once at construction, equal by
  value.
- **Entity** — has identity and a lifecycle → equality by id; state changes through intention-named methods
  (`order.cancel()`), not field assignment from outside.
- **Aggregate** — an invariant spanning several objects (order total = sum of lines) enforced by callers, or children
  mutated directly → route every change through the root, which checks the invariant; load and save the aggregate whole.
- **Anemic model** — a service that reads an object's fields, decides, and writes them back → move the rule onto the
  object that owns the data. Logic spanning aggregates with no natural owner → a domain service named after the
  operation.
- **Repository** — persistence queries (ORM, SQL, fetch) inside domain rules or request handlers → an interface per
  aggregate in domain terms (`orders.byCustomer(id)`), implemented in infrastructure.
- **Layering** — domain code imports a framework, ORM, HTTP, or SDK module → invert it: the domain declares the
  interface, infrastructure implements it, dependencies point inward. Using another bounded context's model directly →
  translate at the boundary (an anti-corruption adapter) instead of sharing its types.
