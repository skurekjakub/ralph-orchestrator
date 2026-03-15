# Phase 1: Bootstrap & Infrastructure

**Goal**: Create the bootstrap script, directory scaffold, seed artifact files, and the factory's own artifact schemas.
**Dependencies**: None — this is the foundation.
**Outputs consumed by**: All subsequent phases (agents read these seed files).

---

## Tasks

### 1.1 — Create Bootstrap Script

**File**: `fractals/fractal-factory/fractal-factory-bootstrap.sh`

The bootstrap creates the `.fractal-factory/` artifact directory inside the target working directory. It must:
- Refuse to run if `.fractal-factory/` already exists (crash recovery guard)
- Create all subdirectories: `agents/`, `domain-model/`, `architecture/`, `roster/`, `produced-output/`, `tests/`
- Seed `progress.json`, `manifest.json`, `context.json` (template with `<FILL:>` markers)
- Seed `constraints.json` with defaults (maxDepth: 3, maxAgents: 50, preferredCli: "copilot")

**Changes**:

```bash
#!/bin/bash
set -euo pipefail
ROOT="${1:-.}"
ARTIFACT_DIR="$ROOT/.fractal-factory"

if [ -d "$ARTIFACT_DIR" ]; then
  echo "Artifact directory already exists at $ARTIFACT_DIR"
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"/{agents,domain-model,architecture,roster,produced-output,tests}
# ... seed files (see below)
```

**Acceptance Criteria**:
- [ ] Script creates `.fractal-factory/` with all required subdirectories
- [ ] Script refuses to overwrite if directory exists
- [ ] All seed JSON files are valid, parseable JSON
- [ ] `context.json` has `<FILL:>` markers for user-editable fields

### 1.2 — Seed progress.json

**File**: `fractals/fractal-factory/fractal-factory-bootstrap.sh` (inline)

```json
{
  "version": 1,
  "lastUpdated": null,
  "currentPass": 0,
  "passStatus": {
    "pass1_domainComprehension": "not-started",
    "pass2_architectureSynthesis": "not-started",
    "pass3_blueprint": "not-started",
    "pass4_agentWriting": "not-started",
    "pass5_structuralAudit": "not-started",
    "pass6_gapHunting": "not-started",
    "pass7_delivery": "not-started"
  },
  "counts": {
    "domainsScanned": 0,
    "invariantsExtracted": 0,
    "agentsDesigned": 0,
    "agentsWritten": 0,
    "agentsVerified": 0,
    "agentsBlocked": 0,
    "testsPlanned": 0
  },
  "gapHunting": {
    "cyclesCompleted": 0,
    "newItemsPerCycle": [],
    "converged": false
  }
}
```

**Acceptance Criteria**:
- [ ] All pass names match the 7-pass pipeline
- [ ] All counts initialized to 0
- [ ] gapHunting section present with convergence tracking

### 1.3 — Seed context.json Template

**File**: `fractals/fractal-factory/fractal-factory-bootstrap.sh` (inline)

```json
{
  "version": 1,
  "domain": "<FILL: name of the domain this agent system will handle>",
  "source": {
    "domainBrief": "<FILL: path to domain-brief.md>",
    "domainDocs": "<FILL: path to domain-docs/ directory>",
    "invariants": "<FILL: path to invariants.md or null>",
    "exemplars": "<FILL: path to exemplars/ directory or null>"
  },
  "target": {
    "outputDirectory": "<FILL: where the produced agent family will be written>",
    "description": "<FILL: one sentence describing the desired agent system>"
  },
  "parameters": {
    "maxDepth": 3,
    "maxAgents": 50,
    "preferredCli": "copilot",
    "includeGoldenTests": true,
    "reusableSkillsPath": null
  }
}
```

**Acceptance Criteria**:
- [ ] All `<FILL:>` fields clearly describe what the user should provide
- [ ] `parameters` has sensible defaults
- [ ] Schema supports optional fields (invariants, exemplars, reusableSkillsPath)

### 1.4 — Create Input Documentation

**File**: `fractals/fractal-factory/README.md`

User-facing documentation explaining:
- What the Fractal Factory does
- Input contract (what files to prepare)
- How to run the bootstrap
- How to fill in `context.json`
- How to invoke the orchestrator
- How to monitor progress
- How to stop and resume

**Acceptance Criteria**:
- [ ] README exists with quick-start instructions
- [ ] All input file formats are documented
- [ ] Example `domain-brief.md` structure is shown

### 1.5 — Create Domain Model Schema

**File**: `fractals/fractal-factory/schemas/domain-model.schema.md`

Document the JSON schema for `domain-model.json` — the output of Pass 1 (domain comprehension). This file is consumed by all Pass 2-3 agents.

```json
{
  "version": 1,
  "domain": "string",
  "summary": "string (1 paragraph)",
  "subdomains": [
    {
      "id": "SD-001",
      "name": "string",
      "description": "string",
      "discoveryDomains": ["string — maps to discovery agent domains"],
      "complexity": "low | medium | high",
      "unknowns": ["string"]
    }
  ],
  "invariants": [
    {
      "id": "INV-001",
      "rule": "string",
      "source": "user-provided | extracted",
      "confidence": 0.9,
      "appliesTo": ["SD-001"]
    }
  ],
  "deliverable": {
    "type": "string",
    "successCriteria": ["string"]
  },
  "assets": {
    "existingSkills": ["string — paths to reusable skills"],
    "existingAgents": ["string — paths to reusable agents"],
    "referencePatterns": ["string — patterns from existing families"]
  },
  "exemplars": [
    {
      "id": "EX-001",
      "inputDescription": "string",
      "expectedOutput": "string",
      "source": "path/to/exemplar"
    }
  ]
}
```

**Acceptance Criteria**:
- [ ] Schema covers subdomains, invariants, deliverable, assets, exemplars
- [ ] Every field has a type and description
- [ ] ID schemes documented (SD-NNN, INV-NNN, EX-NNN)

### 1.6 — Create Produced Agent Schemas

**File**: `fractals/fractal-factory/schemas/produced-agent.schema.md`

Document the JSON schema for individual agent specifications in the roster (output of Pass 3). Each produced agent is planned before being written.

```json
{
  "id": "A-001",
  "name": "domain-feature-mapper",
  "role": "discovery-specialist | analysis-specialist | planning-specialist | execution-specialist | verification-specialist | delivery-specialist | coordinator | orchestrator",
  "level": 0 | 1 | 2 | 3,
  "parent": "A-000 | null",
  "dispatches": ["A-002", "A-003"],
  "resultCodes": ["discovered", "blocked"],
  "artifactsWritten": ["feature-inventory.json"],
  "artifactsRead": ["context.json"],
  "routingTable": { ... },
  "antiLazinessRules": ["string — for adversarial agents"],
  "status": "designed | written | verified | blocked"
}
```

**Acceptance Criteria**:
- [ ] Schema covers all agent types (specialist through orchestrator)
- [ ] Level field supports 0-3
- [ ] Status lifecycle documented (designed → written → verified)
