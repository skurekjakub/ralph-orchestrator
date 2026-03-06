# Implementation Plan: Agent-as-Function for ralph.ralph (ralph-vscode)

> Branch: `feat/agent-as-function`
> Target profile: `ralph-vscode`
> Target agent chain: `ralph.ralph` → `ralph-analyst`, `ralph-coder` (new), `ralph-reviewer` (new)
> Also in scope: post-hook agents `run-analyzer`, `agent-improver`

---

## Summary

Refactor ralph.ralph from a monolithic agent (researches, codes, tests, commits, pushes, reviews, hands off) into a **pure router** that dispatches purpose-built subagents and routes based on `status.json` responses. Ralph retains only administrative duties: commit, push, PR, JIRA, handoff.

See [AGENT-AS-FUNCTION.md](../AGENT-AS-FUNCTION.md) for the full pattern spec.

---

## Subagent Roster

| Agent | Role | Model | New? | Input | Output |
|---|---|---|---|---|---|
| `ralph-analyst` | Researcher | Sonnet | Exists (modify) | JIRA issue + codebase. On revisions: PR feedback + prior handoff | `output.md`: implementation plan (or revision fix plan) |
| `ralph-coder` | Implementer | Opus | **NEW** | `ralph-analyst/output.md`. On iteration 2+: also `ralph-reviewer/output-v{N-1}.md` | `output-v{N}.md`: change summary + build/lint/test results |
| `ralph-reviewer` | Self-reviewer | Sonnet | **NEW** | `ralph-coder/output-v{N}.md` + actual changed files in repo | `output-v{N}.md`: review findings, per-file feedback |

### Post-hook agents (local, host-side)

| Agent | Input | Output |
|---|---|---|
| `run-analyzer` | Task log directory | `output.md`: execution analysis |
| `agent-improver` | `run-analyzer/status.json` → if `issues-found`, reads `run-analyzer/output.md` | `output.md`: improvement summary |

### Result codes

| Agent | `result` values | Orchestrator action |
|---|---|---|
| `ralph-analyst` | `analyzed` | Always → dispatch coder |
| `ralph-coder` | `implemented` / `partial` | `implemented` → dispatch reviewer · `partial` → skip to commit with partial status |
| `ralph-reviewer` | `pass` / `fail` | `pass` → commit · `fail` → dispatch coder again (max 2 iterations) |
| `run-analyzer` | `issues-found` / `clean` | Passed to agent-improver via artifact |
| `agent-improver` | `improved` / `no-action` | Terminal |

---

## Workflow: Standard (new task)

```
ralph.ralph (orchestrator)
  │
  │ Phase 1: Setup
  │   ralph does: branch verify, state.md init, JIRA greeting
  │
  │ Phase 2: Analyze
  │   dispatch ralph-analyst → read status.json (result: analyzed)
  │
  │ Phase 3: Implement & Review Loop (max 2 iterations)
  │   ┌─ dispatch ralph-coder → read status.json
  │   │   result: partial → skip to Phase 5 (commit with partial)
  │   │   result: implemented → dispatch reviewer
  │   │
  │   ├─ dispatch ralph-reviewer → read status.json
  │   │   result: pass → proceed to Phase 4
  │   │   result: fail, iteration < 2 → dispatch coder again
  │   │   result: fail, iteration = 2 → accept, proceed to Phase 4
  │   └─ (loop)
  │
  │ Phase 4: Commit & Push (ralph does via MCP: git add, commit, ado_push_progress)
  │ Phase 5: PR (ralph does via MCP: ado_create_pull_request)
  │ Phase 6: Handoff & Exit (ralph does: handoff file, JIRA comment+attachment, exit block)
```

## Workflow: Revision (fixing a reviewed PR)

```
ralph.ralph (orchestrator)
  │
  │ Phase 1: Understand
  │   ralph does: read state.md, find existing PR/branch
  │
  │ Phase 2: Analyze Revision
  │   dispatch ralph-analyst (revision mode) → read status.json
  │   analyst reads PR feedback, prior handoff, JIRA comments ITSELF
  │   analyst produces output.md scoped to "what needs fixing"
  │
  │ Phase 3: Fix & Review Loop (max 2 iterations)
  │   same coder → reviewer loop as standard workflow
  │
  │ Phase 4: Commit & Push (ralph does)
  │ Phase 5: Handoff & Exit (ralph does: update handoff, JIRA, exit block)
```

---

## Artifact Directory Structure

```
.ralph/tasks/{taskId}/artifacts/
├── manifest.json
├── ralph-analyst/
│   ├── output.md              # implementation plan (or revision plan)
│   └── status.json
├── ralph-coder/
│   ├── output-v1.md           # iteration 1 change summary
│   ├── output-v2.md           # iteration 2 (if reviewer fails v1)
│   └── status.json
├── ralph-reviewer/
│   ├── output-v1.md           # review of coder's v1
│   ├── output-v2.md           # review of coder's v2 (if loop continues)
│   └── status.json
```

Post-hooks (local):
```
{hook.outputDir}/artifacts/
├── manifest.json
├── run-analyzer/
│   ├── output.md
│   └── status.json
├── agent-improver/
│   ├── output.md
│   └── status.json
```

---

## Implementation Steps

### Phase A: Shared Contract

#### A1. Create `shared/agent-includes/agent-as-function-contract.md`

Shared Liquid partial that every subagent renders. Defines:
- Artifact directory structure and creation rules
- `status.json` schema with field descriptions
- `manifest.json` append-only format
- Versioning convention (`output-v{N}.md`)
- Conversational return format: one line, never artifact content
- Manifest initialization: first agent creates `[]`, subsequent agents read-append-write

**Depends on:** nothing

---

### Phase B: Subagent Templates

#### B1. Refactor `ralph-analyst` — `profiles/ralph-vscode/agents/ralph.ralph-analyst.agent.md`

Changes:
- Add `{% render 'agent-as-function-contract' %}` section
- Redirect "Output Format" section: same markdown structure written to `.ralph/tasks/{taskId}/artifacts/ralph-analyst/output.md`
- Write `status.json` with `result: analyzed`
- Append to manifest.json
- Final return: one-line status
- Add ralphchives search: analyst searches ralphchives (via MCP) for prior art and includes relevant findings in its output
- Add revision mode: when `isRevision` is true, analyst reads PR feedback, prior handoff, reviewer comments from JIRA/ADO itself, produces a fix-focused plan instead of a fresh implementation plan

**Depends on:** A1

#### B2. Create `ralph-coder` — `profiles/ralph-vscode/agents/ralph.ralph-coder.agent.md`

New agent template. Model: Opus.

Content to carry over from current `ralph.ralph.agent.md`:
- Ordering constraints (build before commit, `npm run test:xvfb`, push via MCP — actually coder doesn't push, so only build/test constraints)
- Known failure patterns (uncommitted build failure, hallucinated APIs, wrong test command)
- Target repo orientation: read `.github/copilot-instructions.md`

Content to carry over from current `ralph.ralph-analyst.agent.md`:
- Architecture section (definition-driven design, key areas table, how features are added, testing, build)
- This gives the coder full repo context without needing an extra read

New content:
- Artifact contract (`{% render 'agent-as-function-contract' %}`)
- Input: read `ralph-analyst/output.md` for implementation plan. On iteration 2+, also read `ralph-reviewer/output-v{N-1}.md` for feedback.
- Do the work: implement changes, run `npm run build`, `npm run lint`, `npm run test:xvfb`. Handle obvious build failures internally (fix and retry within session).
- Output `output-v{N}.md`: files modified, what changed, build/lint/test results
- Write `status.json`: `result: implemented | partial`
- Rules: never commit, never push, never interact with JIRA/ADO. Implementation only.

Skills needed:
- None of the workflow skills (those are orchestrator concerns)
- Maybe a dedicated `vscode-coder-implement` skill with implementation-specific instructions

**Depends on:** A1

#### B3. Create `ralph-reviewer` — `profiles/ralph-vscode/agents/ralph.ralph-reviewer.agent.md`

New agent template. Model: Sonnet.

Content:
- Artifact contract (`{% render 'agent-as-function-contract' %}`)
- Input: read `ralph-coder/output-v{N}.md` for what changed + read actual files in the repo
- Run full validation: `npm run build`, `npm run lint`, `npm run test:xvfb`
- Review checklist: code correctness, pattern compliance (read `.github/copilot-instructions.md`), test coverage, API consistency
- Target repo architecture section (same as coder — reviewer needs to know patterns to review against)
- Output `output-v{N}.md`: per-file findings, pass/fail per check, specific corrections needed
- Write `status.json`: `result: pass | fail`, `next_hint: ralph-coder` if fail
- Rules: read-only — never edit files. Review only.

Skills needed:
- Maybe a dedicated `vscode-reviewer-checklist` skill

**Depends on:** A1

---

### Phase C: Orchestrator Rewrite

#### C1. Rewrite `ralph.ralph.agent.md`

Transform from monolithic implementer to pure router with admin duties.

Remove:
- All implementation/coding instructions
- Build/lint/test validation (coder's job)
- The execute phase content

Keep:
- Agent identity / personality
- Prompt contract section
- Security section
- Error handling (adapted for routing: if coder fails → partial, if analyst fails → blocked)
- Naming conventions (commit prefix, workload dir)

Add:
- `agents: ["ralph-analyst", "ralph-coder", "ralph-reviewer"]` in frontmatter
- Orchestration routing logic: dispatch sequence, status.json reading pattern
- Iteration tracking: max 2 coder→reviewer rounds
- What ralph does himself: commit, push, PR, JIRA, handoff
- Ordering constraint: read every `status.json` before routing

**Depends on:** B1, B2, B3

#### C2. Rewrite `shared/agent-includes/ralph-vscode/ralph-standard-workflow.md`

New phase structure:

| Phase | Skill | Who does it |
|-------|-------|-------------|
| 1. Setup | vscode-workflow-setup | Ralph (orchestrator) |
| 2. Analyze | vscode-workflow-analyze | Ralph dispatches analyst |
| 3. Implement & Review | vscode-workflow-implement-loop | Ralph dispatches coder → reviewer → loop |
| 4. Commit & Push | vscode-workflow-commit | Ralph (orchestrator) |
| 5. PR | vscode-workflow-pr | Ralph (orchestrator) |
| 6. Handoff & Exit | vscode-workflow-handoff | Ralph (orchestrator) |

**Depends on:** C1

#### C3. Rewrite `shared/agent-includes/ralph-vscode/ralph-revision-workflow.md`

| Phase | Skill | Who does it |
|-------|-------|-------------|
| 1. Understand | vscode-workflow-revision-setup | Ralph (orchestrator) |
| 2. Analyze Revision | vscode-workflow-analyze | Ralph dispatches analyst (revision mode) |
| 3. Fix & Review | vscode-workflow-implement-loop | Ralph dispatches coder → reviewer → loop |
| 4. Commit & Push | vscode-workflow-revision-commit | Ralph (orchestrator) |
| 5. Handoff & Exit | vscode-workflow-revision-handoff | Ralph (orchestrator) |

**Depends on:** C1

#### C4. Rewrite workflow skills

| Skill | Change |
|-------|--------|
| `vscode-workflow-setup` | Remove step 7 (analyst delegation). Remove ralphchives search (analyst's job now). Setup only: branch, state.md, greeting, read repo instructions |
| `vscode-workflow-execute` | **Rename/replace** → `vscode-workflow-analyze`: dispatch analyst, read status.json, record plan in state.md |
| NEW `vscode-workflow-implement-loop` | Dispatch coder → read status → dispatch reviewer → read status → loop/proceed. Track iterations, enforce max 2. |
| `vscode-workflow-commit` | Minimal changes — ralph still does this himself |
| `vscode-workflow-pr` | Minimal changes — ralph still does this himself |
| `vscode-workflow-handoff` | Minimal changes — ralph still does this himself |
| `vscode-workflow-revision-setup` | Remove analyst delegation reference. Just read feedback, find branch/PR. |
| `vscode-workflow-revision-fix` | **Rename/replace** → use `vscode-workflow-analyze` + `vscode-workflow-implement-loop` |
| `vscode-workflow-revision-commit` | Minimal changes |
| `vscode-workflow-revision-handoff` | Minimal changes |

**Depends on:** C1

---

### Phase D: Post-Hook Agents

#### D1. Update `shared/agent-includes/post-hooks/run-analyzer.md`

Changes:
- Add `{% render 'agent-as-function-contract' %}` section
- Output → `{hook.outputDir}/artifacts/run-analyzer/output.md` (was `{hook.outputDir}/analysis.md`)
- Write `status.json`: `result: issues-found | clean`
- Append to `{hook.outputDir}/artifacts/manifest.json`
- Final return: one-line status

**Depends on:** A1. Can be done in parallel with B/C.

#### D2. Update `shared/agent-includes/post-hooks/agent-improver.md`

Changes:
- Add `{% render 'agent-as-function-contract' %}` section
- Read `{hook.outputDir}/artifacts/run-analyzer/status.json` first — if `result: clean`, early exit
- Read analysis from `{hook.outputDir}/artifacts/run-analyzer/output.md` (was `{hook.outputDir}/analysis.md`)
- Output → `{hook.outputDir}/artifacts/agent-improver/output.md` (was `{hook.outputDir}/improvements.md`)
- Write `status.json`: `result: improved | no-action`
- Append to manifest.json

**Depends on:** A1, D1.

---

### Phase E: Wiring & Profile Config

#### E1. Update `profiles/ralph-vscode/profile.json`

- Add `ralph-coder` and `ralph-reviewer` to agent list in ralph.ralph's `agents` frontmatter
- Add/update skill references in variant skill arrays:
  - Remove: `vscode-workflow-execute` (replaced)
  - Add: `vscode-workflow-analyze`, `vscode-workflow-implement-loop`
  - Remove: `vscode-workflow-revision-fix` (replaced by generic dispatch skills)

**Depends on:** C4 (skill names finalized)

---

### Phase F: Verification

#### F1. Run tests
```bash
npm test
```
Verifies Liquid template parsing (template-integration.test.ts catches broken `{% render %}` refs, unparsed tags).

#### F2. Agent graph validation
```bash
npx tsx scripts/visualize-agent-graph.ts --agent ralph.ralph
```
Verifies all skill references resolve, no unreferenced skills.

#### F3. Manual trace

Walk through the standard workflow mentally:
1. ralph dispatches analyst → analyst writes to `.ralph/tasks/{taskId}/artifacts/ralph-analyst/` → ralph reads `status.json`
2. ralph dispatches coder → coder reads `ralph-analyst/output.md`, implements, writes `output-v1.md` + `status.json` → ralph reads `status.json`
3. ralph dispatches reviewer → reviewer reads `ralph-coder/output-v1.md`, reviews, writes `output-v1.md` + `status.json` → ralph reads `status.json`
4. If fail: ralph dispatches coder → coder reads `ralph-reviewer/output-v1.md`, implements fixes → same loop
5. ralph commits, pushes, creates PR, writes handoff

Verify: at no point does ralph read any `output.md`. Only `status.json`.

**Depends on:** all previous phases.

---

## Execution Order

```
A1 ─────────────────────────────────────────────────► shared contract partial
  │
  ├── B1 (analyst refactor) ──┐
  ├── B2 (coder — NEW) ──────┤
  ├── B3 (reviewer — NEW) ───┤── can be parallel
  ├── D1 (run-analyzer) ─────┤
  │                           │
  │                    C1 (ralph.ralph rewrite) ◄── depends on B1-B3
  │                      │
  │                    C2, C3 (workflow includes) ◄── depends on C1
  │                      │
  │                    C4 (workflow skills) ◄── depends on C2, C3
  │                      │
  │                    D2 (agent-improver) ◄── depends on D1
  │                      │
  │                    E1 (profile.json) ◄── depends on C4
  │                      │
  │                    F1, F2, F3 (verification) ◄── depends on all
  └──────────────────────────────────────────────────────────────────
```

---

## Files Changed

### New
| File | Purpose |
|---|---|
| `shared/agent-includes/agent-as-function-contract.md` | Shared Liquid partial — artifact contract |
| `profiles/ralph-vscode/agents/ralph.ralph-coder.agent.md` | Implementer subagent |
| `profiles/ralph-vscode/agents/ralph.ralph-reviewer.agent.md` | Self-reviewer subagent |
| `shared/skills/workflow/vscode-workflow-analyze/SKILL.md` | Dispatch analyst, read status |
| `shared/skills/workflow/vscode-workflow-implement-loop/SKILL.md` | Coder → reviewer → loop |

### Modified
| File | Change |
|---|---|
| `profiles/ralph-vscode/agents/ralph.ralph.agent.md` | Rewrite as pure router |
| `profiles/ralph-vscode/agents/ralph.ralph-analyst.agent.md` | Add artifact contract, redirect output |
| `profiles/ralph-vscode/profile.json` | Add new agents, update skill lists |
| `shared/agent-includes/ralph-vscode/ralph-standard-workflow.md` | New dispatch-based phases |
| `shared/agent-includes/ralph-vscode/ralph-revision-workflow.md` | New dispatch-based phases |
| `shared/skills/workflow/vscode-workflow-setup/SKILL.md` | Remove analyst delegation |
| `shared/skills/workflow/vscode-workflow-revision-fix/SKILL.md` | Remove / replace with dispatch |
| `shared/agent-includes/post-hooks/run-analyzer.md` | Artifact contract, new output path |
| `shared/agent-includes/post-hooks/agent-improver.md` | New input path, status.json check |

### Potentially Removed
| File | Reason |
|---|---|
| `shared/skills/workflow/vscode-workflow-execute/SKILL.md` | Replaced by `vscode-workflow-analyze` + `vscode-workflow-implement-loop` |
| `shared/skills/workflow/vscode-workflow-revision-fix/SKILL.md` | Revision now uses same analyze + implement-loop skills |
