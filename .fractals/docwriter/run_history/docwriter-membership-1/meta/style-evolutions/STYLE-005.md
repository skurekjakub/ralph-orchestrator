---
id: STYLE-005
title: "Prohibited interaction verbs (choose/enable) enforced in 2 business-user tasks ("
type: style-evolution
confidence: low
domains: ["how-to", "admin-ui", "style-formatting", "xperience-platform"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: []
invariantsReferenced: ["INV-style-034", "INV-style-036"]
sourceSignals: ["STYLE-EVO-005"]
deprecated: false
---

## Insight

Business-user pages consistently use 'choose' and 'enable/disable' instead of the required 'select' and 'clear'. Xperience style guide mandates select/clear for checkbox interactions.

## Evidence

- Source signal: STYLE-EVO-005 (from task-signals)
- Within-run strength: moderate (2 tasks)
- Tasks referenced: N/A
- Confidence: low (cold-start run — first observation)

## Recommendation

See insight above for actionable guidance.

## Applicability

Applicable to future pipeline runs involving how-to, admin-ui, style-formatting documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
