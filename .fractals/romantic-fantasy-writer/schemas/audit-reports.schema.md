# audit-reports/{phase}/{gate-id}.json — Schema

## Purpose

Adversarial audit report per phase gate (INV-027). Every creative phase has a gate that challenges consistency, enforces craft tools, and applies kill-your-darlings (INV-081). Blocks progression on critical findings.

## Write Protocol

**create-once-per-gate** — One file per audit attempt. On retry, a new file is created with an incremented gate ID.

## Writers

- Phase-specific auditors: `romantic-fantasy-writer-concept-auditor`, `romantic-fantasy-writer-worldbuilding-auditor`, `romantic-fantasy-writer-character-auditor`, `romantic-fantasy-writer-plotting-auditor`, `romantic-fantasy-writer-style-auditor`, `romantic-fantasy-writer-drafting-auditor`, `romantic-fantasy-writer-revision-auditor`, `romantic-fantasy-writer-beta-reading-auditor`

## Readers

- Phase coordinator (for routing decision), revision agents

## Schema

```json
{
  "gateId": "string — GATE-{phase}-NNN (e.g., GATE-concept-001)",
  "phase": "string — Creative phase being audited",
  "findings": [
    {
      "id": "string — AUD-NNN",
      "severity": "string — critical|major|minor",
      "category": "string — consistency|craft-compliance|darling|deus-ex-machina|continuity",
      "description": "string",
      "artifactRef": "string — Which artifact contains the issue",
      "suggestedFix": "string"
    }
  ],
  "summary": {
    "critical": "number",
    "major": "number",
    "minor": "number"
  },
  "verdict": "string — pass|revise|block (block if any critical findings)",
  "craftToolEnforcement": [
    {
      "toolId": "string — T1-T26",
      "enforced": "boolean",
      "violations": ["string"]
    }
  ],
  "darlingsIdentified": ["string — Kill-your-darlings candidates per INV-081"],
  "upstreamRefs": ["string — Relative paths to all artifacts reviewed"]
}
```

## ID Scheme

- Gate: `GATE-{phase}-NNN` (e.g., `GATE-concept-001`, `GATE-worldbuilding-002`)
- Finding: `AUD-NNN` within each gate

## Verdict Rules

| Condition | Verdict |
|-----------|---------|
| Any critical findings | `block` |
| Only major/minor findings | `revise` |
| No major or critical findings | `pass` |
