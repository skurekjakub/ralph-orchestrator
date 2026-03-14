# Docwriter Routing Architecture

> Reference for path-by-path tracing during audits. Every distinct execution path through the pipeline is enumerated with its trigger condition, agent sequence, artifacts produced, error handling, and progress mutations.

## Legend

- **→** sequential dispatch (wait for completion)
- **⇒** progress.json mutation
- **⊘** error/skip path
- **↺** re-entry / loop
- Artifacts in `mono` are under `.docwriter/`
- Status files in `agents/<name>-status.json`

---

## Path Index

| # | Path | Trigger | Frequency |
|---|------|---------|-----------|
| P-01 | [Happy path (first run, no gaps)](#p-01-happy-path-first-run-no-gaps) | Fresh bootstrap | Common |
| P-02 | [Gap-hunting re-entry cycle](#p-02-gap-hunting-re-entry) | Gaps found at Pass 6 | Common |
| P-03 | [Crash recovery (mid-pipeline resume)](#p-03-crash-recovery) | Restart after crash | Occasional |
| P-04 | [Pass 0 failure (non-blocking)](#p-04-pass-0-failure) | Meta-knowledge missing/broken | Rare |
| P-05 | [Pass 0.5 failure (non-blocking)](#p-05-pass-05-failure) | Codebase orientation fails | Rare |
| P-06 | [Pass 6.5 failure (non-blocking)](#p-06-pass-65-failure) | Knowledge synthesis fails | Rare |
| P-07 | [Research-scout failure (degraded Pass 2)](#p-07-research-scout-failure) | External fetch timeout | Occasional |
| P-08 | [Execution rewrite loop](#p-08-execution-rewrite-loop) | Reviewer rejection in Pass 4 | Common |
| P-09 | [Task blocked after 3 attempts](#p-09-task-blocked) | Persistent review failures | Occasional |
| P-10 | [Forced convergence (3 gap cycles exhausted)](#p-10-forced-convergence) | Max re-entry cycles hit | Rare |
| P-11 | [Directive: skip pass](#p-11-directive-skip-pass) | `## Routing` directive | User-driven |
| P-12 | [Directive: halt before pass](#p-12-directive-halt-before-pass) | `## Routing` directive | User-driven |
| P-13 | [Front-matter validation failure](#p-13-front-matter-validation-failure) | Invalid front matter at Pass 7 | Occasional |
| P-14 | [Synthesis degraded mode](#p-14-synthesis-degraded-mode) | Signal analyzer failure | Rare |
| P-15 | [Cold-start (empty meta-knowledge)](#p-15-cold-start) | First-ever task | Once |

---

## P-01: Happy Path (first run, no gaps)

The nominal end-to-end execution with no errors, no gaps found, and no re-entry.

```
Startup
│  verify bootstrap → validate context → read directives → read progress
│
├─ Pass 0: knowledge-curator (direct dispatch, non-blocking)
│  ├─ Read: meta/index.json, meta/*, context.json
│  ├─ Write: knowledge-brief.json
│  ├─ Status: agents/knowledge-curator-status.json
│  ⇒ pass0_knowledgeCuration = "done"
│
├─ Pass 0.5: codebase-orientation-coordinator (non-blocking)
│  ├─ → codebase-surveyor
│  │    Write: codebase-survey.json
│  ├─ → codebase-curator
│  │    Write: meta/codebase-map.json
│  ├─ Status: agents/codebase-orientation-coordinator-status.json
│  ⇒ pass05_codebaseOrientation = "done" (orchestrator sets this)
│
├─ Pass 1: discovery-coordinator
│  ├─ → diff-analyzer
│  │    Read: context.json (source repo + diff ref)
│  │    Write: change-inventory.json
│  ├─ → corpus-scanner
│  │    Read: context.json (docs workspace)
│  │    Write: doc-index.json
│  ├─ Cross-validate: changes exist + docs exist
│  ├─ Status: agents/discovery-coordinator-status.json
│  ⇒ pass1_discovery = "done"
│
├─ Pass 2: analysis-coordinator (mode: pass2)
│  ├─ → invariant-scanner (first — no upstream deps)
│  │    Read: context.json → guidelines path
│  │    Write: invariant-inventory.json, invariant-hashmap.json
│  ├─ → code-analyzer ‖ research-scout (parallel, independent)
│  │    code-analyzer Read: change-inventory.json, meta/codebase-map.json, [source-observations.md skill ref]
│  │    code-analyzer Write: code-analysis.json
│  │    research-scout Read: change-inventory.json, invariant-inventory.json
│  │    research-scout Write: research-brief.json
│  ├─ → impact-mapper (after code-analyzer + corpus-scanner)
│  │    Read: code-analysis.json, doc-index.json, change-inventory.json, [research-brief.json]
│  │    Write: impact-matrix.json
│  ├─ Status: agents/analysis-coordinator-status.json (result: pass2-complete)
│  ⇒ pass2_analysis = "done"
│
├─ Pass 3: analysis-coordinator (mode: pass3)
│  ├─ → task-planner
│  │    Read: impact-matrix.json, code-analysis.json, knowledge-brief.json, [research-brief.json], [source-observations.md skill ref]
│  │    Write: task-graph.json, tasks/<id>/ directories
│  ├─ → risk-analyzer
│  │    Read: task-graph.json, code-analysis.json, impact-matrix.json, invariant-inventory.json
│  │    Write: risk-register.json
│  ├─ Status: agents/analysis-coordinator-status.json (result: pass3-complete)
│  ⇒ pass3_planning = "done"
│
├─ Pass 4: execution-coordinator
│  ├─ For EACH task in task-graph.json (by order, respecting dependsOn):
│  │  ├─ → content-writer (with task ID, risk info if high/critical)
│  │  │    Read: task def, code-analysis.json, impact-matrix.json, knowledge-brief.json, invariants
│  │  │    Write: actual doc files + tasks/<id>/writer-output.json
│  │  ├─ → style-reviewer → accuracy-reviewer → persona-reviewer (sequential)
│  │  │    Read: written doc file + task def + invariants + knowledge-brief.json
│  │  │    Write: tasks/<id>/{style,accuracy,persona}-review.json
│  │  └─ ALL approved → task status = "written", next task
│  ├─ Status: agents/execution-coordinator-status.json
│  ⇒ pass4_execution = "done"
│
├─ Pass 5-6: verification-coordinator
│  ├─ Pass 5: → cross-ref-updater
│  │    Read: all written doc files, doc-index.json
│  │    Write: verification-matrix.json
│  │  ⇒ pass5_verification = "done"
│  ├─ Pass 6: → gap-hunter
│  │    Read: change-inventory.json, task-graph.json, written docs, invariant-inventory.json,
│  │          [knowledge-brief.json], [task-effectiveness.md skill ref], [source-observations.md skill ref]
│  │    Write: gap-analysis.json
│  │  Evaluate: totalGaps === 0, converged === true
│  │  ⇒ pass6_gapHunting = "done", gapHunting.reEntryTarget = null, converged = true
│
├─ Pass 6.5: synthesis-coordinator (non-blocking)
│  │  Guard: pass6 done AND reEntryTarget === null
│  ├─ → task-signal-analyzer
│  │    Write: synthesis-signals/task-signals.json
│  ├─ → context-signal-analyzer
│  │    Write: synthesis-signals/context-signals.json
│  ├─ → knowledge-integrator
│  │    Read: signals + meta/index.json + existing meta entries
│  │    Write: meta/ entries + updated meta/index.json
│  ├─ → skill-rebuilder
│  │    Write: .github/skills/docwriter-meta/references/*.md
│  ├─ Status: agents/synthesis-coordinator-status.json
│  ⇒ pass65_knowledgeSynthesis = "done" (orchestrator sets this)
│
├─ Pass 7: delivery-coordinator
│  ├─ Prerequisites check: pass6 done, converged, no in-progress tasks
│  ├─ → frontmatter-validator
│  │    Write: frontmatter-validation.json
│  ├─ → changelog-writer
│  │    Write: changelog-entry.md
│  ├─ Status: agents/delivery-coordinator-status.json
│  ⇒ pass7_delivery = "done"
│
└─ Pipeline Complete
   └─ Write pipeline-summary.json, report to user
```

**Artifacts produced (in order):** knowledge-brief.json → codebase-survey.json → meta/codebase-map.json → change-inventory.json → doc-index.json → invariant-inventory.json → code-analysis.json → research-brief.json → impact-matrix.json → task-graph.json → risk-register.json → [doc files + review JSONs per task] → verification-matrix.json → gap-analysis.json → synthesis-signals/ → meta/ updates → frontmatter-validation.json → changelog-entry.md → pipeline-summary.json

---

## P-02: Gap-Hunting Re-Entry

Gaps found during Pass 6. The orchestrator cascade-resets downstream passes and re-executes. **Smart task targeting:** gap-hunter emits `affectedTaskIds` per gap, enabling downstream agents to selectively update only affected work instead of redoing entire passes.

```
Pass 6 completes:
│  gap-analysis.json shows totalGaps > 0
│  Each gap includes affectedTaskIds (structured T-* IDs)
│  ⇒ pass6_gapHunting = "done"
│  ⇒ gapHunting.reEntryTarget = "<earliest target>" (e.g. "pass3")
│  ⇒ gapHunting.cyclesCompleted++
│
Orchestrator evaluates routing table:
│  Condition: pass6 done AND reEntryTarget non-null AND cycles < 3
│
├─ Read reEntryTarget (e.g. "pass3")
├─ Cascade reset: pass3_planning, pass4_execution, pass5_verification, pass6_gapHunting → "not-started"
├─ Clear reEntryTarget → null
│
├─ Routing table naturally re-dispatches from pass3:
│  ├─ analysis-coordinator (pass3 mode)
│  │  └─ task-planner reads gap-analysis.json → modifies only affectedTaskIds tasks,
│  │     creates new tasks for gaps with empty affectedTaskIds, preserves all other "written" tasks
│  ├─ execution-coordinator (gap-aware)
│  │  └─ Resets ONLY tasks in affectedTaskIds to "planned", all other "written" tasks preserved
│  ├─ verification-coordinator (both passes re-run)
│  │  └─ Cross-refs re-verified, gap-hunter runs again
│  └─ Either converges or triggers another re-entry cycle
│
Re-entry SKIPS:
│  ⊘ Pass 0 — knowledge brief doesn't change mid-run
│  ⊘ Pass 0.5 — repo structure doesn't change mid-run
│  ⊘ Pass 6.5 — synthesis only after final convergence
```

**Re-entry target mapping (what gets reset):**

| Target | Passes reset | Rationale |
|--------|-------------|-----------|
| `pass2` | 2, 3, 4, 5, 6 | Analysis needs redo → everything downstream |
| `pass3` | 3, 4, 5, 6 | Planning needs redo → write + verify |
| `pass4` | 4, 5, 6 | Only execution errors → rewrite + reverify |
| `pass5` | 5, 6 | Cross-refs wrong → reverify |

**Maximum 3 cycles.** After cycle 3, verification-coordinator forces convergence regardless of gaps (see P-10).

---

## P-03: Crash Recovery

Orchestrator restarts and finds partial progress in `progress.json`.

```
Startup
│  Read progress.json → find partially completed state
│  Example: pass2_analysis = "done", pass3_planning = "in-progress"
│
├─ Routing table scans top-to-bottom
├─ Skips all passes already "done"
├─ Dispatches first matching "not-started" or "in-progress" condition
│  └─ In example: re-dispatches analysis-coordinator in pass3 mode
│
Key behaviors:
│  ├─ Never restarts completed passes (crash-safe)
│  ├─ "in-progress" treated same as "not-started" (re-execute)
│  ├─ pass6_gapHunting is always "done" or "not-started" (never "needs-reentry")
│  │  └─ Re-entry signaled via reEntryTarget field (H-2 fix ensures this)
│  └─ Non-blocking passes (0, 0.5, 6.5) marked "done" even on error
```

**Critical invariant:** `pass6_gapHunting` can ONLY be `"done"` or `"not-started"` — never a custom value. Re-entry is routed by checking `gapHunting.reEntryTarget !== null` AFTER `pass6 === "done"`. This prevents crash-recovery deadlocks from unrecognized status values.

---

## P-04: Pass 0 Failure (Non-Blocking)

Knowledge curation fails or produces no knowledge.

```
Pass 0: knowledge-curator dispatched
│
├─ ⊘ Status is "error" OR status file missing
│    ├─ Log warning: "Knowledge curation failed — continuing without meta-knowledge"
│    ⇒ pass0_knowledgeCuration = "done" (non-blocking)
│    └─ Continue to Pass 0.5
│
Downstream impact:
│  ├─ knowledge-brief.json missing or empty
│  ├─ task-planner: proceeds without pattern knowledge (cold-start)
│  ├─ content-writer: proceeds without writing patterns
│  ├─ style-reviewer: no style-evolution criteria (base invariants only)
│  ├─ gap-hunter: no meta-knowledge considerations (no source-observation predictors)
│  └─ Pipeline completes normally, quality may be lower
```

---

## P-05: Pass 0.5 Failure (Non-Blocking)

Codebase orientation fails.

```
Pass 0.5: codebase-orientation-coordinator dispatched
│
├─ ⊘ Status is "error" OR status file missing
│    ├─ Log warning: "Codebase orientation failed — downstream agents will discover structure ad-hoc"
│    ⇒ pass05_codebaseOrientation = "done" (non-blocking)
│    └─ Continue to Pass 1
│
Downstream impact:
│  ├─ meta/codebase-map.json missing or stale (from prior successful run)
│  ├─ code-analyzer: discovers module structure from scratch during analysis
│  ├─ knowledge-curator: no codebase-map enrichment for domain identification
│  ├─ task-planner: less accurate task scoping
│  └─ Pipeline completes normally, potentially less efficient
```

---

## P-06: Pass 6.5 Failure (Non-Blocking)

Knowledge synthesis fails.

```
Pass 6.5: synthesis-coordinator dispatched
│
├─ ⊘ Status is "error" OR status file missing
│    ├─ Log warning: "Knowledge synthesis failed — meta-knowledge not updated this run"
│    ⇒ pass65_knowledgeSynthesis = "done" (non-blocking)
│    └─ Continue to Pass 7
│
Impact:
│  ├─ meta/ entries not updated with this run's findings
│  ├─ Skill reference files not regenerated
│  ├─ Next run's knowledge-curator uses stale meta-knowledge
│  └─ No impact on current run's output (synthesis is retrospective)
```

---

## P-07: Research-Scout Failure (Degraded Pass 2)

External documentation fetch fails or times out. Research is non-blocking within Pass 2.

```
Pass 2: analysis-coordinator
│
├─ → invariant-scanner (OK)
├─ → code-analyzer ‖ research-scout (parallel)
│    ├─ code-analyzer: OK
│    └─ ⊘ research-scout: fails/times out
│         ├─ Log warning
│         ├─ Set researchBriefAvailable = false on coordinator status
│         └─ Continue — research-brief.json does NOT exist
│
├─ → impact-mapper
│    └─ Skips research recommendation integration (checks if brief exists first)
│
Downstream impact:
│  ├─ task-planner: no external best-practice recommendations
│  ├─ impact-mapper: no research-informed impact adjustments
│  ├─ content-writer: no research recommendations in context
│  └─ Invariant-driven quality still enforced; research is enhancement only
```

---

## P-08: Execution Rewrite Loop

Content rejected by one or more reviewers; writer retries.

```
Pass 4: execution-coordinator, for a single task
│
├─ Attempt 1:
│  ├─ → content-writer (task T-005)
│  │    Write: docs/guide.md + tasks/T-005/writer-output.json {attempt: 1}
│  ├─ → style-reviewer → accuracy-reviewer → persona-reviewer
│  │    style: approved ✓
│  │    accuracy: rejected ✗ ("incorrect API parameter names")
│  │    persona: approved ✓
│  └─ ANY rejected → rewrite needed
│
├─ Attempt 2:
│  ├─ Compile feedback: read tasks/T-005/{style,accuracy,persona}-review.json
│  │  Write: tasks/T-005/review-feedback.md (combined fail items)
│  ├─ → content-writer (with review-feedback.md context)
│  │    Write: updated docs/guide.md + writer-output.json {attempt: 2}
│  ├─ → style-reviewer → accuracy-reviewer → persona-reviewer
│  │    All approved ✓
│  └─ Task status → "written"
│
Maximum 3 attempts per task. See P-09 for blocked path.
```

---

## P-09: Task Blocked After 3 Attempts

Writer unable to satisfy reviewers after maximum retries.

```
Pass 4: execution-coordinator, task T-005
│
├─ Attempt 3 completes, still has rejections
├─ attempt >= 3 → BLOCKED
│  ├─ task status → "blocked" in task-graph.json
│  ├─ Log unresolved issues
│  ├─ Move to next task
│  └─ Continue processing remaining tasks
│
End of Pass 4:
│  ├─ Status: tasksCompleted: 18, tasksBlocked: 2
│  ├─ Pipeline continues to Pass 5-6
│  └─ Blocked tasks appear in pipeline-summary.json → unresolvedItems
│
Impact:
│  ├─ Gap-hunter MAY flag blocked task coverage as a gap
│  ├─ If gap-hunter does, re-entry may attempt the task again (fresh cycle)
│  └─ After 3 gap-hunting cycles, forced convergence (blocked tasks stay blocked)
```

---

## P-10: Forced Convergence (3 Gap Cycles Exhausted)

Maximum re-entry cycles hit. Pipeline forces convergence regardless of remaining gaps.

```
Pass 6: verification-coordinator, cycle 3
│
├─ gap-analysis.json shows totalGaps > 0
├─ BUT gapHunting.cyclesCompleted >= 3 (safety valve)
│
├─ ⇒ pass6_gapHunting = "done"
├─ ⇒ gapHunting.reEntryTarget = null (forced — no more re-entry)
├─ ⇒ gapHunting.converged = true (forced)
│
├─ Orchestrator routing table:
│    pass6 done AND reEntryTarget === null → Pass 6.5
│    (not the re-entry branch — reEntryTarget is null)
│
├─ Pass 6.5 runs (knowledge synthesis)
├─ Pass 7 runs (delivery)
│
Pipeline complete with KNOWN GAPS:
│  └─ pipeline-summary.json lists unresolvedItems from final gap-analysis.json
```

---

## P-11: Directive — Skip Pass

User adds `## Routing` directive: "Skip Pass 2"

```
Startup: read directives.md
│
├─ Parse "Skip Pass 2" from ## Routing
├─ ⇒ pass2_analysis = "done" (without executing)
├─ Log in manifest: directivesApplied → { section: "Routing", action: "applied — pass2_analysis set to done" }
│
├─ Routing table: pass2 already "done" → dispatch pass3
│
├─ ⊘ Conflict check: if invariant-inventory.json exists and skip conflicts with an invariant
│    └─ Invariant wins → directive ignored, pass executes normally
│
Impact varies by pass:
│  Skip Pass 0: no knowledge-brief (similar to P-04/P-15)
│  Skip Pass 0.5: no codebase-map refresh (similar to P-05)
│  Skip Pass 2: no analysis — Pass 3 needs impact-matrix.json (WILL LIKELY FAIL)
│  Skip Pass 3: no task-graph — Pass 4 has nothing to execute (WILL FAIL)
│  Skip Pass 4: no written docs — Pass 5-6 have nothing to verify (WILL FAIL)
│  Skip Pass 5-6: no verification — Pass 7 prereqs may fail
│  Skip Pass 6.5: no knowledge synthesis (similar to P-06)
│  Skip Pass 7: no delivery — pipeline reports as complete without changelog
```

**Warning:** Skipping core pipeline passes (1-6) likely causes downstream failures. Only non-blocking passes (0, 0.5, 6.5, 7) are safe to skip.

---

## P-12: Directive — Halt Before Pass

User adds `## Routing` directive: "Halt before Pass 4"

```
Startup: read directives.md
│
├─ Parse "Halt before Pass 4" from ## Routing
│
├─ Pipeline runs normally through Pass 3
├─ Routing table reaches Pass 4 condition
├─ HALT: stop and report to user
│  └─ "Pipeline halted before Pass 4 as directed. Passes 0-3 complete.
│       Review task-graph.json and risk-register.json before continuing."
│
User decides: remove directive and re-run, or adjust plan and continue
```

---

## P-13: Front-Matter Validation Failure

Front matter validator finds issues at Pass 7.

```
Pass 7: delivery-coordinator
│
├─ → frontmatter-validator
│    Write: frontmatter-validation.json { allValid: false, issues: [...] }
│
├─ Decision: report in status, do NOT fix
│  ├─ Status: frontMatterValid = false
│  ├─ Proceed to changelog-writer (issues are informational)
│  └─ Pipeline completes with known front-matter issues
│
Pipeline-summary:
│  └─ unresolvedItems includes front-matter validation failures
│
Note: The orchestrator COULD re-enter Pass 4 for fixes but currently
does not have explicit routing for this. Front-matter issues are reported
as known items for user resolution.
```

---

## P-14: Synthesis Degraded Mode

One or both signal analyzers fail during Pass 6.5.

```
Pass 6.5: synthesis-coordinator
│
├─ → task-signal-analyzer
│    ⊘ Fails → create empty task-signals.json { tasks: [] }, continue
│
├─ → context-signal-analyzer
│    ⊘ Fails → create empty context-signals.json, continue
│
├─ → knowledge-integrator
│    Reads whatever signals are available (possibly empty)
│    └─ Fewer patterns/insights extracted, but integration proceeds
│
├─ → skill-rebuilder
│    Rebuilds from whatever meta/ entries exist
│
├─ Status: { degraded: true }
│
Impact: Knowledge base updated with less information this run.
Not an error — next run will have another chance to extract signals.
```

**Escalation:** If knowledge-integrator itself fails (not just signal analyzers), synthesis is marked as failed, skill-rebuilder is skipped, and the coordinator writes error status. The orchestrator treats this as non-blocking (P-06).

---

## P-15: Cold Start (Empty Meta-Knowledge)

First-ever run — no accumulated knowledge exists.

```
Pass 0: knowledge-curator
│
├─ Read meta/index.json → entries is empty (seed from bootstrap)
├─ Cold-start path: produce empty brief immediately
│    Write: knowledge-brief.json { patterns: [], antiPatterns: [], ... , summary: { totalIncluded: 0 } }
│
├─ meta/codebase-map.json does not exist yet
│    └─ Domain identification relies solely on context.json
│
All downstream agents:
│  ├─ Check if knowledge-brief.json exists before reading → yes, but empty
│  ├─ No patterns, anti-patterns, or domain insights available
│  ├─ Invariants still enforced (from guidelines, not meta-knowledge)
│  └─ Pipeline runs fully; first run "teaches" the meta-knowledge base
│
Pass 6.5: synthesis-coordinator
│  └─ First synthesis populates meta/ with patterns from this run
│      Next run's knowledge-curator will have real data
```

---

## Coordinator Internal Dispatch Sequences

### Discovery Coordinator (Pass 1)

```
Step 0: Read directives (## Global, ## Context, ## Pass 1)
Step 1: → diff-analyzer (blocking — must produce change-inventory.json)
Step 2: → corpus-scanner (blocking — must produce doc-index.json)
Step 3: Cross-validate (sanity check, not dispatching)
```

**Error stops pipeline.** Both specialists are required.

### Analysis Coordinator (Pass 2)

```
Step 0: Read directives (## Global, ## Context, ## Pass 2)
Step 0b: Check gap-awareness (re-entry? read gap-analysis.json for pass2 gaps)
Step 1: → invariant-scanner (blocking — FIRST, provides INV-* IDs for research-scout)
Step 2a: → code-analyzer     ‖ (parallel — independent inputs)
Step 2b: → research-scout    ‖ (non-blocking on failure)
Step 3: → impact-mapper (blocking — needs code-analysis.json)
```

### Analysis Coordinator (Pass 3)

```
Step 0: Read directives (## Global, ## Context, ## Pass 3)
Step 0b: Check gap-awareness (re-entry? task-planner reads gap-analysis.json,
         modifies only affectedTaskIds tasks, creates new tasks for [] gaps,
         preserves unaffected "written" tasks)
Step 1: → task-planner (blocking — must produce task-graph.json)
Step 2: → risk-analyzer (blocking — must produce risk-register.json)
```

### Execution Coordinator (Pass 4)

```
Step 0: Read directives (## Global, ## Context, ## Pass 4, ## Task T-NNN)
Step 0b: Check re-entry gaps (reEntryTarget === "pass4"?
         collect affectedTaskIds from gap-analysis.json,
         reset ONLY those tasks to "planned" — all other "written" tasks preserved)
Step 1: Read task-graph.json + risk-register.json
Step 2: FOR EACH eligible task (ordered, dependencies respected):
  Step A: → content-writer (with task context + risk info + gap recommendations)
  Step B: → style-reviewer → accuracy-reviewer → persona-reviewer (sequential)
  Step C: Evaluate verdicts:
           ALL approved → "written", next task
           ANY rejected AND attempt < 3 → back to Step A (rewrite)
           ANY rejected AND attempt >= 3 → "blocked", next task
```

### Verification Coordinator (Pass 5+6)

```
Step 0: Read directives (## Global, ## Context, ## Pass 5, ## Pass 6)
Mode detect: pass5 not done → run both; pass5 done → run pass6 only

Pass 5:
  Step 1: → cross-ref-updater (blocking — must produce verification-matrix.json)

Pass 6:
  Step 1: → gap-hunter (blocking — must produce gap-analysis.json)
  Step 2: Evaluate convergence:
           totalGaps === 0 → converged (proceed to 6.5)
           totalGaps > 0, cycles < 3 → set reEntryTarget (orchestrator handles re-entry)
           totalGaps > 0, cycles >= 3 → force convergence (safety valve)
```

### Synthesis Coordinator (Pass 6.5)

```
Step 0: Read directives (## Global, ## Context, ## Pass 6.5)
Step 1: → task-signal-analyzer (soft-fail → empty signals)
        Outputs: A-series signals (A1 patterns, A2 anti-patterns, A3 style evolutions)
Step 2: → context-signal-analyzer (soft-fail → empty signals)
        Outputs: B-series signals (B1 gap signals, B2 domain insights, B3 research effectiveness,
                 B4 meta-knowledge effectiveness, B5 source observations)
Step 3: → knowledge-integrator (HARD fail → skip step 4, write error)
        Writes: meta/patterns/, meta/anti-patterns/, meta/domain-insights/,
                meta/style-evolutions/, meta/source-observations/, meta/task-retros/
Step 4: → skill-rebuilder (soft-fail → stale skills)
        Rebuilds: 7 reference files (patterns, anti-patterns, domain-knowledge,
                  style-decisions, task-effectiveness, source-observations) + SKILL.md
```

### Delivery Coordinator (Pass 7)

```
Step 0: Read directives (## Global, ## Context, ## Pass 7)
Prerequisites: pass6 done, converged, no in-progress tasks
  ⊘ Not met → status "blocked", stop

Step 1: → frontmatter-validator
  allValid: true → proceed
  allValid: false → report issues, proceed anyway (informational)
Step 2: → changelog-writer (blocking — must produce changelog-entry.md)
```

---

## Progress.json State Machine

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    progress.json                        │
                    │                                                         │
 passStatus:        │  not-started ──→ [dispatched] ──→ done                 │
                    │                                    │                    │
                    │  (re-entry cascade resets to not-started)               │
                    │                                                         │
 gapHunting:        │  reEntryTarget: null ──→ "pass3" ──→ null (cleared)   │
                    │  cyclesCompleted: 0 → 1 → 2 → 3 (cap)                 │
                    │  converged: false ──→ true                              │
                    │  newItemsPerCycle: [5, 2, 0]                            │
                    └─────────────────────────────────────────────────────────┘
```

**Legal pass status values:** `"not-started"` | `"done"` — NEVER any other value. This is a crash-safety invariant (see H-2 fix).

**Progress update ownership:**

| Pass | Who updates progress.json |
|------|--------------------------|
| 0 (knowledge-curator) | Orchestrator ("After Pass 0" handler) |
| 0.5 (codebase-orientation) | Orchestrator ("After Pass 0.5" handler) |
| 1 (discovery) | Discovery coordinator |
| 2 (analysis) | Analysis coordinator |
| 3 (planning) | Analysis coordinator |
| 4 (execution) | Execution coordinator |
| 5 (verification) | Verification coordinator |
| 6 (gap-hunting) | Verification coordinator |
| 6.5 (synthesis) | Orchestrator ("After Pass 6.5" handler) |
| 7 (delivery) | Delivery coordinator |

**Rule:** Non-blocking passes (0, 0.5, 6.5) → orchestrator manages progress for both success and error. Blocking coordinator passes (1-7) → coordinators manage their own progress.

---

## Artifact Dependency Graph

```
context.json ──────────────────┬──→ knowledge-curator ──→ knowledge-brief.json
                               ├──→ codebase-surveyor ──→ codebase-survey.json ──→ codebase-curator ──→ meta/codebase-map.json
                               ├──→ diff-analyzer ──→ change-inventory.json ─┬──→ code-analyzer ──→ code-analysis.json
                               │                                              ├──→ research-scout ──→ research-brief.json
                               │                                              ├──→ impact-mapper ──→ impact-matrix.json
                               │                                              └──→ gap-hunter
                               └──→ corpus-scanner ──→ doc-index.json ────────┬──→ impact-mapper
                                                                              └──→ cross-ref-updater

invariant-inventory.json ──────┬──→ research-scout (invariant gate)
(from invariant-scanner)       ├──→ content-writer (must-cite invariants)
                               ├──→ all reviewers (enforcement)
                               ├──→ gap-hunter (coverage check)
                               └──→ all coordinators (directive conflict check)

knowledge-brief.json ──────────┬──→ task-planner
(from knowledge-curator)       ├──→ content-writer
                               ├──→ style-reviewer
                               └──→ gap-hunter

meta/codebase-map.json ────────┬──→ knowledge-curator (domain enrichment)
(from codebase-curator)        └──→ code-analyzer (orientation)

impact-matrix.json ────────────┬──→ task-planner
(from impact-mapper)           └──→ execution-coordinator (task dispatch)

task-graph.json ───────────────┬──→ execution-coordinator
(from task-planner)            ├──→ risk-analyzer
                               └──→ gap-hunter

risk-register.json ────────────┬──→ execution-coordinator (risk-aware dispatch)
(from risk-analyzer)           │

code-analysis.json ────────────┬──→ impact-mapper
(from code-analyzer)           ├──→ task-planner
                               ├──→ risk-analyzer
                               └──→ content-writer

gap-analysis.json ─────────────┬──→ orchestrator (re-entry decision)
(from gap-hunter)              ├──→ analysis-coordinator (gap relay on re-entry)
                               └──→ execution-coordinator (task reset on re-entry)
```

---

## Directive Propagation

```
directives.md
├── ## Routing ───→ orchestrator ONLY (skip/halt/re-run)
├── ## Global ────→ ALL coordinators → ALL specialists (relayed in dispatch)
├── ## Context ───→ ALL coordinators → ALL specialists (relayed in dispatch)
├── ## Pass N ────→ target coordinator (applies locally)
└── ## Task T-NNN → execution-coordinator → content-writer + reviewers for that task
```

**Who reads directives.md directly:** All coordinators + knowledge-curator (direct-dispatch specialist).
**Who receives directives via dispatch message:** All specialists (from their coordinator).
**The orchestrator processes ONLY `## Routing` directives.** All other sections are left for coordinators.

---

## Error Classification

| Severity | Behavior | Examples |
|----------|----------|---------|
| **Fatal** | Pipeline stops, reports error | Any coordinator writes `status: "error"` for a required specialist |
| **Blocking** | Task skipped, pipeline continues | content-writer fails (not rejection) → skip task; reviewer fails → retry once then error |
| **Non-blocking** | Warning logged, pipeline continues | Pass 0/0.5/6.5 error; research-scout failure; signal-analyzer failure |
| **Informational** | Reported, no impact | Front-matter validation issues; blocked tasks; forced convergence |
