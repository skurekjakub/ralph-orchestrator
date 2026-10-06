# The final spec: README.md

Read this before writing or updating `README.md` in Phase 7.

`README.md` describes the feature _as it currently exists in the codebase_.
It is the file someone opens to answer "what is this and how do I use it" —
not "how was this built" or "what's still pending". Required tone: **spec**.
It reads the way `docs/conventions/*.md` reads — declarative, current-state,
no narrator presence, no prose that anchors to when something happened
("shipped on this branch", "previously", "this used to be") and nothing that
rots when the next PR lands. A reader who joined the team yesterday should
not be able to tell from the README that the feature shipped in two PRs or
that one track was deferred.

Always include:

- What the feature does (current behaviour, in active voice).
- Why it exists (the problem solved — written as a present-tense problem,
  not "we used to have X").
- Design (the load-bearing technical decisions and how the pieces fit).
- File map (where the feature lives in the tree).
- Consumer pattern (the canonical shape callers follow).
- Constraints / decisions (the load-bearing trade-offs and why each was
  made — useful when someone wonders "can I just change this").
- How to verify (commands a fresh agent can run).

Never include:

- Future-work or deferred-item sections (file these as follow-up files per
  Ground rules).
- Status lines like `Status: shipped | in-progress` or `Track A landed,
  Track B pending`.
- Branch names, PR numbers, commit SHAs, merge dates.
- Implementation tracks, phases, task numbers, or task-list checkboxes.
- References to `plan*.md` files by name in prose. (The file map can list
  them as artifacts; the prose should not say "see plan-track-b.md Task 4".)

When later work ships, edit the README to describe the new current state. Do
not append a changelog, keep a "shipped" list, or leave deprecated paragraphs
around for context — delete them. A new capability adds a row to the file
map, a bullet in the consumer pattern, and a bullet under Constraints /
decisions when introducing an invariant or architectural trade-off; a
removed capability deletes the matching rows and bullets; a follow-up whose
item ships is deleted by whoever ships it, and the README updates to
describe the new state.

Template — a starting point; adapt sections that don't apply and never leave
placeholder text in the real file:

```markdown
# <Feature name>

One paragraph: what this feature does. Present tense, active voice.
No history, no "previously", no PR/branch references.

## Why this exists

The problem this solves, written as a present-tense problem statement.
Reads as a spec, not as a changelog.

## Design

The load-bearing technical decisions and how the pieces fit. Short
enough to skim, complete enough that the file map below makes sense.

## File map

| Path                        | Role        |
| --------------------------- | ----------- |
| `lib/foo/bar.ts`            | Core logic  |
| `app/foo/page.tsx`          | Entry point |
| `tests/foo/bar.test.ts`     | Unit tests  |

## Consumer pattern

How a caller uses it. Code snippet showing the canonical shape.

## Constraints / decisions

Bullets covering the load-bearing decisions and why each was made.
Useful when someone wonders "can I just change this".

## How to verify

\`\`\`bash
npm run test -- foo
\`\`\`
```

Before drafting a new README, skim two or three existing constitutions from
the roster in `.ai/feature-constitution/README.md` as concrete examples
— one small, one large — and match their shape. The first constitution in a
repo sets the shape the rest copy, so write it to this contract exactly.
