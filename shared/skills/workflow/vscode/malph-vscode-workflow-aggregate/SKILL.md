---
name: malph-vscode-workflow-aggregate
description: "VS Code extension review orchestrator Phase 4. Aggregate reviewer verdicts and findings, then post a unified review comment to JIRA."
---

# Phase 4: Aggregate & Deliver

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 4.
3. **Review completed phases** — confirm Phase 3 (Review Panel) is done.

## Instructions

### 1. Read all reviewer artifacts

For each reviewer that completed successfully, read:
- `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-opus/status.json`
- `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-opus/jira-findings.json`
- `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-gpt/status.json`
- `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-gpt/jira-findings.json`
- `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-gemini/status.json`
- `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-gemini/jira-findings.json`

Skip any reviewer whose `status.json` shows `status: failed`.

### 2. Determine panel verdict

Apply the **unanimous approval rule**:
- ANY reviewer verdict of `needs-revision` → overall **NEEDS REVISION**
- Only unanimous `approved` → overall **APPROVED**
- If all successful reviewers approved but one failed, treat the panel verdict as the majority

### 3. Aggregate findings

Merge findings from all `jira-findings.json` files:
- Deduplicate by issue code + file + line — if multiple reviewers flag the same issue at the same location, keep the most detailed description and note which reviewers agreed
- Group by severity: Critical (must fix) → Style (should fix) → Suggestions (optional)
- Preserve the `code`, `file`, `line`, `detail`, and `correction` fields from each finding

### 4. Post unified JIRA comment

Post a single rich comment on **{{ taskId }}** with the panel verdict:

```
## Review Panel Verdict: APPROVED | NEEDS REVISION

**Panel:** 3 reviewers (Opus 4.6, GPT 5.4, Gemini Pro)
**Scout:** Build PASS | FAIL

### Reviewer Verdicts
| Reviewer | Verdict | Findings |
|---|---|---|
| malph-reviewer-opus | approved / needs-revision / failed | N findings |
| malph-reviewer-gpt | approved / needs-revision / failed | N findings |
| malph-reviewer-gemini | approved / needs-revision / failed | N findings |

### Aggregated Findings

#### Critical (must fix)
- **[ARCH-001]** `file:line` — description *(flagged by: opus, gpt)*

#### Style (should fix)
- **[TS-003]** `file:line` — description *(flagged by: gemini)*

#### Suggestions
- **[SUG-001]** description *(flagged by: opus)*

### Summary
<Brief overall assessment>
```

If APPROVED unanimously, keep it concise — the panel agrees the code is clean.

### 5. Update state.md

Record the panel verdict and finding counts.

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to `Phase 5: Handoff`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-handoff
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 4 to "Completed Phases" with panel verdict and total finding count
