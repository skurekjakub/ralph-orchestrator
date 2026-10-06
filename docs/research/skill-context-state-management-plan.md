# Agent Context Management: Skills, State, and JIT Instructions

## Problem Statement

Long-running autonomous agents suffer from **context rot** — as the conversation grows, earlier instructions fade from the model's effective attention window. Ralph's agents run multi-phase workflows (8+ phases, multiple sub-agent delegations) that span thousands of tokens. By the time the agent reaches Phase 7, the instructions from Phase 1 are diluted by accumulated tool output, file contents, and intermediate reasoning.

Today, Ralph addresses this partially:
- **Agent templates** (`*.agent.md`) embed the full workflow inline via Liquid `{% render %}`, loaded into the system prompt at session start
- **`state.md` scratchpad** — created in Phase 1 at `resources/chats/{{ taskId }}/state.md`, re-read before each phase to maintain consistency
- **Skills** — 11 shared skills in `shared/skills/` referenced by textual instruction ("consult the **ralph-code-samples** skill") but never auto-loaded or enforced
- **Ralphchives** — cross-session knowledge via MCP tools, manually searched at task start

The question: **How should we structure skills, state files, and JIT context injection to minimize context rot and keep agents on-task across long sessions?**

## Current State Analysis

### What Works

1. **`state.md` scratchpad** — The agent creates a persistent working file to track decisions, identifiers, and research findings. Workflow instructions say "re-read it before each phase." This is Ralph's primary defense against context rot and it works well when the agent complies.

2. **Skill-by-reference** — Skills are separate files mounted into `.github/skills/` inside the container. Agents are told to "consult the **ralph-new-page-creation** skill" at specific workflow points. This keeps the main prompt lean.

3. **Sub-agent delegation** — Research and review phases run in separate context windows (ralph-researcher, ralph-reviewer), preventing their output from bloating the primary agent's context.

### What Doesn't Work

1. **No enforcement of skill reading.** The agent is _told_ to read skills but nothing prevents it from skipping them — especially late in a session when attention to earlier instructions has degraded. Agents regularly skip the style guide review skill in later phases.

2. **Monolithic workflow in system prompt.** The full 8-phase workflow is rendered into the agent template at startup. By Phase 6, the agent has accumulated enough tool output that the Phase 6 instructions are far back in the context window. The model's attention to those instructions weakens.

3. **`state.md` isn't structured.** It's a freeform Markdown file. The agent decides what to track. There's no schema, no "next step" field, no skill-usage checklist. Different runs produce wildly different `state.md` formats.

4. **No phase-awareness.** The agent has no mechanism to know "I am now in Phase 3" in a way that triggers automatic context refresh. Phase transitions are implicit — the agent just proceeds sequentially through the workflow text.

## Industry Approaches (2026 State of the Art)

### Claude Code: Skills + Auto-Memory

Claude Code's skill system (`.claude/skills/`) provides the closest analog to what Ralph needs:

- **JIT loading**: Skills are loaded on-demand when the model determines they're relevant (based on the `description` field), not bloating every session
- **Supporting files**: Each skill can include templates, examples, and scripts in its directory
- **`context: fork`**: Skills with this flag run in an isolated sub-agent context, preventing their execution from consuming the main agent's context window
- **Skill preloading in sub-agents**: The `skills` frontmatter field injects full skill content into a sub-agent's context at startup — no need for the sub-agent to discover or load skills
- **Auto-memory** (`MEMORY.md`): Claude writes notes for itself. First 200 lines loaded automatically, topic files loaded on demand. This is the equivalent of Ralph's `state.md` but with a more structured loading pattern

Key insight from Claude Code docs: _"Bloated CLAUDE.md files cause Claude to ignore your actual instructions."_ The solution is to move domain knowledge out of the always-loaded system prompt and into on-demand skills.

### Anthropic "Building Effective Agents"

Core principles relevant to context management:

- **Invest more in tools than prompts**: Well-designed tools (with clear schemas, poka-yoke patterns, absolute file paths) reduce the need for lengthy prompt instructions
- **Ground truth from environment**: At each step, agents should query the environment for current state rather than relying on earlier context. This directly supports "re-read `state.md` before each phase"
- **Prompt chaining**: Break complex workflows into discrete steps where the output of step N becomes the input to step N+1. Each step has a focused prompt rather than one monolithic instruction set

### GitHub Copilot Custom Instructions

- **Path-specific `.instructions.md`**: Instructions loaded only when the agent is working on files matching an `applyTo` glob pattern. This is JIT context injection based on file context rather than explicit phase transitions
- **Hierarchy**: `copilot-instructions.md` (always loaded) → `.instructions.md` (path-triggered) → `AGENTS.md` (agent-specific)

### OpenAI Conversation State

- **Server-side compaction**: When context fills, the API automatically summarizes earlier messages while preserving key information. The model can set a `compact_threshold` to control when this happens
- **Explicit state objects**: Rather than relying on conversation history, pass a structured state object with each request that contains the current task status, completed steps, and pending work

## Recommended Architecture

### Principle: Phase-Gated JIT Context

Instead of loading the entire workflow upfront, **load only the current phase's instructions when the agent enters that phase**. Each phase becomes a skill with focused, actionable instructions. The agent's main prompt contains only the phase sequence and the instruction to load each phase's skill before executing it.

### 1. Decompose Workflows into Phase Skills

**Current state** — One monolithic `ralph-standard-workflow.md` partial (200+ lines) rendered into the agent template:

```
{% render 'ralph-docs/ralph-standard-workflow' %}
```

**Proposed state** — A minimal workflow skeleton in the agent template, with each phase as a separate skill:

```markdown
## Workflow

Execute the following phases **in order**. Before each phase, read the corresponding 
skill file to get your detailed instructions:

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | `.github/skills/ralph-workflow-setup/SKILL.md` | Branch, scratchpad, ralphchives |
| 2. Research | `.github/skills/ralph-workflow-research/SKILL.md` | Delegate to researcher sub-agent |
| 3. Write | `.github/skills/ralph-workflow-write/SKILL.md` | Implement documentation changes |
| 4. Review | `.github/skills/ralph-workflow-review/SKILL.md` | Delegate to reviewer sub-agent |
| 5. Revise | `.github/skills/ralph-workflow-revise/SKILL.md` | Fix reviewer feedback (max 2 cycles) |
| 6. Commit | `.github/skills/ralph-workflow-commit/SKILL.md` | Pre-commit checks, commit, push |
| 7. PR | `.github/skills/ralph-workflow-pr/SKILL.md` | Create ADO pull request |
| 8. Handoff | `.github/skills/ralph-workflow-handoff/SKILL.md` | Write handoff, report to JIRA, exit |

**Before entering each phase:**
1. Read your `state.md` scratchpad
2. Read the phase's skill file  
3. Update `state.md` with the current phase and any new context
```

**Benefits:**
- The agent's system prompt shrinks from ~500 lines to ~50 lines (skeleton + constraints + identity)
- Each phase's instructions are fresh in context when the agent reads them — no competing with 5 phases of accumulated tool output
- Phase skills can be updated independently without touching the agent template
- Phase skills can include sub-phase-specific context (e.g., the Write phase skill can reference the style guide skill inline)

**Trade-off:** Adds file-read overhead per phase. With 8 phases, that's 8 extra `read_file` calls. This is negligible compared to the dozens of tool calls in each phase.

### 2. Structured State File as Skill Manifest

Replace the freeform `state.md` with a structured format that serves double duty: **working memory** and **skill manifest for the next phase**. The key insight is that state.md becomes the agent's single source of truth — it tells the agent what phase it's in _and_ which skills to read for that phase:

```markdown
# Task State: {{ taskId }}

## Current Phase
Phase 3: Write

### Skills for this phase
- `.github/skills/ralph-workflow-write/SKILL.md` — phase instructions
- `.github/skills/ralph-style-guide-review/SKILL.md` — style checklist
- `.github/skills/ralph-new-page-creation/SKILL.md` — new page workflow
- `.github/skills/ralph-documentation-syntax/SKILL.md` — Liquid/Jekyll syntax

## Completed Phases
- [x] Phase 1: Setup — branch: ralph/DF-456-content-types, created 2025-01-15
- [x] Phase 2: Research — researcher found 5 existing pages, 3 source classes

## Key Decisions
- New page at `src/_documentation/content-types/reusable-field-schemas.md`
- Using identifier `reusable-field-schemas` (from frontmatter)
- Source branch: main (no triggerParam override)

## Tracked Identifiers
- Page identifier: `reusable-field-schemas`
- PR branch: `ralph/DF-456-reusable-field-schemas`

## Source References
- `ReusableFieldSchemaValidator.cs:L45` — ValidateNesting() throws if parent is already an RFS
- `FieldSchemaManager.cs:L120-135` — PropagateChanges() iterates all referencing types

## Ralphchives Findings
- DF-440 had similar RFS work — used `reusable_field_schema` naming pattern (not kebab-case)

## Notes
- Build fails if code_link references nonexistent file — validate before commit
```

**The reinforcement loop:**

```
Phase N instructions say "read state.md"
    → state.md says "Current Phase: N" and lists skills for Phase N
        → agent reads those skills
            → skills end with "update state.md: set Current Phase to N+1, list skills for Phase N+1"
                → next phase starts from state.md again
```

This creates a **self-sustaining cycle**: the agent doesn't need to remember system prompt instructions about which skills to read — state.md tells it. And state.md is refreshed at every phase transition because the phase skill says to update it. Each phase starts with the agent re-reading state.md, which acts as a context anchor even when earlier system prompt instructions have faded.

**Will the agent actually read state.md before every phase?** Since the instruction "read state.md before this phase" is repeated at the top of every phase skill, the reinforcement compounds. The agent sees it 8 times across a task. Even if attention to the original system prompt degrades, the most recently read phase skill (which told it to update state.md for the _next_ phase) is still fresh in context. It's the closest we can get to guaranteeing compliance without a tool-based enforcement mechanism.

**Key additions over current freeform state.md:**
- **Current Phase** — explicit phase marker the agent updates on each transition
- **Skills for this phase** — the agent lists the skill files it needs to read for the current phase, turning state.md into a JIT context manifest
- **Completed Phases** — checklist of what's done with key outcomes
- **Tracked Identifiers** — structured section for values that must be consistent across phases (page identifiers, branch names, PR IDs)
- **Source References** — dedicated section instead of mixed into notes

The agent template should include a **state.md template** in the Setup phase skill. The template seeds the skill-manifest pattern from the very first phase:

```markdown
### Phase 1 Instructions

Create the state file at `resources/chats/{{ taskId }}/state.md` using this template:

\```markdown
# Task State: {{ taskId }} — {{ taskTitle }}

## Current Phase
Phase 1: Setup

### Skills for this phase
- `.github/skills/ralph-workflow-setup/SKILL.md` — phase instructions

## Completed Phases
(none yet)

## Key Decisions
(record each decision and its rationale)

## Tracked Identifiers
(page identifiers, branch names, PR IDs)

## Source References
(exact source locations backing documentation claims)

## Ralphchives Findings
(prior work from archived task reports)

## Notes
(anything else)
\```

Before moving to Phase 2, update state.md:
- Set "Current Phase" to `Phase 2: Research`
- Set "Skills for this phase" to:
  - `.github/skills/ralph-workflow-research/SKILL.md` — phase instructions
  - `.github/skills/ralph-ralphchives/SKILL.md` — knowledge base search
- Add Phase 1 to "Completed Phases" with branch name and setup outcomes
```

### 3. Phase-Entry Ritual

Each phase skill begins with the same ritual — a standard preamble that forces the agent to re-ground itself:

```markdown
## Phase N: [Name]

### Before you begin

1. **Read `state.md`** at `resources/chats/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase N. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm you have the context from previous phases.

### Instructions

[Phase-specific instructions here]

### Before moving to Phase N+1

1. **Update `state.md`:**
   - Set "Current Phase" to Phase N+1
   - Add Phase N to "Completed Phases" with key outcomes
   - Record any new decisions, identifiers, or source references
2. **Verify build passes** (if applicable)
```

This ritual is cheap (one file read) but powerful — it re-anchors the agent's attention to the task state and prevents drift.

### 4. Skill Cross-References Within Phase Skills

Phase skills can reference other skills inline, creating a two-level JIT hierarchy:

```markdown
## Phase 3: Write

### Before you begin
[standard ritual]

### Instructions

1. **Read the style guides** and consult `.github/skills/ralph-style-guide-review/SKILL.md` 
   for a quick-reference checklist
2. For new pages, read `.github/skills/ralph-new-page-creation/SKILL.md`
3. For code samples, read `.github/skills/ralph-code-samples/SKILL.md`
4. For documentation syntax, read `.github/skills/ralph-documentation-syntax/SKILL.md`
```

The agent reads only the skills relevant to its current phase. A task that doesn't involve code samples never loads the code samples skill.

### 5. Sub-Agent Skill Preloading

For Ralph's sub-agents (researcher, reviewer), skills can be preloaded via the `skills` frontmatter field. This is already supported by both Claude Code and GitHub Copilot agent definitions:

```yaml
---
name: 'ralph-researcher'
model: claude-opus-4.6
skills: ['ralph-ralphchives', 'ralph-source-references']
---
```

This injects the full skill content into the sub-agent's system prompt at startup. Since sub-agents have short, focused sessions, context rot isn't a concern — preloading is appropriate here.

**Current state:** Sub-agents don't declare skills. The main agent manually tells them about ralphchives in the delegation prompt.

**Proposed state:** Sub-agents declare their needed skills in frontmatter. The skills are injected automatically, ensuring the sub-agent always has the full context without relying on the main agent to remember to pass it.

### 6. Conditional Phase Inclusion

Not every task needs every phase. The workflow skeleton should support conditional phases via Liquid:

```markdown
| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | `ralph-workflow-setup` | Branch, scratchpad, ralphchives |
| 2. Research | `ralph-workflow-research` | Delegate to researcher |
| 3. Write | `ralph-workflow-write` | Implement changes |
{%- unless triggerParams.skip_review %}
| 4. Review | `ralph-workflow-review` | Delegate to reviewer |
| 5. Revise | `ralph-workflow-revise` | Fix feedback (max 2 cycles) |
{%- endunless %}
| 6. Commit | `ralph-workflow-commit` | Pre-commit checks, commit, push |
| 7. PR | `ralph-workflow-pr` | Create ADO PR |
| 8. Handoff | `ralph-workflow-handoff` | Write handoff, report, exit |
```

When `skip_review` is set, the agent never sees Review/Revise phases in its skeleton, and never loads those skills.

### 7. Known Failure Patterns as a Standalone Skill

Currently, "Known Failure Patterns" are embedded in the agent template's system prompt:

```markdown
{% section "known-failure-patterns" %}
## Known Failure Patterns — DO NOT REPEAT
- **Uncommitted build failure** — skipping `npm run build`...
- **Hallucinated API signatures** — Always read the source file...
{% endsection %}
```

These should become a standalone skill (`ralph-known-failure-patterns`) that is:
- Referenced in the agent template's always-loaded section (it's short enough)
- Also referenced in specific phase skills where failures are most likely (e.g., the Write phase references the "hallucinated API signatures" pattern, the Commit phase references the "uncommitted build failure" pattern)

This dual-placement ensures the pattern is fresh in context exactly when it matters most.

## Interaction with Multi-Agent Execution

The multi-agent execution plan (`plans/multi-agent-execution-plan.md`, no longer in the tree) introduces concurrent agents sharing a workspace. Skills and state management interact with this in several ways:

### Blackboard Pattern + `state.md`

The multi-agent plan proposes `BLACKBOARD.md` for inter-agent communication. This is complementary to `state.md`:

| File | Scope | Purpose |
|------|-------|---------|
| `state.md` | Per-agent | Private working memory for a single agent's decisions and progress |
| `BLACKBOARD.md` | Shared | Inter-agent communication channel for coordinating work |

In a multi-agent scenario, each agent maintains its own `state.md` (or a per-agent section of a shared state file), while `BLACKBOARD.md` handles coordination signals.

### Skill Sharing Across Agents

When multiple agents share a workspace, they share the same `.github/skills/` directory. Phase skills designed for ralph.ralph (the primary documentation agent) may not be relevant to ralph.malph (the reviewer). Each agent template should declare which phase skills apply to it.

### Sub-Agent Context Isolation

The skill preloading approach (frontmatter `skills` field) ensures sub-agents get exactly the skills they need without inheriting the parent agent's accumulated context. This is especially important in multi-agent scenarios where the main agent's context may include output from other concurrent agents.

## Implementation Approach

### Phase 1: Structured State File

**Effort: Low | Impact: High | Risk: Low**

1. Add a state.md template to the Setup phase instructions in `ralph-standard-workflow.md`
2. Add explicit "update state.md" steps at the end of each phase
3. Add "read state.md" steps at the start of each phase
4. No infrastructure changes — this is purely a prompt/template change

### Phase 2: Extract Phase Skills

**Effort: Medium | Impact: High | Risk: Medium**

1. Create `shared/skills/ralph-workflow-{setup,research,write,review,revise,commit,pr,handoff}/SKILL.md`
2. Each skill contains the corresponding phase's instructions from `ralph-standard-workflow.md`
3. Add the phase-entry ritual preamble to each skill
4. Replace the full workflow `{% render %}` with the phase table skeleton
5. Create corresponding revision phase skills from `ralph-revision-workflow.md`
6. Run a few tasks to validate behavior (context savings, compliance with skill reading)

### Phase 3: Sub-Agent Skill Preloading

**Effort: Low | Impact: Medium | Risk: Low**

1. Add `skills` frontmatter to ralph-researcher and ralph-reviewer agent files
2. Verify the CLI (Copilot and Claude Code) supports the `skills` field — feature support depends on CLI version
3. Remove manual skill-passing from delegation prompts

### Phase 4: Failure Patterns Extraction

**Effort: Low | Impact: Medium | Risk: Low**

1. Extract known failure patterns into `shared/skills/ralph-known-failure-patterns/SKILL.md`
2. Keep a short summary in the agent template's always-loaded section
3. Add skill references to specific phase skills where failures are most likely

## Risks and Open Questions

### Instruction File Collision Between Orchestrator and Target Repo

Ralph mounts skills and agent files into the target repo's `.github/skills/` and `.github/` directories. If the target repo (e.g., `kentico-docs-jekyll`) has its own `.instructions.md` files, `copilot-instructions.md`, or `AGENTS.md`, there's an overlap problem:

- **Path-triggered `.instructions.md`**: If the target repo has `.github/instructions/docs.instructions.md` with `applyTo: "src/_documentation/**"`, and Ralph injects its own instruction files for the same paths, which takes precedence? The behavior depends on the CLI implementation and isn't guaranteed to be deterministic.
- **`copilot-instructions.md`**: If the target repo has its own `copilot-instructions.md`, it may conflict with or override Ralph's agent template conventions.

**Recommendation:** Structure the target repo's instruction files rather than relying on Ralph-injected artifacts to avoid collisions. Ralph's context injection should flow through:
1. **Agent template** (system prompt) — always-loaded identity and workflow skeleton
2. **Skills** (`.github/skills/ralph-*/`) — JIT phase instructions and domain knowledge
3. **`state.md`** (workspace file) — dynamic working memory

Avoid injecting `.instructions.md` files or `copilot-instructions.md` into the target repo. If the target repo needs its own instruction files (e.g., for human developers), those should be authored in the target repo itself and Ralph's agent template should be aware of them rather than competing with them.

### Will the agent actually read skills?

This is the core risk. The agent is already told to read skills and sometimes doesn't. Moving from "consult the skill" to "read this specific file path before proceeding" with a structured state file checkpoint may improve compliance, but can't guarantee it.

**Mitigation:** The phase-entry ritual creates a pattern — if the agent reads `state.md`, it sees the current phase, which references the phase skill. This creates a self-reinforcing loop rather than relying on distant system prompt instructions.

**Stronger mitigation (future):** A custom MCP tool that the agent calls to "enter a phase" — it returns the phase skill content directly, making the skill read part of a tool call rather than a voluntary file read. This would require a new MCP server or extending an existing one.

### Does splitting the workflow hurt coherence?

The monolithic workflow gives the agent a complete picture of all phases upfront. Splitting it risks the agent not understanding the overall flow. 

**Mitigation:** The skeleton table in the agent template preserves the high-level flow. Each phase skill includes a "Before moving to Phase N+1" section that connects phases.

### Context window arithmetic

A typical Ralph task uses ~150K tokens of context (Claude Opus 4.6 has 200K). The current monolithic workflow adds ~4K tokens. Phase skills would add ~500 tokens per phase read (reading only the current phase), but save the ~3.5K from phases the agent has already passed. Net savings increase as the task progresses — when context rot matters most.

### Copilot CLI `skills` support

The Copilot CLI may not support the `skills` frontmatter field the same way Claude Code does. This needs testing before Phase 3.

### Revision workflow

The revision workflow is a separate template. It needs its own set of phase skills, though some phases (commit, PR, handoff) may share skills with the standard workflow. The revision "Understand Feedback" and "Find Existing PR" phases are unique to revisions.

## Appendix A: Hook-Based Context Reinforcement (Future)

The recommendations above rely on the agent voluntarily reading `state.md` and phase skills. Claude Code hooks offer a mechanism to **automatically inject context** when the agent interacts with specific files — turning voluntary compliance into system-enforced reinforcement.

### Relevant Hook Events

Claude Code (2026) supports hooks at every point in the agent lifecycle. The three most relevant for context reinforcement:

| Hook Event | Fires When | Context Injection |
|---|---|---|
| `PostToolUse` (matcher: `Read`) | Agent reads any file | `additionalContext` field injected into Claude's context |
| `PreToolUse` (matcher: `Read`) | Agent is about to read a file | `additionalContext` injected before the read happens |
| `Stop` | Agent finishes responding | Can block stopping with `decision: "block"` + reason |

### Pattern 1: Phase Skill Read → Inject State Reminder

A `PostToolUse` hook matching `Read` operations on phase skill files could inject a reminder to check `state.md`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/reinforce-state.sh"
          }
        ]
      }
    ]
  }
}
```

The hook script checks if the agent just read a phase skill file:

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only fire for phase skill reads
if [[ "$FILE_PATH" == *"ralph-workflow-"*"/SKILL.md" ]]; then
  PHASE=$(echo "$FILE_PATH" | grep -oP 'ralph-workflow-\K[^/]+')
  jq -n --arg phase "$PHASE" '{
    "hookSpecificOutput": {
      "hookEventName": "PostToolUse",
      "additionalContext": "You just read the phase skill for: \($phase). REMINDER: Before proceeding, verify your state.md is current. After completing this phase, update state.md with: (1) set Current Phase to the next phase, (2) list Skills for the next phase, (3) add this phase to Completed Phases with key outcomes."
    }
  }'
else
  exit 0
fi
```

**What this achieves:** Every time the agent reads a phase skill, it gets an automatic context injection reminding it to update `state.md`. The agent doesn't need to remember this from the system prompt — the hook enforces it.

**What it injects:** A short reminder (~50 tokens) with three specific action items. This is small enough to not contribute to context bloat but specific enough to reinforce the phase-entry ritual.

### Pattern 2: Stop Hook → Verify Phase Completion

A `Stop` hook can prevent the agent from stopping if it hasn't completed all phases:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/verify-completion.sh"
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
INPUT=$(cat)
LAST_MSG=$(echo "$INPUT" | jq -r '.last_assistant_message // empty')

# Check if the result block was printed (orchestrator contract)
if echo "$LAST_MSG" | grep -q "===RALPH_RESULT_START==="; then
  exit 0  # Allow stop — result block present
fi

# Block stopping — agent hasn't produced its result
echo '{"decision": "block", "reason": "You have not printed the ===RALPH_RESULT_START=== block. Check state.md and complete remaining phases before stopping."}' 
```

**What this achieves:** The agent cannot finish without printing the result block. If context rot causes it to forget the exit protocol, the hook catches it and provides corrective feedback. This is equivalent to Ralph's existing continuation loop but handled at the CLI level.

### Pattern 3: Prompt-Based Phase Verification

For deeper verification, a `type: "prompt"` hook uses a smaller model to evaluate whether the agent is following the workflow:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate the agent's last message. Context: $ARGUMENTS\n\nCheck:\n1. Did the agent print ===RALPH_RESULT_START=== with all required fields?\n2. Does the output indicate all phases were completed?\n3. Was a handoff file created?\n\nRespond with {\"ok\": true} if complete, or {\"ok\": false, \"reason\": \"what's missing\"} to continue.",
            "model": "claude-haiku-4",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**What this achieves:** A fast, cheap model evaluates the agent's output against the completion criteria. This catches cases where the result block exists but is malformed or missing required fields.

### Pattern 4: SubagentStart → Inject Skill Context

When a sub-agent spawns, a `SubagentStart` hook can inject additional context:

```json
{
  "hooks": {
    "SubagentStart": [
      {
        "matcher": "ralph-researcher",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/inject-researcher-context.sh"
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# Read state.md and inject relevant context into the researcher sub-agent
STATE_FILE=$(find resources/chats/ -name "state.md" -type f | head -1)
if [ -n "$STATE_FILE" ]; then
  CONTEXT=$(cat "$STATE_FILE")
  jq -n --arg ctx "$CONTEXT" '{
    "hookSpecificOutput": {
      "hookEventName": "SubagentStart",
      "additionalContext": "Current task state from the primary agent:\n\($ctx)"
    }
  }'
fi
```

**What this achieves:** The researcher sub-agent automatically receives the current task state, including decisions, identifiers, and ralphchives findings. The primary agent doesn't need to manually pass this context in the delegation prompt.

### Pattern 5: Skill-Scoped Hooks (via Frontmatter)

Hooks can be defined directly in SKILL.md frontmatter. A phase skill can include a `once: true` hook that fires only once — when the skill is first activated:

```yaml
---
name: ralph-workflow-write
description: Phase 3 instructions for implementing documentation changes
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: ".claude/hooks/validate-build-after-edit.sh"
          async: true
          timeout: 120
---
```

**What this achieves:** While the Write phase skill is active, every file write/edit triggers an async build validation. The hook is scoped to the skill's lifetime — it doesn't fire during other phases. This replaces the textual instruction "run `npm run build` after every change" with an automated check.

### Applicability to Ralph's Architecture

Ralph runs agents inside Docker containers via CLI (`copilot --agent` or `claude -p`). Both CLIs support hooks, but with significantly different capabilities for context injection:

| Feature | Claude Code CLI | Copilot CLI |
|---|---|---|
| Hook events | `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart/Stop`, `PreCompact`, + more | `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred` |
| `PreToolUse` — block/allow | `permissionDecision: allow/deny/ask` | `permissionDecision: deny` only (allow/ask not processed) |
| `PostToolUse` — inject context | `additionalContext` field injected into Claude's context | **Output ignored** — no context injection |
| `Stop` — prevent premature exit | `decision: "block"` with reason fed back to model | **Not available** |
| `SubagentStart` — inject context | `additionalContext` injected into sub-agent | **Not available** |
| Prompt/agent hook types | `type: "prompt"` (LLM) and `type: "agent"` (multi-turn) | `type: "command"` only |
| Skill-scoped hooks | Frontmatter `hooks:` in SKILL.md | Not available |
| Async hooks | `async: true` for background execution | Not available |
| Hook location | `.claude/settings.json`, skill/agent frontmatter | `.github/hooks/hooks.json` |

**Key limitation:** Copilot CLI's `postToolUse` output is ignored — the most impactful pattern (injecting context after a skill read) simply doesn't work. Copilot hooks are designed for **logging and blocking**, not context reinforcement. The `preToolUse` hook can deny operations but can't inject `additionalContext` to guide the agent.

**Implication:** Hook-based context reinforcement is currently a **Claude Code advantage**. For profiles using the Copilot CLI, the prompt-based reinforcement (phase-entry ritual, state.md skill manifest) remains the only mechanism. This is a strong argument for the phase-entry ritual approach — it works across both CLIs, while hooks are an enhancement layer for Claude Code profiles.

**Future:** If Copilot CLI adds `additionalContext` support to `postToolUse` or a `Stop` hook equivalent, the patterns described above would become cross-CLI compatible. Ralph already has hook infrastructure in `shared/hooks/` for Copilot CLI audit logging — extending that for context injection would be straightforward if the capability lands.

### Cost-Benefit Analysis

| Pattern | Context Cost | Implementation Effort | Reinforcement Strength |
|---|---|---|---|
| Phase skill read → state reminder | ~50 tokens per phase | Low (one shell script) | Medium — reminder, not enforcement |
| Stop → verify completion | ~30 tokens on stop | Low (one shell script) | High — blocks premature exit |
| Prompt-based phase verify | ~100 tokens + Haiku call | Medium (prompt engineering) | High — catches malformed output |
| SubagentStart → inject state | Varies (state.md size) | Low (one shell script) | High — automated context transfer |
| Skill-scoped build check | ~50 tokens per write | Medium (async hook + script) | Medium — automated build validation |

The most impactful pattern is the **Stop hook** — it's cheap, simple, and catches the most common failure mode (agent stopping without producing the result block). The **state reminder on skill read** provides incremental reinforcement at low cost. The **prompt-based verification** adds a safety net but has a per-invocation cost (one Haiku call per stop).

## Appendix B: Comparison with Claude Code Memory System

| Feature | Claude Code | Ralph (Current) | Ralph (Proposed) |
|---------|-------------|------------------|-------------------|
| Always-loaded context | CLAUDE.md (200 lines max) | Agent template (500+ lines) | Agent template (50 lines) + skeleton |
| JIT context | Skills (on-demand) | Skills (textual reference, not enforced) | Phase skills (explicit read per phase) |
| Working memory | MEMORY.md (auto-written) | `state.md` (freeform) | `state.md` (structured template) |
| Cross-session memory | Auto-memory topic files | Ralphchives (MCP) | Ralphchives (MCP) — no change |
| Sub-agent context | `skills` frontmatter preload | Manual delegation prompt | `skills` frontmatter preload |
| Context compaction | Auto-compaction on fill | None (continuation loop restarts) | None — continuation loop is the mechanism |
| Phase awareness | None (general conversation) | Implicit (sequential workflow text) | Explicit (phase field in `state.md`) |
