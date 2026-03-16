# craft-profile.json — Schema

## Purpose

Story Craft Profile selecting which of the 26 craft tools (T1–T26) apply to this story. Once set, selected tools become **binding invariants** for the rest of production (INV-069, INV-079). Minimum 5 tools required (INV-078).

## Write Protocol

**create-once** — Created by `romantic-fantasy-writer-craft-profile-selector` during the concept phase. Once written, craft-profile.json is immutable — selected tools become binding invariants (INV-069, INV-079). Plotting-phase tool enforcement is handled by the plotting-auditor *reading* the profile, not writing to it.

## Writers

- `romantic-fantasy-writer-craft-profile-selector` (sole writer — concept phase)

## Readers

- All creative agents, all adversarial auditors, craft-knowledge agents

## Schema

```json
{
  "storyId": "string — Story identifier",
  "selectedTools": [
    {
      "toolId": "string — T1 through T26",
      "name": "string — Tool name",
      "rationale": "string — Why this tool suits this story",
      "enforcementPhases": ["string — Phases where this tool is enforced (drafting, revision, etc.)"]
    }
  ],
  "toolCount": "number — Count of selected tools (must be ≥5 per INV-078)",
  "selectionRationale": "string — Why these tools suit this specific story",
  "bindingFrom": "string — Phase at which selection was finalized (concept or plotting)",
  "upstreamRef": "string — Relative path to story-concept.json (INV-029)"
}
```

## Craft Tools Reference (T1–T26)

| ID | Name | Category |
|----|------|----------|
| T1 | Scene Value Shift | Scene structure |
| T2 | Five Commandments of Storytelling | Scene structure |
| T3 | Sequel/Reaction Beats | Scene structure |
| T4 | Try-Fail Cycles | Plot mechanics |
| T5 | Tone Contract | Atmosphere |
| T6 | Stakes Escalation | Plot mechanics |
| T7 | Black Moment | Romance structure |
| T8 | Internal+External Resistance | Conflict |
| T9 | Scene-Type Tone Palettes | Prose |
| T10 | Sanderson's Laws of Magic | Worldbuilding |
| T11 | Kill Your Darlings | Revision |
| T12 | Dual-Arc Interleave | Structure |
| T13 | Tension Mapping | Pacing |
| T14 | MRU (Motivation-Reaction Units) | Prose |
| T15 | Foreshadowing/Payoff Ledger | Craft tracking |
| T16 | Symbolic Motif | Theme |
| T17 | Voice Fingerprinting | Character |
| T18 | Information Asymmetry | Tension |
| T19 | Sensory Detail | Prose |
| T20 | Emotional Throughline | Character |
| T21 | Vulnerability Ladder | Romance |
| T22 | Hook and Close | Chapter structure |
| T23 | Mystery Box | Engagement |
| T24 | Subtext in Dialogue | Dialogue |
| T25 | Thematic Argument | Theme |
| T26 | Sensory Signature | Character |

## ID Scheme

N/A — Singleton per story.

## Example

```json
{
  "storyId": "crimson-court-1",
  "selectedTools": [
    { "toolId": "T1", "name": "Scene Value Shift", "rationale": "Every scene must shift emotional or plot state", "enforcementPhases": ["drafting", "revision"] },
    { "toolId": "T7", "name": "Black Moment", "rationale": "Enemies-to-lovers demands a devastating black moment", "enforcementPhases": ["plotting", "drafting"] },
    { "toolId": "T8", "name": "Internal+External Resistance", "rationale": "Both leads need compelling internal wounds blocking their connection", "enforcementPhases": ["character", "plotting", "drafting"] },
    { "toolId": "T10", "name": "Sanderson's Laws of Magic", "rationale": "Hard magic system needed for the plague subplot", "enforcementPhases": ["worldbuilding", "drafting"] },
    { "toolId": "T17", "name": "Voice Fingerprinting", "rationale": "Dual POV requires distinctly different voices", "enforcementPhases": ["style", "drafting", "revision"] },
    { "toolId": "T21", "name": "Vulnerability Ladder", "rationale": "Enemies-to-lovers arc built on increasing vulnerability", "enforcementPhases": ["character", "drafting"] }
  ],
  "toolCount": 6,
  "selectionRationale": "Enemies-to-lovers with hard magic system needs strong scene structure, voice distinction, and romance mechanics.",
  "bindingFrom": "concept",
  "upstreamRef": "story-concept.json"
}
```
