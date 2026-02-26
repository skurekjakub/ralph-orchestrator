# Phase 4: Migrate Prompt & Container Layers

> **Effort:** Medium (2-3 days)
> **Depends on:** Phase 3
> **Prerequisite for:** Phase 5

## Goal

Replace JIRA types and JIRA-specific extraction logic in the prompt builder, template renderer, container manager, and JIT MCP param system with `WorkItem`.

## Tasks

### 4.1 Prompt Builder

**File:** `src/prompt/prompt.ts`

| Before | After |
|--------|-------|
| `buildPromptWithSections(issue: JiraIssue, ...)` | `buildPromptWithSections(item: WorkItem, ...)` |
| `extractAdfText(issue.fields.description)` | `item.description` (already plain text) |
| `issue.fields.summary` | `item.title` |
| `issue.key` | `item.id` |
| `extractField("priority", ...)` etc. | `item.priority`, `item.labels`, `item.type` |

**Big win:** Remove all `extractAdfText()` calls and `JiraFieldExtractor` usage. The connector already delivered clean text.

**File:** `src/prompt/prompt-builder.ts`

| Before | After |
|--------|-------|
| `build(issue: JiraIssue, ...)` | `build(item: WorkItem, ...)` |
| Delegates to `buildPromptWithSections(issue, ...)` | Delegates to `buildPromptWithSections(item, ...)` |

### 4.2 Template Context

**File:** `src/container/setup/agent-includes.ts`

| Before | After |
|--------|-------|
| `TemplateContext.jiraIssue` | `TemplateContext.workItem` |
| `buildTemplateContext(issue: JiraIssue, ...)` | `buildTemplateContext(item: WorkItem, ...)` |
| Liquid variables: `jira.key`, `jira.summary`, etc. | `task.id`, `task.title`, `task.description`, etc. |
| Custom field extraction | Direct field access on `WorkItem` |

**Template variable rename in Liquid templates:**

```
{{ jira.key }}         → {{ task.id }}
{{ jira.summary }}     → {{ task.title }}
{{ jira.description }} → {{ task.description }}
{{ jira.status }}      → {{ task.status }}
{{ jira.type }}        → {{ task.type }}
{{ jira.priority }}    → {{ task.priority }}
{{ jira.labels }}      → {{ task.labels }}
{{ jira.components }}  → {{ task.components }}
{{ jira.project }}     → {{ task.project }}
{{ jira.created }}     → {{ task.created }}
{{ jira.updated }}     → {{ task.updated }}
```

All `.agent.md` files under `profiles/*/agents/` and `shared/agent-includes/` must be updated.

### 4.3 JIT MCP Params

**File:** `src/container/setup/jit-mcp-params.ts`

| Before | After |
|--------|-------|
| `$jira.key` macro | `$task.id` macro |
| `$jira.project` macro | `$task.project` macro |
| `$jira.branch` macro (slugified key) | `$task.branch` macro |
| `$jira.summary` macro | `$task.title` macro |
| `MACROS` map reads from `JiraIssue` fields | `MACROS` map reads from `WorkItem` fields |
| `resolveJitParams(issue: JiraIssue, ...)` | `resolveJitParams(item: WorkItem, ...)` |

**Profile config update:** All `profile.json` files with `$jira.*` macros in their `mcpServers[].env` blocks must be updated to `$task.*`.

### 4.4 Container Manager

**File:** `src/container/manager.ts`

| Before | After |
|--------|-------|
| `execute(issue: JiraIssue, ...)` | `execute(item: WorkItem, ...)` |
| `issue.key` for log naming | `item.id` for log naming |
| Passes `JiraIssue` to lifecycle hooks | Passes `WorkItem` |

### 4.5 Continuation Runner

**File:** `src/container/continuation-runner.ts`

| Before | After |
|--------|-------|
| References to `JiraIssue` if any | References to `WorkItem` |
| Issue key for logging | `item.id` for logging |

### 4.6 Container Lifecycle Hooks

**File:** `src/container/lifecycle.ts`

| Before | After |
|--------|-------|
| `RepoSyncHook` receives `JiraIssue` | Receives `WorkItem` |
| Uses `issue.key` for branch naming | Uses `item.id` for branch naming |

## Validation

- `npm run lint` passes
- `npm test` passes
- No `JiraIssue` / `JiraComment` imports outside `src/datasource/connectors/jira/`
- All `.agent.md` templates use `task.*` variables, not `jira.*`
- All `profile.json` macros use `$task.*`, not `$jira.*`
- Rendered agent files produce correct output with new variable names
