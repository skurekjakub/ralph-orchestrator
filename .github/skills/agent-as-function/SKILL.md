---
name: agent-as-function
description: "Design and implement multi-agent workflows using the subagent-as-function pattern with filesystem artifact handoff, and decompose monolithic agent prompts into per-phase skills with domain knowledge. Use this skill whenever creating a new multi-agent orchestrator, converting an existing agent to the artifact handoff pattern, adding subagents to an orchestrator. Also triggers on: 'create an orchestrator', 'add a subagent', 'the orchestrator context is too big', 'agent artifact contract', 'status.json', 'manifest.json', 'how should agents pass data', 'pure router orchestrator', 'decompose this agent', 'add domain knowledge', 'phase skills', 'workflow phases', 'skill gaps', or any request involving multi-agent coordination or agent prompt refactoring in the Ralph Orchestrator."
---

# Agent Architecture: Multi-Agent Workflows

This skill covers the two complementary patterns that make up well-structured multi-agent systems in the Ralph Orchestrator:

1. **Prompt decomposition** — break monolithic agent prompts into per-phase skills loaded just-in-time, with a scratchpad contract for state continuity
2. **Subagent-as-function** — orchestrators dispatch subagents as pure functions; all substantive data flows through filesystem artifacts, not conversation context

These patterns are independent but work together. You can decompose a prompt without artifact handoff, or add artifact handoff to a flat-prompt agent. Most mature agents use both.

## When to Use

| Signal | Pattern |
|---|---|
| Agent prompt is 300+ lines, forgets early instructions | Prompt decomposition |
| Agent coordinates 2+ subagents | Both |
| Subagent output bloats orchestrator context | Subagent-as-function |
| Multiple subagents consume the same upstream data | Subagent-as-function |
| Iterative loop (coder → reviewer → coder) needs clean state | Subagent-as-function |
| Agent has domain knowledge gaps (wrong syntax, missed conventions) | Prompt decomposition → skill discovery |
| Existing skills overlap or contradict each other | Prompt decomposition → deduplication |

## Pattern 1: Prompt Decomposition (Phases as Skills)

Turn one giant instruction file into per-phase skills loaded on demand. A scratchpad (`state.md`) tracks which phase the agent is in and which skills to load next.

The agent's main prompt shrinks to a compact workflow table:

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | workflow-setup | Branch, scratchpad, context search |
| 2. Research | workflow-research | Gather context, sub-agents |
| 3. Write | workflow-write | Implement changes |
| 4. Review | workflow-review | Quality check, revision loop |
| 5. Commit | workflow-commit | Pre-commit checks, push |
| 6. Handoff | workflow-handoff | Write report, exit block |

Each phase skill ends with a transition section that updates `state.md` with the next phase and its skill manifest — including domain-specific skills the agent should consult.

**Process:**

| Step | What to do | Reference |
|------|-----------|-----------|
| 0. Decompose | Break monolithic prompt into phase skills + scratchpad contract | [references/workflow-decomposition.md](references/workflow-decomposition.md) |
| 1. **Analyze** | **Decompose existing prompt into constituent subagents the orchestrator needs** | [references/subagent-analysis.md](references/subagent-analysis.md) |
| 1.5. **Audit Missing Functions** | **Audit the current agent roster for missing subagent functions, identify gaps between the workflow phases and the declared subagents, then confirm the initial audit with the user via `ask_questions` before editing files** | [references/subagent-analysis.md](references/subagent-analysis.md) |
| 2. Explore | Analyze target domain for conventions and failure modes | [references/skill-discovery.md](references/skill-discovery.md) |
| 3. Audit | Read all existing skills, build gap analysis | [references/skill-discovery.md](references/skill-discovery.md) |
| 4. Propose | Enumerate candidate skills with overlap risks | [references/skill-discovery.md](references/skill-discovery.md) |
| 5. Create | Write skill files with pushy descriptions and concrete examples | [references/skill-discovery.md](references/skill-discovery.md) |
| 6. Integrate | Wire skills into workflow phase transition lists + inline references | [references/skill-integration.md](references/skill-integration.md) |
| 7. Deduplicate | Compare new vs existing skills, merge overlaps | [references/skill-integration.md](references/skill-integration.md) |

**Steps 1 and 1.5 are mandatory.** Before writing any code or skills, you must produce the subagent analysis, then audit the declared agent roster for missing functions and confirm that initial audit with the user. Step 1 identifies every distinct responsibility and determines which ones the orchestrator should delegate to subagents vs handle itself. Step 1.5 compares that responsibility map against the actual declared subagents and catches hidden hybrid behavior where an "orchestrator" still performs analyst, coder, reviewer, scout, or archiver work itself. The required output is a subagent roster + routing table + data flow map + missing-function audit. Do not skip these steps — without them, the orchestrator will end up doing work that should be delegated, or subagents will have unclear boundaries.

**Mandatory audit questions before implementation:**

- Which workflow phases still contain substantive work inside the orchestrator?
- Which of those phase functions should become dedicated subagents?
- Which declared subagents are only helpers versus true phase owners?
- Is a scout, analyst, coder/writer, reviewer, or scribe/archiver function still missing?
- Have you confirmed the initial missing-function audit with the user via `ask_questions` before editing files?

**Quick reference:**

- **Phase skill template**: "Before you begin" (read state.md, verify phase) → Instructions → "Before moving to Phase N+1" (update state.md with next skills)
- **Skill integration**: Two levels — transition lists (set the manifest) + inline references (at decision points)
- **Overlap resolution**: Heavy → merge + delete; Moderate → merge unique parts; Minimal → keep + cross-reference
- **Descriptions**: Make them "pushy" — include WHAT + WHEN. Undertriggering is more common than overtriggering.

## Pattern 2: Subagent-as-Function (Artifact Handoff)

The orchestrator becomes a pure router. Subagents communicate through the filesystem, not through conversation.

### Roles

**Orchestrator**: Dispatches subagents with a task-id and one-line directive. Reads only `status.json`. Does administrative work itself (commit, push, PR, JIRA transitions). Never reads artifact content, never relays data between subagents.

**Subagent**: Does one job. Reads input from upstream artifacts on the filesystem. Writes output to its own artifact directory. Returns one line: `"Done. Status: {status}, result: {result}."`

### Core Contracts

Each task gets a shared artifact directory. Every subagent writes to its own subdirectory:

```
{artifact-root}/{task-id}/
├── manifest.json              # append-only audit log
├── {agent-name}/
│   ├── output.md              # primary artifact
│   ├── status.json            # the ONLY thing the orchestrator reads
│   └── ...                    # additional files as needed
```

- `status.json` — structured status with `agent`, `task_id`, `status`, `result`, `summary`, `artifacts`, `next_hint`, `iteration`. See [references/artifact-contract.md](references/artifact-contract.md) for full schema.
- `manifest.json` — append-only audit log for debugging and discovery. See [references/artifact-contract.md](references/artifact-contract.md).
- Iterative loops use versioned artifacts (`output-v1.md`, `output-v2.md`). See [references/artifact-contract.md](references/artifact-contract.md).

**Central design principle**: subagents read each other's artifacts directly. The orchestrator never relays data. See [references/data-flow-patterns.md](references/data-flow-patterns.md) for the full data flow table and routing examples.

### Implementation

- **Building an orchestrator or subagent**: See [references/refactoring-guide.md](references/refactoring-guide.md) for implementation checklists.
- **Converting existing agents**: See [references/refactoring-guide.md](references/refactoring-guide.md) for the 5-step conversion process.

## Validation Checklist

After any agent architecture change, verify:

- [ ] **Context cleanliness** — orchestrator context has no artifact content, only status summaries and one-line dispatches
- [ ] **Artifact integrity** — downstream subagents read from filesystem and produce correct output
- [ ] **Audit trail** — `manifest.json` logs the full sequence with timestamps
- [ ] **Loop termination** — iterative loops terminate at configured max
- [ ] **Failure handling** — `status: failed` is written; orchestrator routes without parsing a half-written report
- [ ] **Missing-function audit completed** — every substantive workflow function has an explicit owner, and any intentional hybrid behavior was confirmed with the user before implementation
- [ ] **Phase coverage** — every workflow phase has a skill; no instructions left in the monolithic prompt
- [ ] **Skill manifest** — each phase transition sets the correct skills for the next phase
- [ ] **No dangling references** — deleted or merged skills have no remaining references in phase transitions or inline mentions

## Common Mistakes

**Artifact handoff:**
- Orchestrator reads artifact content — route on `result` codes, not by parsing reports
- Relaying data through orchestrator — subagents read each other's files directly
- Non-standardized result codes — define a fixed set per subagent
- Missing `status.json` on failure — always write it, even when the agent fails
- Overly detailed `summary` — it's for routing (~100 tokens), not a report

**Prompt decomposition:**
- Leaving instructions in the main prompt — the workflow table should be the only thing there
- Missing state.md updates — broken phase transitions mean the agent loses track
- Too many skills per phase — cap at ~6-8; more signals overly granular skills
- Duplicated domain knowledge — creates drift; reference instead of copy

## References

[manifest.json example shape](references/manifest.json)

## Further Reading

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic's orchestration patterns and delegation strategies
- [Claude Code best practices](https://docs.anthropic.com/en/docs/claude-code/best-practices) — Memory files and project context patterns
- [GitHub Copilot custom instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot) — Instruction files, skills, and agent modes
- [Prompt engineering: be direct](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-direct) — Writing clear, imperative instructions
- [OpenAI agent patterns](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) — Multi-agent orchestration and guardrails
