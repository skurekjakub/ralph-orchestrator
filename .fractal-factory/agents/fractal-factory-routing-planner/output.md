# Routing Planner Output — romantic-fantasy-writer

---

## Re-Entry Cycle 2 — Gap Hunting Fixes (2026-03-16T02:45:00Z)

### Summary

Re-entry execution triggered by gap-hunting pass (cycle 1 → 2). Fixed 2 critical routing gaps and performed a full completeness audit across all 20 routed agents.

**Changes made**: 2 new routes added to orchestrator routing table (routes now total 26)
**Routes audited**: 160 total (26 orchestrator + 134 across 19 coordinators)
**Unhandled result codes remaining**: 0

### RC-001 FIXED: craft-tracker blocked handler

Added to orchestrator routing table after the existing craft-tracker completion route:
```
read: agents/craft-tracker/status.json
condition: result == 'blocked'
action: write own status: failed; summary: 'Craft tracking initialization failed — craft-profile.json missing or chapter content unavailable'
```

### RC-002 FIXED: continuity-tracker blocked handler

Added to orchestrator routing table after the existing continuity-tracker completion route:
```
read: agents/continuity-tracker/status.json
condition: result == 'blocked'
action: write own status: failed; summary: 'Continuity verification failed — chapter content unavailable or world-bible files missing'
```

### IE-001 Audit: Full Blocked-Handler Coverage Verified

Audited all 20 routing agents. Confirmed:
- All 12 orchestrator children have both completion and blocked handlers
- All 8 loop configs handle auditor passed/failed/blocked
- All 10 sub-coordinators handle child completed/blocked
- Wildcard handler covers all coordinator revision-loop transient states

### Gaps Not Requiring Routing Changes

- **AC-002**: craft-profile.json is already single-writer via concept-coordinator dispatch — no routing change needed
- **IE-002**: T25 enforcement is prompt-level for auditors — no routing change needed

---

## Original Routing Design (Cycle 1)

## Overview

Designed routing tables for **20 routing agents** in the romantic-fantasy-writer produced system:
- 1 session orchestrator
- 9 coordinators (4 depth-2, 5 depth-3)
- 10 sub-coordinators

**Total routing entries:** 161  
**Auditor gate loops:** 8  
**Per-chapter iteration loops:** 4  
**Parallel dispatch groups:** 3  

---

## 1. Orchestrator Routing Table

The session orchestrator (`romantic-fantasy-writer`) routes 9 sequential creative phases plus 3 cross-cutting utility agents.

### Phase Sequence

| # | Phase | Coordinator | Entry Condition |
|---|-------|-------------|-----------------|
| 1 | Concept | concept-coordinator | progress.json concept.status == 'pending' |
| 2 | Worldbuilding | worldbuilding-coordinator | concept-coordinator complete |
| 3 | Character | character-coordinator | worldbuilding-coordinator complete |
| 4 | Plotting | plotting-coordinator | character-coordinator complete |
| 5 | Style | style-coordinator | plotting-coordinator complete |
| 6 | (cross-cut) | craft-tracker | style-coordinator complete |
| 7 | Drafting | drafting-coordinator | craft-tracker completed |
| 8 | (cross-cut) | continuity-tracker | drafting-coordinator complete |
| 9 | Revision | revision-coordinator | continuity-tracker completed |
| 10 | Beta-reading | beta-reading-coordinator | revision-coordinator complete |
| 11 | Polish | polish-coordinator | beta-reading-coordinator complete |
| 12 | (cross-cut) | series-kb-manager | polish-coordinator complete |

### Revision ↔ Beta-Reading Loop

After beta-reading completes, the orchestrator checks all `beta-synthesis/{N}.json` verdicts. If any chapter has `verdict == 'revision-required'`:
- Reset revision + beta-reading coordinator statuses
- Re-dispatch revision-coordinator for flagged chapters
- Re-dispatch beta-reading-coordinator
- **Max cycles: 2** (then proceed to polish with best-effort)

### Result Codes

| Code | Meaning |
|------|---------|
| `delivered` | All 9 phases + cross-cutting completed successfully |
| `delivered-with-gaps` | Core phases done, some optional phases blocked or revision cycles exhausted |
| `failed` | A mandatory phase blocked (concept through drafting) |

### Transient State: `revision-loop`

Coordinators may report `revision-loop` while in their internal auditor retry loop. The orchestrator waits and re-checks — this always resolves to `complete` or `blocked`.

---

## 2. Coordinator Routing Tables

### 2.1 Concept Coordinator (depth-2)

**Pattern:** Sequential with auditor gate loop

```
concept-developer → craft-profile-selector → concept-auditor
    ↑                                              │
    └──────── if 'failed' (up to 3 retries) ───────┘
```

| Read | Condition | Action |
|------|-----------|--------|
| agents/concept-developer/status.json | missing | dispatch concept-developer |
| agents/concept-developer/status.json | completed | dispatch craft-profile-selector |
| agents/concept-developer/status.json | blocked | → own status: blocked |
| agents/craft-profile-selector/status.json | completed | dispatch concept-auditor |
| agents/craft-profile-selector/status.json | blocked | → own status: blocked |
| agents/concept-auditor/status.json | passed | → own status: complete |
| agents/concept-auditor/status.json | failed, retries < 3 | reset all statuses, re-dispatch concept-developer |
| agents/concept-auditor/status.json | failed, retries ≥ 3 | → own status: blocked |
| agents/concept-auditor/status.json | blocked | → own status: blocked |

**Feedback artifact:** `audit-reports/concept/gate.json`

### 2.2 Worldbuilding Coordinator (depth-3)

**Pattern:** Sequential sub-coordinators with auditor gate loop

```
physical-world-coord → systems-world-coord → worldbuilding-auditor
        ↑                                            │
        └──────── if 'failed' (up to 3 retries) ─────┘
```

| Read | Condition | Action |
|------|-----------|--------|
| agents/physical-world-coordinator/status.json | missing | dispatch physical-world-coordinator |
| agents/physical-world-coordinator/status.json | complete | dispatch systems-world-coordinator |
| agents/physical-world-coordinator/status.json | blocked | → own status: blocked |
| agents/systems-world-coordinator/status.json | complete | dispatch worldbuilding-auditor |
| agents/systems-world-coordinator/status.json | blocked | → own status: blocked |
| agents/worldbuilding-auditor/status.json | passed | → own status: complete |
| agents/worldbuilding-auditor/status.json | failed, retries < 3 | reset all sub + specialist statuses, re-dispatch physical-world-coordinator |
| agents/worldbuilding-auditor/status.json | failed, retries ≥ 3 | → own status: blocked |
| agents/worldbuilding-auditor/status.json | blocked | → own status: blocked |

**Reset cascade on retry:** Deletes status for physical-world-coord, systems-world-coord, geography-builder, culture-builder, history-builder, magic-system-designer, political-structure-builder, worldbuilding-auditor.

### 2.3 Character Coordinator (depth-3)

**Pattern:** Sequential sub-coordinators with auditor gate loop

```
core-characters-coord → ensemble-coord → character-auditor
        ↑                                       │
        └──── if 'failed' (up to 3 retries) ────┘
```

Same pattern as worldbuilding. Reset cascade includes all 4 sub-coordinator specialists + 2 sub-coordinators + auditor.

### 2.4 Plotting Coordinator (depth-3)

**Pattern:** Sequential sub-coordinators with auditor gate loop

```
structural-design-coord → chapter-design-coord → plotting-auditor
          ↑                                             │
          └──────── if 'failed' (up to 3 retries) ──────┘
```

Reset cascade includes structure-selector, dual-arc-builder, tension-mapper, chapter-outliner, scene-beat-designer + 2 sub-coordinators + auditor.

### 2.5 Style Coordinator (depth-2)

**Pattern:** Sequential with auditor gate loop

```
style-analyzer → style-guide-writer → style-auditor
     ↑                                      │
     └──── if 'failed' (up to 3 retries) ───┘
```

### 2.6 Drafting Coordinator (depth-3, per-chapter)

**Pattern:** Per-chapter loop with auditor gate per chapter

```
FOR each chapter N (sequential, INV-012):
  creative-writing-coord → quality-integration-coord → drafting-auditor
          ↑                                                    │
          └───────── if 'failed' (up to 3 retries) ───────────┘
  if 'passed' → advance to chapter N+1
END FOR → own status: complete
```

**Key constraint:** Chapter N+1 cannot begin until chapter N passes the drafting auditor gate (INV-012).  
**Retry scope:** Per-chapter. Each chapter gets up to 3 independent retry attempts. Retry counter resets per chapter.

### 2.7 Revision Coordinator (depth-2, per-chapter)

**Pattern:** Per-chapter 3-pass editing with auditor gate

```
FOR each chapter N:
  developmental-editor → line-editor → copy-editor → chapter-reviser → revision-auditor
                                                           ↑                    │
                                                           └── if 'failed' ─────┘
                                                           (up to 3 retries, re-run reviser only)
  if 'passed' → advance to next chapter
END FOR → own status: complete
```

**Key optimization:** On retry, only the chapter-reviser re-runs. The three editor reports (developmental, line, copy) are preserved — they represent independent assessments that don't need to be repeated.

### 2.8 Beta-Reading Coordinator (depth-3, per-chapter, parallel)

**Pattern:** Per-chapter parallel fan-out → synthesize → audit

```
FOR each chapter N:
  ┌─ genre-lens-coord ─┐
  │                     ├→ beta-synthesizer → beta-reading-auditor
  └─ craft-lens-coord ──┘        ↑                      │
       (parallel)                └── if 'failed' ───────┘
                                 (up to 3 retries, full re-read)
  if 'passed' → advance to next chapter
END FOR → own status: complete
```

### 2.9 Polish Coordinator (depth-2, per-chapter, no auditor)

**Pattern:** Per-chapter polish → summary, then final assembly

```
FOR each chapter N:
  polisher → summary-generator
END FOR
delivery-assembler → own status: complete
```

No auditor loop. Polish is the terminal creative phase.

---

## 3. Sub-Coordinator Routing Tables

### 3.1 Physical World (depth-3, sequential)

```
geography-builder → culture-builder → history-builder → complete
```

**Sequence rationale:** Geography constrains culture (INV-074). Culture constrains history. Strict dependency chain.

### 3.2 Systems World (depth-3, sequential)

```
magic-system-designer → political-structure-builder → complete
```

**Sequence rationale:** Magic system affects who holds power and how governance works.

### 3.3 Core Characters (depth-3, sequential)

```
protagonist-profiler → romance-arc-designer → complete
```

**Sequence rationale:** Protagonist profiles (wounds, desires) must exist before romance arc between leads can be designed.

### 3.4 Ensemble (depth-3, sequential)

```
supporting-cast-developer → character-voice-designer → complete
```

**Sequence rationale:** Supporting cast roles/relationships must exist before voices can be designed across the full cast.

### 3.5 Structural Design (depth-3, sequential)

```
structure-selector → dual-arc-builder → tension-mapper → complete
```

**Sequence rationale:** Framework selection → dual-arc (needs framework) → tension mapping (needs both arcs). Strict data dependency.

### 3.6 Chapter Design (depth-3, sequential)

```
chapter-outliner → scene-beat-designer → complete
```

**Sequence rationale:** Chapter outlines must exist before scene beats can be designed within them.

### 3.7 Creative Writing (depth-3, sequential, per-chapter)

```
chapter-drafter → pov-voice-maintainer → complete
```

**Sequence rationale:** Draft must exist before POV voice can be verified/adjusted.

### 3.8 Quality Integration (depth-3, sequential, per-chapter)

```
continuity-integrator → craft-enforcer → complete
```

**Sequence rationale:** Continuity check (factual errors) is more fundamental than craft enforcement (technique quality).

### 3.9 Genre Lens (depth-3, parallel)

```
┌─ romance-beta-reader ─┐
│                        ├→ complete
└─ fantasy-beta-reader ──┘
    (parallel)
```

Both genre lens readers are independent — they read the same chapter and produce separate feedback.

### 3.10 Craft Lens (depth-3, parallel)

```
┌─ craft-beta-reader ──────┐
├─ sensitivity-beta-reader ─┼→ complete
└─ originality-beta-reader ─┘
    (all three parallel)
```

All three craft lens readers are independent assessments.

---

## 4. Convergence Bounds Summary

| Bound | Value | Scope |
|-------|-------|-------|
| Auditor gate retries | 3 | Per coordinator, per chapter (where applicable) |
| Revision ↔ beta-reading cycles | 2 | Orchestrator level |
| Per-chapter retry reset | Yes | Each chapter gets independent retry budget |
| Max chapters before checkpoint | 5 | Drafting coordinator checkpoints progress |

---

## 5. Routing Completeness Validation

| Check | Status |
|-------|--------|
| All 20 routing agents have routing entries | ✓ |
| All child result codes mapped to actions | ✓ (including revision-loop transient) |
| All block/failure codes propagate upward | ✓ |
| All loop patterns have retry limits | ✓ (8 auditor loops, all bounded at 3) |
| Per-chapter loops have iteration sources | ✓ (4 per-chapter loops) |
| Parallel groups identified | ✓ (3 groups: lens fan-out, genre readers, craft readers) |
| Transient states documented | ✓ (revision-loop at orchestrator) |
| Re-entry on retry includes full cascade reset | ✓ (depth-3 coordinators reset all descendants) |
