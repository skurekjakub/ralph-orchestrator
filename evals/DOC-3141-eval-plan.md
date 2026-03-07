# DOC-3141 Agent Execution Evaluation Plan

**Task:** Review PR #2901 — Tag attribute editor validation (5 generic rules, 39 files, 2 revisions)
**Profile:** ralph-vscode / malph (copilot, GPT 5.4 orchestrator)
**Difficulty:** Medium — large diff (39 files) but structurally repetitive (27 tag def updates + 5 new rules)
**Duration:** 20m 41s (1241113ms)
**Result:** completed, PR #2901 — APPROVED (unanimous)
**Tool calls:** 53 total across 6 phases, 5 sub-agents (scout, 3 reviewers, scribe)

---

## Task Decomposition (Review Workflow)

| ID | Task | Required Outcome |
|---|---|---|
| T1 | **Setup** | Read issue, find PR, create artifacts dir, JIRA greeting, ralphchives lookup |
| T2 | **Scout** | Dispatch malph-scout for diff mapping + build/lint/test validation |
| T3 | **Review Panel** | Dispatch 3 independent reviewers (opus, gpt, gemini) sequentially |
| T4 | **Aggregate & Deliver** | Read all jira-findings.json, deduplicate, post unified JIRA comment |
| T5 | **Handoff** | Write review handoff, attach to JIRA |
| T6 | **Archive & Exit** | Dispatch scribe, print exit block |

**Evaluation focus:** T3 (reviewer behavior — severity classification, PR threading) and T4 (aggregation — finding deduplication, verdict correctness).

---

## Evaluation Checklist

### T1: Setup
- [ ] D1 — Tool selection (ralphchives, ADO PR list, bash, state.md)
- [ ] D2 — Ordering (JIRA ack timing)
- [ ] D3 — Arguments (PR ID, branch, state.md content)
- [ ] D4 — Efficiency (3 failed sql INSERT attempts before success)
- [ ] D8 — Workflow compliance (skill loaded, report_intent, state.md)

### T2: Scout
- [ ] D1 — Tool selection (task dispatch)
- [ ] D3 — Arguments (prompt quality, context passed to scout)
- [ ] D9 — Sub-agent utilization (prompt completeness, output read)

### T3: Review Panel — **PRIMARY FOCUS**
- [ ] D1 — Tool selection (task dispatch for each reviewer)
- [ ] D3 — Arguments (reviewer prompts)
- [ ] D6a — Finding validity (are findings real, correctly coded?)
- [ ] D6b — Verdict correctness (does the verdict follow from findings?)
- [ ] D7 — Style & structure (PR thread format, JIRA-ready artifacts)
- [ ] D9 — Sub-agent utilization (status.json read, routing decisions)

### T4: Aggregate
- [ ] D1 — Tool selection (view findings, JIRA comment)
- [ ] D3 — Arguments (JIRA comment content, deduplication)
- [ ] D6a — Finding validity (aggregate reflects individual findings?)
- [ ] D6b — Verdict correctness (panel verdict follows from individual verdicts?)
- [ ] D7 — Style & structure (JIRA wiki markup)

### T5: Handoff
- [ ] D1 — Tool selection (create, JIRA attachment)
- [ ] D7 — Style & structure (handoff format)

### T6: Archive & Exit
- [ ] D9 — Sub-agent utilization (scribe prompt)
- [ ] D10 — Stopping point (exit block, all deliverables)

---

## Pre-observations

### Critical: Severity Misclassification

1. **SUG-001 (dead code file)** — All 3 reviewers classified `imageAttrConflict.ts` as SUG. This is an orphaned file containing dead code that will never be called. In a professional review, dead code left in the repository is at minimum a `TS-XXX` (code quality) finding. The file is unreachable — the import was removed. This is not a suggestion; it's a code quality defect.

2. **SUG-002 (unused import)** — Unused `findTagAttributeNameRange` import. While less severe than dead code files, unused imports are typically linting/code quality issues (`TS-XXX`), especially in a `strict: true` project. The linter should catch this, and if it doesn't, that's an ESLint config gap the reviewers should flag.

3. **Under-escalation pattern** — 9 findings across 3 reviewers and every single one was coded `SUG`. Zero blocking codes. This suggests a systematic bias toward leniency — the reviewers default to the non-blocking category to avoid triggering `needs-revision`, even when findings warrant it.

### Critical: PR Thread Posting — Approved = No File Threads

4. **All 3 reviewers posted only general summary threads** — no file-level threads at all. The checklist says: "If APPROVED — post the general summary thread only, no file-level threads." This instruction is being followed correctly. **But the instruction itself is the problem.** Even for approved PRs, suggestions linked to specific files should get file-level threads so the PR author can see exactly where the issue is.

5. **GPT and Gemini used wrong attribution prefix** — Both posted as `[ralph.malph]` instead of `[ralph.malph-reviewer-gpt]` and `[ralph.malph-reviewer-gemini]`. Only Opus used the correct prefix `[ralph.malph-reviewer-opus]`. This is a prompt compliance issue.

### Secondary: Orchestrator Observations

6. **3 failed SQL INSERT attempts** in setup — the todo table schema likely had conflicts. Wasted ~25 seconds. Minor efficiency issue.

7. **Orchestrator correctly sequenced all phases** — skills loaded at each boundary, state.md maintained, report_intent called. Workflow compliance is clean.

---

## Scoring Matrix (to be filled during evaluation)

| Task | D1 | D2 | D3 | D4 | D5 | D6a | D6b | D7 | D8 | D9 | D10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 Setup | | | | | | — | — | | | — | — |
| T2 Scout | | — | | | — | — | — | — | — | | — |
| T3 Review Panel | | — | | — | — | | | | — | | — |
| T4 Aggregate | | — | | — | — | | | | — | — | — |
| T5 Handoff | | — | — | — | — | — | | | — | — | — |
| T6 Archive | — | — | — | — | — | — | — | — | — | | |

`—` = not applicable for this task
