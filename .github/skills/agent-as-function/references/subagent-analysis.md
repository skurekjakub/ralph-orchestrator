# Subagent Analysis

**Mandatory first step.** Before writing any orchestrator code, skills, or subagent templates, you must analyze the existing prompt to identify every subagent the orchestrator will need. This prevents the orchestrator from doing delegatable work and ensures subagent boundaries are clean before implementation begins.

## Input

The existing monolithic agent prompt (or multi-agent prompt where subagent boundaries are unclear).

## Output

A complete subagent analysis containing:
1. **Responsibility inventory** — every distinct job the prompt performs
2. **Subagent roster** — which responsibilities become subagents, which stay with the orchestrator
3. **Routing table** — how the orchestrator dispatches and routes between subagents
4. **Data flow map** — what each subagent reads and writes

Present the analysis to the user for review before proceeding to implementation.

## Procedure

### 1. Read the entire prompt

Read the existing agent instructions end-to-end. Do not skim — every section matters. If the prompt spans multiple files (includes, partials, skills), read them all.

### 2. Inventory every responsibility

List every distinct job the agent performs. Be granular — separate "analyze the JIRA issue" from "write the implementation plan" even if they happen in sequence.

For each responsibility, capture:
- **What it does** (one line)
- **What it reads** (inputs: files, APIs, JIRA fields, other agent output)
- **What it produces** (outputs: files, code changes, reports, API calls)
- **Cognitive load** — is this routine/mechanical, or does it require deep reasoning?
- **Tool dependency** — what tools/APIs does it need?

Example inventory:

| # | Responsibility | Reads | Produces | Cognitive Load | Tools |
|---|---|---|---|---|---|
| 1 | Analyze JIRA issue and PR feedback | JIRA fields, PR comments | Implementation plan | High — synthesis | JIRA API, ADO API |
| 2 | Implement code changes | Implementation plan | Modified files | High — coding | File edit, terminal |
| 3 | Run build validation | Source code | Build result | Low — mechanical | Terminal |
| 4 | Review implementation quality | Changed files, plan | Review report | High — judgment | File read |
| 5 | Write JIRA handoff comment | Review results, PR URL | JIRA comment + attachment | Medium — formatting | JIRA API |
| 6 | Commit and push | Changed files | Git commits | Low — mechanical | Git CLI |
| 7 | Create/update PR | Branch, commits | PR URL | Low — mechanical | ADO API |

### 3. Classify: subagent vs orchestrator

Apply these rules to decide what becomes a subagent:

**Make it a subagent when:**
- It requires deep reasoning or domain expertise (analysis, coding, review, writing)
- Its output is consumed by another agent downstream
- It could benefit from a different model (e.g., cheaper model for formatting, stronger model for review)
- It produces a substantial artifact (report, code changes, review document)
- Running it in isolation would be valuable (testing, reuse in other workflows)

**Keep it in the orchestrator when:**
- It's administrative/mechanical (git commit, JIRA transition, branch creation)
- It's a routing decision (what to dispatch next based on `status.json`)
- It's a coordination concern (tracking iterations, enforcing max retries)
- It takes <10 lines of instruction and doesn't produce a standalone artifact

Applying to the example inventory:

| # | Responsibility | → | Rationale |
|---|---|---|---|
| 1 | Analyze JIRA + PR feedback | **subagent: analyst** | High reasoning, substantial output, read by coder |
| 2 | Implement code changes | **subagent: coder** | High reasoning, substantial output, needs iteration |
| 3 | Run build validation | **embedded in coder** | Mechanical, tightly coupled to implementation |
| 4 | Review implementation | **subagent: reviewer** | High judgment, different perspective, may use different model |
| 5 | Write JIRA handoff | **subagent: scribe** | Medium effort, distinct formatting skill, reusable |
| 6 | Commit and push | **orchestrator** | Mechanical, administrative |
| 7 | Create/update PR | **orchestrator** | Mechanical, administrative |

### 4. Define the subagent roster

For each identified subagent, specify:

```markdown
## Subagent Roster

### analyst
- **Role**: Analyze JIRA issue and produce implementation plan
- **Model**: claude-opus-4.6 (needs strong synthesis)
- **Reads**: JIRA fields (via MCP), PR comments (via ADO API), prior handoff artifacts
- **Writes**: `analyst/output.md` — implementation plan
- **Result codes**: `analyzed` (ready for implementation), `blocked` (needs clarification)

### coder
- **Role**: Implement code changes per analyst's plan
- **Model**: claude-opus-4.6 (needs strong coding)
- **Reads**: `analyst/output.md`, `reviewer/output-v{N-1}.md` (iteration 2+)
- **Writes**: `coder/output-v{N}.md` — change summary; actual file modifications
- **Result codes**: `implemented`, `build-broken`, `blocked`

### reviewer
- **Role**: Review coder's changes against the plan and domain conventions
- **Model**: claude-opus-4.6 (needs judgment)
- **Reads**: `coder/output-v{N}.md`, actual changed files
- **Writes**: `reviewer/output-v{N}.md` — review report
- **Result codes**: `approved`, `needs-revision`

### scribe
- **Role**: Write JIRA handoff comment summarizing all work done
- **Model**: claude-sonnet-4.5 (formatting, cheaper)
- **Reads**: All `*/output.md` artifacts, `manifest.json`
- **Writes**: `scribe/output.md` — formatted JIRA comment and attachment
- **Result codes**: `delivered`
```

### 5. Draft the routing table

Map every `(subagent, result)` pair to the orchestrator's next action:

```markdown
## Routing Table

| Agent completed | result | Action |
|---|---|---|
| analyst | analyzed | dispatch coder |
| analyst | blocked | comment on JIRA with blocker, exit |
| coder | implemented | commit + push, dispatch reviewer |
| coder | build-broken | dispatch coder (iteration++, max 2) |
| coder | blocked | comment on JIRA with blocker, exit |
| reviewer | approved | dispatch scribe |
| reviewer | needs-revision | dispatch coder (iteration++, max 3) |
| scribe | delivered | create PR, transition JIRA, exit |
```

Check for completeness:
- Every subagent's every result code appears in the table
- Every row has a clear next action
- Iteration limits are explicit
- Error/blocked paths lead to graceful exits, not hangs

### 6. Map the data flow

Draw the data flow showing who reads what — this validates that the orchestrator never needs to relay content:

```markdown
## Data Flow

analyst → writes output.md
  ↓ (filesystem read)
coder → reads analyst/output.md, writes output-v{N}.md
  ↓ (filesystem read)
reviewer → reads coder/output-v{N}.md + changed files, writes output-v{N}.md
  ↓ (filesystem read, iteration loop)
coder → reads reviewer/output-v{N-1}.md, writes output-v{N+1}.md
  ...
scribe → reads all */output.md + manifest.json, writes output.md
```

Verify: the orchestrator appears **nowhere** in data transmission. It only dispatches and reads `status.json`.

### 7. Present for review

Show the complete analysis to the user:
1. Responsibility inventory (the table from step 2)
2. Classification decisions with rationale (the table from step 3)
3. Subagent roster (from step 4)
4. Routing table (from step 5)
5. Data flow map (from step 6)

Ask: "Does this decomposition look right? Any responsibilities I should split differently, or subagents that should be merged/removed?"

Only proceed to implementation after the user confirms.

## Edge Cases

**Responsibilities that span multiple subagents**: If a responsibility like "validate and fix build errors" involves both checking (reviewer-like) and fixing (coder-like), either embed it in the closer subagent or split it into two subagents. Don't create a subagent that does both analysis and implementation — that defeats the single-responsibility principle.

**Subagents that seem too small**: If a subagent has only one result code and doesn't produce a substantial artifact, it's probably an orchestrator duty. The scribe pattern is the minimum viable subagent — it takes input from multiple sources and produces a formatted output.

**Existing subagents in the prompt**: If the prompt already dispatches subagents, analyze whether their boundaries are clean. Common problems: subagent returns too much data to the orchestrator, orchestrator relays data between subagents, subagent responsibilities overlap.

**Multi-model considerations**: The analysis is a good opportunity to identify where different models would be cost-effective. Formatting/aggregation tasks (scribe) can often use cheaper models. Deep reasoning (analysis, review) benefits from stronger models. Code generation depends on the complexity.
