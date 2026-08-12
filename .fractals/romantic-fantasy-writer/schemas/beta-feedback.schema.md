# beta-feedback/{N}/ & beta-synthesis/{N}.json — Schema

Covers the 5 beta lens files and the synthesis output.

---

## beta-feedback/{N}/romance-lens.json

### Purpose
Romance reader lens: emotional satisfaction, chemistry, pacing of romantic beats, HFN/HEA delivery, heat level consistency, relationship believability.

### Writers
- `romantic-fantasy-writer-romance-beta-reader`

### Schema
```json
{
  "chapterNum": "number",
  "lens": "romance",
  "findings": [
    { "id": "ROM-NNN", "severity": "string", "category": "string", "description": "string", "emotionalImpact": "string" }
  ],
  "summary": { "critical": 0, "major": 0, "minor": 0, "emotionalSatisfaction": "number — 1-10" },
  "arcProgressCheck": { "expected": "string", "actual": "string", "assessment": "string" },
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `ROM-NNN`

---

## beta-feedback/{N}/fantasy-lens.json

### Purpose
Fantasy reader lens: worldbuilding immersion, magic system consistency, plot logic, action sequences, world rules adherence.

### Writers
- `romantic-fantasy-writer-fantasy-beta-reader`

### Schema
```json
{
  "chapterNum": "number",
  "lens": "fantasy",
  "findings": [
    { "id": "FAN-NNN", "severity": "string", "category": "string", "description": "string", "worldRuleRef": "string" }
  ],
  "summary": { "critical": 0, "major": 0, "minor": 0, "immersionScore": "number — 1-10" },
  "magicConsistency": "object — Cross-reference magic use against magic-system.json rules",
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `FAN-NNN`

---

## beta-feedback/{N}/craft-lens.json

### Purpose
Craft reader lens: adherence to selected craft tools from craft-profile.json, scene structure, pacing, foreshadowing, technique execution.

### Writers
- `romantic-fantasy-writer-craft-beta-reader`

### Schema
```json
{
  "chapterNum": "number",
  "lens": "craft",
  "findings": [
    { "id": "CRF-NNN", "severity": "string", "category": "string", "craftToolRef": "string — T1-T26", "description": "string" }
  ],
  "summary": { "critical": 0, "major": 0, "minor": 0 },
  "craftToolCompliance": "object — Per-tool compliance assessment",
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `CRF-NNN`

---

## beta-feedback/{N}/sensitivity-lens.json

### Purpose
Sensitivity reader lens: representation, harmful stereotypes, cultural sensitivity, power dynamics in romance, consent portrayal.

### Writers
- `romantic-fantasy-writer-sensitivity-beta-reader`

### Schema
```json
{
  "chapterNum": "number",
  "lens": "sensitivity",
  "findings": [
    { "id": "SEN-NNN", "severity": "string", "category": "string — representation|stereotype|consent|power-dynamic", "description": "string", "suggestedAlternative": "string" }
  ],
  "summary": { "critical": 0, "major": 0, "minor": 0 },
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `SEN-NNN`

---

## beta-feedback/{N}/originality-lens.json

### Purpose
Originality reader lens: flags passages, characters, plot elements, or magic systems that too closely resemble specific published works (INV-023, INV-025). Zero-tolerance plagiarism check.

### Writers
- `romantic-fantasy-writer-originality-beta-reader`

### Schema
```json
{
  "chapterNum": "number",
  "lens": "originality",
  "findings": [
    { "id": "ORIG-NNN", "severity": "string", "category": "string — prose-similarity|character-similarity|plot-similarity|magic-similarity", "description": "string", "resemblesWork": "string", "suggestedDifferentiation": "string" }
  ],
  "summary": { "critical": 0, "major": 0, "minor": 0 },
  "styleSampleCheck": "object|null — Verify transformative-only usage (INV-024)",
  "upstreamRefs": ["string"]
}
```
**ID Scheme**: `ORIG-NNN`

---

## beta-synthesis/{N}.json

### Purpose
Synthesized beta feedback for chapter N: aggregates all 5 lens findings, de-duplicates, prioritizes by severity. Critical and major findings must be addressed (INV-076).

### Writers
- `romantic-fantasy-writer-beta-synthesizer`

### Schema
```json
{
  "chapterNum": "number",
  "aggregatedFindings": [
    {
      "id": "string — BETA-NNN",
      "originalIds": ["string — ROM-001, FAN-003, etc."],
      "severity": "string — critical|major|minor",
      "category": "string",
      "description": "string",
      "requiredAction": "string"
    }
  ],
  "summary": {
    "critical": "number",
    "major": "number",
    "minor": "number",
    "totalAcrossLenses": "number",
    "deduplicated": "number"
  },
  "verdict": "string — accepted|revision-required (revision-required if any critical/major)",
  "revisionPriorities": ["string — Ordered list, critical first"],
  "upstreamRefs": ["string — Relative paths to all 5 beta-feedback/{N}/*.json files"]
}
```
**ID Scheme**: `BETA-NNN`
