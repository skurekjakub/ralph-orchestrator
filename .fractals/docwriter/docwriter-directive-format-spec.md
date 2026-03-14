# Directive Format Specification

> Source of truth for the `.docwriter/directives.md` file format. All 8 directive-reading agents reference this spec.

## File Location

`.docwriter/directives.md` — created by bootstrap, edited by the user between agent invocations.

## Behavior When Missing or Empty

If the file does not exist or is empty, **no directives are active**. The pipeline runs normally with zero directive influence. Agents treat a missing file identically to an empty file.

## Section Types

The file uses markdown `##` headings to scope directives. Five section types are supported.

### `## Global`

**Scope:** All passes and all agents (coordinators + specialists).

Coordinators relay Global directives to every specialist they dispatch.

**Examples:**
- `Focus documentation on the REST API module only`
- `Use shorter paragraphs (max 3 sentences each)`
- `All code examples must use TypeScript, not JavaScript`
- `Prefer tables over bullet lists for parameter documentation`

### `## Context`

**Scope:** Informational enrichment for all agents. Context directives provide background knowledge that improves agent understanding but do not prescribe behavior.

Coordinators relay Context directives alongside Global directives.

**Examples:**
- `The authentication system was recently migrated from API keys to OAuth 2.0`
- `The team prefers 'endpoint' over 'route' terminology`
- `v3.2 renamed FooService to BarService — all references should use the new name`
- `The docs site uses Docusaurus, not Jekyll, for the API reference section`

### `## Pass N` (or `## Pass N.N`)

**Scope:** The specific coordinator that manages that pass. Only the targeted coordinator reads and acts on these directives.

The coordinator relays applicable Pass directives to its specialists.

| Heading | Read by |
|---|---|
| `## Pass 0` | knowledge-curator (direct-dispatch) |
| `## Pass 1` | discovery-coordinator |
| `## Pass 2` | analysis-coordinator |
| `## Pass 3` | analysis-coordinator |
| `## Pass 4` | execution-coordinator |
| `## Pass 5` | verification-coordinator |
| `## Pass 6` | verification-coordinator |
| `## Pass 6.5` | synthesis-coordinator |
| `## Pass 7` | delivery-coordinator |

**Examples:**
- `## Pass 2` → `Skip research-scout (no internet access this run)`
- `## Pass 4` → `Skip persona review for all tasks — we know the audience`
- `## Pass 6` → `Force convergence after this cycle — don't re-enter`
- `## Pass 3` → `Limit task graph to max 10 tasks — small scope run`

### `## Task T-NNN`

**Scope:** A specific task ID, relayed by execution-coordinator into the per-task dispatch context for content-writer and reviewers.

Only execution-coordinator reads these; it inlines the directive content into the writer's dispatch context for the matching task.

**Examples:**
- `## Task T-003` → `Include a complete OAuth 2.0 code example with error handling`
- `## Task T-007` → `This page targets admins, not developers — adjust persona accordingly`
- `## Task T-012` → `Skip accuracy review — this is a cosmetic formatting fix only`

### `## Routing`

**Scope:** Orchestrator-only. These directives modify the orchestrator's routing decisions — skipping passes, halting the pipeline, or forcing re-runs.

No coordinator reads Routing directives. Only `docwriter` (the session orchestrator) processes them.

**Examples:**
- `Skip Pass 0 (meta-knowledge not useful for this run)`
- `Re-run Pass 2 with broader analysis scope`
- `Halt before Pass 7 — I want to review first`
- `Skip Pass 6.5 — no need for knowledge synthesis this run`

**Supported routing actions:**

| Action | Syntax (free-form, intent-matched) | Effect |
|---|---|---|
| Skip a pass | "Skip Pass N" | Sets pass status to `"done"` without executing |
| Halt before a pass | "Halt before Pass N" | Pipeline stops before reaching that pass |
| Force re-run | "Re-run Pass N" | Resets pass status to `"not-started"` |

## Precedence Rules

When directives at different scopes conflict, the **more specific scope wins**:

```
Task T-NNN  >  Pass N  >  Global  >  Context
```

- A `## Task T-003` directive overrides a conflicting `## Pass 4` directive for that task only.
- A `## Pass 4` directive overrides a conflicting `## Global` directive for Pass 4 only.
- `## Context` is informational and does not conflict with behavioral directives.

**Conflicting directives at the same scope** (e.g., two Global directives that contradict each other) are logged as warnings. The agent applies whichever it encounters first and notes the conflict in its `directivesApplied` status.

## Invariant Supremacy

**Directives CANNOT override invariants.** This is an absolute constraint enforced by every directive-reading agent.

If a directive conflicts with any invariant in `invariant-inventory.json`, the invariant wins unconditionally. The agent:
1. Ignores the conflicting directive
2. Logs a warning in its status file `directivesApplied` array with `action: "ignored — invariant conflict"`
3. Logs the conflict in `manifest.json`

**Example:**
- Invariant `INV-style-003`: "Use active voice in all documentation"
- Directive `## Global`: "Write in passive voice for a more formal tone"
- Result: Directive is ignored. `INV-style-003` applies. Warning logged.

This ensures that human directives enhance the pipeline but cannot accidentally degrade quality below the invariant floor.

## Coordinator Relay Pattern

Specialists do NOT read `directives.md` directly. Instead:

1. The coordinator reads the file and extracts applicable sections (Global + Context + its own Pass section).
2. The coordinator includes relevant directive content in the dispatch message to each specialist.
3. Task-scoped directives (`## Task T-NNN`) are inlined by execution-coordinator into the per-task dispatch context.

This relay pattern means:
- Specialist agents need zero modification for directive support.
- Coordinators control what each specialist sees — consistent with the fractal architecture's information scoping principle.
- The coordinator can filter out directives that don't apply to a specific specialist.

## `directivesApplied` Status Schema

Every directive-reading agent includes a `directivesApplied` array in its status file:

```json
{
  "directivesApplied": [
    {
      "section": "Global",
      "summary": "Focus documentation on REST API module only",
      "action": "applied — narrowed scope to REST API in dispatch"
    },
    {
      "section": "Pass 4",
      "summary": "Skip persona review for all tasks",
      "action": "applied — persona reviewer skipped for all tasks"
    },
    {
      "section": "Global",
      "summary": "Write in passive voice",
      "action": "ignored — conflicts with INV-style-003 (active voice required)"
    }
  ]
}
```

When no directives are present, the array is empty: `"directivesApplied": []`.

## Persistence

Directives are **persistent until removed**. They are not consumed on first read. As long as a directive exists in the file, it applies on every agent invocation.

The user manages the lifecycle by editing or deleting content from the file. This is simpler and more predictable than consumed-once semantics, which would require state tracking and risk lost directives on re-runs.

## File Template

Bootstrap creates the file with this template:

```markdown
# Directives

<!-- Edit this file between agent invocations to inject mid-run guidance. -->
<!-- Directives are persistent until you remove them. -->
<!-- Invariants ALWAYS win — directives cannot override policy constraints. -->

## Global
<!-- Applies to all passes and agents. -->

## Context
<!-- Background information — enriches agent understanding without prescribing behavior. -->

## Routing
<!-- Orchestrator-only: skip/halt/re-run passes. -->
```
