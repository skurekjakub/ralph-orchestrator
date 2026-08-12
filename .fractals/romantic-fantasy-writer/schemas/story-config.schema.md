# story-config.json — Schema

## Purpose

User-provided story parameters: idea, target word count, mood/tone, optional style samples, character sketches, world fragments, and constraints. This is the **single input contract** for the entire pipeline. The guide agent writes it; all other agents read it.

## Write Protocol

**create-once** — Written by `romantic-fantasy-writer-guide` during user onboarding. Never modified after creation.

## Writers

- `romantic-fantasy-writer-guide`

## Readers

- All agents (every agent in the system may reference story-config for the original user intent)

## Schema

```json
{
  "storyId": "string — Unique story identifier (e.g., 'book-1')",
  "seriesId": "string|null — Series identifier if part of a series, null for standalone",
  "storyIdea": "string — Core story premise from the user (minimum viable input per INV-067)",
  "targetWordCount": "number — Rough target word count (e.g., 100000) per INV-026",
  "mood": "string|null — Desired mood/tone keywords",
  "characterSketches": "array|null — Optional rough character ideas from user",
  "worldFragments": "array|null — Optional world details from user",
  "styleSamples": "array|null — Optional reference fiction file paths for style extraction (INV-028)",
  "constraints": "object|null — Optional constraints (heat level, content warnings, etc.)",
  "sequelOf": "string|null — storyId of predecessor book if this is a sequel",
  "confirmedByUser": "boolean — Must be true before pipeline launch (INV-080)",
  "createdAt": "string — ISO-8601 timestamp"
}
```

## ID Scheme

N/A — Singleton per story. Located at `stories/{storyId}/story-config.json`.

## Example

```json
{
  "storyId": "crimson-court-1",
  "seriesId": "crimson-court-trilogy",
  "storyIdea": "A fire mage who has lost her powers falls in love with the ice prince she was sent to assassinate, while an ancient magical plague threatens both their kingdoms.",
  "targetWordCount": 85000,
  "mood": "dark romantic, hopeful undertone, political intrigue",
  "characterSketches": [
    { "name": "Kira", "role": "fire mage protagonist", "notes": "Fierce, loyal, hiding vulnerability" },
    { "name": "Prince Aldric", "role": "ice prince love interest", "notes": "Cold exterior, secretly compassionate" }
  ],
  "worldFragments": [
    "Two rival kingdoms separated by a magical barrier",
    "Magic tied to emotional state"
  ],
  "styleSamples": null,
  "constraints": { "heatLevel": "warm", "contentWarnings": ["war violence"] },
  "sequelOf": null,
  "confirmedByUser": true,
  "createdAt": "2025-01-15T10:00:00Z"
}
```
