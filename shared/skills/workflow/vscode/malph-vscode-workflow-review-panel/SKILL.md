---
name: malph-vscode-workflow-review-panel
description: "VS Code extension review orchestrator Phase 3. Dispatch three independent reviewers sequentially — Opus, GPT, Gemini — each running the full review checklist independently."
---

# Phase 3: Review Panel

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 3.
3. **Review completed phases** — confirm Phase 2 (Scout) is done.

## Instructions

Dispatch three independent reviewers **in sequence**. Each reviewer:
- Reads the scout's artifacts (diff mapping, build results, focus areas)
- Runs the full 7-category review checklist independently
- Posts file-level PR threads on ADO with their model attribution prefix
- Writes `jira-findings.json` and `status.json` to their artifact directory

### Step 1: Dispatch malph-reviewer-opus

Delegate to `malph-reviewer-opus`. Wait for completion.

Read `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-opus/status.json`.

| `result` | Action |
|---|---|
| `approved` | Record verdict, continue to next reviewer |
| `needs-revision` | Record verdict, continue to next reviewer |
| `failed` / `blocked` | Note error, continue to next reviewer |

Update `state.md` — record the Opus verdict in the Reviewer Verdicts table.

### Step 2: Dispatch malph-reviewer-gpt

Delegate to `malph-reviewer-gpt`. Wait for completion.

Read `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-gpt/status.json`.

| `result` | Action |
|---|---|
| `approved` | Record verdict, continue to next reviewer |
| `needs-revision` | Record verdict, continue to next reviewer |
| `failed` / `blocked` | Note error, continue to next reviewer |

Update `state.md` — record the GPT verdict in the Reviewer Verdicts table.

### Step 3: Dispatch malph-reviewer-gemini

Delegate to `malph-reviewer-gemini`. Wait for completion.

Read `.ralph/tasks/{{ taskId }}/artifacts/malph-reviewer-gemini/status.json`.

| `result` | Action |
|---|---|
| `approved` | Record verdict, proceed to Phase 4 |
| `needs-revision` | Record verdict, proceed to Phase 4 |
| `failed` / `blocked` | Note error, proceed to Phase 4 |

Update `state.md` — record the Gemini verdict in the Reviewer Verdicts table.

### Important

- **Do NOT read any reviewer's `output.md` or `jira-findings.json`** during this phase — you are a router
- **Do NOT relay findings between reviewers** — they work independently
- Each reviewer runs the **same checklist** with independent judgment
- A reviewer failing does NOT block the remaining reviewers

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to `Phase 4: Aggregate & Deliver`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-aggregate
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 3 to "Completed Phases" with all three reviewer verdicts
