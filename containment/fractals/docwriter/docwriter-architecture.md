---
description: 'Deep-dive architecture reference for the docwriter fractal pipeline — artifact flow, design decisions, agent interactions.'
model: claude-opus-4.6
name: 'docwriter-architecture'
user-invocable: true
---

# Docwriter Architecture — Deep Dive

You are `docwriter-architecture`, a documentation-only agent. When invoked, you present this architecture reference and answer design questions about the docwriter pipeline. You do not execute pipeline operations.

---

## 1. Design Philosophy

The docwriter family follows the **fractal orchestrator architecture** — a depth-2 agent hierarchy where:

- The **session orchestrator** (`docwriter`) is a pure router that reads status files and dispatches coordinators. It never reads source code, documentation, or guidelines. It also directly dispatches single-agent passes (Pass 0: knowledge-curator, Pass 6.5: synthesis-coordinator).
- **Coordinators** (6) are pure routers that dispatch specialists and validate their outputs. They never perform analysis, writing, or reviewing.
- **Specialists** (22) are leaf agents that do actual work. Each specialist reads specific artifacts, performs one focused task, and writes its output artifact.

This separation exists for three reasons:

1. **Context isolation.** Each specialist gets only the context it needs. The content-writer doesn't see the full diff; it sees pre-extracted docFacts. The accuracy-reviewer doesn't see the style guide; it reads source code.
2. **Crash resumability.** Every agent writes a status file on completion. If the pipeline crashes mid-execution, the orchestrator reads `progress.json` and resumes from the last incomplete pass.
3. **Auditability.** Every action is recorded in `manifest.json` (prepend-only log). Every artifact is a JSON file with `generatedBy` and `version` fields. The full decision chain is reconstructable from artifacts alone.

### Why Not a Flat Agent?

A single agent writing all documentation would need to hold the entire diff, the entire corpus, all guidelines, all code analysis, and all review state in context simultaneously. For a 350-page corpus with 50+ changed files, this exceeds practical context limits. The fractal design decomposes the problem so each agent operates within a manageable context window.

### Why Depth-2, Not Deeper?

Two levels (orchestrator → coordinator → specialist) is sufficient because:
- Specialists have focused, bounded tasks (process one file, review one page)
- Coordination logic is simple routing based on status files
- Adding a third level would increase latency without improving quality

## 2. Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        docwriter (orchestrator)                      │
│   Reads: progress.json, coordinator status files                     │
│   Writes: manifest.json routing entries                              │
│   Logic: routing table + re-entry from gap hunting                   │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬───────────────────────┘
   │      │      │      │      │      │      │
   ▼      │      │      │      │      │      │
┌──────────┐      │      │      │      │      │
│ Pass 0   │      │      │      │      │      │
│ knowledge│      │      │      │      │      │
│ -curator │      │      │      │      │      │
│ (direct) │      │      │      │      │      │
│ →brief   │      │      │      │      │      │
└──────────┘      │      │      │      │      │
          ▼       │      │      │      │      │
   ┌──────────┐   │      │      │      │      │
   │ Pass 1   │   │      │      │      │      │
   │ Discovery│   │      │      │      │      │
   │ Coord.   │   │      │      │      │      │
   ├──────────┤   │      │      │      │      │
   │ diff-    │   │      │      │      │      │
   │ analyzer │   │      │      │      │      │
   ├──────────┤   │      │      │      │      │
   │ corpus-  │   │      │      │      │      │
   │ scanner  │   │      │      │      │      │
   └──────────┘   │      │      │      │      │
                  ▼      │      │      │      │
           ┌──────────┐  │      │      │      │
           │ Pass 2-3 │  │      │      │      │
           │ Analysis │  │      │      │      │
           │ Coord.   │  │      │      │      │
           ├──────────┤  │      │      │      │
           │ invariant│  │      │      │      │
           │ -scanner │  │      │      │      │
           ├──────────┤  │      │      │      │
           │code-     │  │      │      │      │
           │analyzer ◄├──┤ parallel     │      │
           │research- │  │      │      │      │
           │scout     │  │      │      │      │
           ├──────────┤  │      │      │      │
           │ impact-  │  │      │      │      │
           │ mapper   │  │      │      │      │
           ├──────────┤  │      │      │      │
           │ task-    │  │      │      │      │
           │ planner  │  │      │      │      │
           ├──────────┤  │      │      │      │
           │ risk-    │  │      │      │      │
           │ analyzer │  │      │      │      │
           └──────────┘  │      │      │      │
                         ▼      │      │      │
                  ┌──────────┐  │      │      │
                  │ Pass 4   │  │      │      │
                  │ Execution│  │      │      │
                  │ Coord.   │  │      │      │
                  ├──────────┤  │      │      │
                  │ content- │  │      │      │
                  │ writer   │◄─┤      │      │
                  ├──────────┤  │      │      │
                  │ style-   │  │      │      │
                  │ reviewer ├──┤      │      │
                  ├──────────┤  │      │      │
                  │ accuracy-│  │reject│      │
                  │ reviewer ├──┤loop  │      │
                  ├──────────┤  │max 3 │      │
                  │ persona- │  │      │      │
                  │ reviewer ├──┘      │      │
                  └──────────┘         │      │
                                ▼      │      │
                         ┌──────────┐  │      │
                         │ Pass 5-6 │  │      │
                         │ Verif.   │  │      │
                         │ Coord.   │  │      │
                         ├──────────┤  │      │
                         │ cross-   │  │      │
                         │ ref-     │  │      │
                         │ updater  │  │      │
                         ├──────────┤  │      │
                         │ gap-     │──┘ re-entry
                         │ hunter   │    (max 3 cycles)
                         └──────────┘
                                │ converged
                                ▼
                         ┌──────────┐
                         │ Pass 6.5 │
                         │ Synthesis│
                         │ Coord.   │
                         │ (direct) │
                         ├──────────┤
                         │ task-    │
                         │ signal-  │
                         │ analyzer │
                         ├──────────┤
                         │ context- │
                         │ signal-  │
                         │ analyzer │
                         ├──────────┤
                         │knowledge-│
                         │integrator│
                         ├──────────┤
                         │ skill-   │
                         │ rebuilder│
                         └──────────┘
                                │
                                ▼
                         ┌──────────┐
                         │ Pass 7   │
                         │ Delivery │
                         │ Coord.   │
                         ├──────────┤
                         │ frontmat.│
                         │ validator│
                         ├──────────┤
                         │ changelog│
                         │ writer   │
                         ├──────────┤
                         │ pr-      │
                         │ preparer │
                         └──────────┘
```

## 3. Artifact Flow — The Data Backbone

All communication between agents happens through JSON artifacts in `.docwriter/`. There are no in-memory handoffs, no message passing, no shared state. Each artifact has a strict producer and set of consumers.

### Artifact Dependency Graph

```
context.json (user-provided)
    │
    ├──► knowledge-curator ──► knowledge-brief.json ──┬──► task-planner
    │                                                  ├──► content-writer
    │                                                  ├──► style-reviewer
    │                                                  ├──► accuracy-reviewer
    │                                                  ├──► gap-hunter
    │                                                  └──► context-signal-analyzer
    │
    ├──► diff-analyzer ──► change-inventory.json ──┬──► code-analyzer
    │                                               ├──► research-scout
    │                                               ├──► impact-mapper
    │                                               ├──► gap-hunter
    │                                               └──► changelog-writer
    │
    ├──► corpus-scanner ──► doc-index.json ─────────┬──► impact-mapper
    │                                                ├──► cross-ref-updater
    │                                                ├──► task-planner
    │                                                ├──► persona-reviewer
    │                                                └──► gap-hunter
    │
    ├──► invariant-scanner ──► invariant-inventory.json ──┬──► research-scout
    │                                                      ├──► task-planner
    │                                                      ├──► content-writer
    │                                                      ├──► style-reviewer
    │                                                      ├──► persona-reviewer
    │                                                      ├──► frontmatter-validator
    │                                                      └──► gap-hunter
    │
    ├──► code-analyzer ──► code-analysis.json ──┬──► impact-mapper
    │                                            ├──► task-planner
    │                                            ├──► content-writer
    │                                            ├──► accuracy-reviewer
    │                                            └──► gap-hunter
    │
    └──► research-scout ──► research-brief.json ──┬──► task-planner
                                                   ├──► content-writer
                                                   ├──► accuracy-reviewer
                                                   ├──► impact-mapper
                                                   ├──► risk-analyzer
                                                   └──► context-signal-analyzer

impact-mapper ──► impact-matrix.json ──┬──► task-planner
                                        ├──► risk-analyzer
                                        └──► gap-hunter

task-planner ──► task-graph.json ──┬──► risk-analyzer
                                    ├──► execution-coordinator
                                    ├──► content-writer
                                    ├──► all 3 reviewers
                                    ├──► cross-ref-updater
                                    ├──► gap-hunter
                                    ├──► frontmatter-validator
                                    ├──► changelog-writer
                                    └──► pr-preparer

risk-analyzer ──► risk-register.json ──► pr-preparer

content-writer ──► doc files + writer-output.json ──► 3 reviewers

3 reviewers ──► {style,accuracy,persona}-review.json ──► execution-coordinator
                                                         (for rewrite feedback)

cross-ref-updater ──► verification-matrix.json ──► pr-preparer

gap-hunter ──► gap-analysis.json ──► verification-coordinator
                                     (for re-entry routing)

task-signal-analyzer ──► task-signals.json ──► knowledge-integrator
context-signal-analyzer ──► context-signals.json ──► knowledge-integrator
knowledge-integrator ──► meta/ entries + index ──► skill-rebuilder
skill-rebuilder ──► .github/skills/docwriter-meta/references/

frontmatter-validator ──► frontmatter-validation.json ──► delivery-coordinator

changelog-writer ──► changelog-entry.md ──► pr-preparer

pr-preparer ──► pr-description.md + git commit
```

### Why JSON artifacts?

1. **Inspectable.** A human can open any artifact and understand the pipeline state without running code.
2. **Idempotent.** Re-running a specialist with the same inputs produces the same output. No hidden state.
3. **Version-tracked.** Every artifact has `version: 1` for future schema evolution.
4. **Cross-agent contracts.** The schema IS the interface. Agents don't need to know each other's implementation — only the artifact schema.

## 4. The Invariant System — Design Rationale

### The Problem

Documentation quality rules live in guidelines files (style guide, persona definitions, content type specs, Jekyll conventions). Without a structured system, each agent would independently interpret these files, leading to:
- Inconsistent rule application across tasks
- No traceability (which rule was checked? by whom?)
- No way to know if a rule was missed entirely

### The Solution: Indexed Invariants

The `invariant-scanner` agent reads ALL guidelines files and extracts every discrete, enforceable rule into `invariant-inventory.json` with unique IDs (`INV-style-001`, `INV-jekyll-015`, etc.).

The traceability chain:

```
guidelines/style-guide.md § "Voice and Tone"
    → INV-style-001: "Use active voice. Avoid passive constructions."
        → task-planner inlines INV-style-001 into T-001 (concept page, applies to all)
            → content-writer sees INV-style-001 in its task definition, writes accordingly
                → style-reviewer checks INV-style-001: PASS (evidence: "All sentences active voice")
                    → gap-hunter verifies INV-style-001 was applied to all eligible tasks
```

### Why Not Let Each Agent Read Guidelines Directly?

1. **Consistency.** The invariant-scanner creates one canonical interpretation. All downstream agents reference the same extracted rules.
2. **Selectivity.** Not every invariant applies to every task. `INV-persona-003` about admin tone only applies to admin-targeted pages. The task-planner handles this selection logic once.
3. **Accountability.** Reviewers report pass/fail PER invariant ID. This makes review results machine-parseable and gap-huntable.
4. **Efficiency.** Reading 10 guidelines files per-task wastes context. Inlining only the relevant 15-20 invariants per task is more focused.

### Invariant Domains

| Domain | Scope | Enforced By |
|--------|-------|-------------|
| `style` | Voice, tone, formatting, sentence structure | Style reviewer |
| `structure` | Section ordering, required sections by content type | Style reviewer |
| `jekyll` | Front matter schema, Liquid syntax, includes, layouts | Style reviewer + frontmatter validator |
| `persona` | Audience targeting, tone calibration, depth expectations | Persona reviewer |
| `taxonomy` | Classification rules, tag vocabularies, faceted search | Persona reviewer + frontmatter validator |
| `codesamples` | Code block formatting, language tags, annotations | Style reviewer |
| `crossref` | Linking conventions, callout formats | Style reviewer |
| `general` | Catch-all for uncategorized rules | All reviewers |

### Enforcement Types

- **`machine-checkable`**: Can be validated programmatically (e.g. "front matter must have a `title` field"). The frontmatter-validator handles these.
- **`reviewer-checkable`**: Requires AI judgment (e.g. "use active voice"). The three reviewers handle these.

## 5. The Triple Review — Design Rationale

### Why Three Reviewers Instead of One?

A single reviewer checking style, accuracy, AND persona simultaneously would:
- Conflate rejected reasons (is it a tone issue or a factual error?)
- Need an enormous context (style guide + source code + persona definitions)
- Produce ambiguous feedback (hard for the writer to know what specifically to fix)

Three specialized reviewers give:
- **Clear ownership**: Each reviewer has ONE job and ONE set of inputs
- **Precise feedback**: Failed invariant IDs with exact evidence, not vague "needs improvement"
- **Parallel checking**: Style doesn't depend on accuracy — they can run independently (though dispatched sequentially for implementation simplicity)

### The Review Loop

```
┌─────────────────────────────────────────────────┐
│                Execution Coordinator              │
│                                                   │
│   ┌─────────┐   attempt 1   ┌──────────────┐    │
│   │ content- │──────────────►│ 3 reviewers  │    │
│   │ writer   │               │ (parallel)   │    │
│   │          │◄──────────────│              │    │
│   │          │  reject +     │ style: FAIL  │    │
│   │          │  combined     │ accur: PASS  │    │
│   │          │  feedback     │ perso: PASS  │    │
│   │          │               └──────────────┘    │
│   │          │   attempt 2   ┌──────────────┐    │
│   │          │──────────────►│ 3 reviewers  │    │
│   │          │               │ (parallel)   │    │
│   │          │               │              │    │
│   │          │  all PASS     │ style: PASS  │    │
│   │          │◄──────────────│ accur: PASS  │    │
│   └─────────┘               │ perso: PASS  │    │
│       ✓ accepted             └──────────────┘    │
└─────────────────────────────────────────────────┘
```

- **Maximum 3 attempts.** After 3 rejections, the task is marked `blocked` — an infinite rewrite loop would waste compute without improving quality.
- **Combined feedback.** On rejection, the coordinator merges ALL reviewer findings into a single `review-feedback.md` file, so the writer addresses everything in one rewrite.
- **Any rejection = rewrite.** Even if only the persona reviewer rejects, the content goes back through ALL three reviewers. This prevents fixing a persona issue from introducing a style regression.

### Why the Accuracy Reviewer Reads Source Code

The accuracy reviewer doesn't trust `code-analysis.json` summaries alone. It opens the actual source files and verifies every technical claim against the real code. This is the strongest quality guarantee in the pipeline:

1. Content-writer reads docFacts from code-analysis (summarized behavioral facts)
2. Content-writer writes documentation using those facts
3. Accuracy reviewer goes back to the source, reads the actual function at line N, and confirms the claim

This double-verification catches cases where the code-analyzer's summary was imprecise, or where the content-writer misinterpreted a docFact.

## 6. Gap Hunting and Convergence — Design Rationale

### The Problem

No planning system is perfect. The impact-mapper might miss a cross-cutting concern. The task-planner might skip an area. The content-writer might leave gaps the reviewers don't catch because they're focused on what IS written, not what's MISSING.

### The Solution: Adversarial Completeness Audit

The gap-hunter runs AFTER all writing and verification. It approaches the pipeline output with skepticism:

- "Is every code change covered by at least one completed task?" (check change-inventory vs task-graph)
- "Is every behavioral impact documented somewhere?" (check code-analysis vs written content)
- "Are there pages in the affected topic clusters that became stale?" (check doc-index pages outside task-graph)
- "Were all applicable invariants applied to all eligible tasks?" (check task-graph invariant inlining completeness)

### Re-Entry Mechanics

When gaps are found, each gap is tagged with a **re-entry target** indicating which pipeline pass should re-execute to fix it:

| Gap Type | Re-Entry Target | What Happens |
|----------|-----------------|--------------|
| Missed code analysis | `pass2` | Impact-mapper runs again with broader scope |
| Missing tasks | `pass3` | Task-planner creates additional tasks |
| Incomplete writing | `pass4` | Content-writer handles new/reworked tasks |
| Missing cross-refs | `pass5` | Cross-ref updater patches additional links |

The orchestrator resets the target pass status in `progress.json` and follows the routing table — the pipeline naturally re-executes from the re-entry point forward.

### Convergence Control

```
Cycle 1: gap-hunter finds 5 gaps → re-entry to pass3+4
  └─ pass3 creates 3 new tasks, pass4 writes them, pass5 updates refs
Cycle 2: gap-hunter finds 1 gap → re-entry to pass4
  └─ pass4 rewrites 1 task, pass5 updates refs
Cycle 3: gap-hunter finds 0 gaps → converged ✓
```

**Maximum 3 cycles.** If gaps persist after 3 cycles, the pipeline forces convergence and reports unresolved gaps in the PR description. This prevents infinite loops where the gap-hunter and writers disagree on coverage.

**Diminishing returns tracking.** `progress.json` records `gapHunting.newItemsPerCycle: [5, 1, 0]`. If each cycle finds fewer gaps, the system is converging. If cycle 3 finds more gaps than cycle 2, something is fundamentally wrong and forced convergence is the right call.

## 7. Coordinator Design Patterns

### Pure Router Pattern

Every coordinator follows this structure:

```
1. Read progress.json → determine mode (which pass to execute)
2. dispatch specialist A
3. wait → read A's status file → validate output
4. dispatch specialist B (may depend on A's output)
5. wait → read B's status file → validate output
6. ...
7. Update progress.json
8. Write own status file
```

Coordinators never:
- Read source code, documentation, or guidelines
- Transform data between specialists
- Make content decisions
- Fix specialist failures (they report errors, the orchestrator decides)

### Analysis Coordinator — Multi-Pass Pattern

The analysis coordinator manages BOTH pass 2 (analysis) AND pass 3 (planning) because they're tightly coupled — planning depends on analysis outputs. It uses mode detection from `progress.json` to determine which pass to execute. This avoids round-tripping through the orchestrator between passes 2 and 3, which would add latency without benefit.

### Execution Coordinator — Iterative Loop Pattern

The execution coordinator is the most complex because it manages:
- A task queue with dependency ordering
- Per-task write-review cycles (max 3 attempts)
- Combined feedback compilation on rejection
- Task status tracking (planned → in-progress → written → blocked)

It processes tasks **one at a time** in dependency order. This is intentional — doc tasks may depend on each other (e.g. a concept page must exist before a tutorial can link to it).

### Verification Coordinator — Convergence Pattern

The verification coordinator manages the convergence loop:
- Dispatches cross-ref updater (once)
- Dispatches gap-hunter (repeatedly until converged or max cycles)
- Reports `needs-reentry` or `converged` to the orchestrator

It tracks cycle count and convergence assessment, enabling the orchestrator to make re-entry decisions.

## 8. State Machine — progress.json

The pipeline state is fully captured in `progress.json`:

```json
{
  "currentPass": 4,
  "passStatus": {
    "pass0_knowledgeCuration": "done",
    "pass1_discovery": "done",
    "pass2_analysis": "done",
    "pass3_planning": "done",
    "pass4_execution": "in-progress",   ← current
    "pass5_verification": "not-started",
    "pass6_gapHunting": "not-started",
    "pass65_knowledgeSynthesis": "not-started",
    "pass7_delivery": "not-started"
  },
  "gapHunting": {
    "cyclesCompleted": 0,
    "newItemsPerCycle": [],
    "converged": false
  }
}
```

### State Transitions

```
not-started ──► in-progress ──► done
                                  │
                                  ▼ (re-entry from gap-hunter)
                              not-started (reset)
```

### Crash Recovery

If the pipeline crashes:
1. `progress.json` shows the last completed pass
2. The current pass status is `"in-progress"` (or `"not-started"` if it crashed before updating)
3. On restart, the orchestrator reads this state and resumes from the incomplete pass
4. Specialist status files in `.docwriter/agents/` indicate which specialists within that pass completed successfully

This means:
- Completed passes are never re-executed (unless gap-hunter requires re-entry)
- The current pass may partially re-execute (specialists that already wrote status files may run again, but since they overwrite output artifacts, the result is the same)
- Future passes are unaffected

## 9. Manifest — Audit Trail

`.docwriter/manifest.json` is a **prepend-only** log. Every agent prepends an entry on completion:

```json
[
  {"agent": "docwriter-pr-preparer", "action": "created commit on branch docs/feature-xyz with 25 files", "timestamp": "2026-03-13T14:30:00Z"},
  {"agent": "docwriter-delivery-coordinator", "action": "Pass 7 complete — PR ready", "timestamp": "2026-03-13T14:29:00Z"},
  {"agent": "docwriter", "action": "routed to delivery-coordinator", "timestamp": "2026-03-13T14:28:00Z"},
  ...
  {"agent": "docwriter-diff-analyzer", "action": "wrote change-inventory.json", "timestamp": "2026-03-13T13:00:00Z"}
]
```

Reading this log bottom-to-top gives the full execution history. This is the primary forensic tool when diagnosing pipeline issues.

### Why Prepend-Only?

Appending risks last-write-wins corruption if multiple agents write simultaneously (shouldn't happen in the sequential pipeline, but defensive design). Prepending puts the most recent entry first, so a partial-read always gives the latest state. And it matches the fractal orchestrator architecture spec from the skill template.

## 10. Per-Task Work Directories

Each task gets `.docwriter/tasks/<task-id>/` as a workspace:

```
.docwriter/tasks/T-001/
├── writer-output.json        # Content-writer metadata (attempt, docFacts used, invariants applied)
├── style-review.json         # Style reviewer verdict + invariant results
├── accuracy-review.json      # Accuracy reviewer verdict + claim verification
├── persona-review.json       # Persona reviewer verdict + tone assessment
└── review-feedback.md        # Combined rejection feedback (for rewrite attempts)
```

### Why Per-Task Directories?

1. **Isolation.** Task T-001's review results don't interfere with T-002's.
2. **Rewrite history.** On attempt 2, the writer reads `review-feedback.md` (compiled from the previous attempt's 3 review files). The review JSON files are overwritten with new results.
3. **Post-mortem.** For blocked tasks, the entire rejection history is preserved in the task directory.

## 11. Cross-Cutting Design Decisions

### Why No Separate Invariant Extractor Per Agent?

Early designs considered giving each agent its own invariant extraction step. This was rejected because:
- **Duplication**: 3 reviewers would each parse the same style guide 3 times
- **Inconsistency**: Different agents might extract different rules from ambiguous guidelines
- **Untraceability**: No central inventory means no way to verify all rules were checked

The centralized invariant-scanner + per-task inlining pattern is more efficient and more auditable.

### Why Task-Graph Instead of Free-Form Writing?

The task-planner creates an explicit graph rather than letting the content-writer decide what to write because:
- **Coverage guarantee**: Every impact from the impact-matrix is mapped to at least one task
- **Dependency ordering**: Concept pages before tutorials that reference them
- **Invariant scoping**: Per-task invariant selection happens at planning time, not writing time
- **Progress tracking**: The execution coordinator knows exactly which tasks are done, blocked, or pending

### Why Three Reviewers On Every Task?

Even a simple link-fix task gets all three reviewers. This was a deliberate decision from the requirements discussion:
- Style review catches formatting regressions even in small changes
- Accuracy review catches incorrect assumptions even in cross-ref updates
- Persona review catches tone drift even in minor edits
- The overhead is acceptable because each reviewer is lightweight for simple tasks

## 12. Meta-Knowledge System — Self-Improving Pipeline

The pipeline accumulates knowledge across runs via a structured meta-knowledge base at `.docwriter/meta/`. This is the pipeline's long-term memory.

### Knowledge Lifecycle

```
Run N:
  Pass 0: Curator reads meta/index.json → curates knowledge-brief.json
  Pass 1-6: Pipeline executes with meta-knowledge informing planning, writing, review
  Pass 6.5: Synthesizer extracts signals → integrates entries → rebuilds skills

Run N+1:
  Pass 0: Curator reads UPDATED meta/index.json → better-targeted brief
  ...cycle continues, knowledge quality improves over runs...
```

### Confidence Ladder (Strict)

New knowledge entries start at `low` confidence and can only be promoted through repeated confirmation:

| Level | Criteria | Promotion Rule |
|---|---|---|
| `low` | Single observation in a single run | Default for all new signals |
| `medium` | Confirmed in 2+ tasks or 2 separate runs | Second independent observation |
| `high` | 3+ runs, >80% acceptance rate when applied | Third run confirms with strong acceptance |

**Demotion**: Entries at `medium` that are violated in a subsequent run are demoted to `low`. This prevents overconfident recommendations from persistent patterns that no longer hold.

### Quality Gate

Every candidate knowledge entry must pass three criteria:
1. **Reusability** — useful beyond the specific task that generated it
2. **Actionability** — a downstream agent can concretely act on it
3. **Non-redundancy** — adds information beyond what invariants already enforce

### Invariant Supremacy

All meta-knowledge and research recommendations are subordinate to policy invariants. If a pattern, anti-pattern, or research recommendation conflicts with ANY invariant, the invariant wins unconditionally. This is enforced at three levels:
1. **Research-scout** filters recommendations through an invariant gate (approved/blocked/adapted)
2. **Task-planner** checks recommendations against inlined invariants before adding acceptance criteria
3. **Each consumer agent** has an invariant supremacy rule and discards conflicting recommendations

### Research System

The research-scout (Pass 2, parallel with code-analyzer) fetches external documentation best practices from curated sources and filters them through the invariant gate. Key constraints:
- Maximum 8 fetches per run (quality over quantity)
- Every recommendation must cite a specific URL and content
- Blocked recommendations are excluded from downstream agents
- Research-scout failure is non-blocking — the pipeline works without external input
- Source effectiveness is tracked and fed back to the synthesizer for source list evolution

### Skill Files

The `.github/skills/docwriter-meta/` directory contains human-readable projections of the meta index:
- `patterns.md` — Proven documentation approaches
- `anti-patterns.md` — Known failure modes
- `domain-knowledge.md` — Codebase-specific documentation insights
- `style-decisions.md` — Emergent style decisions beyond invariants
- `task-effectiveness.md` — Pipeline effectiveness trends

These are fully rebuilt from `meta/index.json` by the skill-rebuilder on every synthesis cycle. They serve as an alternative consumption path for agents that benefit from summarized knowledge.

### Why Maximum 3 Attempts?

Empirically, if a content-writer can't satisfy all three reviewers in 3 attempts, there's usually a deeper issue:
- A docFact is ambiguous or incomplete (code analysis gap)
- An invariant is contradictory or overly strict
- The task scope is too broad to satisfy all persona requirements simultaneously

Blocking the task and reporting it is more useful than a 4th or 5th attempt that likely produces the same result.

### Why the Gap Hunter Is Separate From Reviewers

Reviewers check what WAS written. The gap hunter checks what WASN'T written. These are fundamentally different activities:
- Reviewers operate on a single page
- The gap hunter operates on the entire pipeline output as a whole
- Reviewers catch quality issues; the gap hunter catches coverage gaps
- Reviewers run during execution; the gap hunter runs after execution

### Why No Explicit Invariant Extractor for Code

The code-analyzer extracts behavioral facts but doesn't produce "code invariants" in the same format as the guideline invariants. This is intentional:
- Code facts are per-change, per-file. They describe specific behaviors.
- Guideline invariants are cross-cutting rules that apply to many tasks.
- Mixing them in one inventory would conflate "what the code does" with "how to write about it."
- The `docFacts` in `task-graph.json` serve as the per-task code facts, while `invariants` serve as the cross-cutting writing rules.

## 13. Scaling Characteristics

| Metric | Impact on Pipeline |
|--------|--------------------|
| Files changed (diff size) | Linear increase in Pass 1-2 work; more areas → more tasks |
| Doc corpus size | Affects corpus scanner time and cross-ref checking scope |
| Number of invariants | Linear increase in per-task review time (more rules to check) |
| Number of tasks | Dominates total pipeline time (Pass 4 is O(tasks × avg_attempts)) |
| Cross-ref density | Affects Pass 5 scope — highly-linked pages cause more cascade updates |
| Gap hunting cycles | Adds ~60% overhead per cycle (re-executes from re-entry point) |

### Expected Performance Profile

For a medium diff (20 files, 5 areas) against a 350-page corpus:
- Pass 1: 2 specialists (fast — file enumeration and diff parsing)
- Pass 2: 3 specialists (moderate — code reading is the bottleneck)
- Pass 3: 2 specialists (fast — planning from structured inputs)
- Pass 4: ~15-20 tasks × 1.3 avg attempts = ~20-26 write-review cycles
- Pass 5: 1 specialist (moderate — cross-ref checking proportional to link density)
- Pass 6: 1-3 gap hunting cycles
- Pass 7: 3 specialists (fast — validation and git operations)

Pass 4 dominates total pipeline time by a wide margin.

## 14. Directive Injection System

The directive system provides mid-run steering without restarting the pipeline or modifying agent code.

### Reading Hierarchy

```
.docwriter/directives.md
        │
        ├── ## Routing     → docwriter (orchestrator) processes immediately
        │                    ├── Skip Pass N → passStatus set to "done"
        │                    ├── Halt before Pass N → pipeline stops
        │                    └── Re-run Pass N → passStatus reset to "not-started"
        │
        ├── ## Global      → docwriter reads → relays to coordinator → coordinator relays to specialists
        ├── ## Context     → same relay path as Global
        │
        ├── ## Pass N      → coordinator for Pass N reads directly
        │                    └── coordinators relay to their specialists in dispatch
        │
        └── ## Task T-NNN  → execution-coordinator inlines into specific task's writer dispatch
                             └── also relayed to reviewers for that task
```

### Relay Pattern

The orchestrator does not relay directive content in its coordinator dispatch messages (except Routing directives, which it processes itself). Instead, each coordinator reads `directives.md` directly and extracts its own applicable sections. This avoids bloating the orchestrator's dispatch messages and keeps directive handling local to each coordinator.

Specialists do NOT read `directives.md`. They receive relevant directive content relayed by their coordinator in the dispatch context. This preserves the specialist's focused context window.

### Conflict Resolution

**Specificity wins:** Task T-NNN > Pass N > Global > Context.

If two Routing directives conflict (e.g., "Skip Pass 2" + "Re-run Pass 2"), the later directive in file order wins. A warning is logged in `manifest.json` with both directives.

Nonexistent pass references (e.g., "Skip Pass 99") are logged as warnings and ignored.

### Invariant Interaction

Directives are subordinate to invariants. The precedence chain:

```
invariant-inventory.json  >  directives.md  >  default agent behavior
```

When a directive conflicts with an invariant, the agent:
1. Ignores the directive entirely
2. Logs a conflict entry in `manifest.json` with the invariant ID
3. Includes a conflict entry in its `directivesApplied` status array with `"action": "ignored — conflicts with INV-ID"`

This ensures invariant supremacy is absolute and auditable.

### Re-Entry Interaction

Directives persist across re-entry cycles. After gap-hunting triggers a re-entry:
- Routing directives are re-evaluated (a "Skip Pass 3" still applies on re-entry)
- Pass-scoped directives are re-applied (a "## Pass 4" directive affects re-executed Pass 4)
- If directives caused the gap (e.g., skipping a reviewer), the user should update or remove the directive before the next cycle

### Audit Trail

Every directive-reading agent includes a `directivesApplied` array in its status file:

```json
"directivesApplied": [
  { "section": "Global", "summary": "Focus on REST API", "action": "relayed to specialists" },
  { "section": "Pass 4", "summary": "Skip persona review", "action": "applied — persona-reviewer auto-passed" },
  { "section": "Pass 4", "summary": "Reduce max review to 2", "action": "ignored — conflicts with INV-012" }
]
```

The orchestrator's `manifest.json` also logs the full directive snapshot on each invocation, including active count and section breakdown.

### Persistence Model

Directives are persistent until manually removed. The bootstrap `--clean` flag preserves `directives.md` alongside `meta/` and `synthesis-signals/`. This allows users to iterate on directives across pipeline resets.

The file is seeded by `docwriter-bootstrap.sh` with empty section headings as a template.
