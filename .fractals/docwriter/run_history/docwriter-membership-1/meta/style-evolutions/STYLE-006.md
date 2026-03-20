---
id: STYLE-006
title: "Unicode arrow (→) vs ASCII arrow (->) inconsistency noted in style reviews for 2"
type: style-evolution
confidence: low
domains: ["style-formatting", "invariant-system"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: []
invariantsReferenced: ["INV-style-046"]
sourceSignals: ["STYLE-EVO-007"]
deprecated: false
---

## Insight

INV-style-046 requires ASCII '->' but existing codebase predominantly uses Unicode '→'. Style reviewers note this as acceptable deviation. Candidate for invariant revision.

## Evidence

- Source signal: STYLE-EVO-007 (from task-signals)
- Within-run strength: moderate (2 tasks)
- Tasks referenced: N/A
- Confidence: low (cold-start run — first observation)

## Recommendation

See insight above for actionable guidance.

## Applicability

Applicable to future pipeline runs involving style-formatting, invariant-system documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
