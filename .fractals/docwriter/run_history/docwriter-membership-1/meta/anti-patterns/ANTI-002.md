---
id: ANTI-002
title: "Style invariant INV-formatting-016 (em dash vs en dash) is the most frequent ..."
type: anti-pattern
confidence: low
domains: ["how-to", "style-formatting", "invariant-system"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: ["TASK-007", "TASK-010", "TASK-014"]
invariantsReferenced: ["INV-formatting-016"]
sourceSignals: ["AGG-003"]
deprecated: false
---

## Insight

INV-formatting-016 triggered rejections in 3 tasks (TASK-007, TASK-010, TASK-014). Writers consistently produce em dashes (—) when the style guide requires en dashes (–).

## Evidence

- Source signal: AGG-003 (from task-signals)
- Within-run strength: single observation
- Tasks referenced: TASK-007, TASK-010, TASK-014
- Confidence: low (cold-start run — first observation)

## Recommendation

Add explicit em-dash/en-dash guidance to the content writer's pre-writing checklist. Consider a post-write automated check before human review.

## Applicability

Applicable to future pipeline runs involving how-to, style-formatting, invariant-system documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
