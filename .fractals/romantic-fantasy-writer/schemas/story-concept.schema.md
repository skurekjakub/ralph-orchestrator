# story-concept.json — Schema

## Purpose

Crystallized story concept: refined premise, thematic pillars, genre balance, comp titles, target audience, and high-level arc shapes. The foundational document all downstream phases reference.

## Write Protocol

**create-once** — Written by `romantic-fantasy-writer-concept-developer`. Never modified after creation.

## Writers

- `romantic-fantasy-writer-concept-developer`

## Readers

- All downstream creative agents, adversarial auditors, series-kb-manager

## Schema

```json
{
  "storyId": "string — Story identifier from story-config.json",
  "refinedPremise": "string — One-paragraph distilled premise",
  "thematicPillars": [
    {
      "id": "string — Pillar identifier",
      "theme": "string — Theme name",
      "question": "string — Thematic question explored",
      "argument": "string — Story's argument/answer (per INV-063/T25)"
    }
  ],
  "genreBalance": {
    "fantasyWeight": "number — 0-1, must not be zero (INV-001)",
    "romanceWeight": "number — 0-1, must not be zero (INV-001)"
  },
  "compTitles": ["string — 2-4 comparable published titles with brief rationale"],
  "targetAudience": "string — Target reader profile",
  "heatLevel": "string — sweet|warm|steamy|explicit",
  "fantasySubgenre": "string — epic|urban|portal|etc",
  "toneContract": {
    "primary": "string — Primary tone",
    "secondary": "string — Secondary tone",
    "forbiddenTones": ["string — Tones to avoid (per INV-043/T5)"]
  },
  "romanceArcType": "string — enemies-to-lovers|friends-to-lovers|forbidden|etc",
  "estimatedChapterCount": "number — Based on targetWordCount",
  "upstreamRef": "string — Relative path to story-config.json (INV-029)"
}
```

## ID Scheme

N/A — Singleton per story.

## Example

```json
{
  "storyId": "crimson-court-1",
  "refinedPremise": "A disgraced fire mage must navigate the treacherous ice court while falling for the very prince she was sent to kill, as an ancient plague awakens magic that consumes those who use it.",
  "thematicPillars": [
    { "id": "TP-1", "theme": "Trust after betrayal", "question": "Can enemies learn to trust?", "argument": "Trust is rebuilt through vulnerability, not proof" },
    { "id": "TP-2", "theme": "Power and sacrifice", "question": "What is magic worth?", "argument": "True power comes from choosing what to protect" }
  ],
  "genreBalance": { "fantasyWeight": 0.55, "romanceWeight": 0.45 },
  "compTitles": ["From Blood and Ash meets The Cruel Prince"],
  "targetAudience": "Adult romantic fantasy readers, 18-35",
  "heatLevel": "warm",
  "fantasySubgenre": "epic",
  "toneContract": { "primary": "dark romantic", "secondary": "hopeful", "forbiddenTones": ["comedic", "grimdark"] },
  "romanceArcType": "enemies-to-lovers",
  "estimatedChapterCount": 25,
  "upstreamRef": "story-config.json"
}
```
