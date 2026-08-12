# Cross-Cutting Tracker Artifacts — Schema

Covers `continuity-tracker.json`, `foreshadowing-ledger.json`, `information-asymmetry-map.json`, `mystery-box-inventory.json`, `emotional-throughline.json`, and `symbolic-motif-registry.json`.

All cross-cutting trackers use **read-modify-write** protocol and are updated incrementally after each chapter.

---

## continuity-tracker.json

### Purpose
Running continuity document updated after every chapter draft (INV-011). Tracks character locations, timeline, knowledge state, active promises, naming consistency.

### Writers
- `romantic-fantasy-writer-continuity-tracker`, `romantic-fantasy-writer-chapter-drafter`

### Schema
```json
{
  "storyId": "string",
  "timeline": [
    { "event": "string", "chapter": "number", "inWorldTime": "string", "characters": ["CHAR-NNN"] }
  ],
  "characterPositions": {
    "<CHAR-NNN>": { "lastKnownLocation": "string", "asOfChapter": "number" }
  },
  "characterKnowledge": {
    "<CHAR-NNN>": [{ "fact": "string", "learnedInChapter": "number" }]
  },
  "activePromises": [
    {
      "id": "string — PROM-NNN",
      "type": "string — chekhov|foreshadow|subplot",
      "description": "string",
      "plantedChapter": "number",
      "status": "string — open|resolved",
      "resolvedChapter": "number|null"
    }
  ],
  "namingRegistry": "object — Canonical spellings of all names, places, terms",
  "lastUpdatedChapter": "number"
}
```
**ID Scheme**: `PROM-NNN`

---

## foreshadowing-ledger.json

### Purpose
Maps every foreshadowing plant to its payoff (INV-053/T15). Tracks completeness.

### Writers
- `romantic-fantasy-writer-chapter-drafter`, `romantic-fantasy-writer-craft-tracker`

### Schema
```json
{
  "storyId": "string",
  "entries": [
    {
      "id": "string — FS-NNN",
      "plant": { "description": "string", "chapter": "number", "lineRef": "string" },
      "payoff": { "description": "string", "chapter": "number", "lineRef": "string" },
      "type": "string — foreshadow|red-herring|callback",
      "status": "string — planted|paid-off|abandoned"
    }
  ],
  "completionRate": "number — Target: 100% excluding intentional red herrings",
  "lastUpdatedChapter": "number"
}
```
**ID Scheme**: `FS-NNN`

---

## information-asymmetry-map.json

### Purpose
Tracks character-vs-reader knowledge (INV-056/T18). Critical for dramatic irony.

### Writers
- `romantic-fantasy-writer-continuity-tracker`, `romantic-fantasy-writer-chapter-drafter`

### Schema
```json
{
  "storyId": "string",
  "facts": [
    {
      "id": "string — FACT-NNN",
      "fact": "string",
      "revealedToReader": { "chapter": "number" },
      "knownBy": [{ "charId": "CHAR-NNN", "learnedChapter": "number" }],
      "unknownBy": ["CHAR-NNN"]
    }
  ],
  "dramaticIronyPoints": [
    {
      "factId": "FACT-NNN",
      "readerKnows": true,
      "characterDoesnt": "CHAR-NNN",
      "activeFromChapter": "number",
      "resolvedChapter": "number|null"
    }
  ],
  "lastUpdatedChapter": "number"
}
```
**ID Scheme**: `FACT-NNN`

---

## mystery-box-inventory.json

### Purpose
Tracks active unresolved reader questions (INV-061/T23). Target range: 3-7 active boxes.

### Writers
- `romantic-fantasy-writer-craft-tracker`, `romantic-fantasy-writer-chapter-drafter`

### Schema
```json
{
  "storyId": "string",
  "boxes": [
    {
      "id": "string — MB-NNN",
      "question": "string",
      "openedChapter": "number",
      "closedChapter": "number|null",
      "importance": "string — major|minor",
      "status": "string — open|closed"
    }
  ],
  "activeCount": "number — Target: 3-7",
  "perChapterSnapshot": [
    { "chapter": "number", "activeCount": "number", "opened": ["MB-NNN"], "closed": ["MB-NNN"] }
  ],
  "lastUpdatedChapter": "number"
}
```
**ID Scheme**: `MB-NNN`

---

## emotional-throughline.json

### Purpose
Charts each lead's emotional state per chapter boundary (INV-058/T20). Enforces emotional variety (INV-037) — no same state for 3+ consecutive chapters.

### Writers
- `romantic-fantasy-writer-chapter-drafter`, `romantic-fantasy-writer-craft-tracker`

### Schema
```json
{
  "storyId": "string",
  "characters": {
    "<CHAR-NNN>": [
      {
        "chapter": "number",
        "emotionalState": "string — Granular label",
        "dominantEmotion": "string",
        "intensity": "number — 1-10",
        "trigger": "string"
      }
    ]
  },
  "varietyCheck": {
    "<CHAR-NNN>": {
      "maxConsecutiveSameState": "number",
      "violations": [{ "chapters": ["number"], "state": "string" }]
    }
  },
  "lastUpdatedChapter": "number"
}
```

---

## symbolic-motif-registry.json

### Purpose
Tracks 3-5 recurring symbols/motifs assigned to thematic pillars (INV-054/T16). Records appearances and evolution.

### Writers
- `romantic-fantasy-writer-craft-tracker`

### Schema
```json
{
  "storyId": "string",
  "motifs": [
    {
      "id": "string — MOT-NNN",
      "symbol": "string",
      "linkedTheme": "string — Thematic pillar reference",
      "appearances": [
        { "chapter": "number", "context": "string", "evolution": "string" }
      ],
      "targetDensity": "string"
    }
  ],
  "lastUpdatedChapter": "number"
}
```
**ID Scheme**: `MOT-NNN`
