# Phase 6: Orchestrator Wiring + Re-entry Logic

**Goal**: Update `docwriter.agent.md` (session orchestrator) routing table, dispatch order, re-entry logic, and agents array to incorporate Pass 0 (knowledge-curator, direct-dispatch), Pass 6.5 (knowledge-synthesizer, direct-dispatch), and the research-scout (coordinator-dispatched).

**Dependencies**: Phase 2 (knowledge-curator agent exists), Phase 3 (research-scout wired into analysis-coordinator), Phase 4 (knowledge-synthesizer agent exists), Phase 5 (all downstream consumers updated)
**Outputs consumed by**: Phase 7 (docs need to reflect final routing)

---

## Tasks

### 6.1 — Update `docwriter.agent.md` agents array

**File**: `.github/agents/docwriter.agent.md`

Both knowledge-curator (Pass 0) and knowledge-synthesizer (Pass 6.5) are direct-dispatched by the orchestrator. Research-scout is dispatched by the analysis-coordinator and doesn't appear here.

Current:
```yaml
agents: ["docwriter-discovery-coordinator", "docwriter-analysis-coordinator", "docwriter-execution-coordinator", "docwriter-verification-coordinator", "docwriter-delivery-coordinator"]
```

Updated:
```yaml
agents: ["docwriter-knowledge-curator", "docwriter-discovery-coordinator", "docwriter-analysis-coordinator", "docwriter-execution-coordinator", "docwriter-verification-coordinator", "docwriter-synthesis-coordinator", "docwriter-delivery-coordinator"]
```

The order reflects the dispatch sequence (Pass 0 → Pass 1 → ... → Pass 6.5 → Pass 7).

### 6.2 — Update routing table

**File**: `.github/agents/docwriter.agent.md`

The routing table currently maps 7 conditions to 5 coordinators across Passes 1-7. Add two new direct-dispatch rows:

| Condition | Dispatch | Pass |
|---|---|---|
| `progress.pass0 !== "done"` | `docwriter-knowledge-curator` | Pass 0 (Knowledge Curation) |
| `progress.pass1 !== "done"` | `docwriter-discovery-coordinator` | Pass 1 (Discovery) |
| `progress.pass2 !== "done"` | `docwriter-analysis-coordinator` | Pass 2 (Analysis) |
| `progress.pass3 !== "done"` | `docwriter-analysis-coordinator` | Pass 3 (Planning) |
| `progress.pass4 !== "done"` | `docwriter-execution-coordinator` | Pass 4 (Execution) |
| `progress.pass5 !== "done"` | `docwriter-verification-coordinator` | Pass 5 (Verification) |
| `progress.pass6 !== "done"` | `docwriter-verification-coordinator` | Pass 6 (Gap Hunting) |
| `progress.pass65 !== "done" AND pass6 === "done" AND gapHunting.reEntryTarget === null` | `docwriter-synthesis-coordinator` | Pass 6.5 (Knowledge Synthesis) |
| `progress.pass7 !== "done"` | `docwriter-delivery-coordinator` | Pass 7 (Delivery) |

**Key difference from prior design**: Pass 0 dispatches `docwriter-knowledge-curator` directly (not via discovery-coordinator). This matches the Pass 6.5 pattern and avoids dual-mode coordinator logic.

The orchestrator scans the routing table top-to-bottom and dispatches the FIRST matching condition.

### 6.3 — Update progress.json schema

**File**: `.github/agents/docwriter-bootstrap.sh` (already modified in Phase 1)

Confirm the progress.json includes Pass 0 and Pass 6.5 entries:
```json
{
  "pass0": "pending",
  "pass1": "pending",
  "pass2": "pending",
  "pass3": "pending",
  "pass4": "pending",
  "pass5": "pending",
  "pass6": "pending",
  "pass65": "pending",
  "pass7": "pending",
  "counts": {}
}
```

This was already specified in Phase 1, Task 1.1.

### 6.4 — Update re-entry logic

**File**: `.github/agents/docwriter.agent.md`

Current re-entry logic:
- After Pass 6 (gap hunting), if `reEntryTarget` is set and `gapHunting.cycleCount < 3`:
  - Set the re-entry target pass status back to `"pending"`
  - Resume from the routing table scan (will naturally hit the re-entry target)

**New re-entry logic** — add this constraint:

```markdown
### Re-entry rules

When gap-hunting (Pass 6) triggers re-entry:

1. Reset the re-entry target pass to `"pending"` (existing behavior)
2. Resume routing table scan from the top (existing behavior)
3. **SKIP Pass 0** on re-entry — knowledge curation already ran, no need to re-curate
4. **SKIP Pass 6.5** during re-entry cycles — knowledge synthesis runs ONLY when:
   - `pass6 === "done"` (gap hunting complete)
   - `gapHunting.reEntryTarget === null` (no more re-entries pending)
   - i.e., verification has fully converged

This means the routing table check for `pass65` must additionally verify:
```
progress.pass65 !== "done" 
  AND progress.pass6 === "done" 
  AND gapHunting.reEntryTarget === null
```

Without these guards, the synthesizer would run with incomplete data (tasks still being revised) and produce inaccurate patterns from intermediate states.
```

### 6.5 — Update post-coordinator actions

**File**: `.github/agents/docwriter.agent.md`

After each coordinator or direct agent dispatch, the orchestrator reads the status file and updates progress. Add handling for the two new dispatches:

**After Pass 0 (direct-dispatch knowledge-curator)**:
```markdown
After dispatching knowledge-curator for Pass 0:
1. Read `.docwriter/agents/knowledge-curator-status.json`
2. If status is "done":
   - Set `progress.pass0 = "done"`
   - Set `counts.knowledgePatternsCurated = status.patternsIncluded`
   - Prepend manifest entry
3. If status is "error" or file missing:
   - Log warning: "Knowledge curation failed — continuing without meta-knowledge"
   - Set `progress.pass0 = "done"` (non-blocking)
```

**After Pass 6.5 (knowledge-synthesizer direct dispatch)**:
```markdown
After dispatching knowledge-synthesizer for Pass 6.5:
1. Read `.docwriter/agents/knowledge-synthesizer-status.json`
2. If status is "done":
   - Set `progress.pass65 = "done"`
   - Set `counts.knowledgeEntriesNew = status.newEntries`
   - Set `counts.skillFilesRegenerated = status.skillFilesRegenerated`
   - Prepend manifest entry
3. If status is "error" or file missing:
   - Log warning: "Knowledge synthesis failed — meta-knowledge not updated"
   - Set `progress.pass65 = "done"` (non-blocking)
```

### 6.6 — Update pipeline completion summary

**File**: `.github/agents/docwriter.agent.md`

The pipeline completion summary (after all passes are `"done"`) should include the new metrics:

```markdown
### Completion summary additions

Add to the final summary:
- **Meta-knowledge**: {knowledgePatternsCurated} patterns curated, {knowledgeEntriesNew} new entries synthesized
- **Research**: {researchRecommendationsApproved} recommendations applied
- **Skill**: {skillFilesRegenerated} skill files regenerated
```

---

## Design Decisions

### Why direct-dispatch for both curator and synthesizer?
Both are standalone passes that don't belong to any coordinator's scope. Knowledge-curator (Pass 0) produces a brief before discovery begins. Knowledge-synthesizer (Pass 6.5) distills knowledge after verification converges. Direct dispatch from the orchestrator keeps coordinator scopes clean and matches a consistent pattern: the orchestrator dispatches coordinators for multi-agent passes and specialists for single-agent passes.

### Why skip Pass 0 and Pass 6.5 on re-entry?
- **Pass 0** knowledge curation: Meta-knowledge doesn't change during a single run. Re-curating would produce identical `knowledge-brief.json`. Skip saves time.
- **Pass 6.5** knowledge synthesis: Synthesizing from incomplete data (tasks still being revised) would produce misleading patterns. Wait until full convergence.

### Why non-blocking failures?
Both knowledge curation and knowledge synthesis are enhancements. The core pipeline (discovery → analysis → planning → execution → verification → delivery) must work even if meta-knowledge features fail entirely. This preserves backward compatibility with the original 7-pass pipeline.

---

## Acceptance Criteria

- [ ] `docwriter.agent.md` agents array includes `docwriter-knowledge-curator` and `docwriter-synthesis-coordinator`
- [ ] Routing table has 9 rows (Pass 0 through Pass 7, including Pass 6.5)
- [ ] Pass 0 dispatches knowledge-curator directly from orchestrator
- [ ] Pass 6.5 dispatches synthesis-coordinator directly from orchestrator
- [ ] Re-entry logic skips Pass 0 and Pass 6.5
- [ ] Pass 6.5 routing condition requires: `pass65 !== "done" AND pass6 === "done" AND gapHunting.reEntryTarget === null`
- [ ] Post-coordinator actions handle new status files for Pass 0 and Pass 6.5
- [ ] Both Pass 0 and Pass 6.5 failures are non-blocking
- [ ] Pipeline completion summary includes meta-knowledge and research metrics
- [ ] Progress.json schema includes `pass0` and `pass65` entries
