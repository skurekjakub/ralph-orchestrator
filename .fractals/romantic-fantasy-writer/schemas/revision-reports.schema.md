# revision-reports/{N}/ — Schema

Covers `developmental.json`, `line-edit.json`, and `copy-edit.json`.

---

## revision-reports/{N}/developmental.json

### Purpose
Developmental edit findings for chapter N: plot holes, pacing issues, motivation gaps, arc satisfaction, thematic drift. First of three mandatory review passes (INV-013).

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-developmental-editor`.

### Schema
```json
{
  "chapterNum": "number",
  "findings": [
    {
      "id": "string — DEV-NNN",
      "severity": "string — critical|major|minor",
      "category": "string — plot-hole|pacing|motivation|arc|theme|etc",
      "description": "string",
      "location": "string — Line/scene reference",
      "suggestedFix": "string"
    }
  ],
  "summary": {
    "critical": "number",
    "major": "number",
    "minor": "number",
    "overallAssessment": "string"
  },
  "darlingsIdentified": ["string — Kill-your-darlings candidates per INV-049/T11, INV-081"],
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `DEV-NNN`

---

## revision-reports/{N}/line-edit.json

### Purpose
Line edit findings: prose quality, voice distinctness, cliché detection, show-vs-tell (INV-005), repetition, dialogue naturalism (INV-019). Second mandatory pass.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-line-editor`.

### Schema
```json
{
  "chapterNum": "number",
  "findings": [
    {
      "id": "string — LINE-NNN",
      "severity": "string — critical|major|minor",
      "category": "string — voice|prose|cliché|show-tell|repetition|dialogue",
      "description": "string",
      "lineRef": "string",
      "suggestedFix": "string"
    }
  ],
  "summary": {
    "critical": "number",
    "major": "number",
    "minor": "number"
  },
  "voiceConsistency": {
    "charId": "string — CHAR-NNN",
    "deviations": [
      { "where": "string", "expected": "string", "actual": "string" }
    ]
  },
  "proseQualityMetrics": {
    "clichéCount": "number",
    "adverbCount": "number",
    "passiveVoicePercent": "number",
    "showTellRatio": "string — Per INV-017"
  },
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `LINE-NNN`

---

## revision-reports/{N}/copy-edit.json

### Purpose
Copy edit findings: grammar, naming consistency, timeline accuracy, factual accuracy within world rules (INV-018), formatting. Third mandatory pass.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-copy-editor`.

### Schema
```json
{
  "chapterNum": "number",
  "findings": [
    {
      "id": "string — COPY-NNN",
      "severity": "string — critical|major|minor",
      "category": "string — grammar|naming|timeline|factual|formatting",
      "description": "string",
      "lineRef": "string",
      "correction": "string"
    }
  ],
  "summary": {
    "critical": "number",
    "major": "number",
    "minor": "number"
  },
  "continuityChecks": ["object — Cross-reference results against continuity-tracker.json"],
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `COPY-NNN`
