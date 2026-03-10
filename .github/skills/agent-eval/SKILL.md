---
name: agent-eval
description: "Evaluate a completed Ralph agent execution for quality across tool selection, ordering, argument correctness, efficiency, error recovery, output accuracy, workflow compliance, and agent-as-function pattern adherence. Use this skill whenever the user wants to evaluate, review, assess, score, grade, or analyze a completed agent run — whether from a transcript, log directory, or JIRA issue key. Also use when the user wants to compare agent runs, identify improvement areas, or build evaluation checklists for agent tasks. Trigger on phrases like 'evaluate this run', 'how did the agent do', 'score this execution', 'review the transcript', 'grade the agent', or 'what went wrong in this task'."
---

# Agent Execution Evaluation

Evaluate a completed Ralph agent run by decomposing the task into constituent sub-tasks, scoring each against standardized dimensions — with particular focus on the **agent-as-function** pattern (filesystem artifact handoff, orchestrator purity, routing table compliance) — and producing an actionable findings report.

All Ralph agents follow the **agent-as-function** pattern: orchestrators dispatch subagents as pure functions, subagents communicate through filesystem artifacts (`status.json`, `output.md`, `manifest.json`), and orchestrators route on `status.json` — never reading artifact content. Evaluations must assess compliance with this pattern alongside traditional quality dimensions.

## When to Use

- After a completed agent run (successful or failed) when you want quality analysis
- When comparing two runs of the same task (e.g., before/after a prompt change)
- When building golden-dataset evaluation criteria for a task type
- When diagnosing why an agent run was slow, inefficient, or produced low-quality output

## Evaluation Workflow

### Phase 1: Gather Artifacts

Collect all available artifacts from the run. The log directory is at `output/logs/<key>-<startTs>/`.

| Artifact | Purpose | Required? |
|---|---|---|
| `*-pre-tool.log` | Complete tool call sequence (JSONL: tool name + args) — the single most important artifact | **Yes** |
| `*-transcript.md` | Full reasoning trace with tool outputs | **Yes** |
| `*-summary.json` | Duration, exit code, PR URL, status | **Yes** |
| `*-audit.jsonl` | Timestamped audit trail | Helpful |
| `*-proxy.log` | Squid proxy access log (allowed/denied domains) | Optional |
| `*-sidecar.log` | MCP sidecar output | Optional |
| Target repo branch | Actual output files for content verification | For content scoring |

**Reading strategy:**
1. Read `pre-tool.log` first — it's compact (one JSON line per tool call) and gives you the complete tool sequence
2. Read `summary.json` for metadata (duration, status, PR URL)
3. Use `grep` on `transcript.md` to locate key markers (`📦 task`, `report_intent`, `APPROVED`, `REJECTED`, `===RALPH_RESULT`) before reading sections
4. Read transcript sections selectively — don't read the entire file linearly

### Phase 2: Decompose Task

Break the JIRA issue into constituent sub-tasks the agent needed to accomplish. Each task should map to one logical unit of work.

Standard decomposition for a documentation task:

| ID | Task | Typical Tools |
|---|---|---|
| T1 | Setup | bash (git), create (state.md), MCP (JIRA ack), MCP (ralphchives) |
| T2 | Research | task (researcher sub-agent), grep, glob, view |
| T3 | Create content | create, view (sibling pages for reference) |
| T4 | Cross-references | edit (existing pages) |
| T5 | Build validation | bash (npm run build) |
| T6 | Release notes | create (if trigger param present) |
| T7 | Sub-agent validation | task (validator sub-agent) |
| T8 | Review | task (reviewer sub-agent), edit (apply fixes) |
| T9 | Commit & push | bash (git), MCP (ado_push_progress fallback) |
| T10 | Pull request | MCP (ado_create_pull_request) |
| T11 | Handoff & exit | create (handoff), MCP (JIRA attachments + comment), MCP (ralphchives) |

Adapt this table — not all tasks have all sub-tasks. A simple task might have T1, T3, T5, T9–T11.

Standard decomposition for a **review workflow** task:

| ID | Task | Typical Tools |
|---|---|---|
| T1 | Descend (setup) | bash (git), create (state.md), MCP (JIRA ack), MCP (ralphchives), MCP (ado_list_pull_requests) |
| T2 | Study the Law | view (style guides, standards docs) |
| T3 | Investigate | bash (git diff, git show, grep), view (modified files, sibling pages) |
| T4 | Verify Technical Claims | task (investigator sub-agent) |
| T5 | Review & Verdict | bash (convention analysis), edit (state.md with findings + verdict) |
| T6 | Deliver | MCP (jira_add_comment), MCP (ado PR thread comments) |
| T7 | Handoff & Exit | create (handoff), MCP (JIRA attachment), MCP (ralphchives), exit block |

Review workflows use **D6a/D6b** instead of D6 — see the dimension definition below.

### Phase 3: Score Each Task

Score each sub-task against applicable evaluation dimensions.

## Evaluation Dimensions

### D1: Tool Selection Correctness

Did the agent choose the right tool for each action?

**What to check:**
- `bash` for git operations, file system commands, build commands
- `create` for new files, `edit` for modifying existing files
- `view` for reading files in the target repo
- `grep`/`glob` for file discovery
- `skill` for loading workflow skills at phase boundaries
- `task` for sub-agent delegation
- MCP tools for external service calls (JIRA, ADO, ralphchives)

**Common failure pattern:** Using `bash` with `cat` to read files instead of `view`. Using `edit` when `create` is appropriate (new file). Chaining unrelated operations in a single `bash` call where one failure kills the entire chain.

### D2: Tool Call Ordering

Were calls sequenced logically with dependencies respected?

**What to check:**
- Preconditions satisfied before dependent operations (directory exists before file creation, branch created before commits)
- External notifications (JIRA ack) sent only after workspace is confirmed ready
- Build validation runs after all content changes, not after each individual change
- Sub-agents invoked after the main agent has gathered enough context to write a good prompt
- Phase boundaries respected (research before write, write before review)

**Common failure pattern:** JIRA ack comment posted before workspace initialization completes. Build check after only the new page, then another after cross-refs — two builds where one post-changes build would suffice.

### D3: Argument Quality

Were tool arguments correct on first attempt?

**What to check:**
- File paths correct (no typos, correct directory nesting)
- Git branch names follow conventions
- Search queries specific enough to be useful but broad enough to catch results
- Sub-agent prompts comprehensive with clear scope
- Commit messages follow conventional-commit format
- PR descriptions include per-file changes, context, and review notes
- JIRA comment formatting correct (monospace for code, emoji for status)

**Common failure pattern:** `git checkout -b` chained with `&& mkdir -p` — exit code propagation kills the chain. `create` called without verifying parent directory exists.

### D4: Efficiency

Were there unnecessary or redundant tool calls?

**What to check:**
- Duplicate searches (main agent + sub-agent searching the same terms in ralphchives)
- Sub-agent re-reading files the main agent already has in context
- Multiple build checks where fewer would suffice
- Recovery attempts that could have been avoided by checking preconditions
- Redundant skill loads (loading a skill that's already loaded — note: sub-agents don't share loaded skills, so this is expected for sub-agents)
- Setup phase tool count vs. minimum required

**Benchmark:** Count total tool calls, estimate minimum required, compute efficiency ratio. For a documentation task: setup ~5, research ~5–10, write ~5–15, cross-refs ~N (one per file), review/validate ~3–5, commit/PR/handoff ~10–12.

**Common failure pattern:** 5 ralphchives queries for a topic with zero prior coverage. Validator sub-agent re-reading all files the main agent just wrote.

### D5: Error Recovery

How did the agent handle tool failures?

**What to check:**
- Did it diagnose before retrying (e.g., `git branch -a` to understand why checkout failed)?
- Did it simplify the failing command (break a 4-command chain into individual commands)?
- Did it try a different approach (git push failed → ado_push_progress MCP tool)?
- Did it spin in a retry loop, or did it converge quickly?
- Did it acknowledge errors in its reasoning, or silently proceed as if the call succeeded?

**Red flags:** More than 2 retries of the same tool with the same arguments. Silent continuation after a failed tool call. No diagnostic step between failure and retry.

**Green flags:** Diagnostic-first recovery (check state before retry). Immediate fallback to alternative tools. Error acknowledged in reasoning.

### D6: Content Accuracy (output quality)

Does the created content accurately reflect source material?

**What to check (documentation tasks):**
- API signatures match source code (class names, method names, return types, generic constraints)
- Namespaces correct
- Code examples compile (or would compile given the right using statements)
- Behavioral descriptions match actual code behavior
- Cross-reference identifiers resolve to real pages
- No hallucinated API members or parameters

**What to check (code sample tasks):**
- Code compiles and runs against the target SDK version
- Package references and import statements are correct
- Variable names, method calls, and types match the API's public surface
- Error handling follows the SDK's idiomatic patterns (e.g., try/catch for async, result types)
- Code doesn't use deprecated APIs when current alternatives exist

**What to check (migration / refactoring tasks):**
- Behavioral parity — migrated code produces the same outputs for the same inputs
- No silent breaking changes (renamed exports, changed default values, removed overloads)
- Dependencies updated consistently (package.json, lock file, import paths)
- Build and test suites pass after migration

**What to check (analysis / post-hook tasks):**
- Metrics are correctly extracted from source data (log files, telemetry)
- Findings reference real evidence (actual tool calls, real error messages) — no hallucinated findings
- Improvement suggestions target files that exist and sections that are relevant
- Cross-references between subagent analyses are consistent

**Verification method:** Read the source files the agent referenced and compare claims against actual code. For docs tasks, check `related_pages` identifiers with `grep -rn 'identifier: <id>'` in the target repo. For code tasks, check build output. For analysis tasks, verify cited evidence against raw logs.

#### D6 in Review Workflows → D6a + D6b

For review agents (e.g., Malph), D6 conflates two outputs that can diverge sharply — a correct finding paired with a wrong verdict, or vice versa. Split D6 into two sub-dimensions:

**D6a: Finding Validity** — Are findings real, traceable, and correctly coded?
- Each finding cites a specific rule from a style guide or standard
- Issue codes match the finding category (STY for style, ACC for accuracy, REQ for requirements, SUG for suggestions)
- Evidence supports the finding (grep results, file comparisons, source code references)
- No hallucinated findings (claiming a problem that doesn't exist)

**D6b: Verdict Correctness** — Does the verdict follow mechanically from surviving findings?
- If any STY, ACC, or REQ findings survive the pre-verdict audit → NEEDS REVISION
- Only SUG-only findings allow APPROVE
- The verdict label in the JIRA comment is consistent with the finding codes listed
- "Non-blocking" classification is only applied to SUG-coded findings

Score D6a and D6b independently in the scoring matrix. Use the average of D6a and D6b when computing the dimension average for D6.

### D7: Style & Structure (output quality)

Does output match the conventions of the target repo?

**What to check (documentation tasks):**
- Frontmatter fields match sibling pages (identifier format, order value, persona, license, toc config)
- Callout types match conventions (`{% note %}`, `{% tip %}`, `{% code %}`)
- Heading levels consistent with sibling pages
- Code block formatting matches repo conventions
- Comparison tables follow existing patterns

**What to check (review workflows):**
- JIRA comment uses correct wiki markup (headings, monospace, bold, links)
- Findings are structured with issue codes, file locations, and suggested corrections
- PR thread comments are posted per-file at the relevant line (not batched at the end)
- Review language is professional and actionable — persona flavor is fine but substance comes first
- Source code URLs from sub-agent verification are carried through to the delivered comment

**Common failure pattern:** `maxHeadingLevel: 6` in toc config when siblings use `2` or `3`. Non-standard vocabulary (e.g., "invokable") that passes first draft but gets caught by reviewer.

### D8: Workflow Compliance

Did the agent follow the prescribed phase workflow?

**What to check:**
- Correct skill loaded at each phase boundary
- `report_intent` called at phase transitions
- `state.md` created in setup, updated at each phase transition
- Sub-agents invoked at the correct phase (researcher in research, validator after write, reviewer after validation)
- Phase order respected (no writing before research, no commit before review)

### D9: Agent-as-Function Compliance

All Ralph agents follow the subagent-as-function pattern. D9 evaluates how well the run adheres to this pattern across five sub-dimensions. Score each sub-dimension independently; report the average as the D9 score.

#### D9a: Artifact Contract

Did subagents produce the required filesystem artifacts?

**What to check:**
- Every subagent writes `status.json` with all 7 required fields (`agent`, `task_id`, `status`, `result`, `summary`, `artifacts`, `next_hint`, `iteration`)
- Every subagent writes a primary artifact (`output.md` or `output-v{N}.md` for iterative agents)
- Every subagent appends to the shared `manifest.json` audit log
- `result` codes match the declared set for that agent type (e.g., researcher: `researched`/`blocked`, writer: `implemented`/`partial`, reviewer: `approved`/`needs-revision`, mapper: `mapped`/`skipped`, analyzer: `analyzed`/`skipped`, synthesizer: `synthesized`/`skipped`)
- `summary` is routing-grade (~100 tokens, enough for decisions, not a report)
- Iterative agents use versioned artifacts (`output-v1.md`, `output-v2.md`) and increment `iteration`
- `next_hint` is populated where meaningful (researcher → writer, writer → reviewer)
- **Fan-out agents** use namespaced artifact paths: `run-analyzer/<target>/status.json`, `agent-improver/<target>/status.json` — one directory per target subagent
- **Mapper agents** produce both a master inventory (`output.md`) and per-item extraction files (`subagents/<name>.md`)

**Evidence sources:** Search `audit.jsonl` or transcript for `status.json`, `manifest.json`, `output.md` reads/writes. Check `pre-tool.log` for `cat .../status.json` commands. For fan-out pipelines, verify each dispatched instance writes to its own namespaced directory.

#### D9b: Orchestrator Purity

Does the orchestrator act as a pure router?

**What to check:**
- Orchestrator reads ONLY `status.json` from subagent directories — never `output.md` or any other artifact file
- Orchestrator never relays artifact content between subagents (subagents read each other's artifacts directly from the filesystem)
- Orchestrator's conversational context grows by only one-liners from subagent returns (`"Done. Status: completed, result: analyzed."`)
- Subagent dispatch prompts contain pointers to upstream artifacts (filesystem paths), not the content itself
- Administrative work (commit, push, PR, JIRA transitions) stays in the orchestrator — deep reasoning (research, writing, review) is always delegated

**Anti-patterns to flag:**
- `cat .../output.md` or `view .../output.md` by the orchestrator → purity violation
- Orchestrator prompt contains long relayed content from a subagent → data relay violation
- Orchestrator reading reviewer `output.md` to decide whether to revise → should route on `result` from `status.json`

**Documented exceptions:** Some orchestrators have narrow, documented exceptions to purity (e.g., scientist reads mapper `output.md` to get the subagent list for fan-out dispatch). These should be explicitly declared in the agent template. Score as 4 if the exception is documented, 2 if it's undocumented.

**Measuring context cleanliness:** Count total tokens from subagent returns entering orchestrator context. Ideal is ~5-10 tokens per subagent (one line). If any return exceeds ~100 tokens, flag as a violation. For fan-out orchestrators, this is per-dispatch — a 5-subagent fan-out means ~50 tokens total from analyzer returns, not 50 per subagent.

#### D9c: Data Flow

Do subagents read upstream artifacts from the filesystem, not from the orchestrator?

**What to check:**
- Writer dispatch prompt contains a path reference to researcher artifact (e.g., `"read the report at .ralph/tasks/{id}/artifacts/ralph-researcher/output.md"`) — NOT the content itself
- Reviewer dispatch prompts contain path references to writer artifacts — NOT file lists or content pasted from the orchestrator
- Downstream subagents (coder iteration 2+) read reviewer feedback from `reviewer/output-v{N}.md` directly
- No subagent prompt contains quoted content from another subagent's output
- **Fan-out dispatch** prompts point to the mapper's per-subagent extraction file (e.g., `"read extraction at .../subagent-mapper/subagents/<name>.md"`) — the orchestrator passes the path, not extracted data
- **Analyzer → improver** handoff passes the analyzer's namespaced output path (e.g., `"read analysis at .../run-analyzer/<name>/output.md"`) — not analysis content

**Per-dispatch check:** For each `task` tool call in `pre-tool.log`, examine the `prompt` argument:
1. Does it contain a filesystem path pointer to upstream artifacts? ✅
2. Does it contain inline content that came from another subagent? ❌
3. Does it contain task-definition content (JIRA issue, key constraints)? ⚠️ Acceptable if lean (<500 chars), anti-pattern if heavy (>1000 chars)

#### D9d: Subagent Prompt Quality

Were subagents dispatched with effective prompts?

**What to check:**
- Researcher prompt includes specific research questions, not just "research this topic"
- Writer prompt points to `ralph-researcher/output.md` and lists key constraints
- Reviewer prompts declare their input artifacts: `Input: ralph-writer/output-v{N}.md, changed files`
- Reviewer prompts include scope information: which files changed, what to verify, what standards apply
- All dispatch prompts include the task-id for artifact directory resolution
- Prompt length is proportional to task importance (researcher/writer get detailed prompts, reviewers get structured prompts — not one-liners)
- Sub-agent skill loads are reasonable (they don't inherit loaded skills from main agent)
- **Fan-out dispatch prompts** include: target subagent name, path to upstream artifact (mapper extraction or analyzer report), and namespaced output directory. Each fan-out dispatch should be self-contained — the dispatched agent shouldn't need to discover its target.

**Scoring guide:**
- 5: Every dispatch prompt has clear input artifact declarations, specific scope, and appropriate detail level
- 4: Most prompts are well-structured; one has minor gaps (e.g., missing file list in reviewer prompt)
- 3: Functional but with clear gaps — some prompts lack input declarations or scope
- 2: Multiple prompts are thin or relay content instead of using paths
- 1: Prompts are one-liners with no artifact references or scope

#### D9e: Routing Table Compliance

Does the orchestrator follow its declared routing table?

**What to check:**
- Every `(agent, result)` pair from the routing table is handled correctly when observed in the run
- Error/blocked paths lead to graceful exits, not hangs
- Iteration limits are enforced (e.g., max 2 write/review cycles)
- Parallel dispatch is used correctly (e.g., all 3 reviewers launched simultaneously, not sequentially)
- **Fan-out dispatch** follows the routing table per-iteration: for each mapped subagent, analyzer dispatched → result checked → improver dispatched if `analyzed` → result checked. Sequential per-subagent is correct; the key check is that the routing table is followed for each iteration.
- `next_hint` from `status.json` is considered but not blindly followed when the routing table specifies otherwise
- The routing table is explicitly declared in the orchestrator agent template (check the template file if evaluating template quality)
- **Post-fan-out routing** — synthesizer or other aggregate agents are dispatched only after all per-subagent dispatches complete, and their results are handled per the routing table (e.g., `skipped` if too few subagents)

**Scoring guide:**
- 5: All observed routing decisions match the declared table; parallel dispatch used where applicable
- 4: Routing decisions correct; minor deviation from declared table (e.g., checking agents in suboptimal order)
- 3: Routing works but no explicit table exists — routing is implicit in phase skill prose
- 2: Routing deviates from declared table or misses an edge case
- 1: Routing failures — wrong subagent dispatched, iteration limit violated, or hang on error path

### D10: Stopping Point

Did the agent stop at exactly the right time?

**What to check:**
- All deliverables submitted before `===RALPH_RESULT_START===` (handoff doc, JIRA attachments, completion comment, ralphchives report)
- No premature exit (missing attachments, uncommitted changes)
- No unnecessary post-completion work (extra edits after review approval, redundant JIRA comments)
- Exit block contains correct STATUS and PR_URL

## Grading Scale

| Grade | Meaning | Guidance |
|---|---|---|
| **5** | Optimal | Couldn't meaningfully improve. Perfect tool selection, no wasted calls, correct on first attempt. |
| **4** | Strong | Minor non-impactful issues. One unnecessary tool call, slightly suboptimal ordering, cosmetic style deviation. |
| **3** | Adequate | Functional but clear improvement opportunities. Multiple rework cycles, noticeable inefficiency, minor accuracy issues. |
| **2** | Below expectations | Significant issues affecting quality. Wrong tool choices, missing cross-references, incorrect API claims. |
| **1** | Failure | Dimension not satisfied. Content is wrong, workflow not followed, or task not completed. |

Not all dimensions apply to all tasks. Mark inapplicable cells with `—`.

## Output Format

Produce two files:

### 1. Evaluation Plan (`evals/<key>-eval-plan.md`)

Task decomposition, dimension checklist per task, pre-observations from data gathering. Use this as the working document during analysis. See [references/eval-plan-template.md](references/eval-plan-template.md) for the template.

### 2. Scored Evaluation (`evals/<key>-eval-scored.md`)

Per-task scoring tables with evidence, dimension averages, overall score, strengths, weaknesses, and actionable improvements. See [references/eval-scored-template.md](references/eval-scored-template.md) for the template.

## Tips from Experience

### Reading strategy

**pre-tool.log first.** Each line is one tool call with name and args — map the entire execution in minutes. Read transcript.md selectively after that.

**Transcript for purity checks.** Pre-tool.log shows what tools the orchestrator called, but you need the transcript to see if subagent returns leaked artifact content into the orchestrator's context. Grep for `output.md`, `cat `, and artifact directory paths in orchestrator sections.

### Architecture (D9)

**D9 is independent of D1–D8.** A run can score 5 on execution quality while scoring 2 on architecture (orchestrator reads output.md, relays data, no manifest). Always evaluate D9 separately.

**manifest.json is the newest contract requirement.** Many existing runs predate it — score current runs against the current contract, but note if the template itself doesn't include manifest.json instructions (template bug, not agent bug).

**Sub-agent duplication is expected.** Sub-agents don't share the main agent's file cache or loaded skills. Some re-reading is unavoidable. Score as 3–4 depending on severity, not as failure.

**Fan-out pipelines amplify purity checks.** A fan-out orchestrator dispatches the same agent type N times — verify each dispatch follows the routing table independently. One violation in a loop of 5 dispatches is minor; the same violation in every dispatch is systemic.

### Content quality (D6)

**For review agents, verdict correctness is the primary output.** A wrong verdict delivered with excellent formatting is worse than a correct verdict with mediocre formatting. Weight D6b heavily — an incorrect verdict cascades into JIRA comments and handoff.

**Finding quality and verdict quality are independent.** An agent can produce D6a: 5 and D6b: 1 — this happened in the DOC-3143 Malph run where STY-001 was correctly identified but classified as non-blocking. Always use the D6a/D6b split for review workflows.

### Tooling patterns

**Build check frequency is a judgment call.** Two builds (after all changes + before commit) is the minimum. Three (early smoke + after changes + before commit) is defensible for complex tasks. More than three is inefficient.

**Git push failures are expected in proxy environments.** The container routes through Squid proxy, which blocks direct git push. The correct fallback is `ado_push_progress` MCP tool. Score the fallback as D5: 5.

**Chain commands carefully or don't chain them.** `cmd1 && cmd2 && cmd3` fails entirely if any command returns non-zero. Separate tool calls are more robust for setup operations with different failure modes. Chaining is fine for read-only sequences.

### Workflow (D2, D8)

**JIRA ack timing matters.** The ack comment tells the user "I'm working on this." If it goes out before workspace initialization completes and init then fails, the user gets a false signal. Score early acks as D2 issue.
