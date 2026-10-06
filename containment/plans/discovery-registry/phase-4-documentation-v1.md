# Phase 4: Documentation & Routing Updates

**Goal**: Update all documentation artifacts to reflect the discovery registry: ROUTING-ARCHITECTURE.md data flows, orchestrator awareness, and changelog.
**Dependencies**: Phase 2 (agent changes finalized), Phase 3 (gap-hunter changes finalized).
**Outputs consumed by**: Phase 5 (verification checks documentation consistency).

---

## Tasks

### 4.1 — Update ROUTING-ARCHITECTURE.md — P-01 artifact chain

**File**: `.fractals/docwriter/ROUTING-ARCHITECTURE.md`

The artifact chain at ~line 147 lists all artifacts produced during P-01. `discoveries/*.json` must be added as artifacts produced during Pass 1 (code-analyzer), Pass 2 (impact-mapper, research-scout), Pass 4 (content-writer), and Pass 5 (cross-ref-updater).

**Changes**:

1. In the P-01 artifact chain, add `discoveries/*.json` as a cross-cutting artifact produced by multiple passes.
2. Alternatively, add a note after the chain: `Cross-cutting: leaf agents in Passes 1, 2, 4, 5 may produce `.docwriter/discoveries/{agent}--{context}--c{cycle}.json` (consumed by gap-hunter in Pass 6).`

**Acceptance Criteria**:
- [ ] Discovery files appear in the P-01 artifact documentation
- [ ] Producing passes (1, 2, 4, 5) are identified
- [ ] Consuming pass (6) is identified

---

### 4.2 — Update ROUTING-ARCHITECTURE.md — Pass 1 data flow

**File**: `.fractals/docwriter/ROUTING-ARCHITECTURE.md`

The Pass 1 section (code-analyzer dispatch) currently lists `code-analysis.json` as the sole output. Add `discoveries/code-analyzer--global--c*.json` as an optional output.

**Changes**:

1. In the Pass 1 data flow (discovery-coordinator dispatches code-analyzer), add:
   - **Optional writes**: `discoveries/code-analyzer--global--c{cycle}.json`

**Acceptance Criteria**:
- [ ] Pass 1 shows optional discovery file output
- [ ] Marked as optional (only written if discoveries exist)

---

### 4.3 — Update ROUTING-ARCHITECTURE.md — Pass 2 data flow

**File**: `.fractals/docwriter/ROUTING-ARCHITECTURE.md`

Pass 2 dispatches impact-mapper and research-scout. Both need discovery annotations.

**Changes**:

1. In the impact-mapper dispatch section, add optional discovery output.
2. In the research-scout dispatch section, add optional discovery output.

**Acceptance Criteria**:
- [ ] Impact-mapper shows optional `discoveries/impact-mapper--global--c*.json` output
- [ ] Research-scout shows optional `discoveries/research-scout--global--c*.json` output

---

### 4.4 — Update ROUTING-ARCHITECTURE.md — Pass 4 data flow

**File**: `.fractals/docwriter/ROUTING-ARCHITECTURE.md`

Pass 4 (execution-coordinator) dispatches content-writer per task. Content-writer's optional discovery output is per-task.

**Changes**:

1. In the Pass 4 execution-coordinator section, note content-writer optional discovery output: `discoveries/content-writer--{task-id}--c*.json`

**Acceptance Criteria**:
- [ ] Content-writer discovery file noted as optional per-task output
- [ ] Task ID in filename clearly shown

---

### 4.5 — Update ROUTING-ARCHITECTURE.md — Pass 5 data flow

**File**: `.fractals/docwriter/ROUTING-ARCHITECTURE.md`

Pass 5 (verification-coordinator) dispatches cross-ref-updater.

**Changes**:

1. In the Pass 5 section, add optional discovery output for cross-ref-updater.

**Acceptance Criteria**:
- [ ] Cross-ref-updater shows optional `discoveries/cross-ref-updater--global--c*.json` output

---

### 4.6 — Update ROUTING-ARCHITECTURE.md — Pass 6 data flow (gap-hunter inputs)

**File**: `.fractals/docwriter/ROUTING-ARCHITECTURE.md`

The Pass 6 section (gap-hunter) lists its inputs. `discoveries/*.json` must be added.

**Changes**:

1. In the Pass 6 gap-hunter reads, add: `[discoveries/*.json]` (optional, glob)
2. Note the new Step 7 in the gap-hunter's process flow description if one exists.

**Acceptance Criteria**:
- [ ] `discoveries/*.json` listed in gap-hunter reads
- [ ] Marked as optional
- [ ] Step 7 (discovery-driven gap analysis) noted

---

### 4.7 — Update ROUTING-ARCHITECTURE.md — P-02 re-entry flow

**File**: `.fractals/docwriter/ROUTING-ARCHITECTURE.md`

The P-02 re-entry section describes how gap-hunting re-entry works. Discovery files from prior cycles persist into new cycles (new files get `c{cycle+1}` suffix, old ones remain). This creates an accumulating evidence base.

**Changes**:

1. Add a note in the P-02 section explaining:
   - Discovery files from prior cycles are NOT removed during re-entry
   - New cycle agents produce new files with incremented cycle number
   - Gap-hunter in the new cycle reads ALL discovery files (all cycles), providing cumulative evidence

**Acceptance Criteria**:
- [ ] Re-entry section explains discovery file accumulation across cycles
- [ ] Clear that gap-hunter reads all cycles' discoveries, not just current

---

### 4.8 — Update ROUTING-ARCHITECTURE.md — Degraded mode notes

**File**: `.fractals/docwriter/ROUTING-ARCHITECTURE.md`

The degraded mode section (which documents what happens when optional inputs are missing) should mention the case where no discovery files exist.

**Changes**:

1. Add degraded mode note: "No discovery files → gap-hunter Step 7 skipped; gap analysis relies on Steps 1–6 only (baseline behavior, no regression)."

**Acceptance Criteria**:
- [ ] Degraded mode note for missing discoveries documented
- [ ] Makes clear this is the default/baseline behavior (no regression)

---

### 4.9 — Update docwriter-changelog.md

**File**: `.fractals/docwriter/docwriter-changelog.md`

Add a changelog entry following the established format (most recent first, under a date header).

**Changes**:

1. Add new entry under `## 2026-03-15` (or current date):

```markdown
### Discovery Registry

Added per-invocation discovery file output to 5 leaf agents and wired gap-hunter as the consumer. Leaf agents can now record out-of-scope discoveries during execution that persist across re-entry cycles.

**Foundation:**
- **docwriter-bootstrap.sh** — creates `discoveries/` directory in both fresh and `--clean` modes; `--clean` wipes cycle-specific discoveries (not preserved like meta-knowledge)

**Leaf agent wiring (discovery output):**
- **docwriter-code-analyzer** — optional `discoveries/code-analyzer--global--c{cycle}.json` for cross-cutting concerns, undocumented behaviors outside change inventory
- **docwriter-content-writer** — optional `discoveries/content-writer--{task-id}--c{cycle}.json` for adjacent page contradictions, missing prerequisites, stale links
- **docwriter-impact-mapper** — optional `discoveries/impact-mapper--global--c{cycle}.json` for undocumented areas, stale pages, questionable no-doc-impact classifications
- **docwriter-research-scout** — optional `discoveries/research-scout--global--c{cycle}.json` for external contradictions, deprecated practices, undocumented features from external sources
- **docwriter-cross-ref-updater** — optional `discoveries/cross-ref-updater--global--c{cycle}.json` for orphaned pages, missing interlinks, scope-drifted content

**Execution-coordinator awareness:**
- **docwriter-execution-coordinator** — acknowledges content-writer discovery files; does not read/modify/delete them; re-entry preserves all discovery files

**Gap-hunter consumption:**
- **docwriter-gap-hunter** — `discoveries/*.json` added as optional input; new Step 7 "Discovery-driven gap analysis" deduplicates against Steps 1–6 gaps, converts novel discoveries to formal gaps with type mapping and severity mapping; gap-analysis.json gets optional `discoverySource` field and 3 summary statistics (`discoveriesProcessed`, `discoveriesConvertedToGaps`, `discoveriesDeduplicated`)

**ROUTING-ARCHITECTURE.md:**
- P-01 passes 1, 2, 4, 5 annotated with optional discovery file outputs
- P-01 pass 6 gap-hunter reads updated with `discoveries/*.json`
- P-02 re-entry section documents discovery file accumulation across cycles
- Degraded mode: no discoveries → Step 7 skipped, baseline behavior
```

**Acceptance Criteria**:
- [ ] Changelog entry follows established format (date header, subsection title, categorized changes)
- [ ] All 5 leaf agents listed with file naming convention
- [ ] Execution-coordinator awareness documented
- [ ] Gap-hunter consumption documented (Step 7, schema changes, deduplication)
- [ ] ROUTING-ARCHITECTURE.md changes summarized
