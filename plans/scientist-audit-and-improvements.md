# Scientist Agent Family — Audit & Improvement Plan

## 1. File Inventory

| File | Role | Notes |
|---|---|---|
| `profiles/ralph-docs/agents/ralph.scientist.agent.md` | Orchestrator (pure router) | Dispatches `run-analyzer` → `agent-improver` |
| `profiles/ralph-docs/agents/ralph.run-analyzer.agent.md` | Stub — renders `{% render 'post-hooks/run-analyzer' %}` | |
| `profiles/ralph-docs/agents/ralph.agent-improver.agent.md` | Stub — renders `{% render 'post-hooks/agent-improver' %}` | |
| `shared/agent-includes/post-hooks/run-analyzer.md` | Full run-analyzer prompt | The actual analysis logic |
| `shared/agent-includes/post-hooks/agent-improver.md` | Full agent-improver prompt | The actual improvement logic |
| `profiles/ralph-docs/profile.json` | Profile config | `postTaskHooks` in both Ralph and Malph variants |
| `.github/skills/agent-eval/SKILL.md` | Agent-eval skill | Referenced by run-analyzer |
| `dashboard-local/src/components/log-browser/cli-debug-subagent-parser.ts` | CLI debug log parser | Extracts `SubagentSpan[]` with per-subagent tool calls |
| `dashboard-local/src/components/log-browser/tool-timeline-types.ts` | Type definitions | `SubagentSpan`, `SubagentToolCall`, `ContextWindowEntry`, `AssistantUsageEntry` |
| `dashboard-local/src/components/log-browser/tool-timeline-categories.ts` | Tool categorization | `skill`, `mcp`, `edit`, `shell`, `nav`, `subagent`, `other` |
| `dashboard-local/src/components/log-browser/context-window-parser.ts` | Context window + token usage parser | `ContextWindowEntry`, `AssistantUsageEntry` from cli-debug.log |

---

## 2. Audit Findings (Agent-as-Function Compliance)

### Finding 1: Orchestrator is clean — pure router ✅

`ralph.scientist.agent.md` follows pure router pattern correctly:
- Never reads `output.md`
- Only reads `status.json` from subagents
- Never relays content between subagents
- Routing table covers all result codes from both subagents
- Exit handling is clean (status.json + manifest.json + return)
- Artifact directory convention is correct (`{{ artifactDir }}/`)

**Verdict:** No issues at the orchestrator level.

### Finding 2: Run-analyzer only analyzes orchestrator-level tool calls ❌ **CRITICAL**

The run-analyzer prompt says:

> "Tool sequence analysis — Read `*-audit.jsonl` or `*-transcript.md` for the tool call sequence"

The `pre-tool.log` and `audit.jsonl` files only capture **orchestrator-level** tool calls (the ones made by `ralph.ralph` or `ralph.malph`). They do NOT contain per-subagent tool call data. In the DOC-3188 example:
- `pre-tool.log` has **69 lines** → the orchestrator's top-level calls
- `cli-debug.log` has **35,361 lines** → contains 8 subagent spans with detailed per-subagent tool calls

**What's missed:** The run-analyzer never reads `cli-debug.log` to extract subagent tool call sequences. This means:
- Researcher's 559-minute span with all its file reads, searches, and MCP calls — **unanalyzed**
- Writer's tool calls (file creates, edits, builds) — **unanalyzed**
- Each reviewer's PR threading and file reads — **unanalyzed**
- Coder's bootstrap sequence — **unanalyzed**
- Validator's verification tool calls — **unanalyzed**
- Scribe's handoff and archival tool calls — **unanalyzed**

**Impact:** The run-analyzer can evaluate orchestrator routing efficiency and subagent dispatch quality, but cannot evaluate whether any individual subagent:
- Used the right tools
- Made redundant calls
- Had error recovery issues
- Spent time on the wrong things
- Missed available MCP tools it should have used

### Finding 3: No subagent-level analysis loop ❌ **CRITICAL**

The run-analyzer processes the execution as a single flat sequence. There is no:
- Iteration over each subagent span
- Per-subagent tool call extraction from `cli-debug.log`
- Per-subagent quality scoring
- Per-subagent comparison against expected tool patterns

The dashboard-local codebase already has the parsing infrastructure:
- `parseCliDebugSubagents()` extracts `SubagentSpan[]` from `cli-debug.log`
- Each span includes: name, model, duration, tool call count, model call count, individual tool calls with timestamps and args
- The tool timeline UI renders per-subagent breakdowns with tool categories, durations, and call lists

This parsing logic exists but is only used in the dashboard UI — the run-analyzer doesn't know about it and can't use it directly (it runs as an LLM agent reading files, not as TypeScript code).

### Finding 4: `cli-debug.log` not mentioned in log file catalog ❌ **HIGH**

The run-analyzer prompt's "Collected log files" section lists 7 log types but **omits `*-cli-debug.log`**:
- ✅ `*-audit.jsonl`
- ✅ `*-transcript.md`
- ✅ `*-tool-output.log`
- ✅ `*-proxy.log`
- ✅ `*-sidecar.log`
- ✅ `*-summary.json`
- ✅ `*-pre-tool.log`
- ❌ `*-cli-debug.log` — **missing** (35K lines, richest data source)
- ❌ `*-state.md` — **missing** (final pipeline state)
- ❌ `*-session-state/` — **missing** (session state directory)
- ❌ `*-session-db` — **missing** (session database)
- ❌ `*-artifacts/` — **missing** (all subagent artifacts including status.json, output.md, manifest.json)

### Finding 5: No artifact analysis ❌ **HIGH**

The run-analyzer never examines the contents of `.ralph/tasks/{taskId}/artifacts/`:
- Per-subagent `status.json` files → quality of status reporting, result codes, summaries
- Per-subagent `output.md` files → content quality, research thoroughness, writing quality
- `manifest.json` → artifact trail completeness
- Task files from planner → task decomposition quality

The artifacts directory is the **ground truth** of what each subagent produced, and it's completely ignored.

### Finding 6: No context window / token usage analysis ❌ **MEDIUM**

The `cli-debug.log` contains context window utilization snapshots and per-turn token usage (`assistant_usage` events). The dashboard already parses these:
- `ContextWindowEntry`: usedTokens, maxTokens, utilization percentage
- `AssistantUsageEntry`: promptTokens, completionTokens, cachedTokens

These reveal critical efficiency signals:
- When did context compaction trigger?
- Which subagents consumed the most tokens?
- Was caching effective?
- Did any subagent approach the context window limit?

The run-analyzer ignores all of this.

### Finding 7: Agent-improver has no subagent-level findings to act on ❌ **HIGH (downstream)**

Because the run-analyzer only produces orchestrator-level analysis, the agent-improver has no data about:
- Subagent prompt quality issues
- Missing skills that a specific subagent could use
- MCP tool gaps for specific subagent workflows
- Tool call patterns suggesting subagent prompt refinement

The improver's scope includes `profiles/*/agents/`, `shared/skills/`, `shared/mcp-servers/` — but it can't make informed changes without subagent-level analysis data.

### Finding 8: No cross-run comparison ❌ **MEDIUM**

The operation ledger at `output/logs/history/{{ taskId }}.json` is mentioned but not used for:
- Comparing this run's performance against previous runs of the same issue
- Detecting regression patterns
- Tracking improvement effectiveness over time

### Finding 9: Scientist hook has no skills mounted ⚠️ **LOW**

The `postTaskHooks` stage config in `profile.json` has no `skills` array:
```json
{
  "agent": "ralph.scientist",
  "role": "scientist",
  "mode": "local",
  "model": "claude-opus-4.6"
}
```

The run-analyzer mentions "use the **agent-eval** skill" but this skill isn't explicitly mounted. In local mode, the agent may have access to `.github/skills/` in the orchestrator repo workspace, but this is implicit and fragile. The `agent-eval`, `agent-as-function-audit`, `skill-creator`, and `mcp-builder` skills should be explicitly mounted for the scientist family.

### Finding 10: Agent-improver reads wrong path ⚠️ **LOW**

The agent-improver prompt says:
> "Read `{{ hook.outputDir }}/analysis.md` completely"

But the run-analyzer writes to:
> `{{ artifactDir }}/{{ agentName }}/output.md`

The paths don't match. The agent-improver should read `{{ artifactDir }}/run-analyzer/output.md`, which it correctly specifies elsewhere in the same prompt:
> "read the full analysis at: `{{ artifactDir }}/run-analyzer/output.md`"

This is an inconsistency — two different path references in the same prompt for the same file.

---

## 3. Gap Analysis: What the Scientist Family Should Do vs. What It Does

### Currently Does

| Capability | Scope |
|---|---|
| Summary.json review | Orchestrator-level |
| Orchestrator tool sequence analysis | Top-level tool calls only |
| Error recovery assessment | Orchestrator-level only |
| Proxy & MCP health | Infrastructure-level |
| Workflow compliance check | Phase completion only |
| Content quality (Malph reviews) | Reviewer output substance |
| Template variable resolution | Spot-check |

### Should Do (Gap)

| Missing Capability | Data Source | Value |
|---|---|---|
| **Per-subagent tool call analysis** | `cli-debug.log` subagent spans | Identify each subagent's efficiency, tool selection quality, error recovery |
| **Per-subagent token/context analysis** | `cli-debug.log` assistant_usage + CompactionProcessor | Token cost per subagent, context pressure, caching effectiveness |
| **Subagent artifact quality** | `artifacts/*/output.md`, `status.json` | Research thoroughness, writing quality, review finding validity |
| **Tool call gap identification** | Per-subagent tool calls vs available MCP tools | Did a subagent miss an available tool that would help? |
| **Skill gap identification** | Per-subagent tool calls vs mounted skills | Did a subagent fail to load a relevant skill? |
| **Prompt effectiveness** | Dispatch prompt vs subagent behavior | Did the subagent follow its dispatch prompt? |
| **Subagent timing analysis** | Subagent start/end timestamps | Which subagents are bottlenecks? |
| **Cross-run comparison** | Operation ledger history | Is this run better/worse than previous? |
| **Alternative workflow suggestion** | Full execution analysis | Could a different orchestration flow be more efficient? |

---

## 4. Proposed Changes

### Change 1: Add `cli-debug.log` to the run-analyzer's log catalog

**File:** `shared/agent-includes/post-hooks/run-analyzer.md`
**Section:** "Collected log files"

Add:
```
- `*-cli-debug.log` — Full CLI debug log with subagent lifecycle events, per-subagent tool calls, model usage, context window utilization
- `*-state.md` — Final pipeline state (phases completed, key decisions, tracked identifiers)  
- `*-artifacts/` — Directory containing per-subagent output artifacts (status.json, output.md, manifest.json)
```

### Change 2: Add per-subagent analysis loop to run-analyzer

**File:** `shared/agent-includes/post-hooks/run-analyzer.md`
**Section:** New section after step 2 (Tool sequence analysis)

Add a new analysis step: **"Subagent Execution Analysis"**

This is the core improvement. The run-analyzer should:

1. Read `cli-debug.log` and identify all subagent spans by looking for `subagent_started` / `subagent_completed` telemetry events
2. For each subagent span, extract:
   - Agent name, model used, fallback status
   - Duration (start to completion)
   - Tool calls within the span (look for `tool_calls` arrays and `tool_call_executed` events between the span boundaries)
   - Model call count (assistant_usage events within the span)
3. For each subagent, analyze:
   - **Tool selection quality** — Did it use the right tools for its role? (e.g., researcher should use grep/glob/view/MCP searches; writer should use create/edit/bash-build)
   - **Efficiency** — Were there redundant reads, excessive retries, unnecessary searches?
   - **Error recovery** — Did it handle tool failures gracefully?
   - **Duration proportionality** — Is the time spent reasonable for its role?
   - **MCP tool utilization** — Did it use available MCP tools, or miss them?
   - **Skill utilization** — Did it load and use relevant skills?

Document the subagent span identification format:
```
Subagent spans in cli-debug.log are delimited by telemetry events:
- Start: `kind: subagent_started` followed by `Agent "<name>" getOrCreateAgent: final model="<model>"`
- End: `kind: subagent_completed`
- Tool calls within a span: look for `"tool_calls": [` arrays containing `"function": { "name": "<tool>" }`
- Each `kind: tool_call_executed` event within the span boundary increments the tool call count
- Each `kind: assistant_usage` event represents one LLM turn
```

### Change 3: Add subagent artifact review to run-analyzer

**File:** `shared/agent-includes/post-hooks/run-analyzer.md`
**Section:** New step after subagent execution analysis

Add step: **"Subagent Artifact Quality"**

1. List contents of `*-artifacts/` directory
2. For each subagent directory, read `status.json`:
   - Are all 7 required fields present? (`agent`, `task_id`, `status`, `result`, `summary`, `artifacts`, `next_hint`, `iteration`)
   - Is the result code correct for the agent type?
   - Is the summary routing-grade (concise, actionable)?
3. Check `manifest.json` for completeness — every subagent should have an entry
4. For output-producing subagents (researcher, writer, validator), spot-check `output.md`:
   - Does the research report cover the key areas from the JIRA description?
   - Does the writer's output match the task's acceptance criteria?
   - Does the validator's output flag real issues?

### Change 4: Add token/context analysis to run-analyzer

**File:** `shared/agent-includes/post-hooks/run-analyzer.md`
**Section:** New step after subagent artifact quality

Add step: **"Token & Context Analysis"**

1. Search `cli-debug.log` for `CompactionProcessor` lines to find context window utilization snapshots
2. Note when context compaction triggered and for which subagent
3. Search for `assistant_usage` telemetry events to get per-turn token usage
4. Identify which subagents consumed the most tokens
5. Flag if any subagent approached context window limits (>80% utilization)

### Change 5: Add tool/skill/workflow gap identification

**File:** `shared/agent-includes/post-hooks/run-analyzer.md`
**Section:** Expand the "Improvement Suggestions" output section

For each subagent analyzed, the analyzer should produce:

1. **MCP tool gaps** — "The researcher searched ralphchives but didn't use microsoft-docs for the API reference. Consider adding microsoft-docs to its research flow."
2. **Skill gaps** — "The writer loaded ralph-documentation-syntax but not ralph-codesamples when writing code samples. The code samples skill has patterns for code_link tags."
3. **Prompt gaps** — "The dispatch prompt for the reviewer didn't specify which files changed, so the reviewer had to discover them via git diff, adding 3 unnecessary tool calls."
4. **Alternative workflow suggestions** — "The coder took 19 minutes. Since bootstrap is a mechanical procedure, consider a pre-baked script or dedicated MCP tool."

### Change 6: Restructure run-analyzer output format for subagent analysis

**File:** `shared/agent-includes/post-hooks/run-analyzer.md`
**Section:** Output structure

Update the markdown output template:

```markdown
# Execution Analysis: {{ taskId }}

## Summary
<!-- Status, duration, overall assessment (pass/warn/fail) -->

## Orchestrator Analysis
### Tool Usage Patterns
### Error Recovery  
### Workflow Compliance
### Template Variable Resolution

## Subagent Analysis

### Subagent: ralph-coder
- **Model:** claude-opus-4.6 | **Duration:** 18m 51s | **Tool calls:** 47 | **LLM turns:** 12
- **Tool Selection:** [rating + notes]
- **Efficiency:** [rating + notes]  
- **Error Recovery:** [rating + notes]
- **MCP Utilization:** [notes on tools used/missed]
- **Key Issues:** [list]

### Subagent: ralph-researcher
<!-- same structure -->

### Subagent: ralph-writer  
<!-- same structure -->

### Subagent: ralph-validator
<!-- same structure -->

### Subagent: ralph-reviewer-technical
<!-- same structure -->

### Subagent: ralph-reviewer-ia
<!-- same structure -->

### Subagent: ralph-reviewer-style
<!-- same structure -->

### Subagent: ralph-scribe
<!-- same structure -->

## Artifact Quality
<!-- status.json completeness, manifest.json trail, output quality -->

## Token & Context Budget
<!-- Per-subagent token consumption, context utilization trends, compaction events -->

## Proxy & MCP Infrastructure
<!-- Blocked domains, MCP errors, tool infrastructure issues -->

## Improvement Suggestions
### Agent Prompt Improvements
### Skill Gaps
### MCP Tool Gaps  
### Workflow Optimization
### Alternative Flow Proposals
```

### Change 7: Fix agent-improver path inconsistency

**File:** `shared/agent-includes/post-hooks/agent-improver.md`
**Section:** Workflow step 1

Change:
```
1. Read `{{ hook.outputDir }}/analysis.md` completely
```
To:
```
1. Read `{{ artifactDir }}/run-analyzer/output.md` completely
```

### Change 8: Mount skills on scientist hook stage

**File:** `profiles/ralph-docs/profile.json`
**Section:** `postTaskHooks` in both Ralph and Malph variants

Add skills to the scientist stage:
```json
{
  "agent": "ralph.scientist",
  "role": "scientist",
  "mode": "local",
  "model": "claude-opus-4.6",
  "skills": [
    "agent-eval",
    "agent-as-function-audit",
    "skill-creator",
    "mcp-builder"
  ]
}
```

### Change 9: Add subagent-sourced improvement guidance to agent-improver

**File:** `shared/agent-includes/post-hooks/agent-improver.md`

The agent-improver currently handles findings generically. With per-subagent analysis in the run-analyzer output, the improver needs guidance on how to act on subagent-level findings:

Add to the "Scope of Changes" section:
```
### Subagent-Level Improvements

When the analysis identifies issues with a specific subagent, determine the root cause layer:

| Layer | What to change | Example |
|---|---|---|
| **Dispatch prompt** | The orchestrator's routing logic or subagent dispatch prompt | Researcher dispatch should include specific research questions |
| **Subagent template** | The subagent's own `.agent.md` or included partial | Writer template needs stronger emphasis on build verification |
| **Mounted skill** | A skill the subagent loads or should load | Add ralph-codesamples to writer's skill load sequence |
| **MCP tool** | A tool the subagent should use or needs configured | Researcher should use microsoft-docs for API reference lookups |
| **Workflow phase** | The workflow skill governing the phase | Review phase should specify changed files in reviewer dispatch |
| **New subagent** | A gap that warrants a new dedicated subagent | Dedicated "code sample verifier" subagent for post-write validation |
```

---

## 5. Stretch Goals: Meta-Level Improvements

### Alternative Orchestration Flow via Tool Call

The scientist could suggest entirely different orchestration flows — for example:
- "This task type (code sample migration) would benefit from a dedicated `code-sample-migrator` subagent instead of going through the general researcher → writer pipeline"
- "The reviewer panel found zero issues across 3 reviewers. Consider a fast-track path that uses a single reviewer for clean tasks"

This would require a `workflow-suggestion` output section in the run-analyzer that the agent-improver could potentially implement by modifying the orchestrator's routing table or creating new agent templates.

### Cross-Run Trend Analysis

Use the operation ledger history to build trend data:
- Average tool call efficiency ratio per task type
- Common failure patterns across runs
- Improvement effectiveness tracking (did last round's prompt changes help?)

This could be a third subagent in the scientist pipeline ("trend-analyzer") or a separate periodic hook.

### Self-Referencing Improvement Loop

The scientist analyzes the main pipeline but not itself. A meta-level improvement would be to have the scientist also evaluate its own previous run:
- Was the run-analyzer's analysis accurate and actionable?
- Were the agent-improver's changes effective?
- Did this round's suggestions actually get implemented?

---

## 6. Implementation Priority

| Priority | Change | Effort | Impact |
|---|---|---|---|
| **P0** | Change 1: Add cli-debug.log to catalog | Low | Unblocks all subagent analysis |
| **P0** | Change 2: Per-subagent analysis loop | High | Core gap — the entire value proposition |
| **P1** | Change 3: Subagent artifact review | Medium | Validates output quality, not just process |
| **P1** | Change 6: Restructured output format | Medium | Needed for agent-improver to act on findings |
| **P1** | Change 7: Fix path inconsistency | Trivial | Bug fix |
| **P2** | Change 4: Token/context analysis | Medium | Efficiency optimization insights |
| **P2** | Change 5: Gap identification guidance | Medium | Makes suggestions more actionable |
| **P2** | Change 8: Mount skills on scientist | Trivial | Better skill access for the pipeline |
| **P2** | Change 9: Subagent improvement guidance | Medium | Makes agent-improver more effective |

---

## 7. CLI Debug Log Parsing Guide for the Run-Analyzer

Since the run-analyzer is an LLM agent reading files (not running TypeScript), it needs a text-based parsing guide for `cli-debug.log`. Here's the pattern reference it should receive:

### Subagent Span Detection
```
# Start marker — look for this telemetry event:
<timestamp> [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_started)

# Agent identification — within the next ~5 lines:
<timestamp> [DEBUG] Agent "<family>.<name>" getOrCreateAgent: final model="<model>"

# End marker:
<timestamp> [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_completed)
```

### Tool Call Detection Within a Span
```
# Tool calls appear as JSON arrays between span start and end:
"tool_calls": [
  {
    "function": {
      "name": "<tool_name>",
      "arguments": "<json_args>"
    }
  }
]

# Each executed tool call has a telemetry event:
<timestamp> [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: tool_call_executed)

# Tool invocation results:
<timestamp> [DEBUG] Tool invocation result: <json_or_text>
```

### Model Fallback Detection
```
# Model availability check:
<timestamp> [DEBUG] Agent "<name>": definitionModel="<wanted>", sessionModel="<session>", availableModels=[...]

# Fallback warning:
<timestamp> [INFO] Agent "<name>" definition model "<wanted>" is not available, falling back to session model "<actual>"
```

### Context Window Utilization
```
# CompactionProcessor lines:
<timestamp> [DEBUG] CompactionProcessor: <used_tokens>/<max_tokens> (<pct>%)

# Per-turn token usage:
<timestamp> [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: assistant_usage)
# Followed by JSON with prompt_tokens, completion_tokens, cached_tokens
```

### Practical Approach for the Run-Analyzer

Since the cli-debug.log can be 35K+ lines, the run-analyzer should:
1. Use `grep -n "subagent_started\|subagent_completed\|Agent.*getOrCreateAgent.*final model" <file>` to map all subagent spans first
2. For each span, use `sed -n '<start>,<end>p' <file> | grep -c "tool_call_executed"` to count tool calls
3. For high-priority subagents (or flagged ones), use `sed` to extract the span section and analyze tool call sequences in detail
4. Use `grep "CompactionProcessor\|assistant_usage" <file>` for token/context analysis

This approach keeps the analysis within the run-analyzer's LLM tool capabilities (bash + grep/sed/awk) without needing to run TypeScript parsers.
