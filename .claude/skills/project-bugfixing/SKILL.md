---
name: project-bugfixing
description: >-
  Use when fixing a bounded, already-identified defect in ralph-orchestrator — an observed symptom, a filed ticket, a regression, or working code no test reaches. Triggers include "fix this bug", "this is broken", "X renders nothing", "Y prop is ignored", "spacing is wrong on Z", "add a regression test for". Not for new behaviour (use feature-development) and not for behaviour-preserving cleanup (use codebase-refactoring).
---

# Project bugfixing

The deliverable of a bugfix is **the defect closed** with a regression test
seen failing before the fix, a root-cause journal, and a user explainer.
The skill has three parts followed by reference material: **Ground rules**
bind every phase, **the journal** defines the artifact contract, and **the
phases** define the workflow in order.

## Ground rules

### Is this a bugfix, a feature, or a refactor?

A bugfix restores behaviour the code already intends. The test is whether
closing it requires a **decision the code does not already contain**.

| Signal | Route |
|---|---|
| A doc comment, convention doc or `.ai/dod/` checklist says X, the code does Y | bugfix |
| Code that works but no test reaches | bugfix (gap analysis) |
| Closing it needs a new config field, resource, schema key or route | **feature** — use `feature-development` |
| Closing it needs picking between two defensible behaviours | **feature** |
| Same behaviour, better shape | **refactor** — use `codebase-refactoring` |
| "While I'm here I'll also…" | Neither. Separate item, separate branch. |

Escalating is not failure. A bugfix that quietly grows a design decision
ships a decision nobody reviewed. If it turns into a feature mid-flight, say
so, stop, and switch skills.

### Seats: who does what, on which model

This skill sets the repo specifics. `superpowers:*` skills hold the method:
`superpowers:systematic-debugging` to find the cause,
`superpowers:test-driven-development` for the fix,
`superpowers:verification-before-completion` for every done claim,
`superpowers:requesting-code-review` and `superpowers:receiving-code-review`
for the review, `superpowers:finishing-a-development-branch` to finish. If
they are absent from the available-skills list, stop and tell the user
rather than improvising from this file alone.

The orchestrator — the session running this skill — reproduces the defect,
finds the cause, writes both artifacts, makes the minimal fix inline (no
plan file, no dispatch), and watches the regression test fail. A subagent
reporting "test written and passing" has not established RED; ask for the
failing output, or run it against the reverted fix yourself.

Every dispatch goes to a `rubber-duk-*` agent, never `general-purpose`,
which carries none of the repo's conventions (comment policy, stack profile,
e2e yardstick) and re-litigates what the roster already knows. If a seat's
agent isn't installed in `.claude/agents/`, say so and do that seat's work
inline. Routed by role: `rubber-duk-tests` (WRITE) writes the
regression test whenever adding a new test file or test block (`it`/`test`),
and `rubber-duk-tests` (AUDIT) audits it — the orchestrator writes the test
inline only when modifying assertions within an existing test block;
`rubber-duk-e2e` (WRITE / AUDIT) does the same for e2e specs — separate
concern, separate harness; `rubber-duk-backend` / `rubber-duk-frontend`
(IMPLEMENT) exclusively for implementing Phase 8 review-finding fix commits
when delegated by the orchestrator; `rubber-duk-review`, `rubber-duk-backend`
(REVIEW), `rubber-duk-frontend` (REVIEW) and `rubber-duk-auditor` for
review, by surface. Pass `model` explicitly on every dispatch, following
`.ai/resources/skills/seats.md`: a fast, economical model for
mechanical fix commits, a strong reasoning model for review seats and
negative-proof regression tests, and the most capable model available for
the whole-branch review in Phase 8.

Every dispatched implementation subagent's prompt names
`docs/conventions/comment-policy.md` and requires reading it first.

Tests live where `docs/conventions/test-layout.md` says (`tests/**/*.test.ts`).

### Read the framework docs on disk first

Before any framework work, read the version-matched docs the stack profile
(`docs/conventions/stack-profile.md`) points at. Training data is outdated;
the installed docs are the source of truth. This bites hardest on bugfixes,
because the symptoms that look like application bugs — a page rendering
empty, a stale value surviving a write, a boundary resolving in the wrong
order — are usually framework caching or rendering semantics.
`docs/gotchas.md` carries the ones already paid for.

Repo facts a bugfix runs into:

- **Registers.** `.ai/regression/` is the manual click-through suites,
  `.ai/dod/` per-surface definition-of-done,
  `.ai/feature-constitution/` the feature trail (grouped by domain,
  `<domain>/<slug>/`, rostered in its own `README.md`),
  `.ai/refactoring/` the refactor trail, `.ai/bugfixes/` this
  one. Don't create a sixth.
- **Production-only bugs.** A bug that reproduces only in a production build
  is often a build-output gap (files the runtime reads that the build didn't
  include) or a caching difference, not a logic error. Check that first.
- **Everything in `CLAUDE.md` still applies to a two-line fix** — the
  comment policy, the framework-docs mandate, and `docs/conventions/` for the
  surface you touch.

### How the repo is verified

```bash
npm test
```

That is the one command that runs every quality gate. Read the `package.json`
script (or whatever defines it) once so you know which stages it covers.

Do not run the stages individually — `verify` is a superset. Never pipe its
output through `head`, `tail` or `grep` — run it bare and read it. One
carve-out: a single-file test run during the red-green loop is a test
invocation, not a verification.

**What `verify` does not cover.** Checks that run only in CI (content or
schema validation, bundle checks, e2e) say nothing locally. If the fix
touches a surface one of them guards, document this in the user explainer's
residual-risk section ("What could still break", defined in The journal)
rather than implying `verify` cleared it.

**Check that a gate actually gates.** Before citing any script as the gate on
a risk you are accepting, open it and check it is wired up **and** that it
actually checks the thing. An ungated risk named as gated is worse than an
ungated risk named as ungated.

### Scope discipline

Bugfixes die of scope the same way refactors do. The test for each candidate
change: **does closing this defect require it?** If not, surface it and let
the user decide.

- **A second bug you found while in here.** Report it; do not fix it. Two
  bugs in one commit cannot be reverted separately, and the second one lands
  in a diff nobody reviewed for it. New directory, new branch.
- **A convention violation next to the defect.** Fixing it turns a bugfix
  into a refactor. File it.
- **A missing test for adjacent working code.** That is its own gap-analysis
  bugfix.

Record what you deliberately left alone in the root-cause journal's "The
fix" section (defined below under The journal), so a reviewer can tell
"missed" from "chose not to".

### Comments the fix leaves behind

The comment policy (`docs/conventions/comment-policy.md`) applies to a
two-line fix. Two shapes only: doc comments on functions, and a two-line-max inline comment at the gotcha —
directly above the line where correct-looking code is wrong. That inline
comment is often the most valuable line in a bugfix diff.

What must not ship: the old behaviour ("previously this used `<strong>`"),
the rationale for the approach, or a fix narrative.
Those belong respectively in the commit body, the root-cause journal, and
the user explainer artifact. A comment describing a state the code is no
longer in is worse than no comment.

## The journal

Every bugfix leaves a written trail under `.ai/bugfixes/NNN-<slug>/`:

```
.ai/bugfixes/NNN-<slug>/
  root-cause.md          # what breaks, where, why — written BEFORE the fix
  explainer.html         # published artifact: the shipped fix, for the user
  <surface>-before.png   # one capture pair per affected surface
  <surface>-after.png
```

Two documents, not three. There is no `design.md` and no `plan.md`: a bugfix
that needs a plan is a feature.

**Picking the number:** `ls .ai/bugfixes/`, take the highest existing prefix,
add one. Zero-padded, three digits, creation order. Never renumber, never
reuse an abandoned number. The sequence is independent of
`.ai/feature-constitution/` and of `.ai/refactoring/` — the directory says
which flow produced it.

### `root-cause.md` — the contract

Written before the fix, for whoever maintains the code, in this order. Scale
each section to the bug; a one-line-fix bug gets a short file, not a padded
one.

1. **Symptom** — what is observably wrong, stated so someone could check it.
   Measured where possible; marked as reasoned where not.
2. **Location** — the `file:line` where the wrong thing happens. Quote the
   lines. If the cause is spread across call sites, list them all.
3. **Mechanism** — *why* the code does the wrong thing. Not "it has a bug":
   the specific condition, branch, or missing case. This is the section that
   makes the fix obvious, and if you cannot write it you have not found the
   cause yet.
4. **Blast radius** — what is affected and, equally, what is not.
   Repo-wide counts belong here (a `grep -l` over the affected tree), because
   they are why the bug did or did not wait.
5. **The fix** — what changes, in behaviour terms. And what deliberately does
   **not** change: the adjacent thing you noticed and are leaving alone.
6. **How it will be proven** — the behaviour the regression test pins, and
   why that test would have gone red before the fix. Where the defect is
   textual rather than pictorial (whitespace, an attribute, an ordering),
   the measured DOM value goes here too.

Numbers in this file are measurement, and measurement is welcome — "1808
content files contain a tab", "8 routes render through `PageLayout`". Dated, sourced, with a command someone could
re-run. Name the behaviour that must hold and the edge that must be
refused, then write however many tests that takes; never specify numerical
test targets or quotas.

A missing-test bug uses the same six headings. Symptom is "nothing under
the test suite reaches this code"; Mechanism is the class of regression that
can therefore land unseen; the Fix is the test; How it will be proven is
*how you demonstrate the new test catches it* — write the regression, watch
the test go red, revert the regression. A test you never saw fail proves
nothing.

### The captures

One before/after pair per affected surface, not one pair per bugfix. A fix
that touches two components, two routes, or two render modes needs a pair
for each — a single pair proves one of them and silently asserts the rest.
Name them for the surface so the pairing is unambiguous
(`checkout-before.png` / `checkout-after.png`, `cart-badge-before.png` /
`cart-badge-after.png`). Both shots of a pair are the same route, same scroll
position, same viewport — a "before" at the top of the page and an "after"
at the block proves nothing. They live in the bugfix directory next to
`root-cause.md`; a screenshot in `/tmp` is gone by the next session.

### `explainer.html` — the contract

The explainer is for the user, who should not have to read a diff to know
what changed in their codebase and why it was wrong. Start from
`references/explainer-template.html` in this skill directory — tokens, both
themes, the four fixed sections as `FILL:` slots, and three figure components
as commented blocks. Copy it, fill every slot, delete the ones you did not
use and the instruction comments. Don't restyle it: every bugfix explainer
is one page of a series, and a page that invents its own palette reads as a
different project. Load `artifact-design` for the reasoning behind the
choices, not to redo them.

Write it to `.ai/bugfixes/NNN-<slug>/explainer.html`, publish with the
`Artifact` tool, and hand the user the URL. Keep the path stable across
redeploys so the URL is stable.

**The title is a bug-report title.** `<title>`, the page's `h1`, and the
`description` passed to `Artifact` are formatted strictly as a ticket
subject line: 4–8 words naming the component and the defect, with no
commas, conjunctions ("so"), or metaphors.

| | |
|---|---|
| ✅ | `Checkout total ignores discount codes` |
| ✅ | `Settings page missing save confirmation` |
| ✅ | `maxItems ignored on inline RecentOrders` |
| ❌ | `The price formatter kept the old rounding mode, so every order over 100 items was a cent off at checkout` |
| ❌ | `Checkout got its discounts back` |
| ❌ | `A wrapper that went missing` |

The first reject is a whole sentence with the mechanism and the measurement
in it — that belongs in the standfirst, the very next line on the page. The
other two are headlines: they read nicely and name nothing.

**Required content, in this order:**

1. **What the code did** — the prior behaviour, with real `file:line`
   references and real numbers from this repo.
2. **Why it was wrong** — the specific failure. If a reference says
   otherwise (framework docs, a convention doc), quote it with its locator.
3. **What changed** — the diff in prose, short enough to follow without
   opening the code. Include what you deliberately left alone.
4. **What could still break** — the honest residual risk. Contracts touched,
   pipeline-only gates that have not run, the test that is now the safety
   net.

No quiz: a bugfix explainer is published after `verify` is green, so a quiz
would be grading a decision already made. A figure is not decoration — use
one only when it shows something the prose cannot (a before/after magnitude,
a corpus-wide count), and every figure carries what was measured and how.

## The phases

Before Phase 1, initialize the task list using the environment's task
management tools (e.g., TaskCreate/TodoWrite), creating one task per phase
plus capture subtasks per affected surface, and updating their status as you
go. An untracked run is how the reproduction, the docs check, or the
definition-of-done walk quietly go missing.

| # | Phase | Skill / tool | Artifact | Skip when |
|---|---|---|---|---|
| 1 | Reproduce | the running app (`npm run dashboard`) + `agent-browser` | `<surface>-before.png` per surface | defect has no page surface |
| 2 | Find the cause | `superpowers:systematic-debugging` | a proven mechanism (`file:line` chain, failing test, or browser observation) | never |
| 3 | Write the cause | — | `root-cause.md` | never |
| 4 | Fix, TDD | `superpowers:test-driven-development` + `rubber-duk-tests` / `rubber-duk-e2e` (WRITE) | the fix and a regression test seen failing | never for unit fix/test; skip e2e spec if defect has no runtime surface |
| 5 | Prove it in the app | restart the dev server, then capture | `<surface>-after.png` per surface; `.ai/regression/` box tightened or added | skip captures if defect has no page surface; never skip `.ai/regression/` update |
| 6 | Update the docs | `grep` | convention, gotcha, constitution README, `.ai/dod/`, `.ai/diagrams/` edits — or "none" | never |
| 7 | Verify | `npm test` | exit 0, read | never |
| 8 | Review | `superpowers:requesting-code-review` + `superpowers:receiving-code-review` + `rubber-duk-*` | findings listed with verdicts; one commit per accepted finding | never |
| 9 | Explain | `references/explainer-template.html` + `Artifact` | `explainer.html`, published | never |
| 10 | Tick | — | touched `.ai/dod/` checklists walked | never (retire issue if tracked; record "no checklist" if unassigned) |
| 11 | Commit and finish | `superpowers:finishing-a-development-branch` | one commit, one PR | never |

### Phase 1 — Reproduce in the running app

Mandatory before any diagnosis, whenever the defect is reachable through a
page — which is most of them, not just visual ones. A defect you have not
seen with your own eyes is a defect you are guessing at, and the "after"
proof is worthless without the "before".

Get the dev server up at http://localhost:3101. Check first, start only if absent:

```bash
curl -sf -o /dev/null http://localhost:3101 && echo up
```

If it is down, start `npm run dashboard` as a background task — never in the
foreground, where it blocks the session. If a server is already running,
use it without killing it or starting a second instance.

Load the `agent-browser` skill and drive the page from there — console
errors, DOM reads, screenshots. Load the skill rather than reaching for the
CLI from memory; its command surface moves.

```bash
agent-browser open --enable react-devtools http://localhost:3101/<route>
agent-browser screenshot before.png
```

Copy each capture into the bugfix directory as
`.ai/bugfixes/NNN-<slug>/<surface>-before.png`, per the journal section.
Where the defect is textual, also record the
measured value — `agent-browser eval` reading the DOM is stronger evidence
than a picture of it, and diffable.

A surface that turns out not to be affected is a finding, not a gap. If the
"before" capture shows the defect absent, the reproduction is wrong or the
cause is elsewhere — the cause hunt in Phase 2 starts from that, not from
what you already believed.

### Phase 2 — Find the cause

Invoke `superpowers:systematic-debugging`. Read the code, then prove the
mechanism — a failing test, a browser observation, a `file:line` chain. Not
a hypothesis you find plausible.

### Phase 3 — Write `root-cause.md`

Before the fix exists, to the contract in the journal section. A cause
diagnosed only in conversation has not been written down, and the next
session cannot read the conversation.

### Phase 4 — Fix it, TDD

Failing test first — and it must fail *for the reason `root-cause.md`
names*. Watch it fail. Implement the minimal change inline, as required by
Ground rules § Seats. Watch it pass. The regression test is written by the
agent designated in Ground rules § Seats: who does what, on which model;
the orchestrator still watches it fail.

Where the test goes:

| Kind | Home | Convention |
|---|---|---|
| Unit / integration | `tests/**/*.test.ts` | `docs/conventions/test-quality.md` |
| Manual click-through | `.ai/regression/<domain>.md` | `.ai/regression/README.md` |

The repo has no e2e agent installed: a defect reachable through a page is
pinned by the unit test plus the Phase 5 before/after capture of the DOM
contract the defect broke (the wrapper element is present, the data attribute
is rendered). Say in the report that no e2e spec was written.

### Phase 5 — Prove the defect is gone in the app

Same route, same observation as Phase 1, captured the same way into the
bugfix directory. Restart the dev server first:

```bash
# stop the background `npm run dashboard`, then start it again
```

Confirm the restarted server rebuilt cleanly (no compile errors in its
output) before you read anything off the page.

A stale dev server will lie to you. Hot reload does not reliably rebuild
everything a bugfix touches, and any server-side cache compounds it — a
cached render survives the edit that changed how it is built. A branch
switch mid-session makes it worse. If the page disagrees with what the code
plainly does, suspect the server before you suspect the fix: prove the unit
in isolation (a single-file test run, or a scratch script), then restart and
re-measure. Rewriting a correct fix to satisfy a stale
render is the failure mode this paragraph exists to prevent.

Then check whether `.ai/regression/<domain>.md` already has a box covering
the behaviour. If it does and the box passed while the bug was live, the box
is too weak — tighten it as part of the fix. If the domain has no box for
it, add one.

### Phase 6 — Update the docs the fix invalidated

Check the diff against `docs/conventions/` (the convention covering the
surface you touched), `docs/gotchas.md` (add one if the trap generalises),
the owning `.ai/feature-constitution/<domain>/<slug>/README.md`, and
`.ai/dod/` if a definition-of-done item was wrong. Most bugfixes touch none,
and "none" is a valid finding — record "Doc updates: none" in the Phase 6
task record and PR body.

Most bugfixes touch no diagram either. But a fix that changes which module
owns a behaviour, adds a module, or changes a data path affects the map a
fresh agent reads to orient itself. Open every diagram under `.ai/diagrams/`
whose subsystem the fix touched and verify each path, module, function and
route it names still resolves — `grep` or `ls` them, don't trust the
diagram's own claim. Current-state prose only: no "previously", no fix
narrative.

### Phase 7 — Verify

`npm test` exits 0, as the verification rule in Ground rules sets
out. Run it. Read the output. Not "should pass".

### Phase 8 — Review

In order: `superpowers:requesting-code-review` against the branch base;
`rubber-duk-review` over the full branch diff — mandatory, every bugfix —
with the domain passes the seats rule names (`rubber-duk-backend`,
`rubber-duk-frontend`, `rubber-duk-auditor`) by surface;
`superpowers:receiving-code-review` to process with rigor rather than
performed agreement; `rubber-duk-tests` (AUDIT) over the regression test and
`rubber-duk-e2e` (AUDIT) over any e2e spec. A bugfix does not pass with an
unaddressed finding — fix it or explicitly rebut it.

Findings specific to this flow, to ask the reviewer for by name:

- **A behaviour change riding along with the fix** — the diff should close
  the defect and nothing else. A rename, a signature change, or an extra
  guard inside the fixed function needs naming and justifying.
- **A fix at the symptom rather than the cause** — a CSS override that hides
  a wrong DOM contract, a `?? fallback` that swallows the condition
  `root-cause.md` named.
- **A regression test that pins the implementation, not the behaviour** —
  one that would go green against a wrong fix, or red against a correct
  refactor.
- **The adjacent instance left unfixed** — the same defect at a second call
  site the inventory missed. Either fix it in this bugfix or name it in
  "what deliberately does not change".
- **Archaeology comments** introduced by the fix (Ground rules § Comments
  the fix leaves behind).

List every finding to the user before applying any of them, with a verdict
on each — valid, or rebutted and why. A finding silently folded into the
diff is a finding nobody chose to accept. The orchestrator (or dispatched
`rubber-duk-backend` / `rubber-duk-frontend` for delegated changes)
implements each accepted finding as its own commit on top of the bugfix
commit, named for what it fixes: a reviewer reads their own finding as one
diff and stops there, while a batch commit makes them re-derive which hunk
answered which point. Rebutted findings produce no commit — they go in the
reply.

### Phase 9 — Write and publish `explainer.html`

After the fix, from the fix, to the contract in the journal section.
Publish with the `Artifact` tool and hand the user the URL.

### Phase 10 — Satisfy the definition of done

Open every `.ai/dod/` checklist whose surface the fix touched and walk
it item by item against the diff. A **must** item is met or the fix is not
done; an **if relevant** item is met or you state why it does not apply.
Fix the code to earn the tick — editing the checklist so the work passes is
the one move that is never allowed. "No checklist covers this surface" is a
valid outcome — record "DoD: No checklist covers this surface" explicitly in
the PR body.

### Phase 11 — Commit and finish

Bundle the fix, tests, artifacts, captures and doc updates into a single
commit, branch, and PR so the change can be cleanly reverted as a single
unit. Review-finding commits from Phase 8
sit on top of it and are exempt — they answer a reviewer, so each stays
separately readable.

Then `superpowers:finishing-a-development-branch`. PR body rules:
`.ai/resources/pr-guidelines.md`. The explainer URL belongs in the PR
body; `root-cause.md` does not get pasted
into it.

## Reference material

- `references/explainer-template.html` — the explainer's tokens, both
  themes, the four fixed sections as `FILL:` slots, and the figure
  components.

### Red flags — stop

- A fix in the working tree and no `.ai/bugfixes/NNN-<slug>/root-cause.md`
- `root-cause.md` with a Location but no Mechanism — the cause is not found
  yet
- A regression test that was never observed failing
- A missing-test bugfix where the reintroduce-the-regression step was
  skipped
- A bugfix directory with no `NNN-` prefix, a reused number, or a number
  copied from `.ai/feature-constitution/`
- `root-cause.md` or a task brief naming how many tests to write
- A fix that adds a config field, a resource, a schema key or a route —
  that is a feature
- Two bugs in one commit, or a bugfix split across commits
- Review findings applied without listing them and their verdicts first, or
  several findings squashed into one commit
- `explainer.html` missing, or published before `npm test` exited 0
- An artifact title that is a metaphor, a pun, or a sentence that would fit
  some other bug
- A fix claimed done without the page having been looked at, before **and**
  after
- No before/after capture (or an equivalent measured value) in the bugfix
  directory for a defect reachable through a page
- An "after" capture taken without restarting the dev server
- "Verified" claimed while a pipeline-only gate covering the touched surface
  was never named
- Claiming done without having run `npm test`
- Any verification stage run alone (lint, typecheck, the whole test suite)
  instead of `npm test`

Any of these: stop, write the missing file, then continue.

### Rationalizations

| Excuse | Reality |
|--------|---------|
| "The fix is one line, the artifacts are overhead" | The one line is the cheap part. Why it was wrong is the part that gets lost. |
| "I'll write `root-cause.md` after — I'll know more then" | You will know the fix. After it, you can no longer tell which parts you actually proved. |
| "I found the line that's wrong, that's the cause" | That is the Location. The cause is why that line does the wrong thing under the triggering condition. Write the Mechanism. |
| "It's obvious once you see it" | Then the Mechanism section is two sentences. Write them. |
| "The ticket has a full description, that IS the root cause doc" | A ticket is a one-line statement of deferred work. It has no mechanism. |
| "The symptom is intermittent, I can't measure it" | Then write "reasoned, not measured" in the Symptom section. An unmarked guess reads as evidence later. |
| "I'll write the test after the fix — same test either way" | You never watched it fail, so you never proved it can catch anything. That is the entire value of a regression test. |
| "The test passes, so the fix works" | Did it fail before? For the right reason? If you did not check, the test may be pinning something else. |
| "This missing-test bug has no cause to analyse" | It has a class of regression it lets through. Name it, then prove the new test catches it by reintroducing it. |
| "While fixing this I noticed another bug, I'll fix it too" | Two bugs, two directories, two commits, two branches. |
| "The bug is visual, a unit test on the component is enough" | The unit test renders the component. The bug is that a route never renders it, or renders it outside the wrapper the CSS keys off. Assert the DOM contract. |
| "`verify` is green, so the fix is verified" | `verify` doesn't run the CI-only checks or e2e. Name what did not run. |
| "`verify` is slow, I'll run the one test file and call it done" | Single-file runs are for the red-green loop. Only `verify` claims the repo is green. |
| "I'll run the e2e suite locally to be sure" | If CI owns it, write the spec and say it is unrun locally. |
| "A dev server is in the way, I'll kill it" | It's the user's. Use it, don't kill it. Restart the server when preparing to capture Phase 5 "after" evidence or when you have evidence it is serving stale output. |
| "The unit test is green, I don't need to open the page" | The unit test proves your function. It does not prove the route calls it, or that anything changed for a reader. Open the page. |
| "I'll capture the 'after' — the 'before' is obvious from the report" | Then you have one picture and no comparison. Capture the broken state first; after the fix it is unrecoverable without a stash. |
| "The page still looks wrong, my fix must be incomplete" | Or the server is stale. Prove the unit in isolation first, then restart and re-measure. Do not rewrite a correct fix to satisfy a cached render. |
| "This needs a new config field, but it's still fundamentally a bug" | A new field changes the schema contract. That is `feature-development`. Escalate. |
| "The explainer repeats `root-cause.md`, it's redundant" | Different readers. One is the maintainer's record, one is the user's. Neither is written in the other's language. |
| "The title is catchy, the body has the detail" | The title is what appears in a list of artifacts. Name the defect. |
| "Naming the symbol in the title makes it ugly" | It makes it findable. `NormalizeWhitespace` is what someone will search for; "the indentation thing" is not. |
| "I'll design the explainer from scratch, this one deserves it" | It is one page of a series. Fill the template. |
| "The template's sections don't quite fit this bug" | They fit every bug: what it did, why that is wrong, what changed, what is still risky. If one is empty, the investigation is unfinished. |
| "I explained the fix in chat, the artifact is redundant" | Chat scrolls away. The URL does not. |
| "I'll fix all three, then commit once" | Then none can be reverted alone, and `git log` stops recording which fix caused what. |
| "A comment explaining what it used to do helps the next reader" | It describes a state the code is not in. Commit body, `root-cause.md`, explainer — pick one. |
