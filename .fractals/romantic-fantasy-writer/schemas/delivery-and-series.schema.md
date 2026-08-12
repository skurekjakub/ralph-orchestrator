# delivery-report.json & chapter-summaries/{N}.json & series-kb/index.json — Schema

---

## delivery-report.json

### Purpose
Final delivery summary: word counts, chapter roster, quality metrics, craft compliance, invariant adherence, outstanding items.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-delivery-assembler`.

### Schema
```json
{
  "storyId": "string",
  "totalWordCount": "number — Sum of all chapter word counts",
  "chapterCount": "number — Total chapters delivered",
  "qualityMetrics": {
    "avgBetaScore": "number",
    "craftToolCompliance": "number — Percentage",
    "invariantAdherence": "number — Percentage",
    "revisionCycles": "number"
  },
  "outstandingItems": ["string — Minor findings deferred (only minor allowed per INV-076)"],
  "seriesKBUpdated": "boolean",
  "artifactManifest": ["string — Complete list of all delivered artifact paths"]
}
```

---

## chapter-summaries/{N}.json

### Purpose
Per-chapter summary for series KB promotion: key events, character development, world changes, unresolved threads.

### Write Protocol
**create-once** — Written by `romantic-fantasy-writer-summary-generator`.

### Schema
```json
{
  "chapterNum": "number",
  "keyEvents": ["string — Major plot events"],
  "characterDevelopment": {
    "<CHAR-NNN>": "string — Arc movement in this chapter"
  },
  "worldChanges": ["string — New world facts established"],
  "unresolvedThreads": ["string — Threads opened/advanced but unresolved"],
  "romanceProgression": "string — Where the romance arc moved",
  "upstreamRef": "string — Relative path to chapters/{N}/final.md"
}
```

---

## series-kb/index.json

### Purpose
Series knowledge base master index. Lives at series level (not per-book). References all per-book KBs and tracks cross-book facts. Append-mostly per INV-070.

### Write Protocol
**read-modify-write** — Written by `romantic-fantasy-writer-series-kb-manager`.

### Schema
```json
{
  "seriesId": "string",
  "books": [
    { "storyId": "string", "title": "string", "order": "number", "kbPath": "string" }
  ],
  "crossBookFacts": [
    {
      "id": "string — SKB-NNN",
      "fact": "string",
      "establishedInBook": "string — storyId",
      "type": "string — world|character|magic|timeline|naming|style"
    }
  ],
  "unresolvedThreads": [
    {
      "id": "string — UTH-NNN",
      "thread": "string",
      "fromBook": "string — storyId",
      "disposition": "string — continue|resolve|drop|pending (per INV-071)"
    }
  ],
  "namingConventions": "object — Canonical names/spellings across the series",
  "lastUpdated": "string — ISO-8601"
}
```
**ID Scheme**: `SKB-NNN`, `UTH-NNN`
