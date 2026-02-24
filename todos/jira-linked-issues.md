# JIRA Linked Issues — Dependency Awareness & Context Enrichment

## What This Is

Make the orchestrator and agents aware of JIRA issue links (blocks, is blocked by, relates to, is caused by) so that:
1. Agents receive context from related issues in their prompts
2. The orchestrator can respect dependency ordering (don't start a task that depends on an incomplete prerequisite)
3. Agents can build on top of work from linked issues (e.g., check out a branch from a prerequisite PR)

## Core Concept

JIRA issues rarely exist in isolation. A documentation task might depend on another task being completed first (the prerequisite introduces the API that needs documenting). Or two tasks might relate to the same subsystem and the second agent should know what the first one wrote.

Currently, agents have zero visibility into linked issues. They see only the single issue they're assigned.

## What the Orchestrator Needs

### Link Extraction

The JIRA REST API returns issue links via `fields.issuelinks`. Each link has:
- `type.name`: "Blocks", "Relates", "Dependency", etc.
- `inwardIssue` / `outwardIssue`: The linked issue key, status, summary

The `JiraClient` or a new service needs to fetch link data when polling or when building the prompt context.

### Dependency Ordering

For "blocks"/"is blocked by" links:
- If issue A blocks issue B, and B is triggered, the orchestrator should check if A is completed
- If A is not completed: either reject/defer the operation (with a JIRA comment explaining the block), or proceed but include A's context as "prerequisite in progress"
- If A is completed: include A's handoff/PR details so B's agent can build on top of A's work

This adds a new preflight check — `preflight: "dependency-check"` — that queries linked issues and validates prerequisite statuses.

### Context Enrichment

For "relates to" and other non-blocking links:
- Include a summary of related issues in the prompt: key, summary, status, and (if completed) the PR URL and handoff summary
- Don't block execution — just provide context

This enrichment happens in `buildTemplateContext()` or in the prompt builder. The `TemplateContext` would need a new field like `linkedIssues: LinkedIssueContext[]` containing the basic metadata for each linked issue.

## What Changes in the Codebase

### JiraClient

New method to fetch issue links: `getIssueLinks(issueKey: string): Promise<JiraIssueLink[]>`. This could be part of the existing `getIssue()` call (the fields are already available in the response, just not extracted) or a separate call.

### TemplateContext

New field:
```typescript
linkedIssues: {
  key: string;
  summary: string;
  status: string;
  linkType: string;        // "blocks", "relates to", etc.
  direction: string;       // "inward" or "outward"
  prUrl?: string;          // If completed and PR exists
  handoffSummary?: string; // If completed and handoff exists
}[];
```

### Agent Templates

A new optional prompt section rendered when linked issues exist:
```liquid
{%- if linkedIssues.size > 0 %}
{% section "related-issues" %}
## Related JIRA Issues
{% for issue in linkedIssues %}
- **{{ issue.key }}** ({{ issue.linkType }}): {{ issue.summary }} — Status: {{ issue.status }}
  {%- if issue.prUrl %} | PR: {{ issue.prUrl }}{%- endif %}
{% endfor %}
{% endsection %}
{%- endif %}
```

### Preflight Check

A new named preflight `"dependency-check"` that:
1. Fetches linked issues with "blocks" relationship
2. Checks if all blocking issues are in a completed status
3. If not, rejects the operation with a JIRA comment listing the blockers

### Operation Ledger

The ledger might need to record which linked issues were checked and their statuses at time of execution — for debugging dependency chains.

## Open Questions

- **Handoff retrieval**: Should the orchestrator fetch the full handoff attachment from completed prerequisite issues? That's an additional API call per linked issue. Maybe just include the summary.
- **Circular dependencies**: How to handle if A blocks B and B blocks A? Probably just detect and reject both.
- **Stale links**: JIRA link types vary by project configuration. How to normalize "Blocks" vs "Dependency" vs custom link types?
- **Branch inheritance**: If prerequisite issue A created branch `ralph/DOC-3000-xyz`, should issue B's agent be told to branch from A's branch instead of `main`? This would be powerful but adds complexity.
- **Performance**: Fetching links for every polled issue adds API calls. Consider caching or batch fetching.
