# plot-structure.json & dual-arc-timeline.json & tension-map.json — Schema

---

## plot-structure.json

### Purpose
Overall story structure: selected framework, act boundaries, key plot beats, subplot registry, stakes escalation (INV-044/T6). The architectural blueprint for chapter outlines.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-structure-selector` and `romantic-fantasy-writer-dual-arc-builder`.

### Schema
```json
{
  "storyId": "string",
  "framework": "string — three-act|save-the-cat|heros-journey|custom",
  "acts": [
    {
      "act": "number — 1-3",
      "startChapter": "number",
      "endChapter": "number",
      "thematicFocus": "string",
      "stakesLevel": "string"
    }
  ],
  "keyBeats": [
    {
      "id": "string — BEAT-NNN",
      "name": "string",
      "chapter": "number",
      "type": "string — fantasy|romance|both",
      "description": "string"
    }
  ],
  "subplots": [
    {
      "id": "string — SUB-NNN",
      "name": "string",
      "characters": ["string — CHAR-NNN"],
      "startChapter": "number",
      "resolution": "string",
      "type": "string"
    }
  ],
  "tryFailCycles": [
    {
      "challenge": "string",
      "attempts": [
        { "chapter": "number", "outcome": "string — fail|partial|succeed" }
      ]
    }
  ],
  "stakesEscalation": [
    {
      "act": "number",
      "whatIsAtRisk": "string",
      "comparedToLast": "string"
    }
  ],
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `BEAT-NNN`, `SUB-NNN`

---

## dual-arc-timeline.json

### Purpose
Fantasy and romance arcs plotted in parallel (INV-050/T12). Maps where each arc's beats land per chapter, showing reinforcement and counterpoint patterns.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-dual-arc-builder`.

### Schema
```json
{
  "storyId": "string",
  "chapters": [
    {
      "chapter": "number",
      "fantasyBeat": "string|null — BEAT-NNN reference",
      "romanceBeat": "string|null — BEAT-NNN reference",
      "relationship": "string — reinforce|counterpoint|independent"
    }
  ],
  "interleaveRatio": {
    "fantasyDominant": ["number — chapter numbers"],
    "romanceDominant": ["number — chapter numbers"],
    "balanced": ["number — chapter numbers"]
  },
  "upstreamRefs": ["string"]
}
```

---

## tension-map.json

### Purpose
Tension rise-and-fall chart across all chapters (INV-051/T13). Ensures pacing variation (INV-020) — no more than 3 consecutive high-tension chapters.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-tension-mapper`.

### Schema
```json
{
  "storyId": "string",
  "chapters": [
    {
      "chapter": "number",
      "tensionLevel": "number — 1-10",
      "tensionType": "string — action|emotional|mystery|romantic",
      "pacingNote": "string"
    }
  ],
  "peaksAndValleys": [
    {
      "chapter": "number",
      "type": "string — peak|valley",
      "significance": "string"
    }
  ],
  "consecutiveHighCount": "number — Max consecutive high-tension chapters (should ≤3)",
  "upstreamRef": "string"
}
```
