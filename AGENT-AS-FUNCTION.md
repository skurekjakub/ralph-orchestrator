# Refactor: Subagent-as-Function with Filesystem Artifact Handoff

## Context

You are refactoring an existing multi-agent workflow. Currently, subagents return their full output (reports, diffs, review comments, analysis) as conversational text in their final turn. This output gets injected into the orchestrator's context window, bloating it with artifacts the orchestrator doesn't need to reason over — it only needs to know the outcome and route to the next step.

## Goal

Convert every subagent to the **subagent-as-function** pattern using **filesystem-based artifact handoff**:

- Subagents write all substantive output to files in a shared workspace directory.
- Subagents return only a **structured status object** to the orchestrator — never the artifact content itself.
- The orchestrator routes between subagents using only status metadata. It never reads artifact files directly.
- Downstream subagents read artifact files from the workspace as their input context. They pull what they need on their own.

## Handoff structure

Create a shared workspace directory at `.artifacts/` scoped per task run:

```
.artifacts/{task-id}/
├── manifest.json          # append-only log of all artifacts produced
├── {subagent-name}/       # each subagent writes to its own subdirectory
│   ├── output.md          # primary artifact (report, diff, review, etc.)
│   ├── status.json        # structured status the orchestrator reads
│   └── ...                # any additional files the subagent produces
```

### status.json (what the orchestrator sees)

Every subagent must write a `status.json` before exiting. This is the **only** file the orchestrator reads. Keep it minimal:

```json
{
  "agent": "review-agent",
  "task_id": "feat-auth-42",
  "status": "completed",
  "result": "fail",
  "summary": "3 issues found: 2 style violations, 1 potential null reference",
  "artifacts": ["review-agent/output.md"],
  "next_hint": "edit-agent",
  "iteration": 2
}
```

Fields:
- `status`: `completed | failed | blocked` — did the subagent finish its work?
- `result`: task-specific outcome (e.g., `pass | fail` for review, `applied | conflict` for edit)
- `summary`: one-line description, max ~100 tokens. Enough for the orchestrator to make a routing decision. Not a report.
- `artifacts`: list of file paths relative to `.artifacts/{task-id}/` that downstream agents can read.
- `next_hint`: optional suggestion for which subagent should run next. Orchestrator can override.
- `iteration`: how many times this subagent has been invoked for this task. Helps the orchestrator detect loops.

### manifest.json (append-only audit log)

Each subagent appends an entry when it writes artifacts. The orchestrator doesn't read this during normal flow — it exists for debugging, recovery, and so downstream subagents can discover what's been produced if needed.

```json
[
  {
    "timestamp": "2026-03-06T14:22:00Z",
    "agent": "edit-agent",
    "artifacts": ["edit-agent/output.md"],
    "status": "completed",
    "iteration": 1
  },
  {
    "timestamp": "2026-03-06T14:23:12Z",
    "agent": "review-agent",
    "artifacts": ["review-agent/output.md"],
    "status": "completed",
    "iteration": 1
  }
]
```

## Refactoring rules

For each subagent in the existing workflow:

### 1. Identify what it currently returns as conversation output

Look at the subagent's final turn — the message that currently flows back into the orchestrator's context. This is the content that needs to move to a file.

### 2. Redirect artifact content to filesystem

The subagent should write its substantive output to `.artifacts/{task-id}/{agent-name}/output.md` (or an appropriate format). The content, structure, and quality of the output should remain identical — you're changing where it goes, not what it says.

### 3. Replace the conversational return with status.json

Instead of returning a report, the subagent writes `status.json` and its final conversational message to the orchestrator becomes minimal, something like:

> Done. Wrote results to `.artifacts/{task-id}/review-agent/status.json`. Status: completed, result: fail.

This is what the orchestrator sees in its context. Not the review. Not the diff. Just the routing signal.

### 4. Update downstream subagents to read from filesystem

Any subagent that previously received another subagent's output through the orchestrator must now read it from the filesystem. For example, if the edit-agent previously got review comments via the orchestrator relaying them, it should now:

1. Read its task assignment from the orchestrator (which subagent to respond to, what the high-level goal is).
2. Read `.artifacts/{task-id}/review-agent/output.md` directly for the detailed review comments.
3. Do its work.
4. Write its own artifacts and status.json.

### 5. Update the orchestrator's routing logic

The orchestrator should:

1. Dispatch a subagent with a task description and the task-id.
2. After the subagent completes, read **only** `.artifacts/{task-id}/{agent-name}/status.json`.
3. Make routing decisions based on `status`, `result`, `summary`, and `iteration`.
4. Dispatch the next subagent with a task description that references the task-id — not the previous agent's output.
5. Track iteration counts to detect loops and set a max retry threshold.

The orchestrator **never** reads `output.md` or any other artifact file. If it needs to understand what happened beyond what `status.json` provides, the `summary` field needs to be more informative — not the orchestrator's context window larger.

### 6. Handle the edit → review → edit loop

For iterative workflows where a review-agent's output feeds back into an edit-agent:

- Each iteration gets a versioned output: `edit-agent/output-v1.md`, `edit-agent/output-v2.md` (or use subdirectories per iteration).
- The review-agent always reads the latest edit artifact.
- The edit-agent reads the latest review artifact and the current state of the files it's editing.
- The orchestrator tracks iterations via `status.json` and enforces a max (e.g., 3 rounds). After the max, it escalates or accepts the current state.

## What NOT to change

- **Subagent internal behavior.** How the subagent reasons, what tools it uses, what skills it loads — leave all of that alone. You're only changing the I/O boundary.
- **Artifact quality.** The reports, reviews, diffs should be identical in substance. They're just written to files instead of returned as conversation.
- **Orchestrator decision logic.** The routing rules stay the same. You're changing what data the orchestrator uses to make those decisions (structured status vs. full-text output), but the logic itself (if fail → retry, if pass → proceed) should be preserved.

## Validation

After refactoring, verify:

1. The orchestrator's context window contains no artifact content — only status summaries and task dispatches.
2. Downstream subagents successfully read their input from the filesystem and produce equivalent output.
3. The `.artifacts/{task-id}/manifest.json` correctly logs the full sequence of agent invocations.
4. The edit → review loop terminates correctly at the max iteration threshold.
5. If a subagent fails mid-task, the orchestrator can read `status: failed` and route to error handling without needing to parse a half-written report from context.