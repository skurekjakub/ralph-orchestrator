# Phase Specification Template

Copy this template when creating a new phase spec. Adapt the sections to fit the phase — not every section is needed for every phase.

Phase specs are versioned: `phase-N-<name>-v1.md`, `phase-N-<name>-v2.md`, etc. When debrief feedback or mid-implementation changes affect a phase, create a new versioned file — never edit a previous version in place. Only bump versions for phases that actually changed; unchanged phases keep their current version number.

---

```markdown
# Phase N: <Name>

**Version**: v1
**Goal**: One sentence describing the end state of this phase.
**Dependencies**: Phase X, Phase Y (or "None" if entry phase)
**Outputs consumed by**: Phase A, Phase B

---

## Context

<Optional — 1-2 paragraphs explaining WHY this phase exists, any architectural decisions 
that affect the whole phase, or dispatch/integration patterns relevant here.>

---

## Tasks

### N.1 — <Task Title>

**File**: `path/to/target` (or **New file**: `path/to/new/file`)

<1-2 sentences explaining the rationale — why this change is needed, what problem it solves.>

**Changes**:

1. **<Change category>**: <Detailed description with code/schema/config examples>

```<language>
// Actual code snippet, JSON schema, or config example
// Be specific — this is the implementer's reference
```

2. **<Change category>**: ...

**Artifacts**:
- Creates: `path/to/new/artifact`
- Modifies: `path/to/existing/file`
- Reads: `path/to/dependency` (from Phase X)

**Acceptance Criteria**:
- [ ] Criterion 1 — concrete, verifiable
- [ ] Criterion 2 — concrete, verifiable
- [ ] Criterion 3

---

### N.2 — <Task Title>

...
```

---

## Writing Guidelines

### Rationale First

Every task should explain WHY before HOW. The implementer needs to understand the intent so they can make correct judgment calls on details the spec doesn't cover.

### Concrete Code Snippets

Include actual code, schemas, or config blocks — not pseudocode. If the spec says "add a JSON field," show the exact field name, type, and example value. The implementer should be able to copy-paste and adapt, not guess at the structure.

```markdown
**Bad**: Add a new section to the config for tracking directives.

**Good**: Add a `directives` object to `progress.json`:
{
  "directives": {
    "activeCount": 0,
    "lastReadAt": null,
    "applied": []
  }
}
```

### Cross-References

When a task produces an artifact consumed by a later phase, say so explicitly:

```markdown
**Outputs consumed by**: Phase 5 (consumers read `knowledge-brief.json`)
```

When a task depends on an artifact from an earlier phase, reference the specific section:

```markdown
**Reads**: `knowledge-brief.json` (produced by Phase 2 § 2.1)
```

### Acceptance Criteria

Each criterion should be:
- **Verifiable** by reading the file or running a simple check
- **Specific** enough that two people would agree on pass/fail
- **Independent** from other criteria where possible

```markdown
**Bad**: Agent works correctly.
**Good**: Agent file has valid frontmatter with model: claude-opus-4.6.

**Bad**: Integration is complete.
**Good**: Orchestrator's routing table includes Pass 0 → docwriter-knowledge-curator.
```

### Edge Cases

Document what happens in edge/error cases inline with the task:

```markdown
**Edge cases**:
- Missing input file → produce empty brief with `{ entries: [], reason: "cold-start" }`
- Corrupt index → log warning, treat as cold-start
- Zero relevant entries above threshold → empty brief (not an error)
```

### Phase Size

A good phase has 2-6 tasks. If you have more than 8 tasks, consider splitting into two phases. If you have only 1 task, consider merging with an adjacent phase.
