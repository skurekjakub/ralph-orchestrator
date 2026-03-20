---
id: STYLE-003
title: "Empty redirect_from frontmatter triggered rejections in 2 tasks (TASK-001, TASK-"
type: style-evolution
confidence: low
domains: ["page-creation", "style-formatting", "invariant-system"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: ["TASK-001"]
invariantsReferenced: ["INV-frontmatter-004"]
sourceSignals: ["STYLE-EVO-003"]
deprecated: false
---

## Insight

Create-action pages consistently get empty redirect_from arrays. Writers need explicit guidance to derive redirect_from from identifier pattern (x/<identifier>).

## Evidence

- Source signal: STYLE-EVO-003 (from task-signals)
- Within-run strength: moderate (2 tasks)
- Tasks referenced: TASK-001
- Confidence: low (cold-start run — first observation)

## Recommendation

See insight above for actionable guidance.

## Applicability

Applicable to future pipeline runs involving page-creation, style-formatting, invariant-system documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
