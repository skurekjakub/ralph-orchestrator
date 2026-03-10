# Improvement Summary: DOC-3189

## Changes Made

### 1. Added `*.blob.core.windows.net` to proxy allowlist
- **File:** `profiles/ralph-docs/profile.json`
- **Finding:** Analysis §Improvement 1 — 372 proxy denials for NuGet CDN domains caused the entire execution to fail. ADO-hosted NuGet feeds redirect package downloads to `*.blob.core.windows.net` which was not on the allowlist.
- **Root cause:** Infrastructure issue — the proxy config was missing a required domain.
- **Change:** Added `.blob.core.windows.net` to the `allowlistDomains` array, positioned after the existing `.artifacts.visualstudio.com` entry. This allows NuGet package downloads from Azure Blob Storage CDN, which is where ADO feed packages are actually served from.

### 2. Added proxy/network fail-fast pattern to coder agent template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-coder.agent.md`
- **Finding:** Analysis §Improvement 2 — the coder subagent burned 20 model turns retrying proxy-blocked NuGet restores without ever writing a `status.json`. The existing "Known Failure Patterns" section covered PAT issues and missing system packages but had no guidance for network/proxy failures.
- **Root cause:** Agent behavior gap — the agent had no instructions about when to give up on network failures. Its existing fail-fast rules only covered prerequisites (license, PAT) and system packages.
- **Changes:**
  - Added "Proxy/network retry loop" to the Known Failure Patterns section with explicit 2-attempt limit and instructions to write `status.json` with `result: "failed"`.
  - Updated the result codes table to include "infra blocked" in the `failed` code description, making it clear that infrastructure problems are a valid failure reason.

### 3. Added proxy/network troubleshooting entry to bootstrap skill
- **File:** `shared/skills/tasks/ralph-codesamples-bootstrap/SKILL.md`
- **Finding:** Analysis §Improvement 2 — the bootstrap skill's troubleshooting table covered 401 errors and database issues but had no entry for proxy/network blocking, which is the exact failure mode observed.
- **Root cause:** Rule gap — the skill's troubleshooting guidance was incomplete. The coder follows this skill's troubleshooting section, so missing guidance here meant the agent had no framework for handling this failure class.
- **Change:** Added a new troubleshooting row for "Connection timeout or 403/407 on `*.blob.core.windows.net`" with cause explanation (egress proxy blocks Azure Blob Storage CDN) and fix instructions (write failed status, operator must update proxy allowlist).

### 4. Added explicit ralphchives search to Phase 1 setup reference
- **File:** `shared/skills/workflow/docs/ralph-workflow/references/1-setup.md`
- **Finding:** Analysis §Improvement 4 — the orchestrator's state.md showed "(pending search)" for Ralphchives findings, but the search was never performed before dispatching the coder. Prior task reports might have flagged the proxy issue.
- **Root cause:** Rule gap — the workflow table listed "ralphchives search" as part of Phase 1, and the scratchpad template included a "Ralphchives Findings" section, but the setup reference never explicitly instructed the agent to perform the search. The instruction was implied but not stated.
- **Change:** Added step 5 to the setup instructions: "Search Ralphchives for prior work related to this task" with explicit direction to search before Phase 1b or Phase 2.

### 5. Relaxed orchestrator ralphchives rule for Phase 1 Setup
- **File:** `profiles/ralph-docs/agents/ralph.ralph.agent.md`
- **Finding:** Analysis §Improvement 4 — the orchestrator's "What you NEVER do" section had a blanket prohibition: "Never call ralphchives search/read tools yourself — researching prior knowledge is ralph-researcher's job." This conflicted with the Phase 1 setup reference's intent that ralphchives be searched during setup.
- **Root cause:** Rule gap — the prohibition was too broad. It correctly prevents the orchestrator from doing deep content research (that's the researcher's job), but it also prevented a lightweight infrastructure-awareness check during setup that could have caught the proxy issue before wasting the coder's entire turn budget.
- **Change:** Narrowed the rule to "Never call ralphchives search/read tools yourself **outside of Phase 1 Setup**" and added explicit guidance that during Phase 1 Setup, the orchestrator SHOULD search ralphchives for known infrastructure issues.

## Proposed (Not Implemented)

### P1. `summary.json` duration tracking reports 0ms (Finding #3)
The pipeline's `summary.json` records `durationMs: 0` despite ~5 minute runtime. This is a code-level bug in the pipeline's duration tracking logic (likely in `src/`), not an agent template or skill issue. Requires investigation of how the pipeline captures start/end timestamps for subagent execution.

### P2. Audit trail missing post_tool events for final calls (Finding #5)
The audit JSONL has 12 pre_tool entries but only 10 post_tool entries — the session terminated ungracefully without flushing pending events. This is a pipeline shutdown handler issue in the execution infrastructure. The fix would be to add a shutdown hook that writes `terminated` status for any in-flight tool calls before exit.

## No Action Needed

(none — all 5 findings from the analysis were actionable; 3 were implemented as agent/config changes, 2 are proposed as infrastructure code changes)
