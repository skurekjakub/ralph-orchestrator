# chapter-outlines/{N}.json — Schema

## Purpose

Per-chapter outline: POV character, scene goals, conflict, emotional arc, beat assignments. Must exist before drafting begins (INV-010 Outline Before Draft). One file per chapter.

## Write Protocol

**create-once** — Written by `romantic-fantasy-writer-chapter-outliner` and `romantic-fantasy-writer-scene-beat-designer`.

## Writers

- `romantic-fantasy-writer-chapter-outliner`
- `romantic-fantasy-writer-scene-beat-designer`

## Readers

- `romantic-fantasy-writer-chapter-drafter`, continuity-tracker, adversarial-auditor

## Schema

```json
{
  "chapterNum": "number — Chapter number",
  "pov": "string — CHAR-NNN of the POV character for this chapter",
  "povTransitionMotivation": "string|null — Why POV switches here (INV-072), null if same as previous",
  "scenes": [
    {
      "id": "string — SCN-NNN",
      "goal": "string — Scene goal",
      "conflict": "string — Source of conflict",
      "disaster": "string — How it goes wrong (or partially right)",
      "valueShift": "string — What changes emotionally/plot-wise",
      "fiveCommandments": "object — Per INV-040/T2: inciting incident, complication, crisis, climax, resolution"
    }
  ],
  "emotionalArc": {
    "startState": "string — POV character emotional state at chapter start",
    "endState": "string — Emotional state at chapter end",
    "pivotMoment": "string — Key emotional turning point"
  },
  "fantasyBeats": ["string — Plot beats from dual-arc-timeline"],
  "romanceBeats": ["string — Romance beats for this chapter"],
  "hookType": "string — Opening hook type per INV-060/T22",
  "closeType": "string — Closing technique per INV-060/T22",
  "targetWordCount": "number — Target words for this chapter",
  "upstreamRefs": ["string — Relative paths to plot-structure.json, characters/{pov}.json, dual-arc-timeline.json"]
}
```

## ID Scheme

`SCN-NNN` within each chapter. Files located at `plot/chapter-outlines/{N}.json` where N is zero-padded (001, 002, etc.).
