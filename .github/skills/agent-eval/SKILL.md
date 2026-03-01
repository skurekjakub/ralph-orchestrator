---
name: agent-eval
description: "Evaluate a completed Ralph agent execution for quality across tool selection, ordering, argument correctness, efficiency, error recovery, output accuracy, and workflow compliance. Use this skill whenever the user wants to evaluate, review, assess, score, grade, or analyze a completed agent run — whether from a transcript, log directory, or JIRA issue key. Also use when the user wants to compare agent runs, identify improvement areas, or build evaluation checklists for agent tasks. Trigger on phrases like 'evaluate this run', 'how did the agent do', 'score this execution', 'review the transcript', 'grade the agent', or 'what went wrong in this task'."
---

# Agent Execution Evaluation

Evaluate a completed Ralph agent run by decomposing the task into constituent sub-tasks, scoring each against standardized dimensions, and producing an actionable findings report.

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

**Verification method:** Read the source files the agent referenced and compare claims against actual code. Check `related_pages` identifiers with `grep -rn 'identifier: <id>'` in the target repo.

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

### D9: Sub-agent Utilization

Were sub-agents given good prompts and their outputs used effectively?

**What to check:**
- Researcher prompt includes specific research questions (not just "research this topic")
- Validator prompt specifies what to validate (list of subtasks/files)
- Reviewer receives the right scope (which files to review, what standards to apply)
- Sub-agent outputs are reflected in subsequent main agent actions (e.g., researcher findings populate state.md)
- Sub-agent skill loads are reasonable (they don't inherit loaded skills from main agent)

**Common failure pattern:** Researcher tries to load a nonexistent skill name. Main agent passes no context about already-completed searches, causing sub-agent to repeat them.

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

**Reading pre-tool.log is the fastest way to understand what happened.** Each line is one tool call with name and args — you can map the entire execution in minutes. Read transcript.md selectively after that.

**Sub-agent duplication is architecturally expected but still worth noting.** Sub-agents don't share the main agent's file cache or loaded skills. This means some re-reading is unavoidable. Score it as a 3–4 depending on severity, not as a failure.

**Build check frequency is a judgment call.** Two builds (after all changes + before commit) is the minimum for correctness. Three builds (early smoke test + after changes + before commit) is defensible for complex tasks. More than three is inefficient.

**Git push failures are expected in proxy environments.** The agent container routes through Squid proxy, which blocks direct git push. The correct behavior is to fall back to `ado_push_progress` MCP tool. Score the fallback as a positive (D5: 5) — the agent shouldn't waste time debugging the proxy.

**JIRA ack timing matters.** The ack comment tells the user "I'm working on this." If it goes out before the workspace is initialized and initialization then fails, the user gets a false signal. Score early acks as a D2 issue.

**For review agents, verdict correctness is the primary output.** A wrong verdict delivered with excellent formatting is worse than a correct verdict with mediocre formatting. Weight D6b heavily — an incorrect verdict in Phase 5 cascades into Phase 6 (wrong JIRA comment) and Phase 7 (wrong handoff). When a verdict error exists, note it as a finding in every phase it affects.

**Finding quality and verdict quality are independent.** An agent can produce excellent, well-evidenced findings (D6a: 5) and still reach the wrong verdict (D6b: 1) — this happened in the DOC-3143 Malph run where STY-001 was correctly identified but classified as non-blocking. Scoring D6 as a single blended number hides this. Always use the D6a/D6b split for review workflows.

**Chain commands carefully or don't chain them at all.** `cmd1 && cmd2 && cmd3` fails entirely if any command returns non-zero. For setup operations where each step has different failure modes, separate tool calls are more robust. Chaining is fine for read-only sequences like `cd /workspace && grep ...`.
