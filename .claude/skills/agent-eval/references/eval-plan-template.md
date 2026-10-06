# Evaluation Plan Template

Copy this template and fill in for each evaluation.

---

# <ISSUE-KEY> Agent Execution Evaluation Plan

**Task:** <one-line description>
**Profile:** <profile name> (<cli type>)
**Difficulty:** <difficulty rating if known>
**Duration:** <from summary.json>
**Result:** <completed/error/partial>, <PR URL if applicable>
**Tool calls:** <count from pre-tool.log> total across <N> phases, <N> sub-agents

---

## Task Decomposition

| ID | Task | Required Outcome |
|---|---|---|
| T1 | **Setup** | <what needs to happen> |
| T2 | **Research** | <what needs to happen> |
| ... | ... | ... |

---

## Evaluation Checklist

### T1: <Task Name>
- [ ] D1 — Tool selection
- [ ] D2 — Ordering
- [ ] D3 — Arguments
- [ ] D4 — Efficiency
- [ ] D5 — Error recovery
- [ ] D8 — Workflow compliance

### T2: <Task Name>
- [ ] D1 — Tool selection
- [ ] D2 — Ordering
- [ ] D3 — Arguments
- [ ] D4 — Efficiency
- [ ] D9a — Artifact contract
- [ ] D9b — Orchestrator purity
- [ ] D9c — Data flow
- [ ] D9d — Subagent prompt quality
- [ ] D9e — Routing table compliance

<!-- Repeat for each task. Mark only applicable dimensions. -->

---

## Pre-observations

<!-- Note anything spotted during data gathering that should be validated during scoring. -->

1. ...
2. ...

---

## Scoring Matrix (to be filled during evaluation)

| Task | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9a | D9b | D9c | D9d | D9e | D10 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | | | | | | — | — | | — | — | — | — | — | — |
| ... | | | | | | | | | | | | | | |

`—` = not applicable for this task

D9 sub-dimensions: a=Artifact Contract, b=Orchestrator Purity, c=Data Flow, d=Subagent Prompt Quality, e=Routing Table Compliance
