# Phase 1: Pipeline Design & Schema Foundation

**Goal**: Update the pipeline-design skill reference and the pipeline-architect agent to make Analysis (Pass 2) default-on.
**Dependencies**: None — this is the foundation.
**Outputs consumed by**: Phase 2 (factory agents reference the updated pass inclusion rules), Phase 3 (produced-agent schema references the analysis specialist type guidance).

---

## Tasks

### 1.1 — Update pipeline-design.md "Deciding Which Passes to Include"

**File**: `.github/skills/agent-fractal-orchestrator-architecture/references/pipeline-design.md`

The current text treats Pass 2 as opt-in:

```
**Always include:** 1 (Discovery), 4 (Execution), 7 (Delivery). These are the minimum viable pipeline.

**Include 2 (Analysis) when:** The domain has behavioral rules, invariants, or semantics that must be extracted before planning. Skip when the domain is simple enough that discovery output is sufficient for planning.
```

Change to a three-tier model:

```
**Always include:** 1 (Discovery), 4 (Execution), 7 (Delivery). These are the minimum viable pipeline.

**Default-on (include unless explicitly justified):** 2 (Analysis). Nearly every domain works with existing material that has behavioral semantics worth extracting. Skip ONLY when: (a) the domain creates something entirely new with no existing source material to analyze, AND (b) the invariant extractor found fewer than 3 invariants. When skipping, the pipeline-architect must document the justification in architecture.json under `pipeline.analysisSkipJustification`.

**Include 3 (Planning) when:** ...
```

Also update the domain mapping examples to show that every example includes Analysis — none skip it. Currently all four examples already include Analysis in their tables, so this is a documentation-level reinforcement: add a note after the examples table:

```
> **Note:** Every domain mapping example above includes Analysis. This is not coincidental — analysis is the pass that transforms shallow discovery output into deep behavioral understanding. Without it, planning operates on names rather than semantics.
```

**Acceptance Criteria**:
- [ ] "Always include" tier unchanged (Passes 1, 4, 7)
- [ ] New "Default-on" tier lists Pass 2 with skip conditions and justification requirement
- [ ] `analysisSkipJustification` field documented as required when skipping
- [ ] Note after domain examples reinforces analysis universality
- [ ] Existing "Include 3 (Planning) when..." through "Include 6 (Gap Hunting) when..." text unchanged

### 1.2 — Update pipeline-architect Pass 2 selection criteria

**File**: `.fractals/fractal-factory/agents/fractal-factory-pipeline-architect.agent.md`

The current Step 2 table says:

```
| 2: Analysis | Domain has behavioral rules, complex dependencies | Trivially simple domain |
```

Change to:

```
| 2: Analysis | Default-on — include unless explicitly justified | Domain creates entirely new artifacts with no existing source material to analyze AND fewer than 3 invariants extracted |
```

Also add a new Step 2.5 after Step 2:

```markdown
### Step 2.5: Justify Any Analysis Skip

If you excluded Pass 2 (Analysis), you MUST:
1. Document why in `architecture.json` under `pipeline.analysisSkipJustification`
2. Explain what source material was evaluated and why it doesn't warrant behavioral extraction
3. Confirm the invariant count from `domain-model.json` is below 3

If you cannot provide a concrete justification, re-include Pass 2. The default is inclusion.
```

And in the architecture.json write rules, add `analysisSkipJustification` as an optional field in the `pipeline` schema:

```json
"pipeline": {
  "passes": [...],
  "reEntryRules": [...],
  "convergence": {...},
  "analysisSkipJustification": null
}
```

**Acceptance Criteria**:
- [ ] Pass 2 row in the selection table says "Default-on" with explicit skip conditions
- [ ] Step 2.5 exists with justification requirements
- [ ] `analysisSkipJustification` field documented in the architecture.json write rules
- [ ] All other pass selection criteria unchanged

### 1.3 — Update pipeline-architect analysis specialist guidance

**File**: `.fractals/fractal-factory/agents/fractal-factory-pipeline-architect.agent.md`

In the Step 1 "Assess Domain Characteristics" section, strengthen the analysis assessment. Current text:

```
- **Analysis depth**: Are invariants complex? Do they require deep behavioral analysis?
```

Replace with:

```
- **Analysis depth**: What behavioral properties need extraction? Every domain has at least: invariants, dependency relationships, and domain-specific behavioral categories (state transitions for migrations, attack vectors for security, behavior specs for test generation, accuracy checks for documentation). Identify the domain-specific extraction categories.
```

This shifts the architect's mindset from "do we need analysis?" to "what kind of analysis do we need?"

**Acceptance Criteria**:
- [ ] Analysis depth assessment reframed as "what kind" not "whether"
- [ ] Domain-specific extraction category examples included
- [ ] Other assessment bullets unchanged
