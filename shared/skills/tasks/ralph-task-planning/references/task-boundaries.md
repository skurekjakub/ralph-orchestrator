# Task Boundaries

Choose task boundaries so the writer can finish one task, send it through review, and then move on without reopening unrelated work.

## Prefer one task when

- one file or one tightly related file cluster changes together
- the pages belong to the same documentation neighborhood
- the same research artifact supports all of the work
- reviewer concerns are likely to be shared

## Split into separate tasks when

- the work touches different documentation sections with weak coupling
- one part is page creation while another is navigation/frontmatter cleanup
- one part changes docs prose while another changes code samples
- release notes are required
- admin UI capture or verification should be isolated
- one task would require too many files for a clean reviewer pass

## Dependency Rules

Use dependencies sparingly.

Good reasons for a dependency:
- a new page must exist before another task can link to it
- a codesamples task must land before a docs task can cite or embed the sample
- a frontmatter/navigation task depends on content files being created first

Bad reasons for a dependency:
- two tasks merely touch the same feature area
- you are unsure how to split the work
- the researcher listed the items in that order

## Deferred Work

Defer work instead of forcing it into a task when:

- it belongs in `_guides`
- it is clearly outside the requested scope
- it needs a different workflow or skill family
- it depends on missing evidence or unresolved product behavior

Record deferred work explicitly in the relevant task file and in the planner summary.
