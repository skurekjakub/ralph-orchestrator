---
id: STYLE-001
title: "Em dash (—) vs en dash (–) enforcement triggered rejections in 3 tasks (TASK-007"
type: style-evolution
confidence: low
domains: ["style-formatting", "invariant-system"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: ["TASK-007"]
invariantsReferenced: ["INV-formatting-016"]
sourceSignals: ["STYLE-EVO-001"]
deprecated: false
---

## Insight

Writers consistently produce em dashes when en dashes are required. INV-formatting-016 is well-defined but writers need stronger pre-writing guidance on dash types.

## Evidence

- Source signal: STYLE-EVO-001 (from task-signals)
- Within-run strength: strong (3+ tasks)
- Tasks referenced: TASK-007
- Confidence: low (cold-start run — first observation)

## Recommendation

See insight above for actionable guidance.

## Applicability

Applicable to future pipeline runs involving style-formatting, invariant-system documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
