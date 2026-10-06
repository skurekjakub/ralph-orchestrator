# Preflight Improvements — Extensibility & Revision Workflow

## What This Is

Two related improvements to the preflight check system:

1. **Review and improve the existing preflight system**: Assess current preflight checks for completeness and extensibility
2. **Add a preflight for the revision workflow**: Ensure revision tasks have the context they need before agent invocation, and update post-preflight tool calls accordingly

## Current State

The preflight system (`src/services/preflight.ts`) is a simple named-check registry:

```typescript
const PREFLIGHT_CHECKS: Record<string, PreflightCheck> = {
  "review-ready": (_issue, ctx) => {
    if (!ctx.prUrl) return { ok: false, reason: "No PR URL found in comments" };
    if (!ctx.handoffContent) return { ok: false, reason: "No handoff.md attachment found" };
    return { ok: true };
  },
};
```

A variant declares `preflight: "review-ready"` in its `profile.json` config. The orchestrator calls `buildPreflightContext()` to gather comments + handoff content + PR URL, then runs the named check. Failure → reject operation with reason.

The `PreflightContext` currently contains:

- `comments: JiraComment[]` — All issue comments (already fetched during trigger scanning)
- `handoffContent: string | null` — Latest handoff.md attachment content
- `prUrl: string | null` — PR URL extracted from comments (most recent first)

## What Needs Review

### Extensibility Gaps

1. **Context is limited**: `PreflightContext` only carries comments, handoff, and PR URL. New preflights that need different data (e.g., linked issue statuses, attachment list, or container state) would need to expand the context.

2. **Checks are synchronous**: `PreflightCheck` is `(issue, ctx) => PreflightResult`. If a preflight needs to make an API call (e.g., check ADO PR status, verify a linked issue is resolved), it can't — only sync return.

3. **No composition**: A variant can declare exactly one `preflight` string. There's no way to run multiple named checks in sequence (e.g., "review-ready AND linked-issues-resolved").

4. **No warning-level findings**: A preflight either passes or blocks. There's no "warn but proceed" path (e.g., "handoff is present but unusually short — proceed with caution").

### Suggested Improvements

- Make `PreflightCheck` async: `(issue, ctx) => Promise<PreflightResult>`
- Allow `preflight` to be a string array: `["review-ready", "linked-resolved"]`
- Add a `PreflightSeverity` to results: `block | warn`
- Make `buildPreflightContext()` extensible — each named check declares what context it needs, and only the relevant fetches run

## Revision Workflow Preflight

### The Need

When the orchestrator picks up a revision task (issue in a `revisionStatuses` status), the agent needs:

- The previous handoff document (what was done in the first pass)
- The PR URL (what code was produced)
- Review feedback (comments on the PR, or JIRA comments describing defects)

Currently, the standard Ralph variants have no preflight — they run unconditionally. The Malph reviewer has `review-ready` which gates on PR URL + handoff. But there's no preflight for the **revision Ralph** (the agent that fixes issues found by the reviewer).

### Expected Check: `revision-ready`

A new preflight that ensures:

1. A handoff document exists (the first-pass agent produced output)
2. A PR URL exists (there's code to revise)
3. Review feedback exists (there's something to act on — could be a Malph review comment, or a human defect description)

Without these, the revision agent would start blind — wasting compute with no context to guide revisions.

### Post-Preflight Tool Call Updates

The todo mentions "update tool calls after" — this likely means:

After the preflight gathers context (handoff content, PR URL, review comments), that context should flow into the agent's prompt or available tools rather than being discarded after the pass/fail check.

Currently, `buildPreflightContext()` fetches handoff content and PR URL, and `runPreflight()` uses them for validation. But the actual values are thrown away after the check — they're not passed to `buildTemplateContext()` or the prompt builder.

**Expected change**: The preflight context should be forwarded to the template or prompt builder:

```typescript
// In orchestrator.executeOperation():
const preflightCtx = await buildPreflightContext(...);
const result = runPreflight(preflight, issue, preflightCtx);
if (!result.ok) { reject(); return; }

// Pass preflight findings to the template context
await runTask(issue, profile, operation, {
  handoffContent: preflightCtx.handoffContent,
  prUrl: preflightCtx.prUrl,
});
```

This avoids redundant fetches and makes the preflight data available in Liquid templates:

```liquid
{%- if prUrl %}
The PR for this task is: {{ prUrl }}
{%- endif %}
```

## What Changes in the Codebase

1. **`src/services/preflight.ts`**:
   - Make `PreflightCheck` async
   - Add `revision-ready` check
   - Consider composable check arrays
   - Add warning-level results

2. **`src/config.ts`**:
   - Allow `preflight` to be `string | string[]`

3. **`src/orchestrator.ts`**:
   - Pass preflight context forward to `runTask()` after successful check
   - Handle async preflight checks

4. **`src/container/setup/agent-includes.ts`**:
   - Add preflight-gathered fields to `TemplateContext` (handoff content, PR URL)

5. **Agent templates**:
   - Revision templates can now reference `{{ prUrl }}` and `{{ handoffContent }}` directly

6. **Tests**:
   - New preflight test cases for `revision-ready`
   - Async preflight test infrastructure
   - End-to-end test for preflight context flowing into template rendering

## Open Questions

- Should preflight checks declare their own context requirements (like a dependency injection pattern), or should `buildPreflightContext()` always fetch everything?
- How much of the handoff document should be in the template context? The full content could be very long — should it be summarized or truncated?
- Should the preflight system support custom checks defined in profile config (e.g., a small inline expression) or only registered named checks?
