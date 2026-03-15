# Phase 2: Leaf Agent Wiring — Discovery Output

**Goal**: Add discovery file output to all 5 leaf agents and make the execution-coordinator aware of discovery files for per-task agents.
**Dependencies**: Phase 1 (directory must exist).
**Outputs consumed by**: Phase 3 (gap-hunter reads the files these agents produce).

---

## Design Notes

Each agent gets a new section instructing it to write a discovery file. The section is placed AFTER the primary output but BEFORE any status updates. Key constraints:

- **Discovery writing is OPTIONAL** — agents only write a file if they actually have discoveries. No empty files.
- **ID format**: `DISC-NNN` scoped per file (each file restarts at DISC-001).
- **Discovery types**: `undocumented-behavior`, `missing-coverage`, `stale-content`, `cross-cutting-concern`, `scope-expansion`.
- **Cycle number**: Read from `progress.json` → `gapHunting.cyclesCompleted + 1` (or `1` if no re-entry has occurred).
- **Global agents** use `context: "global"`. Per-task agents use `context: "<task-id>"`.

Each agent's discovery guidance should be tailored to what that specific agent is likely to discover — not generic.

---

## Tasks

### 2.1 — Add discovery output to code-analyzer

**File**: `.fractals/docwriter/docwriter-code-analyzer.agent.md`

The code-analyzer does deep per-file analysis across the entire change set. It's the agent most likely to discover undocumented behaviors, cross-cutting concerns that span multiple areas, and missing coverage beyond its scope.

**Changes**:

1. Add a new section after the `code-analysis.json` output section and before any status/completion section. Title: `## Discovery Output (Optional)`.
2. Content:

```markdown
## Discovery Output (Optional)

If during analysis you encounter facts that don't fit into any `docFacts` entry — patterns spanning multiple areas, undocumented behaviors not tied to changed files, or documentation gaps you noticed while reading surrounding code — write a discovery file.

**File**: `.docwriter/discoveries/code-analyzer--global--c{cycle}.json`

Where `{cycle}` = `gapHunting.cyclesCompleted + 1` from `progress.json` (default `1` on first run).

**Only write this file if you have discoveries.** Do not create an empty file.

| Field | Value |
|-------|-------|
| `agent` | `"code-analyzer"` |
| `context` | `"global"` |
| `cycle` | Cycle number (integer) |
| `timestamp` | ISO-8601 |
| `discoveries` | Array of discovery entries |

**Discovery entry fields**: `id` (DISC-NNN), `type`, `summary`, `evidence`, `suggestedAction`, `affectedArea`, `severity`.

**What to look for**:
- Behavioral impacts in files OUTSIDE the change inventory that you noticed via cross-references
- Config surfaces, error codes, or API contracts that aren't in any existing doc page
- Patterns that repeat across 3+ changed files suggesting a cross-cutting concern
- Deprecated code paths still referenced in documentation (if you happen to see doc files)
```

**Acceptance Criteria**:
- [ ] Discovery section exists after code-analysis.json output, before status section
- [ ] File path uses `code-analyzer--global--c{cycle}.json` naming
- [ ] Section specifies "only write if you have discoveries"
- [ ] Discovery types are tailored to code-analysis context (cross-cutting, undocumented behaviors, config surfaces)

---

### 2.2 — Add discovery output to content-writer

**File**: `.fractals/docwriter/docwriter-content-writer.agent.md`

The content-writer already has `gaps` and `notes` fields in `writer-output.json` but the execution-coordinator ignores them. The discovery file replaces this dead channel with a persisted, non-overwritten artifact.

**Changes**:

1. Add a new section after the `writer-output.json` schema section and before any completion/status section. Title: `## Discovery Output (Optional)`.
2. Content:

```markdown
## Discovery Output (Optional)

If during writing you discover facts that don't belong in the current task's target file — gaps in adjacent pages, contradictions with other documentation, missing prerequisites, or content that should exist but doesn't — write a discovery file.

**File**: `.docwriter/discoveries/content-writer--{task-id}--c{cycle}.json`

Where `{task-id}` is the task you're writing for and `{cycle}` = `gapHunting.cyclesCompleted + 1` from `progress.json` (default `1`).

**Only write this file if you have discoveries.** Do not create an empty file.

| Field | Value |
|-------|-------|
| `agent` | `"content-writer"` |
| `context` | Task ID (e.g. `"T-003"`) |
| `cycle` | Cycle number (integer) |
| `timestamp` | ISO-8601 |
| `discoveries` | Array of discovery entries |

**Discovery entry fields**: `id` (DISC-NNN), `type`, `summary`, `evidence`, `suggestedAction`, `affectedArea`, `severity`.

**What to look for**:
- Adjacent doc pages that contradict what you're writing (stale-content)
- Prerequisites or setup steps that need their own doc page but don't have one (missing-coverage)
- Links to pages that don't cover the feature you're documenting (scope-expansion)
- Code behaviors you're referencing that aren't in code-analysis.json (undocumented-behavior)

```

3. **Remove the `gaps` and `notes` fields** from the `writer-output.json` schema. The discovery file replaces this dead channel entirely.

**Acceptance Criteria**:
- [ ] Discovery section exists after writer-output.json schema, before status section
- [ ] File path uses `content-writer--{task-id}--c{cycle}.json` naming (per-task)
- [ ] `gaps` and `notes` fields removed from writer-output.json schema
- [ ] Section specifies "only write if you have discoveries"
- [ ] Discovery types tailored to writing context (adjacent page contradictions, missing prerequisites, stale links)

---

### 2.3 — Add discovery output to impact-mapper

**File**: `.fractals/docwriter/docwriter-impact-mapper.agent.md`

The impact-mapper maps code changes to documentation impact. It's well-positioned to discover doc pages that should be affected but aren't in any area, or new pages that should exist for features never documented.

**Changes**:

1. Add a new section after the `impact-matrix.json` output schema and before any status/completion section. Title: `## Discovery Output (Optional)`.
2. Content:

```markdown
## Discovery Output (Optional)

If during impact mapping you identify documentation needs that go beyond the change inventory — pages that should exist but don't, areas of the codebase that appear undocumented, or stale pages you encountered while scanning the doc corpus — write a discovery file.

**File**: `.docwriter/discoveries/impact-mapper--global--c{cycle}.json`

Where `{cycle}` = `gapHunting.cyclesCompleted + 1` from `progress.json` (default `1`).

**Only write this file if you have discoveries.** Do not create an empty file.

| Field | Value |
|-------|-------|
| `agent` | `"impact-mapper"` |
| `context` | `"global"` |
| `cycle` | Cycle number (integer) |
| `timestamp` | ISO-8601 |
| `discoveries` | Array of discovery entries |

**Discovery entry fields**: `id` (DISC-NNN), `type`, `summary`, `evidence`, `suggestedAction`, `affectedArea`, `severity`.

**What to look for**:
- Code areas with no corresponding documentation at all (missing-coverage)
- Doc pages that reference functionality significantly changed but not captured by any impact (stale-content)
- Features that span multiple doc areas but have no cross-reference hub page (cross-cutting-concern)
- `no-doc-impact` classifications that feel wrong on reflection (scope-expansion)
```

**Acceptance Criteria**:
- [ ] Discovery section exists after impact-matrix.json output schema, before status section
- [ ] File path uses `impact-mapper--global--c{cycle}.json` naming
- [ ] Section specifies "only write if you have discoveries"
- [ ] Discovery types tailored to impact mapping context (undocumented areas, stale pages, no-doc-impact reconsideration)

---

### 2.4 — Add discovery output to research-scout

**File**: `.fractals/docwriter/docwriter-research-scout.agent.md`

The research-scout queries external sources. It may discover that certain features have official documentation elsewhere that contradicts or supersedes the local docs, or that industry best practices have shifted.

**Changes**:

1. Add a new section after the `research-brief.json` output schema and before any status/completion section. Title: `## Discovery Output (Optional)`.
2. Content:

```markdown
## Discovery Output (Optional)

If during research you discover information that doesn't fit into any research recommendation but signals a documentation problem — contradictions between external sources and local docs, deprecated practices still recommended locally, or entirely undocumented product features mentioned in external content — write a discovery file.

**File**: `.docwriter/discoveries/research-scout--global--c{cycle}.json`

Where `{cycle}` = `gapHunting.cyclesCompleted + 1` from `progress.json` (default `1`).

**Only write this file if you have discoveries.** Do not create an empty file.

| Field | Value |
|-------|-------|
| `agent` | `"research-scout"` |
| `context` | `"global"` |
| `cycle` | Cycle number (integer) |
| `timestamp` | ISO-8601 |
| `discoveries` | Array of discovery entries |

**Discovery entry fields**: `id` (DISC-NNN), `type`, `summary`, `evidence`, `suggestedAction`, `affectedArea`, `severity`.

**What to look for**:
- External docs that contradict local documentation (stale-content)
- Features mentioned in release notes or changelogs but absent from local docs (missing-coverage)
- Deprecated APIs or practices that local docs still recommend (stale-content)
- Community patterns or official recommendations not reflected in local guides (scope-expansion)
```

**Acceptance Criteria**:
- [ ] Discovery section exists after research-brief.json output schema, before status section
- [ ] File path uses `research-scout--global--c{cycle}.json` naming
- [ ] Section specifies "only write if you have discoveries"
- [ ] Discovery types tailored to research context (external contradictions, deprecated practices, undocumented features)

---

### 2.5 — Add discovery output to cross-ref-updater

**File**: `.fractals/docwriter/docwriter-cross-ref-updater.agent.md`

The cross-ref-updater checks links and cross-references. It's positioned to discover broken references, orphaned pages, and structural documentation problems.

**Changes**:

1. Add a new section after the `verification-matrix.json` output schema and before any status/completion section. Title: `## Discovery Output (Optional)`.
2. Content:

```markdown
## Discovery Output (Optional)

If during cross-reference checking you discover structural documentation problems beyond broken links — orphaned pages with no inbound links, topic clusters that should be linked but aren't, or pages whose content has drifted from their stated scope — write a discovery file.

**File**: `.docwriter/discoveries/cross-ref-updater--global--c{cycle}.json`

Where `{cycle}` = `gapHunting.cyclesCompleted + 1` from `progress.json` (default `1`).

**Only write this file if you have discoveries.** Do not create an empty file.

| Field | Value |
|-------|-------|
| `agent` | `"cross-ref-updater"` |
| `context` | `"global"` |
| `cycle` | Cycle number (integer) |
| `timestamp` | ISO-8601 |
| `discoveries` | Array of discovery entries |

**Discovery entry fields**: `id` (DISC-NNN), `type`, `summary`, `evidence`, `suggestedAction`, `affectedArea`, `severity`.

**What to look for**:
- Pages with zero inbound links from the rest of the corpus (missing-coverage — orphaned)
- Topic clusters that should be interlinked but aren't (cross-cutting-concern)
- Pages whose actual content doesn't match their title or stated scope (stale-content)
- Links pointing to sections that exist but have drifted in meaning (stale-content)
```

**Acceptance Criteria**:
- [ ] Discovery section exists after verification-matrix.json output schema, before status section
- [ ] File path uses `cross-ref-updater--global--c{cycle}.json` naming
- [ ] Section specifies "only write if you have discoveries"
- [ ] Discovery types tailored to cross-reference context (orphaned pages, missing interlinks, scope drift)

---

### 2.6 — Add execution-coordinator awareness of discovery files

**File**: `.fractals/docwriter/docwriter-execution-coordinator.agent.md`

The execution-coordinator dispatches content-writer per task. After Phase 2, content-writer will create per-task discovery files. The execution-coordinator does not need to READ these files (gap-hunter consumes them), but it needs to:
1. NOT treat discovery files as unexpected artifacts
2. NOT clean up or interfere with the `discoveries/` directory during re-entry task reset

**Changes**:

1. In the Step A section (content-writer dispatch, around line 98), after the verification that `writer-output.json` exists, add a note:

```markdown
> **Note**: Content-writer may also create `.docwriter/discoveries/content-writer--<task-id>--c<cycle>.json`. This file is consumed by gap-hunter in Pass 6 — do not read, modify, or delete it.
```

2. In the Step 0 (re-entry handling, if present), add a note that discovery files from prior cycles should NOT be removed during task reset.

**Acceptance Criteria**:
- [ ] Execution-coordinator acknowledges content-writer discovery files
- [ ] Explicitly states not to read, modify, or delete discovery files
- [ ] Re-entry handling preserves discovery files from prior cycles
