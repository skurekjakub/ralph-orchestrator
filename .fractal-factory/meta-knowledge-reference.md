# Meta-Knowledge Reference Architecture

This document defines the universal meta-knowledge subsystem that every agent system produced by the Fractal Factory must include. Factory agents at Pass 2–4 read this document to inject the correct structures, agents, and artifacts.

**Audience**: Factory agents (not produced agents). Each factory agent references the relevant section when adding meta-knowledge concerns to its output.

---

## § 1 Universal Meta-Knowledge Architecture

Every produced agent system includes two additional pipeline passes dedicated to cross-run learning:

### Pass 0 — Knowledge Curation

- **Position**: Runs BEFORE the first domain pass (before discovery-equivalent).
- **Purpose**: Read accumulated meta-knowledge from prior runs and produce a **knowledge brief** — a curated summary of relevant insights for the current task.
- **Agent**: `{prefix}-knowledge-curator` (singleton specialist, no coordinator — dispatched directly by the orchestrator).
- **Cold start**: On the system's very first run, `meta/index.json` is empty. The curator produces an empty brief with `coldStart: true` and the pipeline proceeds normally. No error.
- **Output**: `knowledge-brief.json` — available to all downstream agents as an optional input.
- **Entry condition**: Always first. No preconditions.
- **Exit condition**: `knowledge-brief.json` exists (even if empty/cold-start).

### Synthesis Pass

- **Position**: Runs AFTER the final verification pass, BEFORE delivery.
- **Purpose**: Extract learning signals from the completed run and persist them to `meta/`.
- **Agent**: `{prefix}-synthesis-coordinator` dispatching signal analyzers and the knowledge integrator.
- **Re-entry**: NEVER re-enters. Runs exactly once after final verification convergence (or forced convergence at maxGapCycles).
- **Output**: Updated `meta/index.json`, new signal files in `synthesis-signals/`, a run retrospective in `meta/run-retrospectives/`.
- **Entry condition**: Verification pass completed (converged or forced).
- **Exit condition**: Synthesis coordinator reports `synthesized` or `degraded`.

### Lifecycle Flow

```
[Pass 0: Knowledge Curation]
        ↓
  knowledge-brief.json
        ↓
[Pass 1–N: Domain Pipeline (discovery → ... → verification → gap hunting)]
        ↓
[Synthesis Pass: Signal Extraction → Integration]
        ↓
  meta/index.json updated, run-retrospective written
        ↓
[Delivery Pass]
```

---

## § 2 Agent Roles

Every produced system's meta-knowledge subsystem contains exactly 5 mandatory agents:

### 1. Knowledge Curator (`{prefix}-knowledge-curator`)

- **Level**: Specialist (leaf). Dispatched directly by the orchestrator at Pass 0.
- **Purpose**: Read `meta/index.json`, filter entries by relevance to the current task, and produce `knowledge-brief.json`.
- **Key behaviors**:
  - 4-factor relevance scoring: (a) category match to current task, (b) confidence level, (c) recency, (d) past usage count.
  - Maximum 20 entries in the brief (prevents context bloat).
  - Cold-start handling: if `meta/index.json` is empty or absent, write brief with `coldStart: true`, empty insight arrays, and proceed.
  - Stale entry detection: flag entries older than 10 runs with declining usage as `stale`.
- **Result codes**: `curated` (normal), `cold-start` (no prior knowledge).

### 2. Domain Signal Analyzer (`{prefix}-{domain-specific-name}-signal-analyzer`)

- **Level**: Specialist (leaf). Dispatched by synthesis coordinator.
- **Purpose**: Analyze the current run's **domain-specific artifacts** (execution outputs, review feedback, verification results) and extract learning signals.
- **Naming**: The `{domain-specific-name}` part is derived from the domain — e.g., `craft-signal-analyzer` for a fiction domain, `task-signal-analyzer` for a documentation domain, `migration-signal-analyzer` for a code migration domain.
- **Key behaviors**:
  - Extract signals from domain-specific artifacts (the produced system's execution and verification outputs).
  - Each signal has: `type` (domain-derived category), `content` (the insight), `strength` (low/medium/high), `sourceArtifact` (where it came from).
  - Minimum 2 signal types per domain (defined at factory time from knowledge categories).
- **Result codes**: `signals-extracted`, `no-signals` (no actionable patterns found).

### 3. Context Signal Analyzer (`{prefix}-context-signal-analyzer`)

- **Level**: Specialist (leaf). Dispatched by synthesis coordinator.
- **Purpose**: Analyze **process-level observations** — which agents struggled, which converged quickly, which invariants triggered the most failures, how many gap-hunting cycles were needed.
- **Key behaviors**:
  - Read verification-report, audit-report, gap-report, and progress data.
  - Extract signals about: agent performance, pipeline bottlenecks, invariant violation patterns, convergence behavior.
  - Each signal has: `type` (always a process category), `content`, `strength`, `sourceArtifact`.
- **Result codes**: `signals-extracted`, `no-signals`.

### 4. Knowledge Integrator (`{prefix}-knowledge-integrator`)

- **Level**: Specialist (leaf). Dispatched by synthesis coordinator AFTER both analyzers.
- **Purpose**: Read signal files from both analyzers, apply the quality gate and confidence ladder, and write validated entries to `meta/index.json`.
- **CRITICAL**: This is the **ONLY** agent that writes to `meta/`. No other agent may modify `meta/index.json` or any file under `meta/`.
- **Key behaviors**:
  - Read all signal files from `synthesis-signals/`.
  - Apply quality gate (§ 4) to each candidate signal.
  - Apply confidence ladder (§ 3) to determine entry confidence.
  - Write passing entries to appropriate `meta/{category}/` files and update `meta/index.json`.
  - Write a run retrospective to `meta/run-retrospectives/{run-timestamp}.json`.
  - Clean up stale entries flagged by the curator.
- **Result codes**: `integrated` (new entries written), `no-new-entries` (all signals filtered by quality gate).

### 5. Synthesis Coordinator (`{prefix}-synthesis-coordinator`)

- **Level**: Coordinator. Dispatched by orchestrator at synthesis pass.
- **Purpose**: Dispatch signal analyzers and integrator in sequence.
- **Dispatch order**: domain-signal-analyzer → context-signal-analyzer → knowledge-integrator.
- **Purity**: Pure router — no substantive work.
- **Degraded mode**: If a signal analyzer fails or returns `no-signals`, create an empty signal file and continue to the next agent. The integrator handles empty signals gracefully. Only fail the entire pass if the integrator itself fails.
- **Result codes**: `synthesized` (all children completed), `degraded` (one or more analyzers produced no signals but integrator completed).

---

## § 3 Confidence Ladder

Every entry in `meta/index.json` has a `confidence` field following a strict promotion ladder:

| Level | Value | Promotion Rule |
|---|---|---|
| `low` | 0.3 | Default for newly extracted entries. Assigned on first observation. |
| `medium` | 0.6 | Promoted when the SAME insight is independently confirmed in a SECOND run (different run, same conclusion). |
| `high` | 0.9 | Promoted when the insight has been confirmed in 3+ runs with >80% acceptance rate (usage count / available runs). |

**Rules**:
1. **Never skip levels**: An entry cannot go from `low` directly to `high`. It must pass through `medium` first.
2. **Independent confirmation required**: Seeing the same signal in the same run twice does NOT promote. It must be across runs.
3. **Demotion**: If an entry is contradicted by strong evidence in 2 consecutive runs, demote one level. Below `low` → mark as `deprecated` and stop including in briefs.
4. **Numeric thresholds are exact**: 2-run confirmation for medium. 3+ runs at >80% for high. No rounding, no approximation.

---

## § 4 Quality Gate

Every candidate signal must pass ALL THREE criteria before the knowledge integrator writes it to `meta/`:

### Criterion 1: Reusability

**Pass**: The insight is applicable beyond the current specific task. It describes a recurring pattern, not a one-off observation.
**Fail**: The insight is specific to a single file, single run, or single input and has no general applicability.

### Criterion 2: Actionability

**Pass**: The insight suggests a concrete action — something an agent can do differently based on this knowledge.
**Fail**: The insight is purely observational ("X happened") without prescriptive value.

### Criterion 3: Non-Redundancy

**Pass**: The insight is not already captured by an existing `meta/index.json` entry at equal or higher confidence.
**Fail**: An existing entry with equal or higher confidence already captures the same insight. (If the new signal strengthens an existing entry, promote confidence instead of adding a duplicate.)

**Gate protocol**: All three must pass. The integrator logs rejected signals with the failing criterion in the run retrospective.

---

## § 5 Meta Directory Structure

Every produced system's artifact directory includes the following meta-knowledge structure:

```
.{domain}/
├── meta/
│   ├── index.json                    ← Central entry registry
│   ├── confidence-ladder.md          ← Human-readable reference
│   ├── {category-1}/                 ← One directory per knowledge category
│   │   ├── entry-001.json
│   │   └── entry-002.json
│   ├── {category-2}/
│   │   └── ...
│   └── run-retrospectives/
│       ├── 2026-01-15T10-00-00Z.json
│       └── 2026-01-16T14-30-00Z.json
├── knowledge-brief.json              ← Pass 0 output (curated per-task)
└── synthesis-signals/
    ├── domain-signals.json           ← Domain signal analyzer output
    └── context-signals.json          ← Context signal analyzer output
```

### meta/index.json Schema

```json
{
  "version": 1,
  "lastUpdated": "<ISO-8601-UTC>",
  "totalEntries": 12,
  "entries": [
    {
      "id": "MK-001",
      "title": "Short descriptive title",
      "type": "<knowledge-category>",
      "category": "<subdirectory name>",
      "confidence": "low | medium | high",
      "confidenceValue": 0.3,
      "content": "The full insight text",
      "action": "What to do differently based on this insight",
      "sourceRun": "<ISO-8601-UTC timestamp of first observation>",
      "lastConfirmed": "<ISO-8601-UTC timestamp of most recent confirmation>",
      "confirmationCount": 1,
      "usageCount": 0,
      "deprecated": false,
      "tags": ["optional", "search", "tags"]
    }
  ]
}
```

### knowledge-brief.json Schema

```json
{
  "version": 1,
  "generatedAt": "<ISO-8601-UTC>",
  "coldStart": false,
  "taskProfile": {
    "domain": "<domain-name>",
    "taskDescription": "<from context.json>"
  },
  "insights": {
    "{category-1}": [
      {
        "id": "MK-001",
        "title": "...",
        "confidence": "high",
        "action": "...",
        "relevanceScore": 0.85
      }
    ],
    "{category-2}": [...]
  },
  "staleEntries": ["MK-005", "MK-008"],
  "summary": "Brief narrative: N high-confidence insights, M medium, K flagged stale."
}
```

### synthesis-signals/{name}.json Schema

```json
{
  "version": 1,
  "generatedAt": "<ISO-8601-UTC>",
  "analyzer": "<analyzer-agent-name>",
  "signals": [
    {
      "id": "SIG-001",
      "type": "<knowledge-category>",
      "content": "The raw observation",
      "strength": "low | medium | high",
      "sourceArtifact": "<path to the artifact that contained this signal>",
      "sourceEvidence": "Quoted text or specific reference"
    }
  ]
}
```

### meta/run-retrospectives/{timestamp}.json Schema

```json
{
  "version": 1,
  "runTimestamp": "<ISO-8601-UTC>",
  "taskProfile": {
    "domain": "<domain-name>",
    "taskDescription": "<from context.json>"
  },
  "signalsProcessed": {
    "total": 15,
    "accepted": 8,
    "rejectedReusability": 3,
    "rejectedActionability": 2,
    "rejectedRedundancy": 2
  },
  "promotions": [
    { "entryId": "MK-001", "from": "low", "to": "medium", "reason": "Independent confirmation in this run" }
  ],
  "demotions": [],
  "newEntries": ["MK-012", "MK-013"],
  "deprecatedEntries": [],
  "metaHealthScore": 0.85
}
```

---

## § 6 Knowledge Category Derivation

The factory's artifact-designer derives 3–6 domain-specific knowledge categories from the domain model. Categories are NOT hardcoded — they emerge from the domain.

### Derivation Process

1. **Read domain-model.json subdomains**: Group subdomains by thematic affinity.
2. **Map to knowledge types**: For each group, ask: "What kind of reusable insight could emerge from processing this group repeatedly?"
3. **Add universal categories**: Every domain gets at least one process-level category (e.g., `process-observations` or `pipeline-insights`).
4. **Validate count**: Aim for 3–6 categories. Fewer than 3 is too coarse (signals get diluted). More than 6 is too fine (categories overlap).

### Worked Examples

**Documentation domain** (doc-writer):
| Category | Derived From | What It Captures |
|---|---|---|
| `patterns` | Writing subdomains | Effective documentation structures, audience adaptation patterns |
| `anti-patterns` | Review/verification feedback | Common writing mistakes to avoid |
| `domain-insights` | Source material analysis | Recurring domain concepts and terminology usage |
| `source-observations` | Research subdomains | How to find and parse different source types |
| `style-evolutions` | Quality verification | How style guidelines evolve with feedback |
| `process-observations` | Pipeline execution | Which agents work well, bottleneck patterns |

**Fiction-writing domain** (fantasy-writer):
| Category | Derived From | What It Captures |
|---|---|---|
| `craft-patterns` | Writing/prose subdomains | Effective narrative techniques, pacing strategies |
| `voice-insights` | Character/dialogue subdomains | Voice consistency patterns, dialogue rhythms |
| `worldbuilding-patterns` | Setting/magic/culture subdomains | Coherent world element integration |
| `revision-strategies` | Review/editing subdomains | What revision approaches yield the biggest quality gains |
| `process-observations` | Pipeline execution | Agent performance, convergence behavior |

**Code-migration domain** (migration-agent):
| Category | Derived From | What It Captures |
|---|---|---|
| `migration-patterns` | Framework/API subdomains | Successful migration strategies for specific transformations |
| `failure-modes` | Error-handling/testing subdomains | Common migration failures and how to avoid them |
| `dependency-insights` | Dependency analysis subdomains | Package resolution patterns, version compatibility |
| `process-observations` | Pipeline execution | Where the migration pipeline bottlenecks |

---

## § 7 Separation of Concerns

### What Meta-Knowledge IS

- Cross-run learning about recurring patterns, effective strategies, and observed pitfalls.
- Process-level observations about pipeline behavior.
- Accumulated wisdom that makes the Nth run better than the 1st.

### What Meta-Knowledge IS NOT

- **Not domain data**: The domain model, task graph, behavior matrix — these are per-task artifacts. They belong in the domain pipeline, not meta/.
- **Not configuration**: Context.json, options, user preferences — these are inputs, not learned knowledge.
- **Not a cache**: Meta-knowledge is curated insight, not raw data. The quality gate ensures only actionable, reusable, non-redundant entries persist.
- **Not a log**: manifest.json is the audit log. meta/ is distilled wisdom, not a record of what happened.

### Boundary Rules

1. **meta/ is isolated**: Only the knowledge-integrator writes to it. All other agents may read `knowledge-brief.json` but never write to `meta/`.
2. **Signals are ephemeral**: `synthesis-signals/` files are overwritten each run. They are intermediaries, not persistent storage.
3. **The brief is ephemeral**: `knowledge-brief.json` is regenerated at the start of each run. It reflects the curator's current assessment, not a historical record.
4. **Retrospectives are persistent**: `meta/run-retrospectives/` accumulates across runs and is never deleted.
