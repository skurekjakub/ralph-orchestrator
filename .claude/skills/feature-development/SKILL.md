---
name: feature-development
description: >-
  Use when starting non-trivial feature work in ralph-orchestrator that touches more than one file — "let's build", "add a feature", "implement", "start work on", "design", "new capability", "ship a", "we need to support" — when the user mentions a feature constitution or the README-as-spec pattern, or before firing superpowers:brainstorming, writing-plans, subagent-driven-development or finishing-a-development-branch standalone for feature work. Not for trivial single-file fixes, for a bounded defect (project-bugfixing), or for behaviour-preserving cleanup, moves, renames or dead-code removal (codebase-refactoring).
---

# Feature development

A feature's deliverable is **new behaviour, proven to work** — in tests, in a
browser, and in a design record a future reader can trust: a
`.ai/feature-constitution/<domain>/<slug>/` folder holding the journal of how
the work was thought through and the evergreen `README.md` describing the
feature as it now exists.

The skill has three parts: **Ground rules** bind every phase, **the journal**
is the constitution folder and its contents, and **the phases** define the
workflow in order.

## Ground rules

### When this skill applies

Use it for non-trivial new capability — a new route or endpoint with its UI,
a settings screen, a component rebuilt on a different mechanism (mechanism
and observable behaviour both change), a new integration, or validation
across a whole data model.

Skip it for a typo, one-line bug, copy edit, or dependency bump — just do
the work.

Hand off by deliverable, not size: `codebase-refactoring` when the
deliverable is behaviour-preserving (cleanup, consolidation, module move or
rename sweep, dead-code removal, duplicate-type collapse, breaking a
dependency cycle) — this flow proves new behaviour works, that one proves
nothing else moved; `project-bugfixing` when the deliverable is a bounded,
already-identified defect restored to its intended behaviour.

If unsure, ask: a small change costs an extra README, a skipped big change
costs the design record entirely.

### Seats: who does what, on which model

Every review and implementation seat is a `rubber-duk-*` agent, never
`general-purpose` or a generic reviewer. Pass `model` explicitly on every
dispatch — an omitted `model` inherits the session's, never the intended
choice. Read `.ai/resources/skills/seats.md` before the first dispatch — the
reviewer/implementer routing table, test-authoring delegation,
model-scaling judgement, and per-dispatch prompt requirements live there.

Most phases run on the `superpowers:*` skill the phase table names. If one
is unavailable, say so and ask via `AskUserQuestion` instead of proceeding
silently.

Phase 4 sets out when implementers may run in parallel.

### Every comment follows the comment policy

Read `docs/conventions/comment-policy.md` before writing code in any phase
and again before reviewing a diff — it's enforced, not advisory, and a
violation in the diff is a review finding like any other. Displaced content
has a home: _why this approach_ → commit message; _behaviour that must keep
working_ → test name; _what the code used to be_ → git log; _work left
undone_ → follow-up file.

### Reorganize toward the target structure — don't bolt on

When a feature changes a subsystem's _shape_ — new abstraction, layer,
consolidation, data-access pattern, retired concept — the work isn't done
while the new code sits beside the old. Relocate code to its correct layer,
**rename** modules, directories, exported symbols and types to match the
new vocabulary, delete the superseded module rather than leave it orphaned,
and update every importer. Renaming is expected: diff and git log capture
the move, and an old name kept "for compatibility" has no consumer in a
single-repo codebase.

This is designed in, not bolted on after:

- **Spec:** a **"Refactoring & reorganization"** section — the target module
  tree, the rename list (old → new), and the ripple inventory (importers,
  build and tooling config that names paths — bundler tracing globs, lint
  and boundary allowlists — naming conventions in `docs/conventions/`, and
  tests bound to moved modules).
- **Plan:** moves and renames are tracked tasks with their own verification
  (typecheck plus the affected suites), sequenced so each move lands
  with its importer updates, never a half-migrated tree spanning two
  structures.
- **Review:** a new structure left standing beside the old one is an
  unaddressed finding — "bolted on, not integrated" fails the gate.

Bounded by intent — reorganize what the feature touches, not unrelated
subsystems. Test each module: _"does its location and name still make sense
after this change?"_ If not, move and rename it.

### Scope discipline and follow-ups

The rule against unrelated refactoring holds through every phase, with one
exception: a sync→async flip. The codebase is async-first
(`.ai/agent-working-rules.md` § Design rulings), so a signature
flipped to async and awaited up the chain proposes the required shape; the finding reserved here is a sync escape hatch (a preloaded
snapshot, a sync-after-init accessor) proposed instead of the flip.

The orchestrator — never a subagent — writes deferred work to
`.ai/followups/<domain>/<slug>.md`, per `.ai/followups/README.md`. Future
work never lands in the constitution's implementation artifacts or final
spec — a spec's "Out of scope" section defines non-goals only.

### UI surfaces: tokens and themes

Read `references/ui-surface-rules.md` before landing a feature that
introduces UI surface — a new component, stylesheet, chrome element, or
content renderer. It has the token and theming requirements, the styling
convention with its reference component, and the legacy-styles carve-out.

## The journal

`.ai/feature-constitution/<domain>/<slug>/` holds a feature's implementation
artifacts, final spec, and explainer. Read
`references/constitution-folder.md` before minting a folder or choosing
which existing one a change belongs under: the file-class split, the "does
this belong under an existing constitution" test, the domain roster, and
the `[[slug]]` cross-reference rule.

Read `references/readme-contract.md` before writing or updating `README.md`
in Phase 7: required tone, what to always/never include, the update rule,
and the template.

### The explainer — `explainer.html`

Write it to `.ai/feature-constitution/<domain>/<slug>/explainer.html`; read
`.ai/resources/skills/explainer-contract.md` first — the template, the four
required sections, and the publishing and linking steps.

## The phases

Each phase invokes a separate skill; this skill sequences them and ensures
each artifact lands in `.ai/feature-constitution/<domain>/<slug>/`. The
`superpowers:*` skills default to their own save paths — override them to
point at the constitution folder.

| # | Phase | Skill / tool | Artifact | Skip when |
| --- | --- | --- | --- | --- |
| 0 | Research | `research-planning:iterative-research` | `research.md` | domain is familiar |
| 0.5 | Map unknowns | `research-planning:mapping-unknowns` | `unknowns.md` | the person waves it off in a sentence — record the skip, never argue |
| 1 | Brainstorm | `superpowers:brainstorming` | `spec.md` | never — chat is not a substitute |
| 1.5 | Spec review | `rubber-duk-*` + `superpowers:receiving-code-review` | findings folded into `spec.md` | never |
| 2 | Plan | `superpowers:writing-plans` | `plan.md` (or `plan-track-*.md`) | never |
| 3 | Isolate | `superpowers:using-git-worktrees` | — | already on an isolated feature branch or worktree |
| 4 | Execute | `superpowers:subagent-driven-development` (or `superpowers:executing-plans`) | commits on the branch | never |
| 5 | Smoke test | the running app (`npm run dashboard`) + `agent-browser` | recorded evidence: route, observed behaviour, screenshot | no observable runtime surface |
| 6 | Review | `superpowers:requesting-code-review` + `superpowers:receiving-code-review` + `rubber-duk-*` | findings fixed or rebutted | never |
| 7 | Finish | `.ai/resources/skills/explainer-template.html` + `Artifact` + `superpowers:finishing-a-development-branch` | `README.md` (+ updated `.ai/diagrams/*` if affected) + `explainer.html`, published | never |

### Phase 0 — Research (conditional)

Invoke `research-planning:iterative-research` only when the feature touches an unfamiliar
framework, library, or pattern: three rounds of three parallel WebSearches
with synthesis between rounds, ending in a "Final takeaways" section citing
primary sources. Save to
`.ai/feature-constitution/<domain>/<slug>/research.md`.

Skip when the domain is familiar — don't pad the constitution with a
research file that says "we know how to do this"; its absence is the
signal.

### Phase 0.5 — Map unknowns

Invoke `research-planning:mapping-unknowns` before brainstorming. The roster and the research
(when Phase 0 ran) are the light territory read the pass needs; it reads
little more. The pass maps what the person knows, knows they lack, would
recognise on sight, and has never considered about this feature — one
question per message, closing with the decisions they now own and the
pattern that follows. Save the final map and brief to
`.ai/feature-constitution/<domain>/<slug>/unknowns.md`.

The gate is soft: offer the pass every time, never argue for it. When the
person waves it off in a sentence, write `Unknowns pass: skipped by the
person` as the first line of the spec's open-questions section in Phase 1 and
write no `unknowns.md`. A recorded skip is a decision, not a missing phase.

### Phase 1 — Brainstorm

Invoke `superpowers:brainstorming`, telling it in the same breath to save to
`.ai/feature-constitution/<domain>/<slug>/spec.md`. Its default path sits
outside the project's journal; a spec landing there is misplaced, not merely
unconventional.

The spec captures:

- **Intent** — what problem this solves.
- **Design** — the approach, decisions, alternatives considered, why this
  one.
- **Refactoring & reorganization** — the section the reorganize rule in
  Ground rules requires.
- **Open questions / unknowns** — starts from the known-unknowns row of
  `unknowns.md`, or the one-line skip record; resolved during planning or
  execution.

Chat-only brainstorming doesn't satisfy this phase — the spec survives the
session, chat doesn't.

### Phase 1.5 — Spec review (mandatory)

The moment `spec.md` exists — before any planning — put it in front of the
`rubber-duk-*` reviewers the seats rule names: this gate catches
foundational design flaws in words before Phase 6 catches them in shipped
code, and both run.

Dispatch the relevant reviewers in parallel (one message, multiple `Agent`
calls), each pointed at `spec.md` with an adversarial, domain-scoped mandate
selected by what the spec touches. `rubber-duk-review` hunts false premises,
unjustified sizing, and convention divergence; `rubber-duk-backend` and
`rubber-duk-frontend` evaluate domain architecture and subsystem boundaries;
`rubber-duk-auditor` assesses security exposure; `rubber-duk-tests` (AUDIT)
evaluates planned test strategies when a test plan exists. Skip a reviewer
only when its domain is absent from the spec, or the agent isn't installed
in `.claude/agents/` — and state which and why (e.g. "frontend skipped —
server-side data logic, no visual surface").

Each reviewer verifies the spec's load-bearing claims against the code —
not its say-so — and returns findings as `file:line` + severity (BLOCKER /
IMPORTANT / MINOR), citing primary sources for any framework claim. A
reviewer must not flag a sync→async flip as scope creep — the
scope-discipline rule says why.

Process the findings through `superpowers:receiving-code-review` with real
rigor — verify each against the code, rebut the wrong ones with evidence,
don't perform agreement. Fold accepted findings into `spec.md`: record the
correction and why, and re-size the cost verdict if the review invalidated
its premises. A spec does not advance to Phase 2 with an unaddressed BLOCKER
or IMPORTANT — fix it or rebut it explicitly.

### Phase 2 — Plan

Invoke `superpowers:writing-plans`, overriding its save path to
`.ai/feature-constitution/<domain>/<slug>/plan.md` the same way.

If the work splits into independent tracks, name them `plan-track-a.md`,
`plan-track-b.md`, and so on — each its own bite-sized task list with file
paths, complete code, and exact verification commands.

Don't include "Step N: Commit" tasks — commits happen as a natural
consequence of work, not a scripted task.

Lead the plan with the decisions the person is most likely to change — data
models, type interfaces, anything user-facing — so review effort lands where
changes are likely, mechanical refactoring and wiring go at the bottom, and
a reader who stops after the first third has seen every decision that could
still move.

The moves and renames the spec's "Refactoring & reorganization" section
lists are tracked tasks in the plan, per the reorganize rule in Ground
rules. A plan that adds new structure without relocating the code it
supersedes is incomplete.

### Phase 3 — Isolate

Invoke `superpowers:using-git-worktrees` to isolate the workspace before
execution. Skip when the user is already on an isolated feature branch or
worktree and comfortable working there.

### Phase 4 — Execute

On entering this phase, mirror the plan into the harness's task-tracking
tool (TodoWrite / TaskCreate — whichever the session provides), one tracked
task per plan task, before touching code. Mark each in-progress when
started, completed once its verification passes — never batch-complete at
the end. The plan file's checkboxes are the durable record; the task list is
the live execution state the user watches.

Invoke `superpowers:subagent-driven-development` to dispatch an
implementation subagent per plan task, ensuring each implementer prompt
enforces the Ground rules prompt requirements and triggers the appropriate
`rubber-duk-*` reviewer on task completion — after each task, never batched
to the end. Inline execution via `superpowers:executing-plans` follows the
same mandate.

Parallelism: the default loop is one implementer at a time. For a
multi-track plan, run **non-conflicting** tasks concurrently by dispatching
agents with `isolation: "worktree"` (each gets its own checkout, avoiding
git-index races), batched by disjoint file ownership so the worktree
branches merge conflict-free. Never run two parallel agents writing the same
file (a shared barrel, a shared context module) — combine those tasks into
one agent. Re-derive the dependency graph from file ownership, not the
plan's track order: a UI track and a backend track in disjoint folders can
run fully concurrent even when the plan lists them
sequentially. After each parallel agent reports, merge its worktree branch
into the feature branch, then prune the worktree and its temporary branch
(`git worktree remove <path>` plus branch deletion) — changed worktrees
aren't auto-cleaned and leak disk. The per-track review gate still fires at
each track boundary, over the merged diff.

### Phase 5 — Smoke test (mandatory)

Once implementation is committed and automated tests pass, load the feature
in the running app to catch failures test suites routinely miss: hydration
mismatches, rendering-boundary breaks, unimported styles, or code that
passes in a test environment but fails in the real runtime.

Start the dev server (`npm run dashboard`, http://localhost:3101) — or reuse the one
already running — and drive it with the `agent-browser` skill: open the
feature's route, exercise its behaviour, and confirm zero console errors.
Check the dev server's own output for server-side errors the page never
shows.
For any UI surface, also verify it in every theme the product has, at a
narrow viewport, and under an accessibility pass.

`superpowers:verification-before-completion` applies — no "it works" claim
without having loaded it. Report what you checked (route, behaviour, and a
screenshot if useful) as the phase's evidence. A feature does not advance to
review with an open smoke-test failure.

Skip only when the change has no observable runtime surface (pure build
tooling, a type-only change). Anything a reader can see or interact with —
UI, routes, content renderers, chrome — always smoke-tests.

### Phase 6 — Review

In order:

1. `superpowers:requesting-code-review` — runs against the branch base;
   uncommitted changes are fine to review.
2. `rubber-duk-review` over the full branch diff — mandatory for every
   feature, whatever its size. In parallel, dispatch the domain passes the
   seats rule names: `rubber-duk-backend` (REVIEW) for server/lib changes,
   `rubber-duk-frontend` (REVIEW) for UI, `rubber-duk-auditor` when the diff
   touches a security-sensitive surface.
3. `rubber-duk-tests` (AUDIT) for unit/integration test changes and
   `rubber-duk-e2e` (AUDIT) for e2e test changes, whenever test files change — a
   separate gate from the general review.
4. `superpowers:receiving-code-review` — process all feedback from steps 1–3
   with technical rigor, not performative agreement.

Findings specific to this flow a reviewer should be asked to hunt:

- a new structure left standing beside the old one — "bolted on, not
  integrated" (Ground rules § Reorganize toward the target structure —
  don't bolt on)
- forbidden compatibility aliases or re-export shims (same section)
- forbidden archaeology comments (Ground rules § Every comment follows the
  comment policy)
- an undocumented function or a narrative comment (same section)

A feature does not pass Phase 6 with an unaddressed finding, or an open
BLOCKER/IMPORTANT from the test audit — dispatch implementation subagents
(or fix inline if trivial) and rebut any rejected findings explicitly.

### Phase 7 — Finish

The orchestrator writes `README.md` first, brings `.ai/diagrams/` in line
with the code, walks the definition of done, then invokes
`superpowers:finishing-a-development-branch` so the constitution and
diagrams land in the same PR as the implementation.

**README.** Rewrite from scratch against the current codebase state, in the
journal section's tone and shape — not an edit of the spec or plan files;
treat the implementation artifacts as source material to skim, not text to
transplant. Update an existing parent constitution's `README.md` too when
the feature changed a shape it describes.

**Diagrams.** `.ai/diagrams/` orients a fresh agent in a subsystem before it
touches code; a diagram naming a deleted module, renamed layer, or
superseded flow is confidently wrong yet read as ground truth.
Read the table in `.ai/diagrams/README.md` and open each diagram whose
subsystem the feature touched — a path, name, layer, or responsibility
change affects a diagram even when its box isn't redrawn. Verify every path,
module, function, and route a touched diagram names still exists (`grep` or
`ls` them, don't trust the diagram's claim). Add a diagram for a subsystem
that has none — new layer, engine, or data-access pattern → new
`.ai/diagrams/<subsystem>.md`, plus its row in the diagrams `README.md`
table and a mention in the reading order if it belongs there. Follow the
README's current-state tone (no historical framing, branch names, or commit
SHAs) — a feature doesn't finish with a diagram that contradicts the tree it
ships.

**Definition of done**, the last gate before finishing: open every
`.ai/dod/` checklist whose surface the feature touched and walk it item by
item against the branch diff — a **must** item is met or the feature isn't
done, an **if relevant** item is met or you state why it doesn't apply.
Where unmet, dispatch an implementer to fix the code (or fix inline if
trivial) and re-check; never edit the checklist to pass the work. Report the
walk — which checklists, which items didn't apply and why — as evidence,
and say plainly when no checklist covers the surface.

**Explainer.** Once the final review is clean and `npm test` exits 0
on the final tree, write and publish `explainer.html` per the journal
section's contract and hand the user the URL — it goes in the PR body, and
once the PR exists, comment on the tracker issue (if the work has one) with
the PR link and the
explainer link.
File any GitHub issues this needs with the `file-github-issue` skill.

## Reference files

- `references/constitution-folder.md` — the file-class split, minting vs.
  reusing a folder, choosing a domain, and the `[[slug]]` cross-reference
  rule.
- `references/readme-contract.md` — the README's required tone, what to
  always/never include, the update rule, and the template.
- `references/ui-surface-rules.md` — tokens, themes and the styling
  convention for new UI surface.
- `.ai/resources/skills/seats.md` — reviewer/implementer routing, test
  authoring delegation, and model scaling, shared with `codebase-refactoring`.
- `.ai/resources/skills/explainer-contract.md` — the explainer template, its
  four required sections, and publishing steps, shared across the
  per-feature flows.
