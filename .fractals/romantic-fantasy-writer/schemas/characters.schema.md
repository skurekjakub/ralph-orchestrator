# characters/*.json — Schema

Covers `characters/index.json` and `characters/{CHAR-NNN}.json`.

---

## characters/index.json

### Purpose
Character roster: all named characters with roles, relationships, and POV status. Master index cross-referencing per-character files.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-protagonist-profiler` and `romantic-fantasy-writer-supporting-cast-developer`.

### Schema
```json
{
  "storyId": "string",
  "characters": [
    {
      "id": "string — CHAR-NNN",
      "name": "string",
      "role": "string — lead-romantic|lead-fantasy|antagonist|supporting|mentor|etc",
      "isPOV": "boolean",
      "arcType": "string — Arc type summary",
      "characterFile": "string — Relative path to characters/{CHAR-NNN}.json"
    }
  ],
  "relationshipWeb": [
    {
      "from": "string — CHAR-NNN",
      "to": "string — CHAR-NNN",
      "type": "string — romantic|rival|mentor|ally|family|etc",
      "evolution": "string — How the relationship changes"
    }
  ],
  "povCount": "number — Number of POV characters",
  "upstreamRefs": ["string — Relative paths to story-concept.json, world-bible/*"]
}
```
**ID Scheme**: `CHAR-NNN`

---

## characters/{CHAR-NNN}.json

### Purpose
Per-character profile: psychological wound, desire, arc, voice parameters, sensory signature. One file per named character (INV-074). Voice parameters enable INV-003/INV-034 verification.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-protagonist-profiler` (leads) or `romantic-fantasy-writer-supporting-cast-developer` (ensemble).

### Schema
```json
{
  "id": "string — CHAR-NNN",
  "name": "string",
  "role": "string — lead-romantic|lead-fantasy|antagonist|supporting|mentor|etc",
  "isPOV": "boolean",
  "psychologicalProfile": {
    "wound": "string — Core emotional wound",
    "desire": "string — What they want (external goal)",
    "fear": "string — What they fear most",
    "lie": "string — False belief they hold",
    "ghost": "string — Backstory event that created the wound",
    "need": "string — What they actually need (internal goal)"
  },
  "arc": {
    "type": "string — positive|negative|flat|etc",
    "startState": "string — Who they are at chapter 1",
    "endState": "string — Who they become",
    "turningPoints": ["object — Key arc moments"]
  },
  "voiceFingerprint": {
    "vocabularyLevel": "string — simple|moderate|elevated|archaic",
    "sentenceLength": "string — short|mixed|long",
    "metaphorDensity": "string — sparse|moderate|rich",
    "emotionalRegister": "string — guarded|open|volatile|etc",
    "thoughtPatterns": "string — How they process internally",
    "dialectMarkers": "string — Speech patterns, dialect hints (per INV-055/T17)"
  },
  "sensorySig": {
    "dominantChannel": "string — visual|auditory|tactile|olfactory|gustatory",
    "signature": "string — Their unique sensory association (per INV-064/T26)",
    "emotionalTriggers": ["string — Sensory experiences tied to emotion"]
  },
  "relationships": [
    {
      "withCharId": "string — CHAR-NNN",
      "type": "string",
      "dynamicArc": "string — How the relationship evolves"
    }
  ],
  "physicalDescription": "object — Appearance for continuity",
  "agency": "string — How this character drives plot through active choices (INV-008)",
  "upstreamRefs": ["string — Relative paths to world-bible/*, story-concept.json"]
}
```
**ID Scheme**: `CHAR-NNN` — sequential numbering (CHAR-001, CHAR-002, etc.)
