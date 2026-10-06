# Scored Evaluation Template

Copy this template and fill in for each evaluation.

---

# <ISSUE-KEY> Agent Execution — Scored Evaluation

**Task:** <one-line description>
**Profile:** <profile name> (<cli type, model>)
**Difficulty:** <difficulty rating>
**Duration:** <duration>
**Result:** <status>, <PR URL>
**Tool calls:** <count> total across <N> phases, <N> sub-agents

---

## Grading Scale

| Grade | Meaning |
|---|---|
| **5** | Optimal — couldn't meaningfully improve |
| **4** | Strong — minor non-impactful issues |
| **3** | Adequate — functional but with clear improvement opportunities |
| **2** | Below expectations — significant issues affecting quality |
| **1** | Failure — dimension not satisfied |

---

## T1: <Task Name>

**Tool sequence:** `tool1` → `tool2` ✅ → `tool3` ❌ → `tool4` ✅

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | | |
| D2 Ordering | | |
| ... | | |

**T1 Average: X.X**

### T1 Findings
- **F1.1** (dimension, severity): Description
- **F1.2** (dimension, positive): Description

<!-- Repeat for each task -->

---

## Scoring Matrix

| Task | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9a | D9b | D9c | D9d | D9e | D10 | Avg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | | | | | | — | — | | — | — | — | — | — | — | **X.X** |
| ... | | | | | | | | | | | | | | | |

### Dimension Averages

| Dimension | Scores | Average |
|---|---|---|
| D1 Tool Selection | x, y, z | **X.X** |
| D9a Artifact Contract | x, y | **X.X** |
| D9b Orchestrator Purity | x, y | **X.X** |
| D9c Data Flow | x, y | **X.X** |
| D9d Subagent Prompt Quality | x, y | **X.X** |
| D9e Routing Table Compliance | x, y | **X.X** |
| ... | | |

### Overall Score

**All N individual scores sum to X → Overall average: X.XX / 5.00**

---

## Summary of Strengths

1. ...
2. ...

## Summary of Weaknesses

1. ...
2. ...

## Actionable Improvement Areas

| Priority | Area | Recommendation |
|---|---|---|
| **High** | ... | ... |
| **Medium** | ... | ... |
| **Low** | ... | ... |
