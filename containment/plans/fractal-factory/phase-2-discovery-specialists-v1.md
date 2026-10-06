# Phase 2: Discovery Specialists (Pass 1 — Domain Comprehension)

**Goal**: Write the 4 discovery specialist agent prompts that scan input documents and produce the structured domain model.
**Dependencies**: Phase 1 (bootstrap and schemas must exist).
**Outputs consumed by**: Phase 3 (planning agents read domain-model.json), Phase 7 (coordinators reference these specialist names).

---

## Agent Overview

| # | Agent Name | Purpose | Reads | Writes |
|---|---|---|---|---|
| 1 | `fractal-factory-domain-scanner` | Scan domain-brief.md and domain-docs/ to identify subdomains, phases, and complexity | context.json, domain-brief.md, domain-docs/ | domain-model.json (subdomains section) |
| 2 | `fractal-factory-invariant-extractor` | Extract behavioral rules from user-provided invariants + domain docs | context.json, invariants.md, domain-docs/, domain-model.json | domain-model.json (invariants section) |
| 3 | `fractal-factory-asset-auditor` | Scan for reusable skills, agents, patterns in existing workspace | context.json, workspace skills/agents | domain-model.json (assets section) |
| 4 | `fractal-factory-exemplar-analyzer` | Parse exemplar input/output pairs into structured test seeds | context.json, exemplars/ | domain-model.json (exemplars section) |

All 4 agents write to the shared `domain-model.json` using the read-modify-write pattern.

---

## Tasks

### 2.1 — Write domain-scanner Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-domain-scanner.agent.md`

The domain scanner is the first specialist dispatched. It reads the user's domain brief and supporting documents, then identifies:
- **Subdomains**: Distinct areas requiring separate discovery agents in the produced system (e.g., for a migration domain: UI, API, data, config)
- **Complexity per subdomain**: low/medium/high based on document density, cross-references, and rule complexity
- **Pipeline applicability**: Which of the 7 standard passes apply to this domain
- **Unknowns**: Gaps in the input documents

The agent must:
- Read `context.json` for input paths
- Read `domain-brief.md` in full
- Scan all files in `domain-docs/` directory
- Create `domain-model.json` with the subdomains section populated
- Assign IDs: `SD-001`, `SD-002`, etc.

**Result codes**: `scanned` (success), `insufficient-input` (domain-brief missing or empty)

**Acceptance Criteria**:
- [ ] Agent prompt exists with correct frontmatter (`name`, `description`, `model`, `user-invocable: false`)
- [ ] Suppresses interactive tools ("never use ask_questions")
- [ ] Documents exact read/write artifacts
- [ ] Status contract with `scanned` and `insufficient-input` result codes
- [ ] Creates `domain-model.json` with valid schema on first run

### 2.2 — Write invariant-extractor Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-invariant-extractor.agent.md`

Runs after domain-scanner. Extracts behavioral invariants from two sources:
1. **User-provided**: `invariants.md` (if present) — these are high-confidence (1.0)
2. **Extracted**: Inferred rules from domain docs — variable confidence (0.3–0.9)

Each invariant links to subdomains via `appliesTo` field. The agent must:
- Read existing `domain-model.json` (to see subdomains)
- Read `invariants.md` (optional — handle missing gracefully)
- Read `domain-docs/` for implicit rules
- Update `domain-model.json` with invariants section using read-modify-write
- Assign IDs: `INV-001`, `INV-002`, etc.

**Invariant classification**:
- `behavioral` — state transitions, event flows, ordering requirements
- `structural` — file organization, naming conventions, schema constraints
- `quality` — performance, security, accessibility requirements
- `workflow` — process rules, approval gates, handoff protocols

**Result codes**: `extracted` (success)

**Acceptance Criteria**:
- [ ] Agent prompt handles missing `invariants.md` gracefully
- [ ] Confidence scoring documented (1.0 for user-provided, 0.3-0.9 for extracted)
- [ ] Invariant classification types in prompt
- [ ] Read-modify-write on domain-model.json (preserves subdomain entries)

### 2.3 — Write asset-auditor Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-asset-auditor.agent.md`

Scans the workspace for reusable assets that the produced agent family might leverage:
- **Existing skills** in `shared/skills/` or user-specified `reusableSkillsPath`
- **Existing agent families** — patterns to emulate or reference
- **Infrastructure patterns** — bootstrap script conventions, artifact schemas, routing patterns

Does NOT copy assets — only catalogues them with relevance scores. The planning agents (Phase 3) decide what to reuse.

**Result codes**: `audited` (success)

**Acceptance Criteria**:
- [ ] Scans `shared/skills/` directory
- [ ] Scans user-specified `reusableSkillsPath` if provided
- [ ] Updates domain-model.json `assets` section
- [ ] Relevance scoring per asset (0.0-1.0)

### 2.4 — Write exemplar-analyzer Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-exemplar-analyzer.agent.md`

Parses the `exemplars/` directory (if present) to extract structured test seeds:
- Input descriptions (what the produced system receives)
- Expected output descriptions (what the produced system should generate)
- Edge cases and failure modes

These seeds feed the test-planner in Pass 3. If no exemplars directory exists, the agent records this and returns `no-exemplars`.

**Result codes**: `analyzed` (exemplars found and parsed), `no-exemplars` (directory missing or empty)

**Acceptance Criteria**:
- [ ] Handles missing/empty exemplars directory gracefully
- [ ] Produces structured exemplar entries with IDs (EX-001, EX-002, ...)
- [ ] Updates domain-model.json `exemplars` section
- [ ] Links exemplars to subdomains where possible
