---
name: codebase-analysis
description: >-
  Use when the user wants an area of ralph-orchestrator analyzed and written up without changing code — "analyze", "audit X for improvements", "look for perf wins in", "what's wrong with …", "find tech debt / smells / dead weight in", "sweep this area", "poke around X and write up what you find", "turn findings into followups", "health check" — or when a review or feature run surfaced side findings that should become follow-up files. Not for reviewing a pending diff (rubber-duk-review), executing a refactor (codebase-refactoring) or building a feature (feature-development).
---

# Codebase analysis

The deliverable is a set of follow-up files, not a conversation. Each file
must let someone who was not here implement the fix without opening this
transcript: the defect, its measured cost, the facts the fix depends on (with
locators that resolve), every caller, the options, the recommended one, and a
solution section with code, tests, verification steps and expected numbers.
This skill never edits code. It ends when the files are written and recapped.

The skill has three parts followed by reference files: **Ground rules** bind
every phase, **the journal** section defines the follow-up file artifact and
where it lives, and **the phases** define the workflow in order.

## Ground rules

### Seats: who does what, on which model

The orchestrator — the session running this skill — writes every finding,
takes every measurement, and makes every judgement call; subagents only
perform mechanical inventory.

Every dispatch goes to a `rubber-duk-*` agent, never `general-purpose`:
`rubber-duk-backend` (REVIEW) or `rubber-duk-frontend` (REVIEW) for
repo-scoped inventory — caller tables, grep sweeps over a large area — and
for refuting a framework claim the orchestrator is about to build a solution
on; `rubber-duk-tests` (AUDIT) when the question is whether an existing test
would catch a regression. Pass `model` explicitly on every dispatch: a fast,
economical model for mechanical inventory; an advanced reasoning model for
refuting a claim and for `rubber-duk-tests` (AUDIT). Never call the Workflow
tool or spawn a multi-agent sweep unless the user asked for that scale.

### Code outranks documentation

Order of evidence, highest first:

1. installed framework source (for example `node_modules/<framework>/**`) —
   cite `file:line`;
2. the version-matched framework docs `docs/conventions/stack-profile.md`
   points at — cite `path:line`; they match the installed version, training
   data does not;
3. library source (`node_modules/<pkg>/…` or the ecosystem's equivalent);
4. repo code;
5. vendor pages via WebFetch, URL + date;
6. repo docs, feature constitutions (`.ai/feature-constitution/**`),
   comments — hypotheses only. A convention doc that contradicts the code is
   itself a finding.

A claim the solution depends on gets a locator from levels 1–5 of this
evidence order or it is removed from the file.

### Nothing in the tree changes

The sweep produces files under `.ai/followups/` and nothing else. `git diff
--stat` at the end shows no source change, and `git status --short` does not
list the follow-up files because `.gitignore` covers them. Any fix the
orchestrator is tempted to make on the way must be written up as a finding
rather than implemented in place.

## The journal

Each finding is one file at `.ai/followups/<domain>/<slug>.md`. The domains
are the ones `.ai/followups/README.md` rosters — the feature domains of
`.ai/feature-constitution/README.md` plus `cross-cutting/` — and that README carries
the naming rule, the file shape, and what is not a follow-up. `ls
.ai/followups/<domain>/` shows worked examples in the area under sweep.

The files stay **untracked** — never `git add` them — and are written into
the primary repository checkout, never a worktree, which is deleted when its
branch merges and takes untracked files with it. A finding is never folded
into a spec, a plan, a README, or another finding's "out of scope" list: a
finding hidden in prose is a finding lost.

`references/followup-template.md` is the file shape, section by section, with
the done-criteria. Read it before writing the first file. The parts that take
the longest are the parts that make the file usable:

- **Solution code** is full replacement code for the changed parts, doc
  comments per `docs/conventions/comment-policy.md`, no archaeology comments, no
  narrative. Include the "looks wrong but isn't" list — every question a
  reviewer will ask, answered with a precedent in the repo or a locator.
- **Tests** name the files to touch and the behaviour each new test pins.
  Know what throws under the test runner (framework APIs that need a request
  scope or a server context) and say which mock idiom to copy, with its
  `file:line`.
  Never assert against production content values in tests you propose —
  stage fixtures.
- **Verification** is ordered, baseline first, with an expected number per
  step and the exact command or env flag (a debug env var,
  `curl -w '%{time_starttransfer}'`, the build-log line).
- **Commit and PR**: the why goes in the commit message, never in comments;
  bullets per `.ai/resources/pr-guidelines.md`; rollback cost in one line.
- **Workflow**: say whether the implementer runs `feature-development` or
  `codebase-refactoring`, by deliverable (new behaviour vs nothing moved).

Voice: plain language first, then the term. Numbers with methods. No
"consider", no "might want to" — an option is listed or it isn't, and one is
recommended. The files are written in full sentences because they outlive
the session, whatever the chat style is.

If the user intervenes during the run or responds to the recap with a
decision ("A, 500 MB, no external storage"), the orchestrator replaces the
file's `## Resolution options` section with
`## Resolution (user-directed, <date>)`, recording their decision and every
stated constraint verbatim in substance. Do not re-argue a decided point in
the file or in chat.

### The explainer

The sweep also publishes one page the user reads instead of the findings
files: `.ai/followups/<domain>/<YYYYMMDD>-<sweep-slug>-explainer.html`,
untracked like the findings, built from the shared template at
`.ai/resources/skills/explainer-template.html`. Read
`.ai/resources/skills/explainer-contract.md` before writing it.

Four sections, in this order: **Summary** (the findings at a glance, each
with its headline number and recommendation — the before/after figure
becomes a findings table); **In plain terms** (what the area does, what the
sweep found and why it costs something, in the subject's vocabulary, no
paths); **Walkthrough** (one step per finding, in the order the files were
written, with the measurement, its method, the evidence locators, and the
resolution options with the recommendation); **Check yourself** (six to ten
questions on the mechanism behind each finding, answer in your head then
open to check, each naming the file or measurement that holds it). The title is
a two-to-four-word name for the sweep; every number carries its command,
commit and date. The URL goes in the chat recap and in the comment on the
tracker issue, if one exists.

## The phases

| # | Phase | Tool | Output | Skip when |
|---|---|---|---|---|
| 0 | Scope | conversation | one-line restatement with the lenses, repeated in each file's provenance line below the title | never |
| 1 | Map | `Grep` / `Glob` / `rubber-duk-*` inventory | caller and boundary tables, carried into each file's callers section | never |
| 2 | Measure | `references/measurement-recipes.md` | a number with its method per candidate finding | never |
| 3 | Verify | evidence order above / `rubber-duk-*` (REVIEW) | a resolving locator per load-bearing claim | never |
| 4 | Split | judgement | the list of findings, one defect each | never |
| 5 | Write | `references/followup-template.md` | `.ai/followups/<domain>/<slug>.md` per finding | never |
| 6 | Self-check | `ls` / `grep` / `git status` | every locator resolves, tree clean | never |
| 7 | Explain and recap | `.ai/resources/skills/explainer-template.html` + `Artifact` | `<YYYYMMDD>-<sweep-slug>-explainer.html`, published; one chat line per file | never |

### Phase 0 — Scope

Take the target literally: a path (`src/billing/`), a route
(`/checkout`), a theme over an area ("performance of the search route"), or
"since you're in there, look for X". Restate it in one line with the lenses
you will apply, then start. If two readings would produce materially
different work, ask; otherwise pick the reasonable one, say so, and record it
in each file's provenance line (the line below the title that names what
surfaced the finding and when, as `.ai/followups/README.md` sets out).

Lenses — pick the ones the target implies, not all of them:

| lens | the question | typical evidence |
|---|---|---|
| cold cost | what runs on a cold fill, how often is it cold | benchmark, cache scope map, container/deploy lifecycle |
| duplication | is the same work done twice per request / build | caller table, scope boundaries, cache keys |
| payload | what does each visitor download that they don't need | HTML and serialized-payload byte counts, bundle sizes, gzip |
| build | what does the build pay per page or per module | CI build log, build output sizes |
| memory | what is resident, who sizes it | cache config, entry sizes, deploy tier |
| coherence | do caches, tags, docs and code agree | tag emitters vs invalidators, doc locators vs `ls` |
| contract drift | does a comment, convention or test pin something no longer true | grep the claim, read the code |

### Phase 1 — Map before measuring

Inventory the area as data, not impressions:

- every entry point and every caller of the symbols in scope — a table with
  `file:line`, the scope it runs in (cached? request-scoped?), and what it
  pays today. This is how "only the content route pays twice" becomes checkable.
- the boundaries the framework draws: rendering and streaming boundaries,
  cache scopes (and what does or doesn't span them), handlers vs pages,
  build-time vs request-time.
- what touches it from outside the import graph: scripts, tests, fixtures,
  config (headers, tracing and ignore lists), convention docs.

`grep -rn` the symbol across the repository (including root config files),
excluding `.claude/worktrees/`, `.ai/`, and `node_modules/`; list every hit.
A large area
is inventoried by a `rubber-duk-*` agent on a fast model, as the seats rule
sets out; the orchestrator reads the table it returns.

### Phase 2 — Measure, don't estimate

A finding without a number is an opinion. Get the number the cheapest honest
way — `references/measurement-recipes.md` has the commands — and write down
the method beside it. Minimum bar per finding:

- for performance, payload, or resource findings: the unit cost (ms per
  page, bytes per visitor, MB resident) with mean and tail (p50 / p90 /
  max), how often it is paid (per build page, per cold fill, per container
  lifetime, per request, per visitor), and known outliers by name;
- for coherence or contract-drift findings: the exact discrepancy, the
  affected sites/callers, and the failure or drift scenario.

Prefer the project's own pipeline and data over a synthetic proxy (the
repo's own configuration, the real data set, a real CI build log).

### Phase 3 — Verify every load-bearing claim

Walk each claim a solution depends on down the evidence order in Ground
rules and attach the locator. When a first version of a claim turns out
wrong (it will — cache tiers, response headers and scope boundaries routinely
fool a first pass), update your finding notes
and record that the earlier claim was refuted so the final file explains the
correction rather than silently rewriting.

Adversarial check for expensive claims: before authoring a solution that
depends on inferred framework behaviour, the orchestrator must read the
implementation function end to end. If it is still unclear, dispatch one
`rubber-duk-backend` (REVIEW) or `rubber-duk-frontend` (REVIEW) on an
advanced reasoning model with the claim and the locator, asking it to
refute.

### Phase 4 — Split into findings

One file per defect. A defect qualifies when its cost is quantified, a
bounded fix exists, and the fix can be described to completion. Merge two
observations that share a fix; split one observation that needs two unrelated
fixes. Anything smaller than a solution — a stale header, a tag spelling, a
single outlier page — is still its own file with a short solution section,
never a bullet at the bottom of a bigger one.

Drop what has no cost and no failure scenario. "Would be nicer" is not a
finding.

### Phase 5 — Write each file

Write each finding to `.ai/followups/<domain>/<slug>.md` following
`references/followup-template.md` exactly, in the voice and with the
sections the journal section sets out. Siblings from the same sweep
cross-reference each other by filename.

### Phase 6 — Self-check

Before handing over, for every file:

- `ls` / `grep` every locator it cites — each resolves today;
- each number has a method next to it;
- no inline out-of-scope lists; sibling follow-ups are linked by filename;
- verify the repository tree remains clean per Ground rules (`git status
  --short` and `git diff --stat`);
- the title names the defect, not the fix.

### Phase 7 — Explain, then recap

Write and publish the explainer to the contract in the journal section, from
the finished findings files, and hand the user the URL.

Then recap in chat: one line per file — filename, headline number, the
recommendation — plus the explainer URL, and stop. The user decides what
gets implemented; offer to start any of them, don't start.

## Reference files

- `references/followup-template.md` — the file shape, section by section, and
  the done-criteria.
- `references/measurement-recipes.md` — commands for file stats,
  benchmarks, timing, payload byte counts, build-log retrieval, and the shell
  traps that cost a round trip.
- `docs/conventions/comment-policy.md`, the rest of `docs/conventions/`,
  `.ai/resources/pr-guidelines.md` — the conventions a solution section must
  already satisfy.
- `.ai/followups/README.md` — the naming rule, the file shape, and what is not
  a follow-up.
