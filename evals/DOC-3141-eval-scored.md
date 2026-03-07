# DOC-3141 Agent Execution — Scored Evaluation

**Task:** Review PR #2901 — Tag attribute editor validation (5 generic rules, 39 files)
**Profile:** ralph-vscode / malph (copilot, GPT 5.4 orchestrator → Opus 4.6 + GPT 5.4 + Gemini Pro reviewers)
**Difficulty:** Medium
**Duration:** 20m 41s
**Result:** completed, PR #2901 — APPROVED (unanimous)
**Tool calls:** 53 total across 6 phases, 5 sub-agents

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

## T1: Setup

**Tool sequence:** `report_intent` → `skill(setup)` → `ralphchives-read` ✅ → `ado_list_pull_requests` ✅ → `bash(ls)` ✅ → `bash(branches)` ✅ → `bash(mkdir)` ✅ → `sql` ❌ → `sql` ❌ → `sql` ✅ → `create(state.md)` ✅ → `jira_add_comment` ✅ → `edit(state.md)` ✅ → `sql` ✅ → `skill(scout)` ✅

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Correct tools throughout: ralphchives for prior context, ADO for PR discovery, bash for workspace setup, JIRA for ack greeting |
| D2 Ordering | 4 | JIRA ack posted after workspace confirmed and state.md written — good. Ralphchives + ADO PR lookup run in parallel — efficient. Minor: ack could wait until after scout dispatch to reduce false-positive window, but this is standard practice. |
| D3 Arguments | 5 | PR ID 2901 correctly identified. Branch name `ralph/doc-3141` correct. State.md content includes all tracked identifiers and reviewer verdict table placeholder. |
| D4 Efficiency | 3 | 3 SQL INSERT attempts before success. First two failed on schema conflicts (likely duplicate IDs or missing table). ~25 seconds wasted on retries. |
| D8 Workflow Compliance | 5 | Skill loaded first, report_intent called, state.md created and updated with phase transition. |

**T1 Average: 4.4**

### T1 Findings
- **F1.1** (D4, minor): 3 SQL attempts for todo creation. The agent should check table state before inserting or use INSERT OR REPLACE.

---

## T2: Scout

**Tool sequence:** `report_intent` → `sql(phase-2)` → `task(malph-scout)` ✅ → `view(scout/status.json)` ✅

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Correct: task dispatch for sub-agent, view for status check |
| D3 Arguments | 5 | Scout prompt is comprehensive: includes issue summary, two-revision context, exact tasks (diff + build + lint + test), artifact directory, status.json schema. |
| D9 Sub-agent Utilization | 5 | Scout returned `scouted` with full detail (39 files, all builds pass, orphaned file flagged). Orchestrator correctly read status and noted key findings in state.md. |

**T2 Average: 5.0**

---

## T3: Review Panel — PRIMARY FOCUS

**Tool sequence:** `report_intent` → `task(malph-reviewer-opus)` ✅ → `view(opus/status.json)` ✅ → `task(malph-reviewer-gpt)` ✅ → `view(gpt/status.json)` ✅ → `task(malph-reviewer-gemini)` ✅ → `view(gemini/status.json)` ✅

### Reviewer execution times
- Opus: ~3m 45s
- GPT: ~4m 44s
- Gemini: ~3m 54s

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Correct dispatch pattern: task → view status → next task. Sequential as required. |
| D3 Arguments | 4 | Reviewer prompts are thorough (issue context, scout artifacts pointer, task list, status/findings JSON schemas). **Issue:** All three prompts are nearly identical — no model-specific guidance despite different model capabilities. |
| D6a Finding Validity | 2 | **CRITICAL — see detailed analysis below** |
| D6b Verdict Correctness | 2 | **CRITICAL — see detailed analysis below** |
| D7 Style & Structure | 3 | **Issue with PR threading — see detailed analysis below** |
| D9 Sub-agent Utilization | 4 | Orchestrator reads status.json after each reviewer and updates state.md. Could have read jira-findings.json summaries for richer state tracking but this is not required. |

**T3 Average: 3.3**

### T3 Detailed Analysis: Finding Validity (D6a)

#### SUG-001: Orphaned dead code file (`imageAttrConflict.ts`) — **MISCLASSIFIED**

All 3 reviewers flagged this identically: an entire file containing a function (`validateCardIconImageConflict`) that is no longer imported anywhere. The import was removed from `card.types.ts` during the migration to declarative `mutuallyExclusiveWith`.

**What it actually is:** Dead code committed to the repository. The file exports a function that nothing calls. This is a **code quality defect** — it should be `TS-001` (TypeScript/code quality), not `SUG-001`. Dead code in a repository:
- Confuses future contributors who may think the function is live
- Will rot as surrounding APIs change (no tests will catch the divergence since nothing calls it)
- Pollutes search results and code navigation
- Represents incomplete migration — the task explicitly added `mutuallyExclusiveWith` to replace this rule

The review checklist's category C ("TypeScript & Code Quality") doesn't explicitly list "dead code files" but the category covers code quality holistically. The reviewers chose to downgrade this to SUG because the code "has no functional impact" — but that's the wrong lens. Dead code is a code quality problem by nature.

**Correct classification:** `TS-001` (critical) — orphaned dead code file should be deleted as part of the migration. This would flip the verdict to `needs-revision`.

#### SUG-002: Unused import (`findTagAttributeNameRange`) — **BORDERLINE**

Two reviewers (GPT, Gemini) flagged an unused import. The import passes lint (ESLint apparently doesn't catch it). In a `strict: true` TypeScript project, unused imports are typically flagged by the `@typescript-eslint/no-unused-vars` rule or `noUnusedLocals`. If lint passes, either:
- The rule is disabled for imports (possible), or
- The import is used in a type position (unlikely — it's a function)

**Assessment:** Unused imports are typically `TS-XXX` territory (code quality) but the impact is genuinely minimal. `SUG` is defensible if the linter intentionally allows it. The reviewer should have investigated the ESLint config to determine intent — one reviewer (GPT) actually ran `grep` on the ESLint config but didn't draw a conclusion.

**Borderline classification:** Could justify `TS-002` or `SUG`. The failure to investigate further drops D6a.

#### SUG-003: Regex false-positive on `=` in quoted values — **CORRECT as SUG**

GPT and Gemini flagged a theoretical edge case in the duplicate attribute regex. They correctly noted it's low-probability in practice. `SUG` is the right call — this is genuinely an optional improvement, not a defect.

#### SUG-004: Unused `TagValidationContext` import — **SAME as SUG-002**

Opus flagged unused type imports in 3 rule files. Same analysis as SUG-002.

#### SUG-005: Inconsistent diagnostic message format — **BORDERLINE**

GPT flagged that positional and named attributes produce different message formats. This affects user-facing diagnostic messages — the inconsistency is visible to extension users. This could be `TS-003` (code quality for user-facing strings) or `SUG` depending on how strictly the project treats diagnostic message consistency. The review checklist category D explicitly checks "Message clarity — diagnostic messages are actionable and specific." The messages are actionable but inconsistent. `SUG` is defensible but a stricter reviewer would flag `TS`.

### T3 Detailed Analysis: Verdict Correctness (D6b)

All 3 reviewers reached `approved`. The verdict rule is mechanical:
> **`needs-revision`** if ANY `ARCH-XXX`, `TS-XXX`, `GRAM-XXX`, `BUILD-XXX`, or `REQ-XXX` findings exist

Since all findings were coded `SUG`, the `approved` verdict follows mechanically. **The verdict is internally consistent but built on misclassified findings.** If SUG-001 were correctly coded as `TS-001`, all 3 verdicts would flip to `needs-revision`.

The verdict itself is wrong because the findings are wrong — D6b scores are coupled to D6a. An agent that classifies everything as SUG can always produce APPROVED consistently. The system lacks a calibration mechanism.

### T3 Detailed Analysis: PR Thread Posting (D7)

All 3 reviewers posted **only general summary threads** — no file-level threads. Each reviewer explicitly cited the checklist rule: "If APPROVED — post the general summary thread only, no file-level threads."

**The reviewers followed the instruction correctly.** The problem is the instruction itself — see Actionable Improvements below.

**Attribution prefix issue:** GPT posted as `[ralph.malph]`, Gemini posted as `[ralph.malph]`. Only Opus used the correct `[ralph.malph-reviewer-opus]`. The `{{ agentName }}` template variable should resolve to the reviewer's own name. Either:
- The template variable resolved incorrectly for GPT/Gemini, or
- The agents ignored the resolved value and used the orchestrator's name

This is a D3 argument correctness issue for GPT and Gemini.

---

## T4: Aggregate

**Tool sequence:** `skill(aggregate)` → `report_intent` → `view(opus/jira-findings.json)` ✅ → `view(gpt/jira-findings.json)` ✅ → `view(gemini/jira-findings.json)` ✅ → `jira_add_comment` ✅

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Correct: read all three findings files, post unified JIRA comment |
| D3 Arguments | 4 | JIRA comment is well-structured with proper wiki markup. Deduplication is sound — 9 raw findings collapsed to 5 with accurate cross-referencing ("flagged by: opus, gpt, gemini"). Minor: could organize findings by priority rather than discovery order. |
| D6a Finding Validity | 3 | Faithfully aggregated what reviewers reported. The orchestrator is not expected to reclassify findings (that would violate the pure-router pattern). But the aggregate comment states "All findings are *suggestions* (non-blocking). No critical or style issues found." — this amplifies the misclassification. |
| D6b Verdict Correctness | 3 | Panel verdict correctly derived from individual verdicts (unanimous APPROVED → APPROVED). The mechanical rule was applied correctly. But the aggregate is only as good as its inputs. |
| D7 Style & Structure | 5 | Excellent JIRA wiki markup. Table formatting for verdicts, structured findings with file paths and flagging attribution. Clean and readable. |

**T4 Average: 4.0**

### T4 Findings
- **F4.1** (D6a, high): Orchestrator repeats "All findings are suggestions, no critical or style issues found" — this language reinforces the misclassification. The orchestrator shouldn't second-guess reviewers (pure router), but it also shouldn't amplify confidence in suspect classifications.

---

## T5: Handoff

**Tool sequence:** `report_intent` → `bash(mkdir)` → `create(review-handoff.md)` ✅ → `jira_add_attachment` ✅

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Correct: create file, attach to JIRA |
| D7 Style & Structure | 5 | Handoff document is comprehensive: panel table, build status, PR link, aggregated findings with per-reviewer attribution. |

**T5 Average: 5.0**

---

## T6: Archive & Exit

**Tool sequence:** `skill(archive)` → `report_intent` → `task(ralph-scribe)` ✅ → `view(scribe/status.json)` ✅ → `edit(state.md)` ✅

| Dim | Score | Evidence |
|---|---|---|
| D9 Sub-agent Utilization | 4 | Scribe prompt is thorough with all artifact paths. Could have included the aggregated findings count to help the scribe prioritize. |
| D10 Stopping Point | 4 | State.md updated, scribe archived. **Note:** The exit block (`===RALPH_RESULT_START===`) was not visible in the pre-tool.log. It may be in the final lines of the transcript. |

**T6 Average: 4.0**

---

## Scoring Matrix

| Task | D1 | D2 | D3 | D4 | D5 | D6a | D6b | D7 | D8 | D9 | D10 | Avg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 Setup | 5 | 4 | 5 | 3 | — | — | — | — | 5 | — | — | **4.4** |
| T2 Scout | 5 | — | 5 | — | — | — | — | — | — | 5 | — | **5.0** |
| T3 Review Panel | 5 | — | 4 | — | — | 2 | 2 | 3 | — | 4 | — | **3.3** |
| T4 Aggregate | 5 | — | 4 | — | — | 3 | 3 | 5 | — | — | — | **4.0** |
| T5 Handoff | 5 | — | — | — | — | — | — | 5 | — | — | — | **5.0** |
| T6 Archive | — | — | — | — | — | — | — | — | — | 4 | 4 | **4.0** |

### Dimension Averages

| Dimension | Scores | Average |
|---|---|---|
| D1 Tool Selection | 5, 5, 5, 5, 5 | **5.0** |
| D2 Ordering | 4 | **4.0** |
| D3 Arguments | 5, 5, 4, 4 | **4.5** |
| D4 Efficiency | 3 | **3.0** |
| D6a Finding Validity | 2, 3 | **2.5** |
| D6b Verdict Correctness | 2, 3 | **2.5** |
| D7 Style & Structure | 3, 5, 5 | **4.3** |
| D8 Workflow Compliance | 5 | **5.0** |
| D9 Sub-agent Utilization | 5, 4, 4 | **4.3** |
| D10 Stopping Point | 4 | **4.0** |

### Overall Score

**All 28 individual scores sum to 109 → Overall average: 3.89 / 5.00**

The overall score is dragged down significantly by the D6a and D6b scores in T3 (Review Panel). Without the severity misclassification issue, this would be a 4.3+ run.

---

## Summary of Strengths

1. **Orchestrator workflow execution is excellent.** Every phase boundary has a skill load, report_intent, and state.md update. The pure-router pattern is followed cleanly.
2. **Scout dispatch and utilization is optimal.** Comprehensive prompt, output correctly consumed, orphaned file flagged to reviewers.
3. **Finding deduplication is well-done.** 9 raw findings correctly collapsed to 5 with accurate cross-reviewer attribution.
4. **JIRA comment formatting is professional.** Wiki markup, tables, structured findings, malph personality flavor without compromising substance.
5. **Deliverable completeness.** Handoff doc, JIRA attachment, ralphchives archive all present.

## Summary of Weaknesses

1. **CRITICAL: Systematic under-classification of findings.** All reviewers default to SUG for everything. Dead code (orphaned file) should be TS. Unused imports should be TS. The panel has no teeth — it will approve almost anything that builds.
2. **PR threads lost for approved PRs.** The checklist says "if APPROVED, no file-level threads." This means the PR author never sees inline annotations pointing to the exact files/lines with issues. Suggestions should still be posted inline.
3. **Attribution prefix wrong for 2/3 reviewers.** GPT and Gemini posted as `[ralph.malph]` instead of their own agent name. This defeats the purpose of multi-reviewer attribution.
4. **No calibration between reviewers.** All 3 produced the same verdict with overlapping findings. No reviewer disagreed or escalated. This suggests the models are either too similar in their review stance or the prompt biases them toward leniency.

---

## Actionable Improvement Areas

| Priority | Area | Recommendation |
|---|---|---|
| **Critical** | Severity classification in review checklist | Add explicit guidance on what constitutes `TS-XXX` vs `SUG-XXX`. Add examples: "Dead code files → TS. Unused imports → TS. Theoretical edge cases → SUG. Style preferences → SUG." Add a pre-verdict audit step: "Before writing your verdict, review each SUG finding and confirm it is genuinely optional. Dead code, unused imports, and incomplete migrations are NOT optional." |
| **Critical** | PR threading for approved PRs | Change the checklist rule from "If APPROVED, no file-level threads" to "Post file-level threads for ALL findings regardless of verdict. The general summary thread is always posted additionally." Inline annotations are valuable even for suggestions — they show the PR author exactly where to look. |
| **High** | Attribution prefix enforcement | Investigate why `{{ agentName }}` resolves to `ralph.malph` instead of `ralph.malph-reviewer-gpt` for GPT and Gemini. This may be a template rendering bug in the orchestrator dispatch. If it's an agent behavior issue, add explicit instruction: "Your agent name is `{{ agentName }}`. Use this exact string, not the orchestrator's name." |
| **Medium** | Reviewer independence calibration | Consider adding a "strictness directive" to at least one reviewer to encourage disagreement. E.g., one reviewer with "err on blocking" and another with "err on approving" — creating useful tension. Currently all 3 converge on the same lenient position. |
| **Low** | SQL todo creation resilience | Use INSERT OR REPLACE or check table state before inserting todos. 3 failed attempts wastes 25 seconds. |
