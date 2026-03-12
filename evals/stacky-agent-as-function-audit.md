# Stacky DevRalph Workflow — Agent-as-Function Audit

**Date:** 2025-07-22
**Scope:** Full prompt-level audit of the Stacky multi-agent workflow (orchestrator + 6 subagents, standard + revision flows)
**Status:** Critical and high findings fixed. Medium and low findings documented.

---

## Files Audited

### Orchestrator & Subagent Prompts
- `profiles/ralph-docs/agents/ralph.stacky.agent.md`
- `profiles/ralph-docs/agents/ralph.stacky-analyst.agent.md`
- `profiles/ralph-docs/agents/ralph.stacky-coder.agent.md`
- `profiles/ralph-docs/agents/ralph.stacky-test-writer.agent.md`
- `profiles/ralph-docs/agents/ralph.stacky-e2e-playwright.agent.md`
- `profiles/ralph-docs/agents/ralph.stacky-reviewer.agent.md`
- `profiles/ralph-docs/agents/ralph.stacky-bug-auditor.agent.md`

### Workflow Skill & References
- `shared/skills/workflow/docs/devralph-workflow/SKILL.md`
- `shared/skills/workflow/docs/devralph-workflow/references/1-setup.md`
- `shared/skills/workflow/docs/devralph-workflow/references/2-research.md`
- `shared/skills/workflow/docs/devralph-workflow/references/3-implement.md`
- `shared/skills/workflow/docs/devralph-workflow/references/4-test.md`
- `shared/skills/workflow/docs/devralph-workflow/references/5-e2e.md`
- `shared/skills/workflow/docs/devralph-workflow/references/6-review.md`
- `shared/skills/workflow/docs/devralph-workflow/references/7-commit.md`
- `shared/skills/workflow/docs/devralph-workflow/references/8-pr.md`
- `shared/skills/workflow/docs/devralph-workflow/references/9-handoff.md`
- `shared/skills/workflow/docs/devralph-workflow/references/r1-setup.md`
- `shared/skills/workflow/docs/devralph-workflow/references/r2-fix.md`
- `shared/skills/workflow/docs/devralph-workflow/references/r3-commit.md`
- `shared/skills/workflow/docs/devralph-workflow/references/r4-handoff.md`

### Agent Includes
- `shared/agent-includes/ralph-docs/devralph-standard-workflow.md`
- `shared/agent-includes/ralph-docs/devralph-revision-workflow.md`
- `shared/agent-includes/agent-as-function-contract.md`

### Infrastructure
- `profiles/ralph-docs/profile.json`
- `src/container/result-parser.ts`
- `tests/container/container-result-parser.test.ts`

### Domain Skills (mounted on Stacky variant)
- `shared/skills/domain/devralph-ruby-gems/SKILL.md`
- `shared/skills/domain/devralph-gulp-pipeline/SKILL.md`
- `shared/skills/domain/devralph-frontend/SKILL.md`
- `shared/skills/domain/devralph-jekyll-site/SKILL.md`
- `shared/skills/domain/devralph-build-verification/SKILL.md`
- `shared/skills/integrations/ralph-ado-pr-workflow/SKILL.md`
- `shared/skills/integrations/ralph-ralphchives/SKILL.md`

---

## Ownership Map

| Agent | Role | Reads | Writes | Result codes |
|---|---|---|---|---|
| **stacky** (orchestrator) | Pure router + admin | `status.json` only | commit, push, PR, JIRA, handoff, exit block | N/A |
| **stacky-analyst** | Analysis | repo code, ralphchives | `output.md`, `status.json`, `manifest.json` | `analyzed`, `blocked` |
| **stacky-coder** | Implementation | analyst `output.md`, reviewer/bug-auditor `output.md` (iter 2+) | `output-v{N}.md`, `status.json`, `manifest.json` | `implemented`, `partial` |
| **stacky-test-writer** | Unit/integration tests | code diff, spec/ directory | `output.md`, test spec files, `status.json`, `manifest.json` | `tests-written`, `no-tests-needed` |
| **stacky-e2e-playwright** | E2E tests | code changes description | `output.md`, test files, `status.json`, `manifest.json` | `tests-written`, `no-tests-needed` |
| **stacky-reviewer** | Code review | git diff | `output.md`, `status.json`, `manifest.json` | `pass`, `critical`, `suggested` |
| **stacky-bug-auditor** | Bug/regression audit | git diff | `output.md`, `status.json`, `manifest.json` | `pass`, `concerns`, `block` |

---

## Findings

### Critical — FIXED

**C1. Exit-block field names were case-incompatible with the result parser.**

The workflow templates in `references/9-handoff.md` and `references/r4-handoff.md` emitted lowercase field names (`status:`, `pr_url:`) while the parser at `src/container/result-parser.ts` used case-sensitive regexes expecting `STATUS:` and `PR_URL:`. If the agent followed the template literally, `agentStatus` resolved to `undefined` and fell back to exit-code heuristics. For `partial` and `blocked` statuses, the fallback silently promoted them to `completed` (exit code 0) or `error` (nonzero).

**Fix:** Made parser regexes case-insensitive (`/i` flag). Updated templates to use uppercase field names as the preferred convention. Added test case for lowercase fields.

---

**C2. The "pure router" status.json rule contradicted workflow reference instructions.**

The orchestrator prompt stated "Never read any `output.md` from subagents — only `status.json`" but workflow references 2-research.md, 3-implement.md, and 4-test.md required the orchestrator to validate detailed content from subagent output (impacted files, build status, test file paths) — information not available in the ~100 token `status.json` summary.

**Fix:** Updated workflow references to route on `status.json` fields (`result`, `summary`) instead of requiring content validation from `output.md`. Downstream subagents read each other's artifacts directly; the orchestrator doesn't need to.

---

### High — FIXED

**H1. Ordering constraints conflicted with the `partial` routing path.**

The ordering constraints said "You MUST dispatch stacky-test-writer AFTER implementation, BEFORE committing" and "You MUST dispatch stacky-reviewer and stacky-bug-auditor BEFORE committing." But the routing table said `stacky-coder → partial → Skip the QA loop and proceed to commit with partial status`.

**Fix:** Added an explicit exception to the ordering constraints for when the coder returns `partial`.

---

**H2. E2E agent referenced Playwright skills not mounted in the container.**

The `stacky-e2e-playwright` prompt referenced `playwright-best-practices` and `playwright-cli` as required skills. These exist only at `.github/skills/` in the orchestrator repo — not in `shared/skills/` — and are not in the stacky variant's skills array. They would not be available inside the Docker container.

**Fix:** Replaced the skill-loading instructions with inline Playwright guidance covering the same principles (locator strategy, assertion patterns, test independence).

---

**H3. Iterative subagent prompts used non-versioned filenames, violating the artifact contract.**

The artifact contract classified "writer, coder, reviewer, validator" as iterative agents requiring `output-v{N}.md`. The reviewer and test-writer prompts used `output.md` instead. Both can be re-dispatched, overwriting previous output.

**Fix:** Updated the artifact contract to distinguish two categories: agents that accumulate work across dispatches (coder → versioned files) vs. agents re-dispatched for fresh evaluation (reviewer, test-writer → `output.md` because only the latest result matters). This matches the actual design intent and data-flow patterns.

---

### Medium — NOT FIXED (documented)

**M1. Exit-block status values drifted between template and parser.**

The workflow templates used `complete` while the parser recognized `completed` (past tense). Even with the case-insensitive fix (C1), the value `complete` would trigger the unrecognized-status warning and fall back to exit-code resolution.

**Status:** Partially fixed — templates now use `completed`. The parser's case-insensitive regex also catches any residual lowercase/mixed-case variations.

---

**M2. Ralphchives post-task report not reinforced in workflow phases.**

The mounted `ralph-ralphchives` skill says to post a task summary before exiting. Neither `9-handoff.md` nor `r4-handoff.md` mention posting to ralphchives. The agent may or may not follow the skill's instruction, leading to inconsistent knowledge-base coverage.

---

**M3. The orchestrator writes the handoff file itself, weakening the "pure router" claim.**

Writing a structured handoff document is substantive document creation, not a routing decision. While explicitly listed under "What you do yourself," this blurs the ownership model. Worth tracking if a future refactor delegates handoff writing to a subagent.

---

### Low — NOT FIXED (documented)

**L1. Reviewer `suggested` result triggers the same action as `critical`.**

The routing table maps both `critical` and `suggested` to re-dispatching the coder, but `suggested` is defined as "Only suggested improvements, no blockers." The condition "if any blocking QA result exists" is ambiguous about whether `suggested` alone triggers re-dispatch.

---

**L2. Subagents lack independent skill mounts.**

All six subagents inherit the orchestrator stage's full `skills` array. There is no least-privilege at the skill layer — every subagent gets every skill.

---

**L3. Max-iteration count (2) appears only in the orchestrator prompt.**

The "Maximum 2 coder/review iterations" rule is not reinforced in any workflow reference file. In long sessions, the orchestrator may lose track of this limit.

---

## Open Questions

1. **Should the revision workflow search ralphchives?** Phase r1-setup.md already says to search, but the standard workflow's ralphchives post-task report is never referenced in the handoff phases.

2. **Should `suggested` be a no-op for re-dispatch?** If only `critical` should trigger a coder re-dispatch, the routing table should map `suggested` → proceed to bug audit (same as `pass`).

3. **Should the max-iteration count be in the workflow reference files?** Adding it to `references/6-review.md` and `references/r2-fix.md` would make it visible when the orchestrator is in the review phase.

---

## Residual Risks

The C1/M1 case-and-value mismatch was the highest-impact issue. Before the fix, `partial` and `blocked` agent statuses were silently lost, causing wrong JIRA status transitions. The parser is now case-insensitive, and templates use the correct `completed` value, eliminating this class of silent failure.

The remaining medium/low findings are degradation risks rather than immediate failures. M2 (ralphchives) causes inconsistent knowledge coverage. M3 (handoff ownership) creates a design seam. L1-L3 are cleanup items that reduce the risk of future regressions.
