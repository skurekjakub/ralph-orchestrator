# world-bible/*.json — Schema

Covers all 5 world-bible subcategory files: geography, magic-system, politics, culture, history.

---

## world-bible/geography.json

### Purpose
Geography and settings: locations, maps, climate zones, key landmarks, travel distances/methods. Independently loadable subcategory file (INV-074).

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-geography-builder`.

### Schema
```json
{
  "storyId": "string",
  "locations": [
    {
      "id": "string — LOC-NNN",
      "name": "string",
      "type": "string — city|region|landmark|wilderness|etc",
      "description": "string",
      "climate": "string",
      "significance": "string — plot/character significance",
      "connectedTo": ["string — LOC-NNN references"]
    }
  ],
  "travelRules": "object — How characters move between locations, travel times",
  "upstreamRef": "string — Relative path to story-concept.json"
}
```
**ID Scheme**: `LOC-NNN`

---

## world-bible/magic-system.json

### Purpose
Magic system design following Sanderson's Laws (INV-048/T10): rules, costs, limitations, practitioners, power levels. Hard magic requires clear rules before conflict resolution.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-magic-system-designer`.

### Schema
```json
{
  "storyId": "string",
  "systemName": "string",
  "hardnessLevel": "string — hard|soft|hybrid",
  "rules": [
    {
      "id": "string — MAG-NNN",
      "rule": "string",
      "cost": "string",
      "limitation": "string",
      "knownBy": ["string — CHAR-NNN references"]
    }
  ],
  "powerLevels": ["object — Tiered power levels"],
  "forbiddenUses": ["string — What magic cannot do (prevents deus ex machina per INV-009)"],
  "upstreamRef": "string"
}
```
**ID Scheme**: `MAG-NNN`

---

## world-bible/politics.json

### Purpose
Political and power structures: factions, governance, alliances, conflicts, power dynamics.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-political-structure-builder`.

### Schema
```json
{
  "storyId": "string",
  "factions": [
    {
      "id": "string — FAC-NNN",
      "name": "string",
      "type": "string",
      "goals": "string",
      "allies": ["string — FAC-NNN"],
      "enemies": ["string — FAC-NNN"],
      "leader": "string"
    }
  ],
  "governanceSystems": ["object"],
  "powerDynamics": "string — Narrative description of political tension",
  "upstreamRef": "string"
}
```
**ID Scheme**: `FAC-NNN`

---

## world-bible/culture.json

### Purpose
Cultural norms: customs, religions, social hierarchies, daily life, naming conventions, festivals, taboos. Prevents anachronisms per INV-018.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-culture-builder`.

### Schema
```json
{
  "storyId": "string",
  "cultures": [
    {
      "id": "string — CUL-NNN",
      "name": "string",
      "customs": "string",
      "socialStructure": "string",
      "religion": "string",
      "taboos": ["string"],
      "naming": "object — Naming conventions for this culture"
    }
  ],
  "socialRules": ["string — Acceptable/unacceptable behaviors"],
  "upstreamRef": "string"
}
```
**ID Scheme**: `CUL-NNN`

---

## world-bible/history.json

### Purpose
World history timeline: key events, legends, era boundaries, historical figures. Establishes backstory for foreshadowing.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-history-builder`.

### Schema
```json
{
  "storyId": "string",
  "eras": [
    {
      "id": "string — ERA-NNN",
      "name": "string",
      "startYear": "number",
      "endYear": "number",
      "keyEvents": ["string"]
    }
  ],
  "legends": ["object — Myths and legends characters might reference"],
  "historicalFigures": ["object — Important figures from the past"],
  "upstreamRef": "string"
}
```
**ID Scheme**: `ERA-NNN`
