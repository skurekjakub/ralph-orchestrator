# Phase 6: Delivery Specialists (Pass 7 — Package & Document)

**Goal**: Write the 3 delivery specialist agents that package, document, and report on the produced agent family.
**Dependencies**: Phase 5 (verification must complete — delivery only runs after convergence).
**Outputs consumed by**: Phase 7 (delivery coordinator dispatches these sequentially).

---

## Agent Overview

| # | Agent Name | Purpose | Reads | Writes |
|---|---|---|---|---|
| 1 | `fractal-factory-packager` | Copy produced output to target path, validate completeness | All produced-output/, roster.json, architecture.json | Packaged output at target path, packaging-report.json |
| 2 | `fractal-factory-documentation-writer` | Generate architecture doc, user guide, roster reference for the produced system | All artifacts, roster.json, architecture.json, manifest.json | produced-output/docs/ |
| 3 | `fractal-factory-report-writer` | Write the final handoff report with coverage stats and outstanding items | All artifacts, all reports | agents/report-writer/output.md (FINAL DELIVERABLE) |

Run sequentially: packager → documentation-writer → report-writer.

---

## Tasks

### 6.1 — Write packager Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-packager.agent.md`

The packager assembles the final output directory at `context.json.target.outputDirectory`:

1. **Copy produced agents** from `.fractal-factory/produced-output/agents/` → `<target>/agents/`
2. **Copy bootstrap script** → `<target>/bootstrap.sh`
3. **Copy artifact schemas** → `<target>/schemas/`
4. **Copy skills** → `<target>/skills/`
5. **Copy golden tests** → `<target>/tests/`
6. **Validate completeness**: Every agent in `roster.json` has a corresponding `.agent.md` file
7. **Validate status**: Every agent's roster status is `verified` (not `written` or `blocked`)

Writes `packaging-report.json`:
```json
{
  "version": 1,
  "targetPath": "/path/to/output",
  "filesCopied": 35,
  "agentsCopied": 26,
  "completeness": {
    "allAgentsPresent": true,
    "allAgentsVerified": true,
    "blockedAgents": [],
    "missingAgents": []
  }
}
```

**Result codes**: `packaged` (all files copied, all agents verified), `incomplete` (missing or blocked agents)

**Acceptance Criteria**:
- [ ] Copies all produced files to target directory
- [ ] Validates roster completeness (every agent has a file)
- [ ] Reports blocked/missing agents
- [ ] Does not overwrite existing files at target without warning

### 6.2 — Write documentation-writer Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-documentation-writer.agent.md`

Generates human-readable documentation for the produced agent system:

1. **Architecture document** (`produced-output/docs/architecture.md`):
   - Pipeline overview (which passes, what each does)
   - Agent hierarchy diagram (ASCII art or markdown table)
   - Artifact flow diagram
   - Re-entry and convergence rules
   - Depth decisions with rationale

2. **User guide** (`produced-output/docs/user-guide.md`):
   - Quick start (bootstrap → fill context → invoke)
   - Monitoring progress (progress.json)
   - Stopping and resuming
   - Troubleshooting common issues

3. **Roster reference** (`produced-output/docs/roster.md`):
   - Table of all agents with role, level, parent, dispatches
   - Per-agent: result codes, artifacts, anti-laziness flag
   - Agent naming convention

All documentation must be generated from actual artifacts — NOT fabricated. Cross-reference manifest.json for the audit trail.

**Result codes**: `documented`

**Anti-Laziness Rules**:
- Must cross-reference roster.json for accurate agent counts
- Architecture diagram must match actual hierarchy (not a generic template)
- User guide must reference actual file paths from the produced system

**Acceptance Criteria**:
- [ ] All 3 documents produced
- [ ] Architecture doc accurately reflects roster.json hierarchy
- [ ] User guide has working quick-start instructions
- [ ] Roster reference covers all agents

### 6.3 — Write report-writer Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-report-writer.agent.md`

The final agent in the pipeline. Writes the executive summary and handoff report:

1. **Coverage statistics**:
   - Domain coverage: subdomains → discovery agents mapping
   - Invariant coverage: which invariants reached execution agents
   - Routing coverage: result-code coverage percentage
   - Test coverage: scenarios × agent types

2. **Outstanding items**:
   - Blocked agents (if any) with reasons
   - Unresolved gap-hunter findings
   - Low-confidence invariants that need user verification
   - Deferred items from convergence bounds

3. **Quality metrics**:
   - Verification pass rate (from checklist-validator)
   - Audit findings (from audit-oracle)
   - Gap-hunting convergence curve (newItemsPerCycle)

4. **Recommendations**:
   - Suggested improvements for the produced system
   - Areas where human review is recommended
   - Follow-up tasks

**Result codes**: `delivered`

**Acceptance Criteria**:
- [ ] All 4 sections present with data from actual artifacts
- [ ] Coverage statistics computed from real counts (not estimated)
- [ ] Outstanding items cross-referenced with gap-report.json
- [ ] Report is the final artifact — pipeline is complete after this
