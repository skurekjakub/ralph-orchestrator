# DOC-3187 — Agent-as-Function Pattern Evaluation

Evaluates the DOC-3187 run against the two complementary patterns from the `agent-as-function` skill:
1. **Prompt decomposition** — phases as skills with `state.md` scratchpad
2. **Subagent-as-function** — filesystem artifact handoff, orchestrator as pure router

---

## 1. Subagent Roster (Observed)

| Agent | Role | Model | Dispatch Mode |
|---|---|---|---|
| `ralph-researcher` | Analyze JIRA issue, catalog code blocks, verify APIs, produce implementation plan | claude-opus-4.6 | sync |
| `ralph-writer` | Implement code changes per researcher's plan | claude-opus-4.6 | sync |
| `ralph-reviewer-technical` | Verify technical accuracy of changes | claude-opus-4.6 | background |
| `ralph-reviewer-style` | Check style guide compliance | claude-opus-4.6 | background |
| `ralph-reviewer-ia` | Evaluate information architecture | claude-opus-4.6 | background |

**Missing from the canonical roster:** No **scribe/archiver** subagent. Handoff duties (JIRA comment, attachment, ralphchives post) are performed by the orchestrator directly. This is a hybrid pattern — the skill prescribes making a scribe subagent for formatting output from multiple sources, but the orchestrator handles it inline.

---

## 2. Artifact Contract Compliance

### 2.1 Directory Structure

**Expected:**
```
.ralph/tasks/DOC-3187/artifacts/
├── manifest.json
├── ralph-researcher/
│   ├── output.md
│   └── status.json
├── ralph-writer/
│   ├── output-v1.md
│   └── status.json
├── ralph-reviewer-technical/
│   ├── output.md
│   ├── review-findings.json
│   └── status.json
├── ralph-reviewer-style/
│   ├── output.md
│   ├── review-findings.json
│   └── status.json
└── ralph-reviewer-ia/
    ├── output.md
    ├── review-findings.json
    └── status.json
```

**Observed:**
- Researcher: `ralph-researcher/output.md` + `status.json` ✅
- Writer: `ralph-writer/output-v1.md` + `status.json` ✅ (versioned artifact — correct for iterative pattern)
- Reviewers: `output.md` + `review-findings.json` + `status.json` ✅ (bonus structured findings file)
- **`manifest.json`: NOT FOUND** ❌ — 0 references in audit log. No subagent appended to it, no orchestrator read it.

**Score: 4/5** — All per-agent artifacts are correctly structured with proper status.json. The missing manifest.json is a gap in audit trail and discoverability, but doesn't affect operational flow since no scribe agent needs it for aggregation.

### 2.2 status.json Quality

All 5 subagents wrote well-structured `status.json`:

| Agent | Fields | Result Codes | Summary Quality |
|---|---|---|---|
| researcher | All 7 fields present | `researched` | Good — includes scope, findings count, key discoveries |
| writer | All 7 fields present | `implemented` | Good — includes file counts, build status |
| reviewer-technical | All 7 fields present | `approved` | Good — "No inaccuracies found" is clear routing signal |
| reviewer-style | All 7 fields present | `approved` | Good — "3 non-blocking suggestions" is informative |
| reviewer-ia | All 7 fields present | `approved` | Good — summarizes what was preserved |

Notable: `next_hint` was correctly populated (`researcher → ralph-writer`, `writer → ralph-reviewer-technical`, reviewers → `null`). The orchestrator didn't blindly follow hints — it dispatched all 3 reviewers in parallel rather than following the linear `next_hint`.

**Score: 5/5**

---

## 3. Orchestrator Purity

The central question: **Does the orchestrator act as a pure router, or does it relay/read artifact content?**

### 3.1 What the Orchestrator Reads

| Read Operation | What was read | Content or Status? |
|---|---|---|
| `cat .../ralph-researcher/status.json` | `status.json` | ✅ Status only |
| `cat .../ralph-writer/status.json` | `status.json` | ✅ Status only |
| `cat .../ralph-reviewer-*/status.json` (×3) | `status.json` | ✅ Status only |
| `read_agent agent-0/1/2` | One-line result | ✅ One-liner only |

**The orchestrator never reads any `output.md` or `output-v1.md` file.** Zero artifact content enters the orchestrator context. This is textbook compliance.

**Score: 5/5**

### 3.2 Data Relay Analysis

The critical anti-pattern: "orchestrator relays data between subagents."

**Researcher → Writer handoff:**
- Writer dispatch prompt includes: `"The researcher's report is at .ralph/tasks/DOC-3187/artifacts/ralph-researcher/output.md — read it"`
- Writer reads the artifact **from the filesystem**, not from the orchestrator prompt
- ✅ **No relay** — pointer only

**Writer → Reviewers handoff:**
- Reviewer prompts contain no pointer to writer artifacts at all
- Reviewers must self-discover what changed (via `git diff`, file inspection, or reading `ralph-writer/output-v1.md` themselves)
- ✅ **No relay** — but also no pointer (see Section 4.2)

**Reviewers → Orchestrator → Commit:**
- Orchestrator reads only `status.json` for routing (`result: approved`)
- Reviewer findings are not relayed to commit or PR
- ✅ **No relay**

**Score: 5/5** — Perfect. The orchestrator context contains zero artifact content across all 52 tool calls.

### 3.3 Orchestrator Context Cleanliness

Evidence from `read_agent` return values:
- Researcher: `"Done. Status: completed, result: researched."` — one line
- Writer: `"Done. Status: completed, result: implemented."` — one line
- All 3 reviewers: `"Done. Status: completed, result: approved."` — one line

The orchestrator's conversational context grows by exactly 5 one-liners from subagent returns. Compare this to a naive pattern where the researcher's full implementation plan (~5000 tokens) and each reviewer's full report (~2000 tokens) would flow through the orchestrator — that's ~11,000 tokens avoided.

**Score: 5/5**

---

## 4. Prompt Decomposition Compliance

### 4.1 Phase Skills

| Phase | Skill Loaded | state.md Updated | Correct? |
|---|---|---|---|
| 1. Setup | `ralph-workflow-setup` | ✅ Phase 1 → 2 | ✅ |
| 2. Research | `ralph-workflow-research` | ✅ Phase 2 → 3 | ✅ |
| 3. Write | `ralph-workflow-write` | ✅ Phase 3 → 4 | ✅ |
| 4. Review | `ralph-workflow-review` | ✅ Phase 4 → 6 | ✅ (Phase 5 skipped — validation embedded in writer) |
| 6. Commit | `ralph-workflow-commit` | ✅ Phase 6 → 7 | ✅ |
| 7. PR | `ralph-workflow-pr` + `ralph-ado-pr-workflow` | ✅ Phase 7 → 8 | ✅ |
| 8. Handoff | `ralph-workflow-handoff` + `ralph-source-references` | ✅ Final phase | ✅ |

Every phase transition: (1) updates `state.md` with new current phase + completed phase summary, (2) lists skills for the new phase, (3) loads those skills before doing work.

**Score: 5/5** — Textbook prompt decomposition. The main agent prompt is effectively just the workflow table — all domain knowledge lives in phase skills.

### 4.2 State.md as Scratchpad

State.md is well-maintained with:
- Current phase + required skills with the stop-and-read guard
- Completed phases with result summaries (from `status.json`)
- Key decisions (7 items)
- Tracked identifiers (branch, pages, files — updated with commit + PR later)
- Ralphchives findings
- Source references section

Each phase transition atomically updates the current phase and appends to completed phases. No stale state observed.

**Score: 5/5**

---

## 5. Routing Table (Implicit vs. Explicit)

The skill prescribes an **explicit routing table** mapping `(agent, result)` → action. DOC-3187 uses an **implicit** routing pattern — the orchestrator follows the phase skill instructions rather than a declared table.

**Reconstructed routing from observed behavior:**

| Agent completed | result | Observed Action |
|---|---|---|
| researcher | researched | Update state → dispatch writer |
| writer | implemented | Update state → dispatch 3 reviewers (parallel) |
| reviewer-* | approved (all) | Read all status.json → commit + push |
| reviewer-* | needs-revision | *(not triggered — would dispatch writer iteration)* |

**Gap:** There is no evidence that the routing table is explicitly declared in the agent template. The orchestrator follows phase skills sequentially. If a reviewer returned `needs-revision`, the `ralph-workflow-review` skill would instruct the orchestrator to loop back — but this routing logic lives in skill prose, not in a structured table.

**Score: 3/5** — Routing works correctly for the happy path, but there's no explicit routing table with all result codes, iteration limits, or error paths declared upfront. The skill recommends defining this before implementation.

---

## 6. Subagent Self-Sufficiency

### 6.1 Researcher

**Dispatch prompt:** ~2500 chars including full JIRA issue description, all 5 implementation phases, key decisions, ralphchives findings, and 6 research focus areas.

**Assessment:** The researcher receives the entire JIRA issue through the orchestrator prompt rather than reading it from JIRA MCP or the filesystem. This is a **partial anti-pattern** — the skill says subagents should "gather their own input from the filesystem rather than depending on the orchestrator to provide context."

**However:** The researcher doesn't have direct JIRA MCP access (those tools are orchestrator-level). The JIRA issue is the *task definition*, not an upstream artifact. Passing the task definition is analogous to passing a task-id — the content just happens to be richer because there's no filesystem intermediary for JIRA content.

**Mitigation available:** The orchestrator could write the JIRA issue to `{artifact-root}/task-input.md` during setup and dispatch the researcher with just a task-id pointer. This would be purer but adds a file-create step.

**Score: 3/5** — Functional but technically violates the relay principle. The ~2500-char prompt inflates the orchestrator context compared to a one-liner dispatch.

### 6.2 Writer

**Dispatch prompt:** ~800 chars. Includes a pointer to the researcher artifact + 7 key constraints.

**Assessment:** Mixed. The pointer to `ralph-researcher/output.md` is correct — the writer will read it from the filesystem. But the 7 key constraints are relayed from the orchestrator's context (originally from state.md/JIRA). These constraints are part of the task definition, not artifact content, so it's borderline.

**Score: 4/5** — Good use of filesystem pointer. The constraints could theoretically be in a shared task-input artifact, but they're lean enough (~300 chars) that the context cost is negligible.

### 6.3 Reviewers

**Dispatch prompts:** ~150-200 chars each. One sentence per reviewer describing what to check. No pointer to writer artifacts, no file list, no specific claims to verify.

**Assessment:** Two issues from the agent-as-function lens:
1. **Missing artifact pointer** — reviewers aren't told where `ralph-writer/output-v1.md` is. They must self-discover scope. This is *technically* self-sufficient (they figure it out), but wastes reviewer time on discovery rather than review.
2. **Too thin** — the skill says subagents should have clear `Input` declarations. These prompts don't reference any input artifacts at all.

**Score: 2/5** — Self-sufficient in practice (reviewers found the right files), but the prompts don't declare input artifacts as the contract requires. A structured prompt with `Input: ralph-writer/output-v1.md, changed files` would be better.

---

## 7. Missing Functions Audit

The skill mandates asking: *"Which workflow phases still contain substantive work inside the orchestrator?"*

| Phase | Substantive work in orchestrator? | Should it be delegated? |
|---|---|---|
| Setup | Creates state.md, JIRA ack, ralphchives search | No — administrative + context gathering |
| Research | Dispatches researcher | No — pure routing |
| Write | Dispatches writer | No — pure routing |
| Review | Dispatches reviewers + polling | No — pure routing |
| Commit | Git add, commit, push (10 tool calls) | No — mechanical/administrative |
| PR | Create PR with description | **Borderline** — PR description is ~2000 chars of formatted content. A scribe could produce this. |
| Handoff | Write handoff doc, JIRA comment, JIRA attachment, ralphchives post (10 tool calls) | **Yes** — this is a scribe function. The orchestrator aggregates reviewer summaries, writes a formatted handoff, composes a JIRA comment with source references. This is exactly the scribe pattern described in the skill. |

**Missing agent: Scribe.**

The handoff phase (Phase 8) has the orchestrator doing substantive formatting work:
- Reading all reviewer status summaries and composing a narrative
- Writing a multi-section handoff document with source references
- Composing a formatted JIRA comment with wiki markup (headings, monospace, bold, links)
- Posting to ralphchives with tags and structured content

This is 10 tool calls of content composition — the orchestrator is acting as both router and scribe. The skill explicitly says: *"Make it a subagent when it produces a substantial artifact (report, code changes, review document)"* and lists scribe as the minimum viable subagent example.

**Score: 3/5** — All deep-reasoning functions are properly delegated (research, writing, review). But the handoff/scribe function is hybrid — the orchestrator does formatting work that the skill says should be a dedicated subagent.

---

## 8. Validation Checklist (from skill)

| Check | Pass? | Evidence |
|---|---|---|
| Context cleanliness — orchestrator has no artifact content | ✅ | Zero output.md reads. Only status.json + one-liners in context. |
| Artifact integrity — downstream subagents read from filesystem | ✅ | Writer reads `ralph-researcher/output.md` from filesystem. Reviewers self-discover changes. |
| Audit trail — manifest.json logs full sequence | ❌ | manifest.json doesn't exist. No append, no reads, 0 references in audit log. |
| Loop termination — iterative loops terminate at configured max | N/A | No revision loop triggered (all approved first pass). Cannot verify. |
| Failure handling — status: failed is written; orchestrator routes | N/A | No failures occurred. Cannot verify. |
| Missing-function audit completed | ❌ | Scribe function not identified as missing — orchestrator performs it. |
| Phase coverage — every workflow phase has a skill | ✅ | All 7 active phases load at least one skill before work begins. |
| Skill manifest — each phase transition sets correct skills | ✅ | State.md "Skills for this phase" section updated at every transition. |
| No dangling references | ✅ | No stale skill references observed. |

**Checklist score: 6/9** (2 N/A excluded → 6/7 from testable items → **86%**)

---

## 9. Data Flow Map

```
JIRA issue (via orchestrator prompt)
  ↓ (conversational relay — anti-pattern)
ralph-researcher → writes output.md + status.json
  ↓ (filesystem pointer in writer prompt)
ralph-writer → reads researcher/output.md, writes output-v1.md + status.json
  ↓ (self-discovery — no pointer)
ralph-reviewer-technical ──┐
ralph-reviewer-style    ──┤→ each reads changed files + git diff, writes output.md + status.json
ralph-reviewer-ia       ──┘
  ↓ (orchestrator reads status.json only)
orchestrator → reads 3× status.json → commit → push → PR
  ↓ (orchestrator acts as scribe — hybrid)
orchestrator → reads status.json summaries → writes handoff.md + JIRA comment + ralphchives
```

**Deviations from pure pattern:**
1. JIRA content relayed through orchestrator prompt (researcher)
2. No artifact pointer from writer to reviewers
3. Orchestrator performs scribe duties in handoff phase

---

## 10. Overall Assessment

### Pattern Compliance Summary

| Aspect | Score | Weight | Weighted |
|---|---|---|---|
| Artifact directory structure | 4/5 | 1.0 | 4.0 |
| status.json quality | 5/5 | 1.0 | 5.0 |
| Orchestrator purity (no artifact reads) | 5/5 | 1.5 | 7.5 |
| Data relay avoidance | 5/5 | 1.5 | 7.5 |
| Context cleanliness | 5/5 | 1.5 | 7.5 |
| Phase skill decomposition | 5/5 | 1.0 | 5.0 |
| State.md scratchpad | 5/5 | 1.0 | 5.0 |
| Routing table explicitness | 3/5 | 0.5 | 1.5 |
| Researcher self-sufficiency | 3/5 | 0.5 | 1.5 |
| Writer self-sufficiency | 4/5 | 0.5 | 2.0 |
| Reviewer self-sufficiency | 2/5 | 0.5 | 1.0 |
| Missing-function audit (scribe) | 3/5 | 1.0 | 3.0 |
| | | **Σ 11.5** | **50.5** |

**Overall: 50.5 / 57.5 = 87.8% — Strong compliance with clear improvement areas**

### Strengths

1. **Perfect orchestrator purity on reads** — the orchestrator never reads a single artifact file. All 5 subagent interactions flow through status.json and one-line returns. Context saved: ~11,000 tokens.
2. **Clean filesystem artifact structure** — every subagent writes well-formed status.json with correct fields, appropriate result codes, and informative summaries. The writer uses versioned artifacts (`output-v1.md`), ready for iterative loops.
3. **Textbook prompt decomposition** — 7 phases, each with skill loading, state.md transition, and stop-and-read guard. Zero domain knowledge in the main agent prompt.
4. **Writer follows filesystem pointer** — the researcher→writer handoff is ideal: orchestrator provides a path, writer reads the file itself. No content relay.
5. **Parallel reviewer dispatch** — correctly uses background mode for 3 independent reviewers, routing on `result` from status.json.

### Weaknesses

1. **No manifest.json** — the append-only audit log prescribed by the artifact contract is entirely absent. No subagent writes to it. This means there's no machine-readable execution history for debugging, recovery, or downstream aggregation (e.g., a scribe couldn't enumerate what ran).
2. **Researcher prompt is a data dump** — ~2500 chars of JIRA content relayed through the orchestrator prompt. The pure pattern would have the orchestrator write JIRA content to a `task-input.md` artifact and dispatch the researcher with a path reference. This inflates orchestrator context unnecessarily.
3. **Reviewer prompts lack artifact pointers** — reviewers aren't told where writer artifacts are, aren't given a file list, and have no declared `Input` section. They self-discover, which works but wastes reviewer cycles and doesn't follow the subagent template contract (Input → Output → Result Codes).
4. **Scribe function not delegated** — Phase 8 (Handoff) has the orchestrator doing ~10 tool calls of content composition: writing a structured handoff doc, formatting a JIRA comment with wiki markup, posting to ralphchives with tags. This is exactly the scribe pattern the skill describes as the minimum viable subagent.
5. **No explicit routing table** — the orchestrator follows phase skill instructions for routing rather than a declared `(agent, result) → action` table. This means error paths, iteration limits, and failure routing are implicit in skill prose rather than inspectable upfront.

### Actionable Improvements

| Priority | Area | Recommendation |
|---|---|---|
| **High** | Reviewer prompts | Add input artifact declarations: `Input: ralph-writer/output-v1.md` + list changed files. Add specific verification targets per reviewer type. Follow the subagent template structure from the refactoring guide. |
| **High** | manifest.json | Have each subagent append to `{artifact-root}/manifest.json` after writing artifacts. Even without a scribe agent, this provides crash recovery and debugging. |
| **Medium** | Scribe agent | Extract Phase 8 handoff work into a `ralph-scribe` subagent. Input: all `*/status.json` + `*/output.md` + `manifest.json`. Output: `ralph-scribe/handoff.md` + `ralph-scribe/jira-comment.md`. Could use a cheaper model (sonnet) since it's formatting, not reasoning. |
| **Medium** | Task input artifact | During setup, write JIRA issue content to `.ralph/tasks/{task-id}/task-input.md`. Dispatch researcher with `"task-id: DOC-3187"` — one line. Researcher reads `task-input.md` from filesystem. Eliminates the ~2500-char relay. |
| **Low** | Explicit routing table | Add a `## Routing Table` section to the main agent template declaring all `(agent, result)` pairs, iteration limits, and error paths. Makes routing inspectable without reading phase skill prose. |
| **Low** | Reviewer model differentiation | Style and IA reviews could use a cheaper model (sonnet). Only technical review needs opus-level reasoning. The skill's multi-model consideration section flags this as a cost opportunity. |
