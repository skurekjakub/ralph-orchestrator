# Subagent-as-Function: Filesystem Artifact Handoff

## Problem

Multi-agent workflows where subagents return their full output as conversation text. Reports, diffs, reviews, analysis — all of it flows into the orchestrator's context window. The orchestrator doesn't need any of this content to make routing decisions. It just needs to know: did the subagent succeed, and what should happen next.

This bloats the orchestrator's context, degrades its reasoning quality, and creates brittle coupling between the orchestrator and subagent output formats.

## Pattern

**Subagent-as-function** with **filesystem-based artifact handoff.**

The orchestrator is a **pure router**. It dispatches subagents, reads a one-line status response, and decides what to dispatch next. It never reads artifact content. All substantive data flows between subagents through the filesystem — subagents read each other's artifacts directly, not through the orchestrator's context.

### Roles

- **Orchestrator agent**: Routes between subagents. Reads only `status.json`. Does administrative work itself (commit, push, PR, JIRA, handoff). Never reads or relays artifact content.
- **Subagent**: Does one job. Reads its input from upstream artifacts on the filesystem. Writes its output to its own artifact directory. Returns only a structured status to the orchestrator.

### Data flow

```
Orchestrator                     Filesystem                        Subagents
─────────────                    ──────────                        ─────────
dispatch analyst ──────────────────────────────────────────────► analyst
                                 analyst writes output.md    ◄── analyst
read status.json ◄── status.json analyst writes status.json  ◄── analyst

dispatch coder ────────────────────────────────────────────────► coder
                                 coder reads analyst/output.md ──► coder
                                 coder writes output-v1.md   ◄── coder
read status.json ◄── status.json coder writes status.json    ◄── coder

dispatch reviewer ─────────────────────────────────────────────► reviewer
                                 reviewer reads coder/output-v1.md ─► reviewer
                                 reviewer writes output-v1.md ◄── reviewer
read status.json ◄── status.json reviewer writes status.json  ◄── reviewer

(if fail) dispatch coder again ────────────────────────────────► coder
                                 coder reads reviewer/output-v1.md ─► coder
                                 coder reads analyst/output.md ────► coder
                                 coder writes output-v2.md    ◄── coder
read status.json ◄── ...
```

The orchestrator sees **only** status.json at each step. All detail flows horizontally between subagents via the filesystem.

## Artifact Directory

Each task gets a shared artifact directory. Every subagent writes to its own subdirectory within it.

```
.ralph/tasks/{task-id}/artifacts/      # {{ artifactDir }}
├── manifest.json              # append-only audit log
├── {agent-name}/
│   ├── output.md              # primary artifact (or output-v1.md, output-v2.md for iterations)
│   ├── status.json            # structured status — the ONLY thing the orchestrator reads
│   └── ...                    # any additional files
```

Templates get the artifact root as the `artifactDir` template variable, which `buildTemplateContext()` (`src/container/setup/agent-includes.ts`) takes from the stage's workspace (`StageWorkspaceResolver`, `src/services/stage-workspace.ts`). The shared partial `agent-as-function-contract` tells subagents to write to `{{ artifactDir }}/{{ self.name }}/`: `{agent-name}` throughout this page is the agent's frontmatter `name` (`self.name`, e.g. `ralph-reviewer`), not its template file id (`ralph.ralph-reviewer`).

- **Container stages**: `.ralph/tasks/{task-id}/artifacts`, relative to the CLI's working directory `/workspace` (the task's workspace, its checkout of the target repo), so artifacts land in `<workspace>/.ralph/tasks/{task-id}/artifacts/`, alongside `state.md`. The orchestrator exports this folder into the task's log directory after the run.
- **A variant's local stages**: the absolute host path of that same folder in the task's workspace, so they share the container stages' artifacts.
- **Post-task hooks**: `<output.logDir>/<key>-<startTs>/hooks/<hook-name>/artifacts`, absolute and shared by all of the hook's stages, next to the hook output directory (`hook.outputDir`).

### status.json

Every subagent writes this before exiting. This is the **only** file the orchestrator reads.

```json
{
  "agent": "ralph-reviewer",
  "task_id": "DOC-3167",
  "status": "completed",
  "result": "fail",
  "summary": "2 pattern violations, 1 missing test. See output-v1.md.",
  "artifacts": ["ralph-reviewer/output-v1.md"],
  "next_hint": "ralph-coder",
  "iteration": 1
}
```

| Field       | Type     | Description                                                                              |
| ----------- | -------- | ---------------------------------------------------------------------------------------- |
| `agent`     | string   | Subagent name                                                                            |
| `task_id`   | string   | Task identifier (e.g. JIRA key)                                                          |
| `status`    | enum     | `completed` · `failed` · `blocked` — did the agent finish?                               |
| `result`    | string   | Task-specific outcome. Agent-defined. Used by orchestrator for routing.                  |
| `summary`   | string   | One-line description, max ~100 tokens. Enough for a routing decision. Not a report.      |
| `artifacts` | string[] | File paths relative to the artifact root (`{{ artifactDir }}`)                           |
| `next_hint` | string?  | Suggested next subagent. Orchestrator can override.                                      |
| `iteration` | number   | How many times this agent has run for this task. Orchestrator uses this to detect loops. |

### manifest.json

Append-only audit log. Each subagent appends an entry when it writes artifacts. The orchestrator doesn't read this during normal flow — it's for debugging, recovery, and so downstream subagents can discover the full execution history if needed.

```json
[
  {
    "timestamp": "2026-03-06T14:22:00Z",
    "agent": "ralph-analyst",
    "artifacts": ["ralph-analyst/output.md"],
    "status": "completed",
    "result": "analyzed",
    "iteration": 1
  },
  {
    "timestamp": "2026-03-06T14:23:12Z",
    "agent": "ralph-coder",
    "artifacts": ["ralph-coder/output-v1.md"],
    "status": "completed",
    "result": "implemented",
    "iteration": 1
  }
]
```

### Versioned artifacts for iterative loops

When a subagent runs multiple times (e.g. coder → reviewer → coder), each iteration produces a versioned artifact:

```
ralph-coder/
├── output-v1.md       # first attempt
├── output-v2.md       # second attempt (after reviewer feedback)
└── status.json        # always reflects the latest iteration

ralph-reviewer/
├── output-v1.md       # review of coder's v1
├── output-v2.md       # review of coder's v2 (if loop continues)
└── status.json        # always reflects the latest iteration
```

- `status.json` is overwritten each iteration — it always reflects the current state.
- `manifest.json` preserves the full history — each iteration appends a new entry.
- Downstream subagents read the versioned file they need (e.g. coder iteration 2 reads `ralph-reviewer/output-v1.md`).

## Orchestrator Behavior

The orchestrator is a **pure router** with administrative duties. It:

1. **Dispatches** a subagent with a minimal task description and the task-id.
2. **Reads** only `{{ artifactDir }}/{agent-name}/status.json` after the subagent completes.
3. **Routes** based on `status`, `result`, `summary`, and `iteration`. Never based on artifact content.
4. **Dispatches** the next subagent with nothing but the task-id and a one-line directive. The next subagent reads upstream artifacts on its own.
5. **Enforces** iteration limits to prevent infinite loops (e.g. max 2 coder→reviewer rounds).
6. **Does** administrative work itself: commit, push, PR creation, JIRA transitions/comments, handoff file, exit block.

The orchestrator **never**:

- Reads `output.md` or any artifact file.
- Relays content from one subagent to another. Subagents read each other's artifacts directly.
- Summarizes or interprets subagent output beyond what `status.json` provides.

If the orchestrator needs more information than `status.json` provides to make a routing decision, the answer is: make `summary` more informative — not the orchestrator's context window larger.

## Subagent Behavior

Every subagent follows the same contract:

1. **Read** the artifact contract (shared partial: `agent-as-function-contract`).
2. **Read input** from upstream subagent artifacts on the filesystem (e.g. coder reads `ralph-analyst/output.md`).
3. **Do** its work — reason, use tools, read/write code. Internal behavior is unchanged.
4. **Write** its primary artifact to `{{ artifactDir }}/{agent-name}/output.md` (or `output-v{N}.md` for iterations).
5. **Write** `status.json` to its artifact directory.
6. **Append** to `manifest.json` in the task artifact root.
7. **Return** to the orchestrator with only: `"Done. Status: {status}, result: {result}. → Read status.json and route."`

The subagent's conversational return to the orchestrator is one line. The orchestrator's context window sees that line plus whatever it had before. No artifact content leaks into the conversation.

## Subagent Data Flow (who reads what)

This is the key design principle: **subagents read each other's artifacts directly.** The orchestrator never relays data.

| Consumer             | Reads from                                                               | Why                               |
| -------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| coder (iteration 1)  | `ralph-analyst/output.md`                                                | Implementation plan               |
| coder (iteration 2+) | `ralph-analyst/output.md` + `ralph-reviewer/output-v{N-1}.md`            | Original plan + reviewer feedback |
| reviewer             | `ralph-coder/output-v{N}.md` + actual changed files in repo              | Change summary + real code        |
| agent-improver       | `run-analyzer/<target-subagent>/output.md` (path given by the scientist) | Execution analysis                |

On **revisions** (fixing a previously-reviewed PR), the orchestrator dispatches the analyst with the revision context (task-id only). The analyst reads the PR feedback, prior handoff, and reviewer comments from the filesystem/MCP tools itself, then produces a fresh `output.md` scoped to "what needs fixing." The coder reads that artifact — same flow as a fresh task.

## Post-Hook Agents

Post-hooks (the `ralph.scientist` stage of the `run-analysis` hook in the bundled profiles) run on the host (not in Docker), each stage in its own workspace under the hook's output directory, and use the same artifact contract. Their `artifactDir` is in the hook's output directory:

```
<output.logDir>/<key>-<startTs>/hooks/<hook-name>/artifacts/
├── manifest.json
├── subagent-mapper/
│   ├── output.md                  # subagent inventory
│   └── subagents/<agent-name>.md  # per-subagent extraction
├── run-analyzer/<target-subagent>/
│   ├── output.md                  # execution analysis report
│   └── status.json                # result: analyzed | skipped
├── agent-improver/<target-subagent>/
│   ├── output.md                  # improvement summary
│   ├── proposals/<path>           # each proposed file, whole, at its path relative to the orchestrator checkout
│   └── status.json                # result: improved | no-action
└── run-synthesizer/
    ├── output.md                  # cross-subagent synthesis
    └── status.json
```

The scientist dispatches `run-analyzer` and `agent-improver` once per subagent found by `subagent-mapper`. `agent-improver` reads the analysis report it is given; if the file is missing or the analyzer's result was `skipped`, it writes a `no-action` status and stops.

## Refactoring Existing Agents

When converting an existing agent to this pattern:

### 1. Identify conversational output

Look at the subagent's final turn — the message that flows back into the orchestrator's context. This content moves to `output.md`.

### 2. Redirect to filesystem

Write the same content (identical structure, quality, depth) to `{{ artifactDir }}/{agent-name}/output.md`. Change where it goes, not what it says.

### 3. Replace return with status.json

Write `status.json`, append to `manifest.json`, then return one line: `"Done. Status: completed, result: analyzed."`

### 4. Update downstream consumers

After the conversion, any subagent that got this agent's output through the orchestrator reads it from the filesystem directly. The orchestrator gives downstream agents nothing but the task-id and a one-line dispatch directive.

### 5. Don't change internals

How the subagent reasons, what tools it uses, what skills it loads — leave all of that alone. Only the I/O boundary changes.

## Validation

After refactoring, verify:

1. **Context cleanliness** — the orchestrator's context contains no artifact content. Only status summaries and one-line dispatches.
2. **Artifact integrity** — downstream subagents read from the filesystem and produce equivalent output to what they produced before.
3. **Audit trail** — `manifest.json` correctly logs the full sequence of agent invocations with timestamps.
4. **Loop termination** — iterative loops (coder→reviewer→coder) terminate at the max iteration threshold.
5. **Failure handling** — if a subagent fails mid-task, `status: failed` is readable and the orchestrator routes to error handling without parsing a half-written report.
