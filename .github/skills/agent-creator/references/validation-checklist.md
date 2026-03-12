# Validation Checklist

Use this checklist during Phase 6. Check every item. Failures must be fixed before the agent family is considered complete.

---

# Validation Report: {Agent Family Name}

## 1. Template Rendering

- [ ] All `.agent.md` files render without Liquid errors
- [ ] All `{% render %}` references resolve to existing partials
- [ ] All `{% section %}` / `{% endsection %}` tags are balanced
- [ ] Liquid conditionals (`{% if %}`, `{% unless %}`) are syntactically correct
- [ ] Template integration tests pass (if available)

## 2. Configuration

- [ ] `profile.json` is valid JSON
- [ ] `profile.json` references correct agent files in stage pipeline
- [ ] All agents in `profile.json` stages exist as `.agent.md` files
- [ ] MCP server declarations reference existing server manifests
- [ ] Match rules are specific enough to avoid false matches with other profiles

## 3. Orchestrator Purity

- [ ] Orchestrator never reads `output.md` from any subagent
- [ ] Orchestrator never relays artifact content between subagents
- [ ] Orchestrator only reads `status.json` for routing decisions
- [ ] Orchestrator doesn't perform substantive work (research, writing, review, coding)
- [ ] All orchestrator duties are administrative: git, PR, JIRA transitions, exit block, dispatch

## 4. Routing Table Completeness

- [ ] Every subagent's every declared result code appears in the routing table
- [ ] Every routing table row has a clear next action
- [ ] No result code leads to an undefined state or hang
- [ ] Iteration limits are explicit with numeric max bounds
- [ ] Error/blocked/failed paths lead to graceful exits
- [ ] The `Any subagent | failed` catch-all row exists

## 5. Artifact Contract

- [ ] Every subagent writes `status.json` (on both success and failure)
- [ ] Every subagent appends to `manifest.json`
- [ ] Every subagent returns a one-line status message (not full artifact content)
- [ ] Artifact directory structure matches the architecture document
- [ ] Versioned artifact naming (`output-v{N}.md`) used for iterating agents

## 6. Data Flow

- [ ] Every file a subagent reads is written by another subagent (or is an external input)
- [ ] No subagent depends on data only available in the orchestrator's conversation context
- [ ] No circular read dependencies exist (A reads B's output, B reads A's output simultaneously)
- [ ] Subagents that read from iterating agents reference the correct version pattern

## 7. Ordering Constraints

- [ ] Every hard dependency in the routing table is covered by an ordering constraint
- [ ] Ordering constraints only contain subagents that exist in the roster
- [ ] No ordering constraint contradicts the routing table (e.g., "A before B" but B is dispatched first)

## 8. Subagent Completeness

- [ ] Every subagent in the orchestrator's roster has a corresponding `.agent.md` file
- [ ] Every agent in the frontmatter `agents:` list matches the file naming convention
- [ ] Every subagent declares input artifacts, output artifacts, and result codes
- [ ] Every subagent's result codes match what the orchestrator's routing table expects
- [ ] Subagent prompts reference the artifact contract partial (or equivalent inline contract)

## 9. Skill References

- [ ] Every skill referenced in agent templates or workflow skills exists in `.github/skills/`
- [ ] Skill descriptions accurately describe their trigger conditions
- [ ] Skill mount lists in the architecture match what's configured in profile/agent setup

## 10. Error Handling

- [ ] Every subagent has at least a `failed` result code
- [ ] The orchestrator handles every failure gracefully (no silent drops)
- [ ] Max iteration limits prevent infinite loops
- [ ] Blocked/error exits produce meaningful status messages

## Findings

| # | Severity | Finding | Location | Fix |
|---|---|---|---|---|
| 1 | {Critical/High/Medium/Low} | {Description} | {File + line/section} | {What was fixed} |

## File Inventory

| File | Type | Status |
|---|---|---|
| `profiles/{profile}/profile.json` | Config | {Created / Updated} |
| `profiles/{profile}/agents/ralph.{name}.agent.md` | Orchestrator | {Created} |
| `profiles/{profile}/agents/ralph.{subagent}.agent.md` | Subagent stub | {Created} |
| `shared/agent-includes/{profile}/{subagent}.md` | Subagent partial | {Created} |
| `.github/skills/{skill}/SKILL.md` | Skill | {Created} |

**Total files:** {N} created, {M} updated
**Validation findings:** {N} found, {N} fixed
