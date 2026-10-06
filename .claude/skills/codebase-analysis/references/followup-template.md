# Follow-up file template

One file per finding, at `.ai/followups/<domain>/<slug>.md`. The domain is one
of the domains the feature-constitution roster uses, plus `cross-cutting/` for a finding
that genuinely spans them; the slug states the problem and carries no number,
because two runs in two worktrees both take the next free number and neither
sees the other. Prefix the slug with a lens when the sweep has one
(`perf-<slug>.md`), so a directory listing groups them.

The file is **untracked** and stays untracked — `.gitignore` covers the tree, so
no staging pathspec is needed — and it is written into the primary checkout, not
a worktree, which is deleted when its branch merges. It never enters a commit, a
PR, a spec, a plan or a README. Full rules: `.ai/followups/README.md`.

The reader is an implementer who was not in the conversation and will not
re-research. Every section below exists so they don't have to.

```markdown
# Follow-up: <one sentence naming the defect, not the fix>

Branch `<branch>` (<what you were doing when you found it>), <YYYY-MM-DD>;
re-verified on `<base branch>` at `<sha>`. Resolves against:
`<file>` (`<symbol>`, `<symbol>`), `<file>:<line-range>`, <…>. Versions:
<framework/library versions the facts depend on>.

## The problem

What is wrong, in plain language, then the cost with a number and the method
that produced it. Tables for measurements: | phase | mean | p50 | p90 | max |.
Say where the cost is paid (build, first request per container lifetime,
every request, every visitor) — it decides the priority.

## What is verified (<date>)

One bullet per load-bearing fact, each with a locator that resolves:
`node_modules/<pkg>/<file>.js:<line>`, `<framework docs>/<path>:<line>`,
`<repo file>:<line>`, or a URL fetched today. Include the facts that *limit*
the fix (serialisation rules, what throws under the test runner, what the deploy target
is) — those are the ones an implementer discovers the hard way.

## Every caller / every emitter

A table when the finding is about a shared thing: | site | scope / tags | what
it pays today |. This is what makes "only X pays twice" checkable.

## Resolution options

Numbered. Each says what it changes, what it keeps, and what it costs. The
last one is "leave it" with its honest price. Then **Recommendation:** with a
one-sentence reason. When the user has decided, replace this with
`## Resolution (user-directed, <date>)` and record their decision verbatim,
including constraints they stated ("single instance, local disk only").

## Solution — ready to implement

Which workflow to run it through (`feature-development` /
`codebase-refactoring`) and why. Then:

### 1. <file>
Full replacement code for the parts that change, with JSDoc per the comment
policy, not fragments the implementer has to stitch. Then "Points that look
wrong but are not" — the reviewer questions you already answered, each with
its precedent or locator.

### 2. Tests
Exact files to touch and what changes in each; new tests named by the
behaviour they pin; fixtures staged by the test, never production content.

### 3. Verification
Numbered, in order, baseline first. Every step has an expected result with a
number ("expect one `set … done`, never two"; "≈ −340 ms"; "still prints 52").
Name the exact command or env flag.

### 4. Commit and PR
Commit subject; what the message must carry (the why — it does not go into
comments); PR bullets per `.ai/resources/pr-guidelines.md`; rollback cost.

## Expected effect

The numbers again, after: per page, per build, per visitor, memory. And what
does not change.
```

## Rules that decide whether a file is done

- Every locator resolves today — `ls`/`grep` each one before handing over.
- Every number names its method; "roughly", "probably" and "should" appear only
  with a reason the number could not be measured.
- Plain language first. No jargon labels for behaviour ("throws", "fails the
  build", "renders on the next request" — never "loud-fail", "SWR", "hot path"
  without saying what happens).
- Sibling findings are separate files cross-referenced by filename. A file
  never carries an "out of scope" or "also noticed" list — that is the next
  file.
- Related decisions the user already made in the session are restated where
  they constrain the solution, so the file survives the conversation.
- The file never says what to do about another finding; it links it.
