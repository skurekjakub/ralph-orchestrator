# Evaluation Approach 1: Trajectory & Process Analysis

## Philosophy

This approach treats a completed agent run not as a pass/fail event, but as a **trajectory** — an ordered sequence of tool invocations, reasoning steps, and environmental state changes — and evaluates quality at each step. The insight, drawn from Process Reward Model (PRM) research and Anthropic's own distinction between _transcript graders_ and _outcome graders_, is that two runs with identical final outcomes may differ dramatically in quality: one may have reached a correct PR through a principled plan, the other through lucky guessing after a dozen retries.

The orchestrator already captures everything needed: `audit.jsonl` records every tool invocation with timestamps, `tool-output.log` records what came back, and `transcript.md` (Copilot) or equivalent captures the full reasoning trace. This approach turns those raw artifacts into structured quality signals _offline_, after each task completes, without requiring any changes to the agent's container or prompt.

**Ground truth**: a human-authored or LLM-generated _reference trajectory_ for each golden task — specifying which tools should be called, in which order, with what general intent, and what an acceptable result at each step looks like. Strict order matching is too brittle; the right model is _semantic intent matching at step level_, similar to LangChain AgentEvals' subset mode.

---

## Metrics

### Tool Execution Quality

**Tool Selection Accuracy**
For each tool call in the trajectory, does it match the expected tool call at that step? Measured as the fraction of tool invocations that select the intended tool from the available MCP set. Misselection is more diagnostic than total failure because it reveals _reasoning errors_, not just environmental problems.

**Argument Correctness**
The correct tool called with wrong parameters is as harmful as selecting the wrong tool. Each invocation's arguments are evaluated by an LLM rubric against the expected argument intent (not exact match, since file paths and issue IDs vary). Score: correct / total invocations. Tracked separately per MCP server (`jira-kentico`, `ado`, `playwright`, etc.) to diagnose server-specific failure patterns.

**Tool Invocation Efficiency (Step Efficiency Score)**
Step count relative to a reference: `reference_step_count / actual_step_count`, capped at 1.0. A score of 0.5 means the agent took twice as many steps as necessary. This is the metric most sensitive to model changes — GPT-4-class models often solve tasks in half the steps of weaker models, which compresses from both ends (fewer errors = fewer retries; better planning = fewer exploratory calls).

**Retry Rate**
Fraction of tool calls that are re-invocations of the same tool with the same or functionally equivalent parameters after a failure or non-useful result. High retry rate signals poor error handling and weak parameter self-correction. Baseline: under 10% retries per task. Track per tool: Playwright retries (navigation failures) are expected; ADO PR creation retries are not.

**Dead-End Detection Rate**
Fraction of runs where the agent calls a tool, receives an error or empty result, and then proceeds as if the call succeeded. Identified by parsing tool output for error markers and checking whether subsequent reasoning acknowledges the failure. This is the most dangerous failure pattern — silent misinformation.

### Trajectory Coherence

**Plan Adherence**
For CLIs that emit a visible plan (e.g. "I will: 1. Fetch the issue, 2. Read source files, 3. Write documentation…"), does the agent follow through on stated steps? Measured by matching transcript plan declarations against subsequent tool calls. Divergence rate = fraction of stated plan steps that are skipped or replaced with something else. High divergence correlates with instruction-following degradation.

**Failure Localization Score**
When a task ends in `partial`, `blocked`, or `error` status, at which step in the trajectory did the first incorrect action occur? Operationalized as: re-run the trajectory through a trajectory grader and label each step correct/incorrect. The localization score is the fraction of failed tasks where the first error step can be identified with >80% confidence. This metric measures _debuggability_ — a trajectory that's easy to localize enables fast iteration; one that isn't wastes engineer time.

**Context Utilization**
Does the agent demonstrably use the information provided in the prompt? Measured by checking whether JIRA fields present in the prompt (issue type, labels, components, description) appear in subsequent tool call arguments or reasoning. An agent that ignores `issueComponents` despite it being clearly relevant is wasting the context window and the orchestrator's ADF-to-text conversion work.

### Coverage & Completeness

**Task Decomposition Coverage**
For multi-step documentation tasks, each task can be decomposed into sub-requirements (analogous to DevAI benchmark's 365 hierarchical requirements across 55 tasks). A task like "Write API reference for module X" decomposes into: discover the module, read its code, extract parameter types, write prose, create code examples, verify links. The coverage score is the fraction of sub-requirements addressed.

Practical construction: for each profile's task type, define a sub-requirement taxonomy once (human-authored, ~5–15 sub-requirements per task type). After each run, an LLM grader checks the transcript and output against the taxonomy.

**Handoff Completeness**
The handoff file is both the output artifact and the revision context. A complete handoff should contain: what was done, what files were changed, what the agent found challenging, what remains for the reviewer, and which ADO PR was created. Score as a rubric with 5 binary items — each item present or absent. Target: all 5 present for `completed` status runs.

---

## Architecture

### Data Flow

```
task completes
    ↓
LogCollector saves: audit.jsonl, tool-output.log, transcript.md, proxy.log, summary.json
    ↓
TrajectoryExtractor parses audit.jsonl into structured ToolCall[] with timestamps, args, outputs
    ↓
TrajectoryEvaluator runs the metric suite against the extracted trajectory
    ↓
EvalResultStore appends to output/evals/<issueKey>-<ts>-trajectory.json
    ↓
AggregationDashboard computes per-variant, per-profile, per-period aggregates
```

### Trajectory Extraction

The `audit.jsonl` format already captures pre-tool and post-tool events. The extractor:

1. Groups events into (invocation, result) pairs by tool call ID
2. Annotates each pair with: tool name, MCP server, latency, success/error flag, result length
3. Computes inter-step gaps (idle time between tool calls — long gaps suggest the agent is stuck)
4. Produces `Trajectory: { steps: ToolCallStep[], totalDuration, retryPairs, idleSegments }`

### Reference Trajectory Construction

Three sources, in decreasing priority:

1. **Expert-authored**: a human engineer writes the expected tool call sequence for a canonical version of each task type. Sparse but high quality.
2. **Best-run extraction**: from all historical runs of a given task type, extract the trajectory of the run with the best outcome and fewest steps. Use as reference after human review.
3. **LLM-generated**: given the task prompt and available tools, ask a capable model (Claude Opus, not the production model) to generate the expected trajectory. Cheapest to produce; requires validation.

References are stored versioned alongside prompt/profile versions. A reference from prompt version 3 is not valid for evaluating a run against prompt version 5.

### Metric Computation

Each metric runs as an independent evaluator function:

- **Deterministic evaluators** (retry rate, step count, invocation count): pure functions over the `Trajectory` struct. No LLM calls. Fast and cheap.
- **Rubric evaluators** (argument correctness, plan adherence, context utilization): LLM-as-judge calls with calibrated rubrics. Batched to minimize cost. Use a smaller, cheaper model (Sonnet rather than Opus) since inputs are structured and rubrics are well-defined.
- **Structural evaluators** (failure localization, coverage): hybrid — heuristic pre-filtering + LLM confirmation for ambiguous cases.

### Aggregation & Alerting

Aggregate metrics along three axes:

- **Per-variant** (`ralph.ralph`, `ralph.malph`, etc.): expose which variant is underperforming
- **Per-profile** (`ralph-docs`, `ralph-vscode`): expose infrastructure-level issues (MCP server problems show up here)
- **Per-time-window** (7-day rolling average): expose regressions after prompt or model updates

Alert thresholds (starting points, calibrated after 30 days of data):

- Step efficiency drops >20% week-over-week
- Retry rate exceeds 15% on any variant
- Dead-end detection rate exceeds 5%
- Plan adherence drops below 70%

---

## Implementation Notes

**Source of truth for tool calls**: the orchestrator currently runs both Copilot and Claude Code CLIs. Copilot's audit.jsonl (from shared/hooks/) has a known format. Claude Code's tool call logging format needs to be confirmed or standardized.

**Calibration gap**: reference trajectories are expensive to create at scale. Start with the 5 most common task types per profile. Use the reference-free metrics (step count, retry rate, dead-ends) first since they require no reference and already provide significant signal.

**Trajectory matching strictness**: never require exact tool call sequence matching. The right granularity is _intent matching at each step_ — "the agent should query the JIRA issue early in the trajectory" not "the agent should call `get_issue` as step 2 with exactly these fields". Strict matching has false positive rates exceeding 50% in practice (WebArena experience).

**Integration point**: the orchestrator's `TaskRunner` already has access to the `summary.json` and collected logs. A post-run hook (called after `collectLogs`) can trigger the trajectory evaluator asynchronously without blocking the main loop.

---

## Task Complexity Taxonomy (Kentico Docs)

Drawn from TaskCraft's structural taxonomy (arXiv:2506.10055) and SWE-bench Pro's quantitative complexity filters, adapted to the Kentico docs repository structure. Task difficulty is measured before evaluation, not inferred post-hoc from pass rate.

| Tier | Name               | Files | Lines changed | Dependencies                                    | Example                                                                                                                                          |
| ---- | ------------------ | ----- | ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Atomic             | 1     | 1–15          | None                                            | Fix a broken `{% page_link %}` identifier; add a `{% note %}` to one page; update `order` in frontmatter                                         |
| 2    | Depth-Sequential   | 2–3   | 10–60         | Each file depends on the previous               | New documentation page (`.md` + `_data/pagetree/documentation.yml` entry + `related_pages` on sibling pages)                                     |
| 3    | Width-Parallel     | 3–6   | 50–150        | Parallel changes that converge in the PR        | New feature docs: concept page + how-to page + nav update + one code sample `.cs` file                                                           |
| 4    | Complex-Integrated | 6–15  | 100–500+      | Multi-phase with cross-file memory requirements | Major feature launch: 4–6 new pages + nav hierarchy + code sample project + changelog entry + related-page cross-references on 5+ existing pages |

**Trajectory implications by tier:**

- Tier 1: 3–8 expected tool calls. Deviation of >15 calls is a strong signal of confusion.
- Tier 2: 8–20 calls. The critical structural dependency is that the agent reads `documentation.yml` _before_ writing the new page (to determine correct parent identifier and `order` value).
- Tier 3: 20–50 calls. The ordering constraint loosens — research can happen in any order — but the PR must combine all changes atomically.
- Tier 4: 50–150 calls. The most valuable test of cross-file memory: changes made in step 1 (new identifier generated for page A) must be referenced correctly in step 15 (cross-reference from page B). Agents that regenerate a different identifier partway through produce broken links.

---

## Ground Truth Design

### What Ground Truth Means for Trajectory Evaluation

For trajectory evaluation, ground truth is a **reference trajectory**: a specification of which tool calls should appear, in which semantic order, with what intent at each step. It is not an exact call sequence — the right model is _intent matching at step level_ (ToolPRMBench, arXiv:2601.12294), where each step is classified as a binary correct/incorrect decision based on whether it advances the task toward the goal, not whether it matches a specific function call.

Ground truth for trajectories has two components:

1. **Structural ground truth** — deterministic facts about what the agent _must_ interact with: which files must be read, which API tools must be called, which files must be created or modified
2. **Behavioral ground truth** — the expected semantic intent at each step: "agent should inspect the navigation tree before creating a new page" rather than "agent should call `get_file_contents` with path `src/_data/pagetree/documentation.yml` as step 4"

### Structural Ground Truth from the Repository

The Kentico docs repository provides several deterministic ground truth anchors that require no LLM judgment:

**Navigation integrity anchor**: any task that creates a new documentation page has a binary verifiable property — the new page's `identifier` value must appear in `src/_data/pagetree/documentation.yml` within the correct parent's `children` array. This is a pure string search, entirely deterministic. If this property is false, the page is unreachable from the navigation regardless of how well-written it is.

**`page_link` reference validity**: every `{% page_link IDENTIFIER %}` tag written by the agent must resolve to an actual page in the repository. The complete set of valid identifiers is the union of `identifier` values across all frontmatter in `src/_documentation/`. This is checkable without running Jekyll — parse the frontmatter of all `.md` files. An agent that writes a `page_link` to a non-existent identifier has introduced a broken link.

**`anchor` consistency**: `{% inpage_link "ANCHOR_NAME" %}` tags must reference a `{% anchor ANCHOR_NAME %}` defined within the same page. An agent that writes an inpage_link but forgets the corresponding anchor tag has written a broken internal reference. Checkable deterministically.

**Frontmatter completeness**: the set of required frontmatter fields (`title`, `persona`, `identifier`, `order`, `license`) is fixed by the Jekyll configuration. A new page missing any of these fields will fail to build. Entirely deterministic.

**Code sample compilation**: any `.cs` file added or modified in `src/_code/src/CodeSamples/` must compile as part of the `CodeSamples` project. The existing `npm run codesamples:build` script (which calls `dotnet build`) provides a deterministic pass/fail verdict. This is the strongest ground truth available for code sample changes — execution-based, no LLM needed.

### Reference Trajectory Construction from Git History

The kentico-docs-jekyll repository's git history is the primary source for reference trajectories. Each merged commit represents a completed documentation change that passed human review — the highest-quality ground truth available.

**Mining procedure:**

1. Run `git log --oneline -- src/_documentation/` to list commits touching documentation
2. For each commit, extract the change set with `git diff --name-only <parent>..<commit>`
3. Classify into the complexity tier based on file count and line delta
4. For each Tier 2–4 commit, reconstruct the _expected agent trajectory_ by working backwards: given these output files, what sequence of read operations would a well-functioning agent need to perform?

**Trajectory reconstruction heuristics:**

- If a new `.md` file was created → the agent must have read `documentation.yml` to determine the parent and order (step must appear in reference trajectory)
- If `related_pages` arrays were updated on existing pages → the agent must have read each of those pages before modifying them
- If a new `.cs` file was added → the agent must have read the corresponding Xperience source at `resources/repositories/xperience/CMSSolution/` to understand the API surface
- If the changelog was updated → the agent must have read the existing changelog format from a sibling entry

**Anchor steps** (mandatory, always in reference trajectory):

1. Read the JIRA issue early (first 3 steps)
2. Read `documentation.yml` before creating any new page
3. Read at least one sibling page for format reference before writing new content
4. Read relevant source code from `resources/repositories/xperience/` before writing API documentation
5. Compile code samples before committing (verified by `dotnet build` call or equivalent)

**Optional steps** (present in reference for complex tasks, absence is acceptable for simpler tasks):

- Reading the changelog format before updating it
- Reading `_configs/_config_primary.yml` to understand collection structure
- Checking for existing `related_pages` on affected pages before adding cross-references

### Per-Task-Type Step Budget

Derived from analysis of git history commits classified by tier. These are starting estimates, to be calibrated after 30 days of production data:

| Task Type               | Expected Steps (p50) | Expected Steps (p95) | Critical Anchor Steps                                           |
| ----------------------- | -------------------- | -------------------- | --------------------------------------------------------------- |
| Fix broken page_link    | 4–6                  | 12                   | Read the referring page, verify identifier exists               |
| New documentation page  | 12–18                | 35                   | Read nav YAML, read 2 sibling pages, update nav YAML            |
| API reference page      | 20–35                | 60                   | Read source code, read nav YAML, compile code sample            |
| Revision (feedback)     | 10–20                | 40                   | Read original page + review comments, targeted edits            |
| Multi-page feature docs | 40–80                | 150                  | Read nav YAML early; consistent identifier use across all pages |
| .NET code sample update | 15–25                | 50                   | Read Xperience source, read existing sample, `dotnet build`     |
| Changelog + metadata    | 8–15                 | 30                   | Read existing changelog format, read version data files         |

---

## Human Refinement Work

The following work is required to operationalize trajectory evaluation. Each item is a concrete, bounded task.

### Reference Trajectory Authoring (One-Time, Per Task Type)

1. **Define 6–8 task type categories** covering the main operations the agent performs: new concept page, new tutorial page, new API reference, revision/feedback, cross-reference update, code sample addition, changelog entry, multi-page feature docs. Each category needs its own reference trajectory.

2. **For each task type, write the reference trajectory** as a list of anchor steps with semantic intent labels. Example: `[read_issue, read_nav_yaml, read_sibling_page×2, write_new_page, update_nav_yaml, add_related_pages, compile_code_sample, create_pr]`. Mark each step as mandatory or optional.

3. **Mine 30–50 historical production run logs** (from `output/logs/`) and manually classify each to a task type. For each run, annotate the actual trajectory against the reference: which anchor steps were hit, which were missed, which were extra.

4. **Calibrate step budgets** from the mined trajectories: use the p50 and p95 actual step counts from confirmed-successful historical runs as the step efficiency baseline.

5. **Identify the 5 most common failure patterns** from the mined logs (e.g., "agent writes new page but never updates navigation YAML", "agent reads wrong source file for API reference", "code sample created but never compiled"). These become named failure modes in the evaluator.

### Evaluation Rubric Authoring

6. **Write argument correctness rubrics** for the 5 most-called tools: `get_file_contents` (was the path correct and the correct file?), `create_or_update_file` (was the content structurally valid for the file type?), `jira_comment` (was the comment appropriately informative?), `create_pull_request` (were the title and description adequate?), `run_dotnet_build` (was it called in the right directory?).

7. **Write a context utilization rubric** that checks whether JIRA fields present in the prompt appear in agent reasoning: does an issue with `components: ["Commerce module"]` result in the agent reading Commerce-related source files?

8. **Define "plan adherence" extraction rules** for both Claude Code and Copilot CLI transcript formats: how to identify a plan declaration in the transcript, and how to match plan items to subsequent tool calls.

### Calibration Dataset Construction

9. **Build a calibration set of 30 annotated trajectory examples**: 10 known-good (all anchor steps hit, final status completed), 10 known-partial (some anchor steps missed, partial status), 10 known-failed (early anchor step missed, error status). Each example needs human-annotated step labels and a composite quality score.

10. **Run the calibration set through each evaluator and measure correlation** with human labels. Target: Spearman ρ > 0.75 for each evaluator before using it in production.

11. **Define alert thresholds** based on calibration set variance: the alert threshold for each metric should be set below the mean score of the known-partial examples (so partials trigger alerts) but above the known-failed examples (so alerts don't fire on every failure).

### Ongoing Maintenance

12. **After each new agent template version**: re-run the calibration set and verify evaluator scores don't drift more than 10% — if they do, the reference trajectories need updating.

13. **After each new task type is deployed**: within 30 days of first production run, author a reference trajectory for the new task type using the first 5 successful runs as a bootstrap.

---

## Prompt Architecture Levers

The orchestrator controls the full prompt pipeline — CLI prompt construction (`prompt.ts`), Liquid template rendering (`agent-includes.ts`), and shared includes — but cannot influence model weights or training. The strategies below are prompt-level approximations of what a Process Reward Model does at training time: narrowing the action space at each step, providing trajectory-shaped guidance, and maintaining cross-step memory.

Each strategy maps to specific trajectory metrics. The metric impact table at the end summarizes the relationship.

### Anchor Step Ordering Constraints

The reference trajectories define anchor steps (read nav YAML before creating pages, compile code samples before committing). These are currently implicit in the workflow prose. Making them **explicit temporal constraints** in the agent template converts behavioral ground truth into prompt-level hard rules:

```markdown
## Ordering Constraints (NEVER violate)

- You MUST read `src/_data/pagetree/documentation.yml` BEFORE writing any new `.md` file
- You MUST read at least 1 sibling page in the same nav section BEFORE writing content
- You MUST run `npm run build` AFTER every file creation/modification, BEFORE committing
- You MUST call `dotnet build` on code samples BEFORE committing `.cs` files
```

Anchor constraints directly target **plan adherence** and **dead-end detection**. An agent that skips an anchor step violates a stated constraint rather than an implicit expectation — making failure localization trivial.

### Task-Type-Specific Workflow Branches

The complexity taxonomy (Tier 1–4) shows that "fix broken page_link" (4–6 steps) and "multi-page feature docs" (40–80 steps) require fundamentally different workflows. Using Liquid conditionals (`triggerParams`, `issueLabels`, or `issueComponents`) to render task-type-specific workflow sections narrows the action space per task type:

- Each branch declares its own anchor steps, step budget, and critical-path tools
- An agent following a "new page" branch doesn't waste steps on revision-specific logic
- The reference trajectory for each task type corresponds to exactly one branch

This reduces the variance in tool selection and step count that comes from the agent inferring task structure from free-text JIRA descriptions.

### Step Budget Hints

The per-task-type step budgets (see "Per-Task-Type Step Budget" table) exist as eval-time knowledge. Moving them into the prompt creates a self-monitoring signal:

```markdown
**Complexity estimate: Tier 2 (Depth-Sequential).** Expected: 12–18 tool calls.
If you've exceeded 35 tool calls, STOP and evaluate whether you're in a retry loop.
```

Research (CLEAR, arXiv:2511.14136) shows a 35-point performance gap between agents with and without step-awareness. The budget hint doesn't prevent the agent from exceeding the count — it forces explicit acknowledgment, reducing silent runaway loops.

### Anti-Pattern Encoding

Rather than waiting for the eval pipeline to identify failure patterns post-hoc, encode known failure modes directly in the prompt as negative examples:

```markdown
## Known Failure Patterns — DO NOT REPEAT

- Creating a new page without adding its `identifier` to `documentation.yml` → page unreachable
- Writing `{% page_link IDENTIFIER %}` without verifying the identifier exists → broken link
- Reading Xperience source from the wrong namespace path (missing `CMS.` prefix) → hallucinated API claims
- Skipping `npm run build` after changes → broken build committed to PR
```

This is the cheapest, highest-ROI prompt change. The agent doesn't need to re-discover failure modes by trial — negative trajectory examples function as a lightweight process reward signal at the prompt level.

### Structured Intermediate Output Contracts

Sub-agent handoffs (researcher → main agent → reviewer) currently use free-text reports. Defining an explicit schema for each handoff preserves critical information (source file paths, identifiers, namespace mappings) across the multi-agent pipeline:

```markdown
The researcher MUST return a report with these sections:

1. **Existing Coverage**: file paths of all related existing doc pages
2. **Source Findings**: exact class names, method signatures, file paths in Xperience source
3. **Recommended Changes**: specific files to create/modify with rationale
4. **Reference Material**: URLs or paths the writer will need
```

Without a schema, information loss between phases is a primary source of **context utilization** failures — the main agent may re-derive information the researcher already found, or worse, derive it incorrectly.

### Self-Verification Checkpoints

Inline verification at critical decision points catches errors before they compound:

```markdown
After reading `documentation.yml`:

- Confirm the correct parent section and note the highest sibling `order` value
- If the parent section cannot be determined, STOP and document in the handoff

After writing a new page:

- Verify every `{% page_link %}` references an identifier confirmed to exist
- Verify every `{% anchor %}` has a corresponding `{% inpage_link %}`
```

These map directly to the structural ground truth anchors (navigation integrity, page*link validity, anchor consistency). Embedding the verification that eval checks \_after the fact* into the prompt _before the fact_ shortens the feedback loop from eval-time to execution-time.

### Context Window Pressure Management

For Tier 3–4 tasks (50–150 tool calls), late-trajectory degradation from context window pressure is the primary failure mode. Strategies:

- **Scratchpad pattern**: the agent maintains a running state file (`resources/chats/<KEY>/state.md`) with identifiers, file paths, and decisions. Re-read before each phase.
- **Summarization checkpoints**: "Before starting Phase 5, write a 5-line summary of all files modified and identifiers created so far."
- **Identifier pinning**: "The identifier you choose for a new page is FINAL. Write it to `state.md` immediately. Reference `state.md` for all subsequent `page_link` and `documentation.yml` entries — do not regenerate."

This targets the cross-file memory problem identified in Tier 4: identifiers chosen in step 5 must be consistent in step 40.

### Tool Selection Guidance Per Phase

With 20+ MCP tools available, phase-specific tool hints narrow the action space:

```markdown
### Phase 2: Research

Primary tools: `get_file_contents` (source code), `search_code` (find relevant files)
Do NOT use Playwright for source code research — use the local repo clone.

### Phase 7: Create PR

Primary tool: ADO REST API via `fetch` (see API reference)
Do NOT attempt git CLI for PR creation.
```

This is a tool-level curriculum — narrowing the action space per phase the same way PRM research narrows the search space at each step.

### Prompt Versioning as Eval Variable

Every prompt architecture change is a version bump evaluated against the same golden tasks. This creates the feedback loop:

```
prompt v3 → run golden tasks → trajectory eval → identify worst metric
    → targeted prompt change → prompt v4 → re-run → measure delta
```

Reference trajectories must be stored versioned alongside prompt versions. A reference from prompt v3 is invalid for evaluating runs against prompt v5 — the expected anchor steps may have changed.

### Strategy-to-Metric Impact Map

| Strategy                      | Primary Metric                             | Secondary Metrics           |
| ----------------------------- | ------------------------------------------ | --------------------------- |
| Anchor step constraints       | Plan adherence, dead-end detection         | Step efficiency             |
| Task-type workflow branches   | Tool selection accuracy, step efficiency   | Retry rate                  |
| Step budget hints             | Step efficiency, retry rate                | —                           |
| Anti-pattern encoding         | Dead-end detection, argument correctness   | Failure localization        |
| Intermediate output contracts | Context utilization, handoff completeness  | Task decomposition coverage |
| Self-verification checkpoints | Argument correctness, handoff completeness | Dead-end detection          |
| Context window management     | Plan adherence (late trajectory)           | Argument correctness        |
| Tool selection guidance       | Tool selection accuracy                    | Step efficiency             |
| Prompt versioning             | All metrics (meta-strategy)                | —                           |

---

## Research Basis (Updated 2025–2026)

**Trajectory and Process Evaluation:**

- LangChain AgentEvals trajectory match evaluators (strict/subset mode), 2025
- Anthropic Engineering: "Demystifying Evals for AI Agents" — outcome vs. transcript graders distinction
- ToolPRMBench (arXiv:2601.12294, Jan 2026): process reward models for tool-using agents; offline vs. online step-level sampling; direct methodology for converting agent trajectories into step-level test cases
- AgentPRM (arXiv:2502.10325): small 3B models with PRM supervision outperform GPT-4o baselines on ALFWorld; step-level grading enables partial credit
- Advancing Agentic Systems: Dynamic Task Decomposition (arXiv:2410.22457): SSI (Structural Similarity Index) is the strongest predictor of performance in sequential tasks; Node F1 and Tool F1 as complementary metrics
- Beyond Task Completion (arXiv:2512.12791): tool orchestration has the highest failure rate in complex scenarios; standard binary metrics miss failure modes entirely

**Task Complexity:**

- TaskCraft (arXiv:2506.10055, June 2025): atomic / depth-based / width-based taxonomy; generating atomic tasks using tool context yields 43% vs. 18.5% pass rate vs. direct prompting
- SWE-bench Pro (arXiv:2509.16941): quantitative complexity thresholds (10 lines minimum, 107.4 lines average across 4.1 files) as concrete baselines
- AI Agents vs. Agentic AI (arXiv:2505.10468): cross-file memory and planning as the key capability axes for multi-file sequential tasks

**Ground Truth Construction:**

- SCICOQA (arXiv:2601.12910, Jan 2026): cross-artifact consistency evaluation; ground truth as consistency constraints between artifacts, not a fixed reference text
- Reference-free Evaluation (arXiv:2501.12011, Jan 2025): property-based verification when multiple valid outputs exist
- Anthropic Engineering, 2025: "two domain experts should independently reach the same pass/fail verdict" as the ground truth validity test
- Towards a Science of Scaling Agent Systems (arXiv:2512.08296): sequential interdependence as the core requirement for true agentic benchmarks

**Benchmark Validity:**

- Agentic Benchmark Checklist / ABC (arXiv:2507.02825, NeurIPS 2025): benchmark overestimation up to 100%; provenance and versioning requirements
- CLEAR (arXiv:2511.14136): step efficiency as a primary metric; 35-point gap between single-run and multi-run evaluation
