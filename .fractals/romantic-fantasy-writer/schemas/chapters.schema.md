# chapters/{N}/ — Schema

Covers `draft.md`, `metadata.json`, `revised.md`, and `final.md`.

---

## chapters/{N}/draft.md

### Purpose
Chapter prose draft. Written sequentially (INV-012) — chapter N+1 cannot start until N is complete.

### Write Protocol
**read-modify-write** — Sequential editing pipeline with 4 writers:
1. `romantic-fantasy-writer-chapter-drafter` (create — initial prose draft)
2. `romantic-fantasy-writer-pov-voice-maintainer` (refine — POV voice consistency pass)
3. `romantic-fantasy-writer-continuity-integrator` (fix — continuity corrections)
4. `romantic-fantasy-writer-craft-enforcer` (enforce — craft tool compliance pass)

### Multi-Writer Rules
- Writers execute in the order listed above within the creative-writing-coordinator → quality-integration-coordinator pipeline.
- Each writer reads the current state of `draft.md`, applies its domain-specific changes, and writes back.
- The `draftVersion` frontmatter field increments with each writer's pass (1 → 2 → 3 → 4).
- On auditor rejection (`drafting-auditor` returns `failed`), the coordinator resets all four writers and the pipeline re-runs from chapter-drafter.

### Format
```markdown
---
chapterNum: 1
pov: CHAR-001
wordCount: 3500
sceneCount: 3
draftVersion: 1
---

# Chapter 1: [Title]

[Prose content with scene breaks marked by ----]
```

---

## chapters/{N}/metadata.json

### Purpose
Per-chapter structured metadata: craft tool compliance, scene value shifts, emotional state tracking.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-chapter-drafter`.

### Schema
```json
{
  "chapterNum": "number",
  "pov": "string — CHAR-NNN",
  "wordCount": "number",
  "sceneBreakdown": [
    {
      "sceneId": "string — SCN-NNN",
      "goal": "string",
      "conflict": "string",
      "disaster": "string",
      "valueShiftFrom": "string",
      "valueShiftTo": "string",
      "sequelReaction": "string — Per INV-041/T3"
    }
  ],
  "craftToolCompliance": {
    "<toolId>": {
      "compliant": "boolean",
      "evidence": "string",
      "notes": "string"
    }
  },
  "foreshadowingPlants": [
    {
      "plantId": "string",
      "description": "string",
      "targetPayoffChapter": "number"
    }
  ],
  "emotionalState": {
    "povStart": "string",
    "povEnd": "string",
    "dominantEmotion": "string — Per INV-037, INV-058/T20"
  },
  "upstreamRefs": ["string"]
}
```

---

## chapters/{N}/revised.md

### Purpose
Revised chapter incorporating all three edit passes. Every change must cite which finding prompted it (INV-014).

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-chapter-reviser`.

### Format
```markdown
---
chapterNum: 1
pov: CHAR-001
wordCount: 3400
revisionVersion: 1
findingsAddressed: [DEV-001, DEV-003, LINE-002, LINE-005, COPY-001]
---

[Revised prose]
```

---

## chapters/{N}/final.md

### Purpose
Final polished chapter: proofread, formatted, ready for delivery.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-polisher`.

### Format
```markdown
---
chapterNum: 1
pov: CHAR-001
wordCount: 3350
finalVersion: 1
passedAllGates: true
---

[Final prose]
```
