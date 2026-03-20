---
id: ANTI-003
title: "Impact mapper misses sibling reference pages when a concept change only generate"
type: anti-pattern
confidence: low
domains: ["api-reference", "how-to", "xperience-platform", "impact-analysis", "content-security"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: []
invariantsReferenced: []
sourceSignals: ["CTXGAP-001"]
deprecated: false
---

## Insight

Impact mapper misses sibling reference pages when a concept change only generates impacts for how-to pages. The IncludeSecuredItems behavioral change was documented on retrieve-content-items.md and retrieve-page-content.md but not propagated to content-retriever-api.md and reference-content-retriever-api.md in the same product area. Sibling pages sharing API surface concepts need co-impact analysis.

## Evidence

- Source signal: CTXGAP-001 (from context-signals)
- Within-run strength: single observation
- Tasks referenced: N/A
- Confidence: low (cold-start run — first observation)

## Recommendation

See insight above for actionable guidance.

## Applicability

Applicable to future pipeline runs involving api-reference, how-to, xperience-platform documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
