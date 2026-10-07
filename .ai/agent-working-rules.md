# Agent working rules

> **Adapt me.** Standing rulings for agents working
> in ralph-orchestrator. Edit freely: delete rules your team doesn't hold, add
> the ones you keep repeating. This file is imported from `CLAUDE.md`, so every
> session reads it.

Standing rulings the repository owner has given agents working in this
checkout. `git log` on this file is the only date a ruling carries, so read it
when a rule looks stale.

Every section is bullets. A bullet is one rule, its reason when the reason is
not obvious, and how to apply it.

---

## 1. Talking to the user

- **Bullets, never paragraphs, in the terminal reply.** Lead with the outcome
  on one line, then one fact per bullet. Anything that needs several sentences
  belongs in a file (spec, follow-up, commit body, PR description), where
  prose is still correct.
- **Plain language first.** Say what breaks, what it means and why it matters
  before any `file:line` chain or type name. Say "throws" or "fails the build";
  never "loud-fail" or "eager-fail".
- **No gratuitous counting.** File counts, line counts and "every member of
  the set" enumerations don't belong in replies, plans, audits or comments.
  Benchmarks, measured costs and thresholds a decision turns on stay, with
  their method.
- **Answer at the end of the turn.** Do the tool work first, then reply in one
  text block.

## 2. Subagents, handoffs and scratch files

- **Before compaction, write a handoff** into the work's own journal folder —
  `.ai/refactoring/NNN-<slug>/` for a refactor,
  `.ai/bugfixes/NNN-<slug>/` for a fix,
  `.ai/feature-constitution/<domain>/<slug>/` for a feature — as
  `<date>-handoff.md`, untracked: where the run is, what is running and where
  its output lands, next steps in order, decisions made, accumulated user
  instructions, scratchpad paths. The handoff belongs beside the spec and plan
  it hands off, not in a directory of its own.
- **Working files go where the skill driving the work says**, which for every
  `superpowers:*` skill used by the workflows is that same journal folder —
  their upstream defaults under `docs/superpowers/` are overridden on every
  invocation, and a file left at the default is misplaced.
- **Transient scratch** (lane reports, TSVs, command output, commit-message
  files) goes under `.cache/claude-scratch/<lane>/` (git-ignored), not the
  system temp directory, which may not survive the session.

## 3. Design rulings

- **Async-first.** When a function comes to depend on an async read, make the
  function itself async instead of blocking or caching around it.
- **Refactor first.** Before adding code, scan the touched area for
  duplication and fold it into a shared helper as part of the task.
- **Audit dedup against the whole tree.** For every hand-rolled helper a
  diff introduces (regex, pool, walker, formatter, parser), search the whole
  source tree for an existing equivalent, not just the feature's siblings.
  Report "checked, legitimately new" beside the misses.
- **Dead is dead, whatever the doc says.** An unreachable branch kept "for
  extensibility" goes, even when a doc says "dormant, do not delete". Record
  the doc's scenarios in the change's spec and commit message, then delete the
  code, the guard and the doc. Exception: `ClaudeCodeExecutor` and the
  `cli: "claude"` paths are unreachable today but are the Claude Code runtime
  being built (AGENTS.md § Subsystems) — don't delete them.

## 4. Comments and docblocks

`docs/conventions/comment-policy.md` is the policy; these corrections are
enforced on top of it:

- **No archaeology, including comparative framing.** Not only "X removed" but
  "replaces X", "mirrors the old contract", "now uses…". No absence
  annotations marking where something was deleted. When ripping out X, delete
  every comment mentioning X and describe the current state as if the code had
  always been this way.
- **Test phases are labelled.** Each test body gets `// Arrange`, `// Act`,
  `// Assert` above the first statement of each phase (`// Act & Assert` when
  one expression; absent phase, no label; the label is the whole comment).
- **Comment audits fix comments only.** Naming, fixture and structure
  findings are reported and filed in one batch; the audit never fixes them.

## 5. Tests

- **No test asserts against shipped production data.** Tests own their
  fixtures; production content changes without anyone reading the test suite.
  The exception is the template lint tests
  (`tests/container/template-integration.test.ts`,
  `template-context-lint.test.ts`), which render the shipped templates on
  purpose to catch Liquid errors and undeclared variables.
- **Verify with the right gate.** `npm test` covers only the root `tests/**`
  suite; a change in `dashboard-local/`, `ralph-dashboard/`,
  `shared/mcp-servers/<name>/` or `ralphchives/sync/` also needs that
  package's own `lint` / `test` / `build`, run inside its directory.

## 7. Finishing a branch and deferred work

- **A workflow branch finishes on three things:** the explainer artifact
  published, the PR opened, and a comment on the tracker issue linking both.
  Publish the explainer first so the PR body and the issue comment can carry
  its URL. The user reads the explainer instead of the diff.
- **Explainer shape:** a broad summary of the changes, then a simplified
  explainer, then a thorough walkthrough, then a question-and-answer section
  for the user to test their understanding
  (`.ai/resources/skills/explainer-contract.md`).
- **Deferred work goes in `todo.md`** at the root of the main checkout
  (git-ignored), under its matching section (deferred decisions, known
  issues, ideas). It is never folded into a spec, plan, README or commit.
  Leave the owner's own notes in that file as they are.
- **Follow-ups from a move wait for the new paths**, so their locators
  resolve.
- **A deferred item becomes a GitHub issue only when the user asks.** File it
  with the `file-github-issue` skill.

## 8. Tooling notes

### agent-browser

- `press Alt+r` delivers a proper keydown with the modifier set.
  `keydown Alt` followed by `keydown t` does not: `altKey` and `repeat` are
  always false. For autorepeat or modifier-hold checks, dispatch a synthetic
  `KeyboardEvent` via `eval --stdin` with the flags set; neither dashboard has
  a browser e2e suite to fall back on.
