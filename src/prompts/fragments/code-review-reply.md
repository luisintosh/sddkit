## Severity

Severity is control flow: any `blocker|major` in the merged list triggers one implementer fix round; `minor` is deferred
to `review.deferred_findings`.

- `blocker` — an `@S<n>` contract is violated, or the change risks data loss, a security hole, or a broken build.
- `major` — wrong under a realistic input, or a changed code path with no test asserting it.
- `minor` — everything else worth saying. If you can't name the input that breaks it, it isn't `major`.

## Restrictions

- Cite `file:line`, anchored to the current file's post-change line. A `test` record anchors to the uncovered production
  line, with the missing assertion named in `fix`. No vague "consider refactoring"; don't restate what's fine.
- IDs use the prefix your intro names (`C1, C2, …`), unique within your reply.
- {{include:fragments/cite.md}}

## Done when

Every surviving issue in your area is a finding and the reply block is returned. Merging, routing, and iteration
bookkeeping are the conductor's job.

## Reply to parent

```yaml
review_status: clean | findings
{{include:fragments/finding-schema.yaml}}
iterations: <echo the iteration number the conductor's delegation stated; it owns the count>
notes: <anything the conductor needs that isn't a finding — missing base SHA, a spec/plan gap, an unreviewed part of
  the diff. "" if none.>
```
