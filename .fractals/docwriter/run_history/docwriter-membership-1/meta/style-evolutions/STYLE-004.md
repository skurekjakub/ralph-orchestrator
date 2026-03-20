---
id: STYLE-004
title: "Incorrect page_link identifiers triggered rejections in 2 tasks (TASK-002, TASK-"
type: style-evolution
confidence: low
domains: ["api-reference", "how-to", "style-formatting", "xperience-platform", "cross-references", "invariant-system", "risk-analysis"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: ["TASK-002"]
invariantsReferenced: ["INV-crossref-001"]
sourceSignals: ["STYLE-EVO-004"]
deprecated: false
---

## Insight

Writers fabricate page_link identifiers (e.g., 'member_roles_developer_guide_xp' instead of 'member_roles_xp'). Cross-reference accuracy requires the writer to verify identifiers against actual front matter.

## Evidence

- Source signal: STYLE-EVO-004 (from task-signals)
- Within-run strength: moderate (2 tasks)
- Tasks referenced: TASK-002
- Confidence: low (cold-start run — first observation)

## Recommendation

See insight above for actionable guidance.

## Applicability

Applicable to future pipeline runs involving api-reference, how-to, style-formatting documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
