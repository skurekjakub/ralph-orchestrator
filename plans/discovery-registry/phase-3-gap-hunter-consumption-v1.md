# Phase 3: Gap-Hunter Consumption — Discovery-Driven Gap Hunting

**Goal**: Wire the `discoveries/` directory as a first-class input to the gap-hunter, adding a dedicated auditing step that converts agent discoveries into gap-analysis entries.
**Dependencies**: Phase 1 (directory exists), Phase 2 (agents produce discovery files).
**Outputs consumed by**: Phase 4 (documentation references the discovery flow).

---

## Design Notes

The gap-hunter already has 6 auditing steps (coverage completeness, behavioral coverage, stale content detection, orphaned content, invariant enforcement gap, history-informed gap hunting). Discovery consumption becomes **Step 7** — a new dedicated step that processes all discovery files and converts qualifying entries into formal gaps in the gap-analysis.

This step runs AFTER all existing auditing steps because discoveries may overlap with gaps already found by other steps — the gap-hunter should deduplicate.

---

## Tasks

### 3.1 — Add `discoveries/*.json` to gap-hunter input list

**File**: `.fractals/docwriter/docwriter-gap-hunter.agent.md`

The gap-hunter's input section (lines 13–43) currently lists 8 required inputs and 3 optional inputs. The discovery directory becomes a new optional input.

**Changes**:

1. In the input/read section, add after the existing optional inputs:

```markdown
12. `.docwriter/discoveries/*.json` (optional — all discovery files from leaf agents; may not exist if no agent recorded discoveries)
```

**Acceptance Criteria**:
- [ ] `discoveries/*.json` listed as input with glob pattern
- [ ] Marked as optional (may not exist)
- [ ] Description explains these are leaf-agent discovery files

---

### 3.2 — Add Step 7: Discovery-driven gap analysis

**File**: `.fractals/docwriter/docwriter-gap-hunter.agent.md`

Add a new auditing step after the existing Step 6 (history-informed gap hunting).

**Changes**:

1. Add after Step 6:

```markdown
### Step 7: Discovery-driven gap analysis

If `.docwriter/discoveries/` exists and contains files:

1. **Glob all files**: Read every `.json` file in `.docwriter/discoveries/`.
2. **Group by type**: Organize discovery entries across all files by their `type` field.
3. **Cross-reference with existing gaps**: For each discovery entry, check whether a gap for the same `affectedArea` and type already exists from Steps 1–6. If so, annotate the existing gap with the discovery evidence (strengthens the case) but don't create a duplicate.
4. **Convert novel discoveries to gaps**: For each discovery not already covered:
   - Map discovery `type` to gap type: `undocumented-behavior` → `undocumented-change`, `missing-coverage` → `undocumented-change`, `stale-content` → `stale-content`, `cross-cutting-concern` → `undocumented-change`, `scope-expansion` → `undocumented-change`
   - Assign `affectedTaskIds` using the same cardinality rules as other gap types
   - Include the discovery's `evidence` and `suggestedAction` in the gap's `details`
   - Set severity mapping: discovery `high` → gap priority `critical`/`high`, discovery `medium` → `medium`, discovery `low` → `low`
5. **Report discovery statistics** in the gap-analysis summary: `discoveriesProcessed`, `discoveriesConvertedToGaps`, `discoveriesDeduplicated`
```

**Acceptance Criteria**:
- [ ] Step 7 exists after Step 6 with clear title "Discovery-driven gap analysis"
- [ ] Handles empty/missing `discoveries/` directory gracefully (skip step)
- [ ] Cross-references against existing gaps from Steps 1–6 to deduplicate
- [ ] Maps discovery types to gap types with explicit mapping table
- [ ] Follows existing `affectedTaskIds` cardinality rules
- [ ] Includes discovery statistics in gap-analysis summary

---

### 3.3 — Update gap-analysis.json schema for discovery metadata

**File**: `.fractals/docwriter/docwriter-gap-hunter.agent.md`

The gap-analysis.json output schema needs to accommodate discovery-sourced gaps and summary statistics.

**Changes**:

1. In the gap-analysis.json schema, add to each gap entry:
   - `discoverySource` (optional): `{ agent: string, file: string, entryId: string }` — present when the gap originated from or was reinforced by a discovery entry.

2. In the `summary` section of gap-analysis.json, add:
   - `discoveriesProcessed` (number): Total discovery entries across all files
   - `discoveriesConvertedToGaps` (number): Novel discoveries that became gaps
   - `discoveriesDeduplicated` (number): Discoveries that matched existing gaps

**Acceptance Criteria**:
- [ ] `discoverySource` field documented in gap entry schema (optional)
- [ ] Three discovery-related summary fields added
- [ ] Existing gap schema fields unchanged
