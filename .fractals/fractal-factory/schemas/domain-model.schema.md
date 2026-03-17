# domain-model.json Schema

Shared artifact populated incrementally by discovery specialists (Pass 1). Each specialist reads the current state and adds entries to its section via read-modify-write.

## Schema

```json
{
  "version": 1,
  "lastUpdated": "<ISO-8601-UTC>",

  "subdomains": [
    {
      "id": "SD-001",
      "name": "<string, short identifier>",
      "description": "<string, what this subdomain covers>",
      "sourceFiles": ["<paths to relevant source material>"],
      "complexity": "<low | medium | high>",
      "estimatedAgentCount": "<number, how many specialists this subdomain might need>",
      "crossCuttingConcerns": ["<references to concerns that span subdomains>"],
      "discoveredBy": "fractal-factory-domain-scanner"
    }
  ],

  "existingAssets": [
    {
      "id": "ASSET-001",
      "name": "<string, asset name>",
      "type": "<skill | agent-template | mcp-server | shared-include | tool>",
      "path": "<string, relative path to the asset>",
      "description": "<string, what this asset does>",
      "reusability": "<direct | adaptable | reference-only>",
      "relevantSubdomains": ["SD-001"],
      "discoveredBy": "fractal-factory-asset-auditor"
    }
  ],

  "exemplarPatterns": [
    {
      "id": "PATTERN-001",
      "name": "<string, pattern name>",
      "source": "<string, which exemplar this came from>",
      "category": "<hierarchy | naming | artifact | routing | anti-laziness | convergence>",
      "description": "<string, what the pattern is>",
      "applicability": "<string, when/where this pattern should be applied>",
      "discoveredBy": "fractal-factory-exemplar-analyzer"
    }
  ]
}
```

## Read-Modify-Write Protocol

Each discovery specialist:
1. Reads the current `domain-model.json`
2. Adds entries ONLY to its designated section (identified by `discoveredBy` field)
3. Preserves ALL entries from other agents
4. Updates `lastUpdated` timestamp
5. Does NOT modify the `version` field
6. Writes the file back

If an agent is re-invoked (gap-hunting re-entry), it:
- Reads existing entries it previously wrote (matched by `discoveredBy`)
- May update existing entries (e.g., increase confidence)
- May add new entries
- Preserves entries from all other agents

## ID Schemes

| Section | Prefix | Example |
|---|---|---|
| Subdomains | `SD-` | `SD-001`, `SD-002` |
| Existing Assets | `ASSET-` | `ASSET-001`, `ASSET-002` |
| Exemplar Patterns | `PATTERN-` | `PATTERN-001`, `PATTERN-002` |

IDs are assigned sequentially within each section. On re-entry, new entries continue from the highest existing ID.

## Invariants (Separate Storage)

**Invariants are NOT stored in this file.** They live in per-classification files under `.fractal-factory/invariants/`:

| File | Classification |
|---|---|
| `invariants/behavioral.json` | Rules about what the system must or must not do |
| `invariants/structural.json` | Rules about how the system is organized |
| `invariants/quality.json` | Rules about output quality standards |
| `invariants/workflow.json` | Rules about process ordering or handoff |

Each file uses the envelope:
```json
{
  "classification": "behavioral",
  "lastUpdated": "<ISO-8601-UTC>",
  "entries": [
    {
      "id": "INV-001",
      "description": "<string, the behavioral rule>",
      "confidence": "<0.3-1.0>",
      "source": "<which input file this came from>",
      "affectedSubdomains": ["SD-001", "SD-003"],
      "verificationStrategy": "<how to check this invariant holds>",
      "discoveredBy": "fractal-factory-invariant-extractor"
    }
  ]
}
```

Invariant IDs (`INV-` prefix) are globally unique across all 4 classification files. The `fractal-factory-invariant-extractor` is the sole writer. See the invariant-extractor agent prompt for the full write protocol.

## Confidence Scoring

Applies to invariants in `invariants/*.json`.

| Range | Meaning |
|---|---|
| 0.9–1.0 | Explicitly stated in source material |
| 0.7–0.8 | Strongly implied by multiple source passages |
| 0.5–0.6 | Inferred from context, may need verification |
| 0.3–0.4 | Speculative, based on patterns in other systems |

Invariants below 0.5 confidence are flagged for user verification in the final report.
