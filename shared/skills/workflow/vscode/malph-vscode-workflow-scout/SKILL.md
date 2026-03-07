---
name: malph-vscode-workflow-scout
description: "VS Code extension review orchestrator Phase 2. Dispatch the malph-scout subagent for diff mapping, pattern verification, and build validation."
---

# Phase 2: Scout

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 2.
3. **Review completed phases** — confirm Phase 1 (Setup) is done.

## Instructions

### Dispatch the scout

Delegate to the `malph-scout` sub-agent. It will:
- Find the PR and record its ID/URL
- Run `git diff` to identify all changed files
- Map each change to the extension's architectural patterns
- Run build validation (`npm run compile`, `npm run lint:ci`, `npm run test:xvfb`)
- Write its scout report to `.ralph/tasks/{{ taskId }}/artifacts/malph-scout/output.md`
- Write its status to `.ralph/tasks/{{ taskId }}/artifacts/malph-scout/status.json`

### Read the result

After the scout returns, read `.ralph/tasks/{{ taskId }}/artifacts/malph-scout/status.json`.

| `result` | Action |
|---|---|
| `scouted` | Proceed to Phase 3 (Review Panel) — build passes |
| `build-broken` | Proceed to Phase 3 (Review Panel) — reviewers will note build failure |
| Any `status: failed` or `blocked` | Skip reviews, set overall status to `blocked`, proceed to Phase 5 (Handoff) |

**Do NOT read `output.md`** — you are a router. The reviewers will read the scout's output directly.

Record the scout's `summary` field from `status.json` in `state.md`.

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to `Phase 3: Review Panel`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-review-panel
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 2 to "Completed Phases" with scout status and build result
