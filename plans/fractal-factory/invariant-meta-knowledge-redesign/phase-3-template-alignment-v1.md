# Phase 3: Template Alignment

**Goal**: Align produced-system meta-knowledge templates with the same invariant-memory boundary.
**Dependencies**: Phase 2.
**Outputs consumed by**: Future prompt-writer runs and produced-system meta-knowledge subsystems.

---

## Tasks

### 3.1 — Update Meta-Knowledge Templates

**File**: `.fractals/fractal-factory/meta-knowledge-templates.md`

The produced-system templates must mirror the same rule set as the factory's own prompts.

**Changes**:

1. Update the domain signal analyzer template to forbid raw invariant inventories and require abstraction into heuristics, strategies, or failure modes.
2. Update the context signal analyzer template to frame invariant signals as process patterns only.
3. Update the knowledge integrator template to reject domain-local invariant catalogs.

**Acceptance Criteria**:
- [ ] Produced-system templates match the factory prompt rules.
- [ ] The abstraction boundary is stated in all three relevant template sections.

### 3.2 — Validate Cross-Document Consistency

**Files**:
- `.fractals/fractal-factory/meta-knowledge-reference.md`
- `.fractals/fractal-factory/meta-knowledge-templates.md`
- `.fractals/fractal-factory/agents/fractal-factory-factory-signal-analyzer.agent.md`
- `.fractals/fractal-factory/agents/fractal-factory-context-signal-analyzer.agent.md`
- `.fractals/fractal-factory/agents/fractal-factory-knowledge-integrator.agent.md`

Check that all documents use the same boundary language.

**Acceptance Criteria**:
- [ ] No file implies accumulation of raw invariant inventories.
- [ ] All files permit tightly abstracted invariant heuristics.
