# Requirements Template

Use this template for the Phase 0 deliverable. Fill in each section based on repo research and user interview. Delete guidance text in parentheses after filling in.

---

# Requirements: {Agent Family Name}

## Target Repository

- **Repo:** {path or URL}
- **Languages:** {primary languages}
- **Build system:** {npm, gradle, dotnet, etc.}
- **Key conventions:** {monorepo structure, module patterns, test framework, etc.}
- **Existing automation:** {CI pipelines, existing agents, linters, etc.}

## Task Description

{One paragraph describing what the agent should accomplish.}

## Trigger

- **Mechanism:** {JIRA comment, manual invocation, CI event, scheduled}
- **Trigger string:** {e.g., `@RalphAgent`, `@RalphDocs`}
- **Trigger parameters:** {e.g., `(verbose, skip_review)` — list expected parameters and what they do}
- **Source:** {JIRA project key, issue types, JQL filter}

## Expected Deliverable

{What the agent produces when it succeeds.}

- **Primary output:** {PR, report, JIRA comment, file set}
- **Output location:** {branch naming, PR target, file path patterns}
- **Handoff method:** {JIRA comment, PR description, report file}

## External Dependencies

| Dependency | Type | Purpose |
|---|---|---|
| {e.g., ADO API} | REST API | {Push code, create PRs} |
| {e.g., JIRA} | MCP / REST | {Read issue, post comments} |
| {e.g., npm registry} | Package manager | {Install dependencies} |

## MCP Tools Required

| Tool / Server | Purpose | Scope |
|---|---|---|
| {e.g., ado_push_progress} | {Push to remote} | {Orchestrator only} |
| {e.g., jira_add_comment} | {Post status updates} | {Orchestrator + scribe} |

## Quality Gates

{What must pass before the agent's work is considered done.}

- [ ] {e.g., All three reviewers approve}
- [ ] {e.g., Build passes}
- [ ] {e.g., PR created and linked to JIRA}
- [ ] {e.g., Handoff comment posted}

## Known Failure Modes

| Failure | Impact | Mitigation |
|---|---|---|
| {e.g., Build failure} | {Blocks PR} | {Retry with fix, max 2 attempts} |
| {e.g., Repo access denied} | {Fatal} | {Exit with `blocked` status} |
| {e.g., Ambiguous scope} | {Wrong output} | {Researcher asks for clarification} |

## Constraints

- **Model budget:** {All Opus / mixed / Sonnet-only / specific limits}
- **Execution mode:** {Container / local / hybrid}
- **Time budget:** {If applicable — max iterations, max continuation rounds}
- **Existing infrastructure to reuse:** {Shared includes, existing skills, MCP servers}
- **Integration points:** {Other agent families this one interacts with}

## Variant Requirements

{If the agent handles multiple task types, describe each variant.}

### Variant: {name}
- **Match rule:** {How this variant is selected — trigger params, issue fields, etc.}
- **Differences from default:** {What changes — different subagents, different skills, different review gate}

## Open Questions

{List anything that needs clarification before proceeding to Phase 1.}

1. {Question}
2. {Question}
