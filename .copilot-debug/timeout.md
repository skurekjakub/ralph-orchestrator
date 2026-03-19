
## What killed the top-level docwriter

### The smoking gun: no HTTP request was ever sent

Comparing the final "model call" against every other call in the log reveals a critical anomaly. A normal model call (e.g., process-1773936616979-8224.log) produces this telemetry sequence after "Start of group":

```
assistant_usage → model_call → request.sent → response (Request-ID ...) → data: {JSON}
```

The process-1773936616979-8224.log has **NONE of these**:

```
17:12:13.119  Start of group: Sending request to the AI model
17:12:13.183  executePromptDirectly completing: hasError=false, will return true  ← 64ms, ZERO HTTP artifacts
17:12:13.184  runPromptMode: exiting with code 0
17:12:13.185  [shutdown] Starting shutdown
```

This proves **the model was never called**. The `executePromptDirectly` function returned `succeeded=true` after 64ms without making an API request. Since `runPromptMode` interprets `succeeded=true` as "the agent is done," it exited with code 0.

Total model request starts in the session: **276**. Successful `model_call` completions: **242**. The 34-gap accounts for GOAWAY retries and this final phantom call.

### The timeline of events leading to exit

| Time | Event |
|---|---|
| 17:10:50.797 | Analysis-coordinator returns "Pass 2 Complete ✅, ready for Pass 3" (`finish_reason: stop`, text-only) |
| 17:10:50.809 | System notification queued: "analysis-coordinator-p2 has finished" |
| 17:10:55.670 | **Code-analyzer ERROR**: GOAWAY after 5 retries (94s total retry wait) |
| 17:10:55.671 | `subagent_failed` telemetry sent |
| 17:10:55.671 | **BUG**: System notification says "code-analyzer has completed successfully" (despite the error!) |
| 17:12:09.965 | `tool_call_executed` — top-level docwriter receives the analysis-coordinator result |
| 17:12:10.043 | New assistant turn starts for top-level docwriter |
| 17:12:11.251 | CompactionProcessor: 23.7% utilization (39,748/168,000 tokens) — **healthy** |
| 17:12:13.113 | `ImmediatePromptProcessor: Injecting immediate prompts` |
| 17:12:13.114-117 | **3** `pending_messages_modified` events (analysis-coord finish + code-analyzer "success" + ?) |
| 17:12:13.119 | "Sending request to the AI model" — **never actually sent** |
| 17:12:13.183 | `executePromptDirectly completing: succeeded=true` — 64ms, no HTTP |
| 17:12:13.184 | Exit with code 0 |

### Why the model call was skipped — three hypotheses

Since the CLI source isn't in the workspace, I can only rank hypotheses by evidence:

1. **Premium request budget exhausted** (most likely) — The `PremiumRequestProcessor` ran at 17:12:13.119. This processor tracks premium model requests across the session. With 276 request starts including retries from GOAWAY failures, it's plausible the session hit a per-conversation request cap. The processor would then signal "done" without making the HTTP call.

2. **Session wall-clock timeout** — Session started at 16:10:17, exit at 17:12:13 = **61 min 56 sec**. This is suspiciously close to a 60-minute timeout. The timeout might have been checked lazily (only when the next model call is about to be made), explaining the ~2 minute overshoot.

3. **CLI edge case with orphaned subagent notifications** — The code-analyzer errored at 17:10:55 (AFTER the analysis-coordinator already finished at 17:10:50). The "completed successfully" notification for a failed subagent, combined with the coordinator's result and 3 pending messages, may have triggered an unexpected early-return code path.

**What it was NOT:**
- Not a token/context issue (23.7% utilization, zero compactions on top-level)
- Not a model decision (no HTTP request was made, so the model never saw the context)
- Not the analysis-coordinator's fault (it correctly said "ready for Pass 3")

---

## Full issue inventory from the log

### Critical issues

| # | Issue | Lines | Impact |
|---|---|---|---|
| 1 | **Top-level docwriter exits without dispatching Pass 3** | 53970-53973 | Pipeline terminates after Pass 2 |
| 2 | **Research-scout context explosion** — reads 1.1MB doc-index.json via `view`, context jumps 29k→442k tokens (263% utilization) | 21206 | Agent killed, no output produced (already fixed) |
| 3 | **Code-analyzer GOAWAY death** — HTTP/2 503 after 5 retries, 94s retry wait | 53895 | Code analysis completed partially but final turn lost |
| 4 | **Misleading "completed successfully" for failed subagent** — `subagent_failed` telemetry immediately followed by "has completed successfully" notification | 53955-53956 | Upstream agents receive false success signals |

### Minor issues

| # | Issue | Lines | Impact |
|---|---|---|---|
| 5 | **Malformed agent frontmatter** — 3 files fail to parse: `_docwriter-directive-format-spec copy.md`, `documentation.research.agent.md`, `documentation.tech-writer.agent.md` | ~80-120 | Agents unavailable (non-blocking — these weren't needed) |
| 6 | **Memory load failure** — "GitHub repository name is required" | ~150 | Repo memory not loaded (non-blocking) |
| 7 | **Research-scout multi-death** — killed on 3 separate retry attempts (263%, 258%, 263% overflow each time) | 21206, 23093, 37895 | Analysis-coordinator correctly marked it "failed (non-blocking)" |

### The fix for issue #4 (misleading notification)

This is a CLI-level bug — the `runSubagent` infrastructure always sends "completed successfully" regardless of whether the subagent errored. You can't fix this in agent prompts, but you can **defensively instruct the top-level docwriter** to not trust completion notifications and instead check for actual artifacts.

### Recommended hardening for the top-level docwriter

To prevent the exit-without-continuing issue from happening even if the model IS called next time, you could add explicit continuation instructions to the docwriter orchestrator prompt — something like:

> **CRITICAL**: After receiving a coordinator result, you MUST dispatch the next pass. NEVER respond with text-only. The pipeline has 10 passes — always check `currentPass` and dispatch the next coordinator.

But this won't help if the CLI itself is preventing the model call. The root cause is likely infrastructure-level (request budget or session timeout), not prompt-level. 

Completed: *Synthesize findings for user* (3/3)