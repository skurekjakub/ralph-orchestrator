# romance-arc-design.json — Schema

## Purpose

Detailed romance arc between the leads: stages of attraction, key moments, obstacles (internal and external per INV-046/T8), the black moment (INV-045/T7), and resolution (minimum HFN per INV-001). The vulnerability ladder (INV-059/T21) maps the escalation of emotional intimacy.

## Write Protocol

**create-once** — Written by `romantic-fantasy-writer-romance-arc-designer`.

## Writers

- `romantic-fantasy-writer-romance-arc-designer`

## Readers

- Plot architects, chapter-drafter, romance-beta-reader, adversarial-auditor

## Schema

```json
{
  "storyId": "string",
  "leadA": "string — CHAR-NNN of first lead",
  "leadB": "string — CHAR-NNN of second lead",
  "arcType": "string — enemies-to-lovers|friends-to-lovers|forbidden|etc",
  "stages": [
    {
      "stage": "string — awareness|attraction|resistance|surrender|commitment",
      "description": "string",
      "targetChapters": ["number"]
    }
  ],
  "internalResistance": {
    "leadA": { "fear": "string", "wound": "string" },
    "leadB": { "fear": "string", "wound": "string" }
  },
  "vulnerabilityLadder": [
    {
      "step": "number — 1-8",
      "moment": "string — Description of the vulnerability moment",
      "character": "string — CHAR-NNN",
      "emotionalCost": "string — What it costs them (per INV-059/T21)"
    }
  ],
  "blackMoment": {
    "description": "string",
    "triggerEvent": "string",
    "emotionalNadir": "string — (per INV-045/T7)"
  },
  "resolution": "string — HFN|HEA (per INV-001)",
  "upstreamRefs": ["string — Relative paths to characters/*, story-concept.json"]
}
```

## ID Scheme

N/A — Singleton per story.
