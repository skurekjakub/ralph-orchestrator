# Task Shaping: Pre-Execution Planning for Ralph

## The Problem

Ralph's current flow is: poll JIRA → pick up issue → spin up container → agent starts working immediately.

This works well for well-defined tasks ("Add a callout to page X", "Update code samples for API Y"), but falls apart on vague, underspecified, or large-scope issues. When the JIRA description is thin, Ralph wastes expensive container time researching what to build, makes wrong assumptions, or produces work that misses the mark entirely.

What's needed is a **shaping step** — something that runs before the orchestrator commits to execution, analyzes the task, gathers context from the target repo and existing documentation, identifies gaps in the issue description, and produces a structured assessment that either:

- Enriches the task so Ralph can execute it well, or
- Flags it as needing human input before it's ready for an agent

This is the "are we ready to build?" question that currently gets skipped.

## Prior Art: What Others Do

### Basecamp Shape Up — "Shaping"

Shape Up introduces a **two-track system**: a shaping track (planning) runs separately from the building track (execution). Shaped work has three properties:

1. **Rough** — solution-level, not pixel-perfect. Leaves room for the builder.
2. **Solved** — main elements worked out, rabbit holes addressed.
3. **Bounded** — explicit scope, appetite (time budget), and no-gos.

The output is a **pitch** with five ingredients:
- **Problem**: specific story showing why the status quo doesn't work
- **Appetite**: fixed time budget that constrains the solution
- **Solution**: core elements at breadboard/fat-marker level
- **Rabbit holes**: tricky spots pre-addressed to prevent the builder from getting stuck
- **No-gos**: what's explicitly excluded

**Relevance to Ralph**: Shape Up's insight is that *vague work is unbounded work*. A JIRA issue that says "Document the custom module system" is too abstract — it becomes whatever the agent imagines. Shaping it into "Add a single page documenting module registration API, covering these 4 methods, with code samples, under /extending/" is bounded and executable.

### BMAD Method — 4-Phase Structured Planning

BMAD provides an opinionated multi-phase pipeline:

```
Analysis → Planning → Solutioning → Implementation
```

Key ideas:
- **Phase separation**: research/analysis is explicitly distinct from implementation
- **Gate checks**: `check-implementation-readiness` validates that epics/stories are complete before any code runs
- **Progressive context building**: each phase produces documents that feed the next (`project-context.md` → PRD → architecture → epics → stories)
- **Scale-adaptive**: small changes skip phases entirely via "Quick Flow"
- **Step-file architecture**: workflows decompose into sequential step files, each loaded JIT

**Relevance to Ralph**: BMAD's strongest idea is the **readiness gate** — a formal check that asks "has enough planning happened to make implementation safe?" Applied to Ralph: before the orchestrator starts a container, a shaping step could evaluate whether the JIRA issue meets minimum criteria for the target profile.

### Existing Over-Ralph — What Ralph Already Has

Over-Ralph (`@OverRalph` variant) already does something similar, but it's a **full orchestrator variant**, not a pre-step:

- Runs inside a Docker container (expensive: full Docker lifecycle)
- Uses Discord HITL for clarifying questions (2+ async round-trips, 120-min timeouts)
- Produces specification → plan → task breakdown (full PRD workflow)
- Researcher sub-agent gathers repo context
- Outputs structured markdown files

**What works**: The research + structured output approach is sound. The researcher sub-agent pattern (delegate repo exploration, get structured report) is excellent.

**What doesn't work for the shaping use case**: Over-Ralph is designed for *large epic decomposition* — it's overkill for evaluating whether a typical DOC-XXXX issue is ready for standard Ralph. It also requires Discord interaction (not always wanted) and runs as a full variant (container startup, MCP sidecar, the works).

---

## Options

### Option A: Lightweight Shaping Script (Standalone, Pre-Orchestrator)

**Concept**: A standalone script (like `scripts/run-agent.ts`) that you run manually before starting the orchestrator. It takes a JIRA issue key, fetches the issue details, clones/reads the target repo, and produces a shaping report without starting Docker containers.

```
npx tsx scripts/shape-task.ts DOC-3200
```

**How it works**:
1. Load config + profiles (reuse `AppStartup` config loading, skip Docker/MCP setup)
2. Fetch the JIRA issue via connector API
3. Match to a profile/variant based on project + status + trigger
4. Clone/read the target repo locally (shallow clone or use existing checkout)
5. Run an LLM analysis (direct API call to Claude/OpenAI — no container needed) with:
   - Full JIRA issue content
   - Relevant repo context (existing pages, navigation structure, style guides)
   - Profile-specific evaluation criteria (what makes a good doc task for this profile?)
6. Produce a structured shaping report

**Output**: Markdown file with structured assessment:

```markdown
# Shaping Report: DOC-3200

## Task Understanding
- What the issue is asking for (in the shaper's own words)
- Ambiguities and assumptions

## Readiness Assessment
- [x] Clear scope: single page or bounded set of changes
- [ ] Required context: API names, file paths, navigation location
- [ ] Acceptance criteria: measurable definition of done
- [x] No conflicting prior work (checked ralphchives)
- Rating: NEEDS_WORK | READY_WITH_NOTES | READY

## Repo Context Gathered
- Existing pages related to this area
- Navigation structure (where new content would go)
- Related code/API surface

## Gaps Found
1. Issue doesn't specify which API version
2. No mention of where in the pagetree this page belongs
3. Code samples requested but no reference implementation identified

## Suggested Description Enhancement
[A rewritten/enhanced version of the JIRA description that would
make this issue Ralph-ready]

## Scope Boundary (No-Gos)
- Things that look tempting but should be explicitly excluded
```

**Pros**:
- Zero infrastructure cost — no Docker, no MCP sidecar, no Squid proxy
- Fast iteration — run it, read the output, adjust the issue, run again
- Works outside the orchestrator — doesn't touch the main loop at all
- Can be used for any issue, not just ones matching a trigger
- Simple to build — a script, an API call, a template

**Cons**:
- No MCP tools (can't search ralphchives, can't browse docs site via Playwright)
- Repo context limited to what the script can gather via git/filesystem
- Requires a local Claude/OpenAI API key and direct API access
- Manual workflow — you have to run it yourself

**Variant A2: Script + MCP Sidecar Light**

Same as Option A but also spins up just the MCP sidecar (not the full app container) for tool access:
```
npx tsx scripts/shape-task.ts DOC-3200 --with-tools
```
This gives the shaping LLM access to JIRA, ADO, ralphchives, web-fetch — without the full container lifecycle. Adds startup cost but gets much richer context.

---

### Option B: Orchestrator Gate Mode ("Shape Before Execute")

**Concept**: Add a `shaping` phase to the orchestrator's task pipeline — between "pick up issue" and "run agent". The orchestrator itself evaluates the task before committing to a full container run.

**How it works**: New pipeline flow:

```
poll → trigger match → ledger plan → [SHAPE GATE] → container up → agent execute
                                          ↓
                              Issue not ready → post JIRA comment
                              with gaps + skip/defer
```

**Configuration** (in `profile.json`):
```json
{
  "shaping": {
    "enabled": true,
    "mode": "gate",
    "criteria": {
      "minDescriptionLength": 200,
      "requiredFields": ["description", "acceptanceCriteria"],
      "llmEvaluation": true
    },
    "onNotReady": "comment_and_skip"
  }
}
```

**Two sub-options for the evaluation**:

**B1: Rules-based gate** — Static checks only (description length, required fields, keyword presence). No LLM. Fast but dumb.

**B2: LLM-assisted gate** — Direct API call to Claude with the issue content + profile context. The LLM evaluates readiness against profile-specific criteria and returns structured JSON. Still no container — just an API call before the container starts.

**Pros**:
- Fully integrated — the orchestrator handles everything automatically
- Prevents wasted container runs on underspecified tasks
- Can post JIRA comments explaining what's missing
- Rules-based mode is near-instant and free

**Cons**:
- Adds complexity to the orchestrator's critical path
- LLM gate adds latency and cost to every task (even well-specified ones)
- "Skip and defer" behavior needs careful state management in the ledger
- Mixing planning logic into the orchestrator blurs its responsibilities

---

### Option C: Shaping Variant (Reuse Container Infra, Separate Trigger)

**Concept**: Like Over-Ralph but lighter. A separate variant with its own trigger (e.g., `@Shape`) that runs the same Docker infrastructure but with a shaping-focused agent template instead of a full planning/PRD agent.

```
JIRA comment: @Shape
→ Orchestrator picks up, runs shaping variant
→ Agent researches repo, evaluates issue, posts assessment back to JIRA
→ No branch, no PR, no code changes
```

**How it works**:
1. New variant in `profile.json` with trigger `@Shape`
2. Agent template focused on rapid assessment, not full PRD
3. No `beforeAgent`/`afterAgent` transitions (or transition to a "Shaped" status)
4. MCP tools available: JIRA, ADO (read-only), web-fetch, ralphchives-read
5. Agent posts its shaping report as a JIRA comment
6. Human reads the report, enriches the issue, then triggers `@RalphDf` for execution

**Shaping agent template** (much simpler than Over-Ralph):
- Read the issue description
- Research the target area in the repo (existing pages, navigation, related content)
- Check ralphchives for prior work
- Identify what's missing or ambiguous
- Post a structured JIRA comment with the assessment
- No interactive Discord Q&A, no multi-round approval cycles

**Pros**:
- Reuses all existing infrastructure (containers, MCP, profiles, ledger)
- Full MCP tool access — can search ralphchives, browse docs, read code
- Integrates naturally with the JIRA-comment workflow
- Shaping report lives on the JIRA issue where it belongs
- No new systems to build — it's just another variant
- Can evolve into auto-enrichment (agent updates the JIRA description itself)

**Cons**:
- Full container lifecycle for what might be a 2-minute assessment
- Still requires a manual trigger (`@Shape` comment)
- Container startup overhead (~30s–1min) for a lightweight task
- MCP sidecar + proxy spun up even though most aren't needed

---

### Option D: Interactive Local Shaping Session (IDE-Native)

**Concept**: Instead of running through the orchestrator at all, shape tasks interactively in your IDE. A Copilot agent mode (or a custom `.agent.md`) that you invoke locally with a JIRA issue key, and it walks you through a structured shaping conversation.

```
You: @shape DOC-3200
Agent: [fetches issue, researches repo, presents findings]
Agent: "Here's what I found. Three gaps: [1] [2] [3]. Want me to suggest a revised description?"
You: "Yes, and also check if there's a related page already"
Agent: [does more research, presents updated assessment]
You: "Good. Update the JIRA description with that and add a @RalphDf comment"
```

**How it works**:
1. Custom agent mode (`.agent.md`) or Copilot Chat participant
2. Uses MCP tools directly from your local environment (JIRA MCP, ADO MCP)
3. Interactive — you guide the shaping, the agent does the research
4. Can directly modify JIRA issues (update description, add comments, set fields)
5. When done, optionally triggers the orchestrator by posting the trigger comment

**Pros**:
- Fully interactive — you stay in the loop
- Fastest feedback cycle — no containers, no orchestrator
- Can shape multiple issues in one session
- Natural IDE workflow — you're already in VS Code
- Can leverage all your local context (open files, terminal, etc.)
- Can evolve organically — start simple, add structure as patterns emerge

**Cons**:
- Requires MCP tools configured locally (JIRA, ADO, ralphchives)
- Not automated — you're doing the shaping interactively
- No record of the shaping process (unless the agent logs it)
- Couples to your specific IDE setup

---

### Option E: Hybrid — Script for Batch + IDE for Interactive

**Concept**: Build both Option A (lightweight script) and Option D (IDE agent mode), sharing the same shaping template and criteria. Use the script for batch assessment of multiple issues, and the IDE mode for interactive deep-dives.

```bash
# Batch: assess all pending issues for ralph-docs
npx tsx scripts/shape-task.ts --profile ralph-docs --status "To Do"
# → produces shaping-report-DOC-3200.md, shaping-report-DOC-3201.md, ...

# Interactive: deep-dive on one issue
@shape DOC-3200
```

**Shared components**:
- Shaping criteria template (per-profile: what makes a good ralph-docs task?)
- Repo context gatherer (navigation structure, existing pages, related content)
- Readiness scorer (structured evaluation rubric)
- Output format (same markdown structure everywhere)

---

## Comparison Matrix

| Dimension | A: Script | B: Gate | C: Variant | D: IDE Agent | E: Hybrid |
|---|---|---|---|---|---|
| **Infrastructure cost** | None | None (B1) / API call (B2) | Full container | None | None |
| **MCP tool access** | No (A2: partial) | No | Full | Local only | Partial |
| **Automation** | Manual | Fully automatic | Trigger-based | Manual | Both |
| **Feedback loop** | Read report → edit issue | Auto-skip | Read JIRA comment | Interactive | Both |
| **Build effort** | Low | Medium | Low | Low | Medium |
| **Ralphchives access** | No (A2: yes) | No | Yes | If configured | Partial |
| **JIRA integration** | Read-only | Read + comment | Full | Full | Full |
| **Batch assessment** | Yes | Automatic | One at a time | No | Yes |
| **Repo context depth** | Filesystem only | None | Full (in-container) | Local checkout | Filesystem |
| **Works for ralph-docs** | Yes | Yes | Yes | Yes | Yes |
| **Works without orchestrator** | Yes | No | No | Yes | Yes |

## Recommendation

**Start with Option D (IDE Agent Mode), graduate to Option C (Shaping Variant).**

Reasoning:

1. **Option D first** because it's the lowest-friction starting point. You're already in VS Code, you already have JIRA MCP tools available, and the interactive loop lets you discover what the shaping process actually needs. You don't need to build anything — just create an `.agent.md` file with shaping instructions and start using it. The shaping criteria, output format, and evaluation rubric will emerge from practice.

2. **Graduate to Option C** once the shaping process is stable and you want to automate it via JIRA comments. At that point you know exactly what the shaping agent should do, what MCP tools it needs, and what output format works. Converting the IDE agent into an orchestrator variant is straightforward — it's the same pattern as every other Ralph variant.

3. **Option B (gate) as a later enhancement** once you have data on what makes tasks fail. The rules-based subset (B1) is easy to add retroactively — minimum description length, required fields — and costs nothing. The LLM gate (B2) is worth adding once you've seen enough shaping reports to know what the LLM should check for.

4. **Skip Option A** unless you specifically want batch assessment of backlogs. The IDE agent mode (D) can do everything the script does but interactively, and the orchestrator variant (C) handles the automated case.

### Concrete First Step

Create a `.agent.md` file for a shaping agent mode:

```markdown
---
name: shape
description: "Analyze a JIRA issue for agent readiness — fetch context, identify gaps, suggest improvements"
tools: ["jira_search", "jira_get_issue", "search_ralphchives", "web_fetch"]
---

# Task Shaper

You help prepare JIRA documentation issues for autonomous agent execution.
When given an issue key, you:

1. Fetch the full issue details
2. Research the target area in the documentation repo
3. Check ralphchives for prior work on related topics
4. Evaluate the issue against readiness criteria
5. Present a structured assessment with specific gaps and suggestions
6. Optionally update the JIRA issue description with improvements

## Readiness Criteria for ralph-docs

A documentation task is ready for Ralph when it has:
- **Clear scope**: identifies specific pages, APIs, or features to document
- **Location**: where in the site hierarchy the content belongs
- **Content type**: new page, update, code samples, restructuring
- **Technical reference**: API names, class names, or feature areas to document
- **Acceptance criteria**: what "done" looks like
- **No blockers**: no dependencies on unreleased features or missing source code
```

This agent definition could live at `profiles/ralph-docs/agents/ralph.shape.agent.md` or in a local `.github/agents/` directory, depending on whether you want it IDE-local or committed to the orchestrator repo.

---

## Option F: Shaping Launcher Script (Fetch Context → Build Prompt → Launch CLI)

**Concept**: A standalone script that fetches JIRA task context, gathers repo intelligence, builds a specialized shaping prompt, and launches a Copilot or Claude CLI session with everything pre-loaded. You interact with the shaping agent locally in your terminal — no Docker containers needed.

```bash
npx tsx scripts/shape-task.ts DOC-3200
# → fetches JIRA issue, reads repo, builds prompt, opens copilot CLI session
# → you interact with the shaping agent in your terminal
```

### How It Works

```
┌─────────────────────────────────────────────────────┐
│  scripts/shape-task.ts                              │
│                                                     │
│  1. Load config.json + .env (reuse loadConfig())    │
│  2. Parse args: issue key + optional profile hint   │
│  3. Match issue to profile variant                  │
│  4. Fetch JIRA issue via JiraClient directly        │
│  5. Gather repo context:                            │
│     - git log (recent changes in target area)       │
│     - file tree of relevant directories             │
│     - existing page content near the target area    │
│  6. Build shaping prompt (issue + repo context +    │
│     profile-specific criteria)                      │
│  7. Launch CLI session:                             │
│     copilot -p "<shaping prompt>"                   │
│       --agent ralph.shape                           │
│       --config-dir /tmp/ralph-shape                 │
│       --allow-all-tools --allow-all-paths           │
│  8. User interacts with the shaping agent           │
│  9. On exit: optionally post results to JIRA        │
└─────────────────────────────────────────────────────┘
```

### What Gets Reused vs. Built New

| Component | Status | Notes |
|---|---|---|
| `loadConfig()` | **Reuse as-is** | Config + profiles + secrets |
| `JiraClient` | **Reuse as-is** | Direct instantiation, no DI needed |
| `JiraConnector.getIssue()` | **Reuse as-is** | `mapIssueToWorkItem()` gives us the `WorkItem` |
| `buildPrompt()` | **Reuse as-is** | WorkItem → structured prompt string |
| Profile matching | **Reuse** | Find variant by project + trigger |
| Repo context gathering | **Build new** | Git log, file tree, content sampling (lightweight) |
| Shaping criteria template | **Build new** | Per-profile evaluation rubric |
| CLI launch (local, no Docker) | **Build new** | `execa("copilot", [...args])` directly on host |
| Shaping agent template | **Build new** | `ralph.shape.agent.md` — the shaping instructions |
| JIRA result posting | **Build new** (small) | Reuse `JiraClient.addComment()` |

### The Shaping Prompt Structure

The script builds a prompt that front-loads all context so the CLI agent doesn't need to fetch anything:

```markdown
# Shaping Session: DOC-3200

## JIRA Issue
- **Key**: DOC-3200
- **Title**: Document custom module registration API
- **Status**: To Do
- **Description**: [full description from JIRA]
- **Comments**: [relevant comments]
- **Labels**: [labels]
- **Components**: [components]

## Target Repository
- **Path**: /home/jakubs/repos/kentico-docs
- **Profile**: ralph-docs (Copilot CLI, ralph.ralph agent)

## Repo Context (Pre-Gathered)
### Existing Pages Near Target Area
[file listing of relevant doc pages already in the repo]

### Navigation Structure
[pagetree YAML snippets showing where content lives]

### Recent Changes
[git log --oneline -20 for the relevant directory]

### Related Source Code (if applicable)
[key files from the Xperience source that this doc would reference]

## Your Task
Analyze this issue for agent readiness. Evaluate:
1. Is the scope clear enough for a single Ralph session?
2. What's missing from the description?
3. Where in the site does this content belong?
4. Are there existing pages that overlap or need updating?
5. What technical references (APIs, classes) should be called out?

Produce a structured assessment with specific gaps and suggestions.
When done, I'll decide whether to post the results back to JIRA.
```

### Complexity Assessment

**Overall: Low-Medium complexity. Mostly plumbing.**

#### What's Trivial (existing code, just wire it up)

1. **Config loading** — `loadConfig()` returns everything. No startup pipeline needed (skip `AppStartup` — that also validates Docker, MCP servers, etc.). Just call `loadConfig()` directly for config + profiles.

2. **JIRA fetch** — `JiraClient` works standalone. Instantiate with credentials from `.env`, call `searchIssues("key=DOC-3200")` + `getComments("DOC-3200")`. Use `mapIssueToWorkItem()` for the clean `WorkItem` shape.

3. **Prompt building** — `buildPrompt(workItem, context)` already produces the structured text. Extend it with repo context sections.

4. **Profile matching** — Filter `config.profiles` by project/trigger/status. Identical to what `run-agent.ts` does.

#### What's Small But New

5. **Repo context gathering** (~50-80 lines):
   - Read the profile's `repoPath` from config
   - Run `git log --oneline -20 <relevant-dir>` via execa
   - List files in likely target directories (e.g. docs site content path)
   - Read pagetree YAML files (navigation structure)
   - This is profile-specific — ralph-docs repos have a specific content structure. Could start with a simple directory listing and iterate.

6. **Local CLI launch** (~30 lines):
   - `execa("copilot", ["-p", shapingPrompt, "--allow-all-tools", ...], { stdio: "inherit" })`
   - Or for Claude: `execa("claude", ["-p", shapingPrompt, ...], { stdio: "inherit" })`
   - Key: `stdio: "inherit"` gives you the interactive terminal session
   - No Docker, no compose, no sidecar

7. **Shaping agent template** (`ralph.shape.agent.md`, ~60-100 lines):
   - Evaluation rubric for ralph-docs tasks
   - Structured output format
   - Instructions for gap analysis
   - Could be a simple `.agent.md` file in the profiles directory

8. **Post-session JIRA update** (~20 lines, optional):
   - After CLI exits, ask whether to post results
   - Call `jiraClient.addComment(issueKey, shapingReport)`

#### What Needs Design Decisions

9. **Agent registration for local CLI**:
   - Copilot CLI needs agent files registered in `.github/agents/` or a config dir
   - For local execution (no container), the script would need to either:
     - **(a)** Point `--config-dir` to a temp directory where the shaping agent is placed
     - **(b)** Use the target repo's `.github/agents/` (but the agent doesn't belong to the target repo)
     - **(c)** Skip `--agent` and put everything in the `-p` prompt (simplest — no agent registration needed, just a big prompt)
   - **Recommendation**: Option (c) for v1. The prompt is self-contained. Graduate to a registered agent later.

10. **MCP tools availability**:
    - **Without MCP**: The shaping agent can only analyze what's in the prompt + local filesystem. No ralphchives, no JIRA tool access, no web fetch.
    - **With MCP**: Would need to either use your local MCP config (if you have JIRA/ADO MCP tools configured in VS Code) or spin up the sidecar separately.
    - **For v1**: Pre-gather everything into the prompt. The agent has the repo on disk and can read files. MCP is a v2 enhancement.

11. **Profile-specific repo context strategy**:
    - ralph-docs repos have a specific structure (content/, _data/pagetree/, _includes/). The script needs to know where to look.
    - Could be configured in `profile.json` via a new `shaping` section, or hard-coded per profile for v1.

### Gaps in Current Codebase

| Gap | Severity | Description |
|---|---|---|
| **No local CLI execution path** | Medium | All CLI execution goes through Docker (`compose.exec()`). Need a direct `execa("copilot", ...)` path. Trivial to add but doesn't exist. |
| **`loadConfig()` coupled to startup validation** | Low | `loadConfig()` itself is clean, but `AppStartup.run()` also validates Docker, MCP servers, etc. For the shaping script, call `loadConfig()` directly and skip `AppStartup`. |
| **No repo context gathering** | Medium | Nothing in the codebase reads the target repo's file tree or git history for prompt enrichment. The Over-Ralph researcher sub-agent does this *inside* the container — but that's a full agent invocation, not a lightweight script. |
| **JIRA client needs manual wiring** | Low | `JiraClient` is designed for DI injection. Standalone usage requires manually reading `config.dataSources.jira.connection` and resolving credentials from env vars. ~10 lines of setup code. |
| **No shaping criteria/rubric** | Medium | The evaluation rubric for "is this task ready?" doesn't exist anywhere. The Over-Ralph template has implicit criteria but nothing structured or extractable. This is the core value-add of the shaping script — it needs to be written. |
| **No project-aware content path mapping** | Low | The script needs to know "for ralph-docs, look in `content/` for existing pages" — this mapping doesn't exist in `profile.json`. Could be a simple config addition or hard-coded initially. |

### Estimated Scope

For a **working v1** that fetches a JIRA issue, gathers basic repo context, and launches an interactive CLI session with a shaping prompt:

- **New file**: `scripts/shape-task.ts` (~150-200 lines)
- **New file**: `profiles/ralph-docs/agents/ralph.shape.agent.md` (~80-100 lines) — or inline in the prompt
- **Modified**: Nothing. Purely additive.
- **Dependencies**: execa (already in package.json), everything else already exists

### What v1 Looks Like

```bash
$ npx tsx scripts/shape-task.ts DOC-3200

Fetching DOC-3200 from JIRA...
  Title: Document custom module registration API
  Status: To Do
  Profile: ralph-docs (@RalphDf)

Gathering repo context from /home/jakubs/repos/kentico-docs...
  Found 12 existing pages under content/extending/
  Pagetree: content/_data/pagetree/extending.yml
  Recent changes: 3 commits in last 30 days

Launching shaping session...
─────────────────────────────────────────

[Copilot CLI starts with full context pre-loaded]
[You interact: ask questions, run searches, refine the assessment]
[When done, Ctrl+C to exit]

─────────────────────────────────────────
Post shaping report to JIRA? (y/n):
```

### Evolution Path

```
v1: Script → JIRA fetch → repo scan → big prompt → local copilot/claude
v2: Add MCP sidecar for ralphchives + JIRA tools during session
v3: Add shaping criteria to profile.json, make rubric per-profile
v4: Auto-post structured assessment to JIRA, track in ledger
v5: Gate mode — orchestrator runs shaping before execution automatically
```

---

## Updated Comparison (Including Option F)

| Dimension | A: Script | B: Gate | C: Variant | D: IDE Agent | E: Hybrid | **F: Launcher** |
|---|---|---|---|---|---|---|
| **Infrastructure** | None | None/API | Full container | None | None | None |
| **MCP tools** | No | No | Full | Local only | Partial | **No (v1), sidecar (v2)** |
| **Interactive** | No (report) | No (auto) | No (JIRA comment) | Yes | Both | **Yes (CLI session)** |
| **JIRA context pre-loaded** | Read-only | Read-only | Full | If configured | Partial | **Full (fetched + injected)** |
| **Repo context pre-loaded** | Filesystem | None | In-container | Local files | Partial | **Yes (pre-gathered)** |
| **Build effort** | Low | Medium | Low | Low | Medium | **Low (~200 lines)** |
| **Agent has target repo** | No | No | Yes (mounted) | Via CWD | Partial | **Yes (local path)** |
| **Profile-aware** | Manual | Yes | Yes | Manual | Both | **Yes (auto-matched)** |

## Updated Recommendation

**Option F (Shaping Launcher) is the strongest starting point.**

It combines the best aspects:
- **From A**: standalone, no containers, low overhead
- **From D**: interactive, you stay in the loop
- **From C**: profile-aware, JIRA-integrated, repo-context-rich

Unlike Option D (IDE agent mode), Option F **pre-loads all context before the session starts**. The agent doesn't need MCP tools to fetch the JIRA issue or discover the repo structure — it's already in the prompt. This means v1 works without any MCP configuration.

Unlike Option A (batch script), Option F gives you an **interactive session** where you can ask follow-up questions, explore the repo further, and refine the assessment collaboratively.

The evolution path is clean: start with a big-prompt local session (v1), add MCP tools (v2), add per-profile criteria (v3), add auto-posting (v4), graduate to an orchestrator gate (v5).

---

## Open Questions

1. **Should shaping update the JIRA issue directly?** Having the shaper rewrite the description could be powerful but also risky (lossy — original context might be valuable). Alternative: post a "suggested improvements" comment.

2. **Profile-specific vs. generic criteria**: ralph-docs tasks need different readiness signals than ralph-vscode tasks. Should the criteria be per-profile, or is there a universal baseline?

3. **Shaping → execution handoff**: When shaping is done and the task is enriched, how does execution get triggered? Manual `@RalphDf` comment? Auto-trigger if readiness score exceeds threshold? Status transition?

4. **Shaping memory**: Should shaping reports be stored in ralphchives so future shaping sessions can reference them? ("Last time we shaped a 'document module system' task, here's what we found...")

5. **Revision shaping**: When Ralph produces work that gets rejected (Defect Found), should the shaping step run again on the revision before re-triggering the agent?

6. **Local CLI availability**: Does the host machine have `copilot` or `claude` CLI installed? The script assumes CLI tools are available locally. If not, fall back to Option A (direct API call) or Option C (container).
