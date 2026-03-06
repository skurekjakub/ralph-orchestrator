## Stacky ⚡ — Workflow Overview

### Trigger

A JIRA comment containing **`@RalphDev`** on an issue in the **DF** project with status **"To Do"** or **"Defect Found"**. The orchestrator transitions the issue to **"In Progress"**, renders the agent template, and launches a Docker container running the Copilot/Claude CLI.

### Workflow Selection

The template checks `isRevision` (true when the issue status is in `revisionStatuses`, i.e., **"Defect Found"**):

```
                         ┌─────────────────┐
                         │   @RalphDev      │
                         │   comment on     │
                         │   JIRA issue     │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  isRevision?      │
                         └──┬───────────┬────┘
                       NO   │           │  YES
               ┌────────────▼──┐   ┌────▼────────────┐
               │  Standard     │   │  Revision        │
               │  Workflow     │   │  Workflow         │
               │  (9 phases)   │   │  (4 phases)       │
               └───────────────┘   └──────────────────┘
```

---

### Standard Workflow (new task — 9 phases)

```
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  state.md is the single source of truth — read before every phase        │
 └───────────────────────────────────────────────────────────────────────────┘

  Phase 1 ─ SETUP                          Skill: devralph-workflow-setup
  ├─ Create feature branch
  ├─ Set up scratchpad at .ralph/tasks/<taskId>/
  ├─ Search ralph-ralphchives for prior art & context
  └─ Classify affected components (→ loads domain skills)

                          │
                          ▼
  Phase 2 ─ RESEARCH                       Skill: devralph-workflow-research
  ├─ Read existing code in every file area being touched
  ├─ Trace integration points across the stack
  └─ Create detailed implementation plan in state.md

                          │
                          ▼
  Phase 3 ─ IMPLEMENT                      Skill: devralph-workflow-implement
  ├─ Execute code changes per the plan
  ├─ Run `npm run build` after EVERY edit
  ├─ Run `npx gulp rspec_tests` if any Ruby gem changed
  └─ Verify rendering with `npm run serve` for UI changes

                          │        ┌──────────────────────────────────────┐
                          ▼        │  DOMAIN SKILLS consulted as needed:  │
  Phase 4 ─ TEST                   │  • devralph-ruby-gems               │
  ├─ Write unit/integration tests  │  • devralph-gulp-pipeline           │
  └─ Delegates to ─────────────►   │  • devralph-frontend                │
     stacky-test-writer sub-agent  │  • devralph-jekyll-site             │
        Skill: devralph-workflow-  │  • devralph-build-verification      │
               test                └──────────────────────────────────────┘

                          │
                          ▼
  Phase 5 ─ E2E
  ├─ Write Playwright E2E tests (UI changes only)
  └─ Delegates to ──────────────►  stacky-e2e-playwright sub-agent
        Skill: devralph-workflow-e2e
        Also loads: playwright-best-practices, playwright-cli

                          │
                          ▼
  Phase 6 ─ REVIEW
  ├─ Self-review gate (two sub-agents invoked in sequence)
  │   ├─ stacky-reviewer ──────►  Code quality, consistency, correctness
  │   └─ stacky-bug-auditor ───►  Regressions, breaking changes, edge cases
  ├─ If issues found → loop back to Phase 3 (Implement)
  └─ If clean → proceed
        Skill: devralph-workflow-review

                          │
                          ▼
  Phase 7 ─ COMMIT                         Skill: devralph-workflow-commit
  ├─ Final `npm run build` verification
  ├─ Stage & commit with prefix `dev(<taskId>):`
  └─ Push to remote

                          │
                          ▼
  Phase 8 ─ PR                             Skill: devralph-workflow-pr
  └─ Create ADO pull request via REST API
        Also loads: ralph-ado-pr-workflow

                          │
                          ▼
  Phase 9 ─ HANDOFF & EXIT                 Skill: devralph-workflow-handoff
  ├─ Write handoff document (.ralph/tasks/<taskId>/handoff.md)
  ├─ Comment on JIRA with summary
  ├─ Attach handoff to JIRA issue
  └─ Print ===RALPH_RESULT_START=== exit block
```

---

### Revision Workflow (fixing defects — 4 phases)

```
  Phase 1 ─ SETUP                          Skill: devralph-workflow-revision-setup
  ├─ Read previous handoff document
  ├─ Parse reviewer feedback from JIRA comments
  ├─ Search ralph-ralphchives for relevant context
  └─ Create fix plan in state.md

                          │
                          ▼
  Phase 2 ─ FIX                            Skill: devralph-workflow-revision-fix
  ├─ Implement fixes addressing each defect
  ├─ Run build + tests after each fix
  └─ Update/add tests as needed

                          │
                          ▼
  Phase 3 ─ COMMIT                         Skill: devralph-workflow-revision-commit
  ├─ Stage & commit with prefix `fix(<taskId>):`
  └─ Push to update existing PR

                          │
                          ▼
  Phase 4 ─ HANDOFF & EXIT                 Skill: devralph-workflow-revision-handoff
  ├─ Update handoff document with what was fixed
  ├─ Comment on JIRA
  └─ Print exit block
```

---

### Sub-Agent Delegation

Stacky delegates specialized work to 4 sub-agents declared in the template frontmatter:

| Sub-Agent | Invoked In | Purpose |
|-----------|-----------|---------|
| **stacky-test-writer** | Phase 4 (Test) | Writes RSpec unit tests for Ruby gems, integration tests for complex flows |
| **stacky-e2e-playwright** | Phase 5 (E2E) | Writes Playwright browser tests for UI-facing changes; loads `playwright-best-practices` + `playwright-cli` skills |
| **stacky-reviewer** | Phase 6 (Review) | Reviews diff for code quality, convention adherence, correctness |
| **stacky-bug-auditor** | Phase 6 (Review) | Analyzes changes for regressions, breaking backward compatibility, edge cases |

### Skill Inventory (20 total)

| Category | Skills |
|----------|--------|
| **Domain** (5) | `devralph-ruby-gems`, `devralph-gulp-pipeline`, `devralph-frontend`, `devralph-jekyll-site`, `devralph-build-verification` |
| **Standard workflow** (9) | `devralph-workflow-setup` through `devralph-workflow-handoff` |
| **Revision workflow** (4) | `devralph-workflow-revision-setup` through `devralph-workflow-revision-handoff` |
| **Integration** (2) | `ralph-ado-pr-workflow`, `ralph-ralphchives` |

### State Machine

The `state.md` file at `.ralph/tasks/<taskId>/state.md` acts as persistent memory across phases — Stacky reads it before every phase and updates it after. This prevents context loss if the session is interrupted and resumed via the continuation loop.

### JIRA Status Transitions

```
To Do ──(@RalphDev)──► In Progress ──(success)──► Ready for Review
                                     ──(blocked)──► (stays In Progress, handoff explains)

Defect Found ──(@RalphDev)──► In Progress ──(success)──► Ready for Review
                               (revision workflow)
```