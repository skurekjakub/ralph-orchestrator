---
id: ANTI-005
title: "Risk analyzer's accuracy dimension underweights business-user page complexity. T"
type: anti-pattern
confidence: low
domains: ["admin-ui", "xperience-platform", "risk-analysis"]
discoveredDate: "2026-03-14T16:06:35+00:00"
lastReferencedDate: "2026-03-14T16:06:35+00:00"
usageCount: 1
sourceTasks: ["TASK-011"]
invariantsReferenced: []
sourceSignals: ["CTX-riskAnalysisEffectiveness"]
deprecated: false
---

## Insight

Risk analyzer's accuracy dimension underweights business-user page complexity. TASK-011 (Members page for business users) was scored accuracy=2 but required 3 cycles because the writer described a UI field interaction incorrectly. Admin UI behavior is harder to verify from source code alone — it requires running the application or detailed UI specifications.

## Evidence

- Source signal: CTX-riskAnalysisEffectiveness (from context-signals)
- Within-run strength: single observation
- Tasks referenced: TASK-011
- Confidence: low (cold-start run — first observation)

## Recommendation

See insight above for actionable guidance.

## Applicability

Applicable to future pipeline runs involving admin-ui, xperience-platform, risk-analysis documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
