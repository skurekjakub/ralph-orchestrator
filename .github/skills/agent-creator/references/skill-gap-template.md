# Skill Gap Template

Use this template for the Phase 3 deliverable.

---

# Skill Plan: {Agent Family Name}

## Domain Inventory

List every knowledge domain the agent family needs:

| # | Domain | Description | Which subagents need it |
|---|---|---|---|
| 1 | {e.g., API conventions} | {REST endpoint patterns, naming, versioning} | {researcher, writer} |
| 2 | {e.g., Doc format standards} | {Markdown conventions, heading hierarchy, metadata} | {writer, reviewer} |
| 3 | {e.g., Build system} | {How to build, test, lint the target repo} | {coder} |
| 4 | {e.g., Review standards} | {What constitutes approval, common defects} | {reviewer} |

## Skill Audit

### Reuse (existing skills, no changes needed)

| Skill | Covers domain | Used by |
|---|---|---|
| {e.g., agent-eval} | {Quality evaluation} | {post-task hook} |

### Extend (existing skills, need updates)

| Skill | Current scope | Needed additions | Used by |
|---|---|---|---|
| {e.g., code-conventions} | {General patterns} | {Add repo-specific patterns} | {coder, reviewer} |

### Create (new skills needed)

| Skill | Domain | Trigger condition | Scope | Size | Used by |
|---|---|---|---|---|---|
| {e.g., api-surface} | {Target API} | {When researching API endpoints} | {Endpoint inventory, auth, versioning} | {Medium} | {researcher} |
| {e.g., doc-format} | {Doc conventions} | {When writing/reviewing docs} | {Heading rules, metadata, template} | {Small} | {writer, reviewer} |

## Per-Subagent Skill Mounts

| Subagent | Skills |
|---|---|
| orchestrator | {e.g., none — pure router} |
| {subagent-1} | {skill-a, skill-b} |
| {subagent-2} | {skill-b, skill-c} |
| {subagent-3} | {skill-d} |

## New Skill Specifications

### {skill-name-1}

- **Name:** {skill-name}
- **Trigger:** {When should the agent read this? e.g., "When writing API documentation"}
- **Scope:** {What it covers — 2-3 sentences}
- **Content outline:**
  1. {Section 1 — e.g., endpoint naming conventions}
  2. {Section 2 — e.g., request/response format}
  3. {Section 3 — e.g., error handling patterns}
- **Reference files needed:**
  - `references/{file1}.md` — {what it contains}
  - `references/{file2}.md` — {what it contains}
- **Estimated size:** {Small / Medium / Large}
- **Priority:** {High — blocks subagent work / Medium — improves quality / Low — nice to have}

### {skill-name-2}

{Repeat for each new skill.}

## Shared vs. Subagent-Specific

| Category | Skills |
|---|---|
| Shared (multi-subagent) | {skill-b (used by subagent-1, subagent-2)} |
| Subagent-specific | {skill-a (subagent-1 only), skill-d (subagent-3 only)} |

## Creation Priority

{Order in which new skills should be created, based on blocking dependencies.}

1. {skill-name} — {reason it's first, e.g., "Blocks researcher subagent"}
2. {skill-name} — {reason}
3. {skill-name} — {reason, e.g., "Nice to have, improves reviewer accuracy"}
