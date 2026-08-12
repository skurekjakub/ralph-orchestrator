# style-guide.json — Schema

## Purpose

Prose style specification: voice calibration per POV character, scene-type tone palettes, prose rules (metaphor density, sentence rhythm, dialogue ratio). Based on style sample analysis if provided (INV-028).

## Write Protocol

**create-once** — Written by `romantic-fantasy-writer-style-guide-writer`.

## Writers

- `romantic-fantasy-writer-style-guide-writer`

## Readers

- `romantic-fantasy-writer-chapter-drafter`, line-editor, voice-verifier, adversarial-auditor

## Schema

```json
{
  "storyId": "string",
  "globalStyle": {
    "proseRegister": "string — formal|conversational|literary|etc",
    "narrativeDistance": "string — close-third|deep-pov|omniscient|etc",
    "paragraphCadence": "string — Short/punchy, flowing, mixed",
    "dialogueToNarrationRatio": "string — target ratio"
  },
  "perPOVCalibration": [
    {
      "charId": "string — CHAR-NNN",
      "voiceFingerprint": "object — Calibrated from character profile (INV-055/T17)",
      "specificRules": ["string — POV-specific prose rules"],
      "exampleSentences": ["string — Style exemplars"]
    }
  ],
  "sceneTypePalettes": {
    "action": { "tempo": "string", "sentenceLength": "string" },
    "romantic": { "tempo": "string", "sentenceLength": "string" },
    "introspective": { "tempo": "string", "sentenceLength": "string" },
    "dialogue": { "tempo": "string", "sentenceLength": "string" }
  },
  "proseQualityFloor": {
    "maxClichesPerChapter": "number — Per INV-017",
    "maxAdverbsPerPage": "number",
    "maxPassiveVoicePercent": "number",
    "showTellRatioTarget": "string"
  },
  "styleSampleAnalysis": "object|null — Extracted abstract patterns if style samples provided (INV-024)",
  "toneContract": "object — Expanded tone contract from story-concept (INV-043/T5)",
  "upstreamRefs": ["string"]
}
```

## ID Scheme

N/A — Singleton per story.
