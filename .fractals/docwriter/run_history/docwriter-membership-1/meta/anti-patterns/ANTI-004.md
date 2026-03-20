---
id: ANTI-004
title: "When acceptance criteria say 'document methods of interface X' without enumerati"
type: anti-pattern
confidence: low
domains: ["api-reference", "xperience-platform", "risk-analysis"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: []
invariantsReferenced: []
sourceSignals: ["CTXGAP-003"]
deprecated: false
---

## Insight

When acceptance criteria say 'document methods of interface X' without enumerating them, writers can miss less-prominent methods. Code analysis identified 6 public methods on IContentItemMemberRoleRetriever but the task planner did not convert this into an exhaustive checklist. High-accuracy-risk tasks should have method-level acceptance criteria.

## Evidence

- Source signal: CTXGAP-003 (from context-signals)
- Within-run strength: single observation
- Tasks referenced: N/A
- Confidence: low (cold-start run — first observation)

## Recommendation

See insight above for actionable guidance.

## Applicability

Applicable to future pipeline runs involving api-reference, xperience-platform, risk-analysis documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
