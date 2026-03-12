# Improvement Summary: Infrastructure (DOC-3176)

## Changes Made

### 1. Run-analyzer: Added infrastructure failure analysis mode
- **File:** `shared/agent-includes/post-hooks/run-analyzer.md`
- **Finding:** "Failure Analysis > Root Cause: CLI Crash on Startup" — the run-analyzer produced excellent infrastructure analysis despite its template only guiding per-subagent analysis. The template said "If the extraction file doesn't exist, write status `skipped` and stop" which contradicts what was actually needed.
- **Root cause:** Rule gap — the template had no guidance for infrastructure failures where the CLI crashes before any subagent executes.
- **Change:** Added a complete "Infrastructure Failure Analysis" section with:
  - **Mode Selection table** — heuristic to choose between per-subagent mode and infrastructure failure mode based on extraction file presence, cli-debug.log existence, and artifact availability
  - **6-step infrastructure analysis procedure** — evidence gathering, failure classification taxonomy (startup crash, setup failure, proxy block, MCP failure, timeout, resource exhaustion), proxy log analysis, sidecar health check, timeline reconstruction, and structured output template
  - Updated the old "skip if no extraction" instruction to route through mode selection instead of blindly skipping

### 2. Subagent-mapper: Added infrastructure metadata extraction fallback
- **File:** `shared/agent-includes/post-hooks/subagent-mapper.md`
- **Finding:** "Gap Identification > Infrastructure Gaps #1: Silent CLI failure" — when cli-debug.log doesn't exist, the mapper wrote `skipped` and the entire analysis pipeline short-circuited. No infrastructure metadata was preserved for downstream analysis.
- **Root cause:** Rule gap — the mapper template had a hard skip when cli-debug.log was missing, with no fallback to extract available infrastructure metadata.
- **Change:** Added "Step 1b: Infrastructure metadata extraction" that activates when cli-debug.log is missing. Extracts summary.json (status, exit code, duration), proxy logs (blocked domains), sidecar logs (MCP health), and session state. Writes a structured `infrastructure.md` extraction file with result `mapped` instead of `skipped`, allowing downstream run-analyzer to operate in infrastructure failure mode.

### 3. Ralph-vscode scientist: Infrastructure failure dispatch guidance
- **File:** `profiles/ralph-vscode/agents/ralph.scientist.agent.md`
- **Finding:** "Failure Analysis > Root Cause: CLI Crash on Startup" — the scientist's simpler dispatch model (run-analyzer → agent-improver) had no explicit guidance for infrastructure failures. The run-analyzer happened to do the right thing, but the dispatch context was generic.
- **Root cause:** Rule gap — the scientist template had no infrastructure-specific dispatch instructions.
- **Change:** Added infrastructure failure handling to Step 1 (dispatch run-analyzer) and Step 3 (dispatch agent-improver):
  - Explicit guidance to dispatch run-analyzer with target `"infrastructure"` for infrastructure failures
  - Explanation that the run-analyzer handles both modes automatically
  - Context for agent-improver explaining that infrastructure findings need pipeline code proposals rather than template edits

### 4. Ralph-docs scientist: Infrastructure failure path for mapper-skipped scenario
- **File:** `profiles/ralph-docs/agents/ralph.scientist.agent.md`
- **Finding:** "Gap Identification > Infrastructure Gaps #1: Silent CLI failure" — the docs scientist's full fan-out model (mapper → per-subagent analyzer+improver → synthesizer) would completely skip analysis when the mapper returned `mapped` with zero subagents, losing infrastructure insights.
- **Root cause:** Rule gap — the docs scientist had no routing for mapper returning infrastructure metadata instead of subagent spans.
- **Change:** Added "Step 2b: Infrastructure failure — single analyzer dispatch" that handles when the mapper returns `mapped` with infrastructure metadata only. Dispatches a single run-analyzer + agent-improver for infrastructure analysis, then skips to final status (no synthesizer needed for zero-subagent runs).

### 5. Agent-improver: Infrastructure-only findings guidance
- **File:** `shared/agent-includes/post-hooks/agent-improver.md`
- **Finding:** All 6 "Improvement Suggestions" from the analysis — the agent-improver template had good coverage for subagent-level improvements but no guidance for infrastructure-only findings where most issues are pipeline code, config, or diagnostic tooling.
- **Root cause:** Rule gap — the template's improvement layer table only covered subagent-related changes.
- **Change:** Added "Infrastructure-Only Findings" section with a decision table mapping finding types (pipeline code, proxy/network config, diagnostic tooling gap, post-hooks template gap, retry/resilience logic) to specific actions. Added key principle: for infrastructure failures, the primary value is improving the *diagnostic pipeline* rather than agent behavior.

### 6. Summary.json: Added failureCategory classification
- **File:** `src/logs/collector.ts`
- **Finding:** "Improvement Suggestions #5: Enrich summary.json with `failureCategory` field" — the summary only contained `"status": "error"` and `"exitCode": 1` with no way to distinguish infrastructure failures from task failures.
- **Root cause:** Infrastructure issue — the summary.json schema lacked failure classification data.
- **Change:** Added `classifyFailure()` function with heuristic-based classification:
  - `"infra"` — short run (<120s), no meaningful stdout/stderr (startup crash, auth failure, blocked API)
  - `"timeout"` — stdout mentions "timed out"
  - `"task"` — non-zero exit with meaningful output (agent was working but hit an error)
  - `"unknown"` — cannot determine from available signals
  - The `failureCategory` field is only emitted for non-completed runs (backward compatible)
  - Added 6 unit tests covering all classification paths

### 7. Tests for failureCategory classification
- **File:** `tests/logs/classify-failure.test.ts`
- **Finding:** "Improvement Suggestions #5" — the classification heuristic needs test coverage.
- **Root cause:** N/A (new test file)
- **Change:** Created 6 test cases verifying correct classification of: infra crash (short/no output), infra crash (minimal output), task failure (long/with output), timeout, unknown (long/no output), and completed runs.

## Proposed (Not Implemented)

### Infrastructure Issues

#### 1. Pre-flight connectivity check
- **Finding:** "Improvement Suggestions #1" — silent CLI crash with no debug log
- **Proposal:** Add a lightweight pre-flight check in `ContainerManager.setup()` (after setup script completes, before CLI launch) that verifies the Copilot API endpoint (`api.githubcopilot.com:443`) is reachable from inside the container. Implementation: `container.execInApp(["curl", "-sS", "--connect-timeout", "5", "https://api.githubcopilot.com"])`. If it fails, log the error clearly and still attempt CLI launch (non-blocking) so the failure is captured with diagnostic context.
- **File:** `src/container/manager.ts` — add to `prepareContainer()` after `setup()` and before hook execution

#### 2. Capture stdout alongside stderr from CLI process
- **Finding:** "Improvement Suggestions #2" — "no stderr captured" despite fatal error
- **Proposal:** The `shared-exec.ts` already captures both stdout and stderr via `StreamCapture`. The issue is that the `containerLogger` may not persist stdout to a file for short-lived sessions. Consider adding a fallback write of captured stdout/stderr to a file when the CLI exits non-zero and cli-debug.log doesn't exist.
- **File:** `src/container/cli-executors/shared-exec.ts` — in the catch block, write a `crash-report.txt` with captured stdout + stderr + exit code

#### 3. Write crash-report.txt on CLI crash
- **Finding:** "Improvement Suggestions #3" — no forensic data when CLI exits before creating cli-debug.log
- **Proposal:** In `TaskRunner.run()`, after `executeAgent()` returns, check if cli-debug.log exists in the container. If the exit code is non-zero and cli-debug.log is missing, write a `crash-report.txt` to the output directory containing: exit code, duration, captured stdout snippet, captured stderr snippet, container health check results, and proxy log last 50 lines.
- **File:** `src/services/task-runner.ts` — add a `writeCrashReport()` method called from the error path

#### 4. Single-retry for infrastructure failures
- **Finding:** "Improvement Suggestions #4" — run permanently failed on a transient-looking error
- **Proposal:** In the `TaskRunner.run()` error path, check if `classifyFailure()` returns `"infra"`. If so, and if this is the first attempt, retry once with a brief delay (5-10s). This catches transient API rate limits, network blips, and proxy startup races. The retry should be logged clearly and the summary should note it was a retry.
- **File:** `src/services/task-runner.ts` — wrap `executeAgent()` in a retry wrapper for infra-classified failures

#### 5. Proxy allowlist audit
- **Finding:** "Improvement Suggestions #6" and "Proxy Analysis" — `release-assets.githubusercontent.com:443` was blocked with TCP_DENIED/403
- **Proposal:** Add `.githubusercontent.com` to the base squid.conf allowlist. This domain serves GitHub release assets and is commonly needed during `npm install` for packages that download prebuilt binaries (esbuild, playwright, turbo, etc.). The current allowlist has `github.com` and `api.github.com` but misses the CDN used for release asset downloads.
- **File:** `shared/security/squid.conf` — add `acl allowed_domains dstdomain .githubusercontent.com` after the existing GitHub entries
- **Security note:** This is a broad wildcard (`.githubusercontent.com` covers raw content, avatars, release assets). A more restrictive option would be `release-assets.githubusercontent.com` specifically, but other subdomains (`raw.githubusercontent.com`) are also commonly needed for agent workflows.

### New Skills / MCP Servers

None identified — the infrastructure failures don't warrant new skills or MCP servers. The `task-failure-diagnosis` skill that already exists in the project covers the knowledge domain; the improvements made here codify that knowledge directly into the templates.

### Alternative Flow Proposals

None — infrastructure crash failures don't require alternative orchestration patterns. The existing scientist → run-analyzer → agent-improver flow is correct; it just needed explicit guidance for the infrastructure failure case.

### SOTA Suggestions

None — the improvements here follow established patterns for failure classification, diagnostic pipelines, and retry strategies. No novel approaches needed for this class of issue.

## No Action Needed

- **"Improvement Suggestions #6: Audit egress proxy allowlist"** — The proxy 403 for `release-assets.githubusercontent.com` occurred during setup (npm install), not during CLI execution. It's unclear whether this blocked request caused the CLI crash or was an unrelated package download attempt. Proposed in the Infrastructure Issues section above for human review rather than direct implementation, as adding CDN domains to the security allowlist requires careful consideration.
