# DOC-3143 Agent Execution — Scored Evaluation

**Task:** Create documentation page for `FormComponentExtender<T>` system  
**Profile:** ralph-docs (copilot CLI, claude-opus-4.6)  
**Difficulty:** Very hard admin  
**Duration:** 20m 38s  
**Result:** Completed, PR #3014  
**Tool calls:** 85 total across 8 phases, 3 sub-agents  

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

**Tool sequence:** `skill(setup)` → `bash(git checkout + mkdir)` ❌ → `ralphchives(DOC-3143)` → `ralphchives(FormComponentExtender)` → `bash(git branch -a)` → `bash(git checkout -b)` ✅ → `create(state.md)` ❌ → `jira_add_comment(ack)` → `bash(mkdir -p)` → `create(state.md)` ✅

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 3 | Correct tool types throughout (bash for git, create for state.md, MCP for JIRA ack, ralphchives for prior-art), but chained `git checkout -b` with `&& mkdir -p` in a single bash call — when checkout failed (exit code 1), the whole chain failed silently. Two tools would have been cleaner. |
| D2 Ordering | 3 | Ralphchives prior-art check happened between the two branch creation attempts — not harmful, but awkward. JIRA ack comment posted *before* state.md was created (step 8 before step 10), meaning the ack went out before workspace was ready. Ideal: branch → dir → state → ack. |
| D3 Arguments | 3 | First bash call `git checkout main && git pull --quiet origin main 2>/dev/null && git checkout -b ralph/DOC-3143-form-component-extenders && mkdir -p .ralph/tasks/DOC-3143` — failed because the checkout succeeded but `git checkout -b` failed (already on main, branch didn't exist yet but the chaining was brittle). State.md `create` called without verifying parent dir. Branch name was correct. |
| D4 Efficiency | 3 | 10 tool calls for setup when ~5 would suffice: skill + bash(checkout+mkdir) + create(state) + jira_ack + 2× ralphchives. The doubled branch attempt and doubled state.md attempt are pure rework. |
| D5 Error Recovery | 4 | All three failures recovered successfully. Branch: investigated with `git branch -a`, then retried standalone `git checkout -b`. State.md: ran `mkdir -p`, then retried `create`. Reasonable recovery pattern — would have been a 5 if it checked preconditions first. |
| D8 Workflow | 4 | Loaded `ralph-workflow-setup` skill correctly. Used `report_intent` to announce phase. State.md created with correct format. Minor: ralphchives happened outside the expected setup flow position. |

**T1 Average: 3.3**

### T1 Findings
- **F1.1** (D3, efficiency): Chaining `git checkout -b` with `&& mkdir -p` in a single bash call is fragile. The `&&` means the entire pipeline fails if any command returns non-zero. The agent should either use separate tool calls or check preconditions.
- **F1.2** (D2): JIRA ack comment was fired before the workspace was fully initialized. If state.md creation had permanently failed, the ack would have been misleading.
- **F1.3** (D5, positive): Self-recovery was methodical — debug first (`git branch -a`), then retry with a simpler command. Good diagnostic instinct.

---

## T2: Research

**Tool sequence:** `report_intent` → `skill(research)` → `task(researcher)` [researcher internally: 3× `ralphchives` → `skill(research-guide)` ❌ → `skill(research)` → `grep` → `glob` → multiple `view` of source files and sibling pages] → `report_intent` → 3× `edit(state.md)` updates

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 4 | Correct use of `task` for researcher sub-agent. Researcher used `grep`, `glob`, `view` appropriately to find source code. Used ralphchives to check for prior work. Minor: researcher tried `skill("ralph-research-guide")` which doesn't exist — fell back to `skill("ralph-workflow-research")` (already loaded by main agent). |
| D2 Ordering | 4 | Prior-art check (ralphchives) → deep research (researcher sub-agent) → sibling page reading is logical. Main agent read sibling pages *after* researcher returned with source code findings. |
| D3 Arguments | 4 | Ralphchives queries ("DOC-3143", "FormComponentExtender form component extenders") were reasonable. Researcher sub-agent prompt was detailed with 6 specific research areas. All file paths correct. |
| D4 Efficiency | 3 | Main agent did 2 ralphchives searches *before* spawning researcher, who then did 3 more ralphchives searches on similar terms. The researcher re-read source files that could have been passed via prompt context. After researcher returned, main agent read 9 sibling/reference pages — partially overlapping with what the researcher already read. Sub-agent architecture makes some duplication unavoidable, but the 5 combined ralphchives queries for a topic with zero prior coverage is excessive. |
| D8 Workflow | 5 | Loaded `ralph-workflow-research` correctly. Used `report_intent` at phase boundary. Updated state.md with source references and tracked identifiers after research phase. |
| D9 Sub-agents | 4 | Researcher prompt was comprehensive (6 tasks: find source files, examine built-in extenders, map sibling pages, etc.). Output was used to populate state.md source refs and trackedIdentifiers. But: (a) researcher tried a nonexistent skill name, (b) researcher loaded `ralph-workflow-research` which the main agent had already loaded (sub-agents don't share loaded skills, so this is expected but still a cost). |

**T2 Average: 4.0**

### T2 Findings
- **F2.1** (D4): 5 total ralphchives queries across main agent + researcher for a topic with zero prior coverage. The main agent's 2 pre-researcher queries established this — the researcher's 3 additional queries were redundant.
- **F2.2** (D9): Researcher sub-agent tried `skill("ralph-research-guide")` — a nonexistent skill. This wasted one tool call and produced a "Skill not found" error. The agent self-recovered by loading the already-available `ralph-workflow-research`.
- **F2.3** (D4): Post-researcher reading of 9 sibling pages by the main agent is partially justified (main agent needs its own context), but the researcher had already read many of the same files. Better prompt engineering could reduce this overlap.

---

## T3: Create New Page

**Tool sequence:** `skill(write)` → 5× `view` (sibling pages) → `bash(find)` → 2× `view` (style guide, markdown syntax) → 2× `bash` (find model overview, grep identifier) → 2× `view` (model overview, ui-form-components) → `grep` → `edit(state.md subtasks)` → `report_intent` → `create(form-component-extenders.md)`

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Used `create` for new file (correct — not `edit`). Used `view` for sibling page research. Used `grep`/`bash(find)` for file discovery. All appropriate. |
| D2 Ordering | 5 | Page created after all research complete, sibling pages read, style guide consulted, subtasks planned in state.md. Perfect sequencing. |
| D3 Arguments | 5 | File path correct (`ui-form-components/form-component-extenders.md`). All frontmatter fields present and correct: `identifier: form_component_extenders_xp`, `order: 150` (correctly between "Editing components" at 100 and "Validation rules" at 200), `persona: developer`, `license: 1`, `redirect_from: x/form_component_extenders_xp`, `toc` config, `related_pages` with 4 verified identifiers. |
| D6 Content Accuracy | 4 | API signatures verified correct against source: `FormComponentExtender<TFormComponent>` base class ✅, `ConfigureComponent()` returns `Task` ✅, `FormComponent` property ✅, `FormComponentCommand` attribute ✅, `FormComponentExtenderAttribute` assembly registration ✅, `ResponseFrom<TResult>` ✅, namespace `Kentico.Xperience.Admin.Base.Forms` ✅. Minor issue: line 30 states "The type must implement the `IFormComponent` interface" — while technically correct (the generic constraint is `where TFormComponent : IFormComponent`), `IFormComponent` is `internal` in the source code. Users can't reference it directly; they target concrete component types like `TextInputComponent`. This could confuse readers who try to find `IFormComponent` in the public API. Also: DI example shows `IInfoProvider<UserInfo>` without the `CMS.Membership` using statement. |
| D7 Style & Structure | 4 | Matches sibling conventions well: `{% note %}` for namespace callout (matches editing-components.md pattern), `{% code lang=csharp title="..." %}` blocks, `{% tip %}` for supplementary info, consistent heading levels (h2 for sections). Comparison table at the end is a valuable addition beyond strict requirements. Minor: `maxHeadingLevel: 6` while siblings use `2` or `3` — cosmetic but inconsistent. Line 92 used "invokable" (caught by reviewer, fixed). |
| D8 Workflow | 5 | Loaded `ralph-workflow-write` skill. Used `report_intent`. Planned subtasks in state.md before writing. |

**T3 Average: 4.7**

### T3 Findings
- **F3.1** (D6): `IFormComponent` is internal but documented as a public constraint the user should know about. Not technically wrong, but could mislead developers scanning public API docs.
- **F3.2** (D7): `maxHeadingLevel: 6` in toc config differs from siblings (typically 2–3). Non-breaking but inconsistent.
- **F3.3** (D6, positive): The comparison table (7 criteria across extender/configurator/custom component) goes beyond what was strictly required and adds significant value.
- **F3.4** (D6, positive): Code examples are well-constructed — one showing `ConfigureComponent` override with property modification, one showing `FormComponentCommand` with DI and `ResponseFrom<T>`. Both demonstrate realistic patterns.

---

## T4: Cross-reference Updates

**Tool sequence:** 4× `edit` (editing-components.md, configure-editing-component-state.md, admin-ui-customization-model-overview.md, ui-form-components.md)

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Used `edit` for all 4 file modifications — correct for modifying existing files. |
| D2 Ordering | 5 | Cross-refs added immediately after main page creation and first build check. Before second build check. Correct position in workflow. |
| D3 Arguments | 5 | All edits precise: (1) editing-components.md: `{% tip %}` callout in "Configure components dynamically" section + `form_component_extenders_xp` in `related_pages`; (2) configure-editing-component-state.md: `{% tip %}` callout at page end + `related_pages` update; (3) model-overview.md: inline sentence in "UI form component framework" section; (4) ui-form-components.md: `related_pages` addition only. All identifiers verified to resolve correctly. |
| D4 Efficiency | 5 | Exactly 4 edits for 4 files needing updates. No missed cross-references (verified: the agent updated every page that logically should link to extenders). No unnecessary edits. No redundant reads — all pages were already read during research phase. |
| D6 Content Accuracy | 5 | Cross-reference descriptions are accurate: "globally modify behavior", "add custom commands without subclassing", "alternative to configurators for modifying component behavior". Each matches the actual capability documented in the new page. |

**T4 Average: 5.0**

### T4 Findings
- **F4.1** (positive): Cross-reference coverage was comprehensive — the agent identified all 4 pages that should reference the new extenders page. No missed or spurious links.
- **F4.2** (positive): Used contextually appropriate link styles — `{% tip %}` callouts where the page had an existing section about dynamic configuration (editing-components.md, configure-editing-component-state.md), inline sentence where the page had a description paragraph (model-overview.md), and `related_pages` only where no natural insertion point existed (ui-form-components.md).

---

## T5: Build Validation

**Tool sequence:** `bash(npm run build)` → [cross-ref edits] → `bash(npm run build)` → [validator] → ... → `bash(npm run build)` before commit

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Used `bash` with `npm run build` — correct. |
| D2 Ordering | 4 | Build ran after page creation (good — early feedback), after cross-refs (good), and before commit (good — final gate). The post-creation build before cross-refs could be skipped since you'd need to rebuild after cross-refs anyway, but it provides early detection of frontmatter/syntax issues on the new page. Defensible. |
| D3 Arguments | 4 | Command correct. First build had 120s timeout. Second and third builds also correct. |
| D4 Efficiency | 4 | 3 builds total. The middle one (after cross-refs, before validator) and the final one (before commit) are both justified. The first one (after page creation, before cross-refs) is debatable — it catches new-page issues early but adds ~60s. On balance: acceptable for a "very hard" task where early feedback reduces rework risk. |
| D8 Workflow | 5 | Build validation at workflow checkpoints is prescribed behavior. All builds ran at phase-appropriate times. |

**T5 Average: 4.4**

### T5 Findings
- **F5.1** (D4): 3 builds is at the upper bound of reasonable. For a simpler task, 2 would suffice (after all changes + before commit). The early build after just the new page provides value as a smoke test.

---

## T6: Release Notes

**Tool sequence:** `skill(ralph-write-release-notes)` → `bash(mkdir -p /tmp/mcp-attachments)` → `create(release-notes.md)` → 2× `edit(state.md)`

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Loaded correct skill, used `bash` for directory creation, `create` for file. All correct. |
| D3 Arguments | 5 | Correct path `/tmp/mcp-attachments/release-notes.md`, correct format, "New features" category. Content describes the new page accurately. |
| D7 Style | 4 | Release notes follow expected format. Content is concise and accurate. |
| D8 Workflow | 5 | Triggered by `release_notes` param in JIRA comment. Skill loaded correctly. Written after validation but before review (correctly — release notes are part of the deliverables, not review material). |

**T6 Average: 4.8**

---

## T7: Sub-agent Validation

**Tool sequence:** `task(ralph.ralph-validator)`

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Used `task` to invoke `ralph.ralph-validator` — correct. |
| D4 Efficiency | 3 | Validator sub-agent re-read all 5 modified/created files. This is inherent to the sub-agent architecture (sub-agents don't inherit the main agent's file cache), but it means ~800 lines of file content were re-read. The validator also ran its own internal checks. The efficiency cost is ~5 tool calls of overhead. |
| D8 Workflow | 5 | Validator invoked after all content changes and build check. Correct phase position. |
| D9 Sub-agents | 4 | Validator prompt directed it to check the main page creation (CREATE-001) and cross-references. Validator confirmed all subtasks complete. Output was used to proceed to review. The validator's scope was appropriate — not too broad, not too narrow. |

**T7 Average: 4.3**

### T7 Findings
- **F7.1** (D4): Validator re-reading is architecturally unavoidable but represents a non-trivial token cost. A potential optimization: pass file contents directly in the validator prompt to skip re-reads.

---

## T8: Review

**Tool sequence:** `skill(review)` → `task(ralph.ralph-reviewer)` → `edit(fix "invokable")` → `edit(state.md)`

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Used `task` for reviewer sub-agent and `edit` for applying the fix. Correct. |
| D3 Arguments | 5 | Reviewer fix was applied precisely: "invokable" → "commands that execute server-side logic from the form component's client template." The replacement was targeted and correct. |
| D8 Workflow | 5 | Loaded `ralph-workflow-review` skill. Review ran after validation. State.md updated with phase transition. |
| D9 Sub-agents | 5 | Reviewer approved first cycle (APPROVED). Found one actionable style issue (STY-N01: "invokable" is non-standard English) and one informational note (STY-N02: slightly long sentences). Agent applied the actionable fix immediately. No unnecessary revision loop. Efficient, high-signal review. |

**T8 Average: 5.0**

### T8 Findings
- **F8.1** (positive): First-cycle approval indicates high-quality first draft. The single style fix was genuine (the word "invokable" doesn't appear in standard dictionaries).
- **F8.2** (D9, positive): Agent correctly triaged reviewer feedback — applied the fix for STY-N01 (actionable) and did not attempt to fix STY-N02 (informational, no specific change requested).

---

## T9: Commit & Push

**Tool sequence:** `skill(commit)` → `bash(npm run build)` → `bash(git add)` → `bash(git commit)` → `bash(git push)` ❌ → `ado_push_progress` ✅ → 2× `edit(state.md)`

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Used `bash` for git operations — correct. When `git push` failed (HTTP 403 from proxy), correctly fell back to `ado_push_progress` MCP tool. |
| D2 Ordering | 5 | Final build check → git add → git commit → git push. Perfect sequence. The `git add` included `--no-pager diff --cached --stat` to verify staging — good practice. |
| D3 Arguments | 4 | Commit message: `docs(DOC-3143): Add form component extenders page` with detailed body covering all changes + `Co-authored-by: Copilot` trailer. Good conventional-commit format. `git add` explicitly listed all 5 files (no `git add .`). `git push` to correct remote/branch. Minor: the remote branch name became `ralph/DOC-3143-test-ralph-sandbox-issue-doc-3143` via the ADO tool (different from local `ralph/DOC-3143-form-component-extenders`) — the agent didn't control this (the MCP tool normalizes branch names), but it did note the mismatch in state.md. |
| D4 Efficiency | 5 | Clean sequence, no redundant steps. Final build check before commit is justified (reviewer fix applied after previous build). |
| D5 Error Recovery | 5 | `git push` returned HTTP 403 from proxy (expected — the container routes through Squid which blocks direct git push). Agent immediately and silently switched to `ado_push_progress` MCP tool, which succeeded. |
| D8 Workflow | 5 | Loaded `ralph-workflow-commit` skill. Used `report_intent`. Updated state.md. |

**T9 Average: 4.8**

### T9 Findings
- **F9.1** (D5, positive): The git push → ADO fallback was seamless. The agent didn't waste time debugging the proxy 403 — it knew the alternative path immediately.
- **F9.2** (D3): Branch name mismatch between local (`ralph/DOC-3143-form-component-extenders`) and remote (`ralph/DOC-3143-test-ralph-sandbox-issue-doc-3143`) was noted in state.md. This is an MCP tool behavior, not an agent error.

---

## T10: Pull Request

**Tool sequence:** 2× `skill(pr, ado-pr-workflow)` → `ado_create_pull_request` → 3× `edit(state.md)`

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Used `ado_create_pull_request` MCP tool — correct for ADO repos. Loaded both PR-related skills. |
| D3 Arguments | 5 | PR created as draft (`isDraft: true`). Title: `DOC-3143 - [Test] Ralph sandbox issue — DOC-3143`. Description is comprehensive: changes list with per-file descriptions, context section explaining the gap, 6 review notes including technical details about `ResponseFrom<T>`, generic constraints, and source file locations. Excellent PR description quality. |
| D8 Workflow | 5 | Loaded `ralph-workflow-pr` and `ralph-ado-pr-workflow` skills. Also used `ado_push_progress` before PR creation (correct — push must precede PR). State.md updated with PR URL. |

**T10 Average: 5.0**

### T10 Findings
- **F10.1** (D3, positive): PR description is exceptionally detailed. The "Review Notes" section includes 6 specific technical observations about the implementation — this level of detail significantly aids human review.

---

## T11: Handoff & Exit

**Tool sequence:** `skill(handoff)` → `report_intent` → `create(handoff-DOC-3143.md)` → 2× `jira_add_attachment(handoff, release-notes)` → `skill(source-references)` → `jira_add_comment(completion)` → `ralphchives_post_task_report` → `===RALPH_RESULT_START===`

| Dim | Score | Evidence |
|---|---|---|
| D1 Tool Selection | 5 | Used `create` for handoff, `jira_add_attachment` for file uploads, `jira_add_comment` for completion comment, `ralphchives-write-post_task_report` for archiving. All correct. |
| D2 Ordering | 5 | Handoff doc → JIRA attachments → source references → completion comment → ralphchives report → exit block. Correct sequence — attachments must exist before comment references them. |
| D3 Arguments | 5 | Handoff doc: per-file change descriptions, PR URL, status. Completion comment: formatted with source references to actual Xperience source files. Ralphchives report: task summary with changes and result. All complete and accurate. |
| D8 Workflow | 5 | Loaded `ralph-workflow-handoff` and `ralph-source-references` skills. Used `report_intent`. Updated state.md. |
| D10 Stopping Point | 5 | Emitted `===RALPH_RESULT_START===` block with `STATUS: completed` and `PR_URL` immediately after all deliverables were submitted. No premature exit (all attachments uploaded, all comments posted, ralphchives archived). No unnecessary post-completion work. Clean stop. |

**T11 Average: 5.0**

---

## Scoring Matrix

| Task | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 | Avg |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 Setup | 3 | 3 | 3 | 3 | 4 | — | — | 4 | — | — | **3.3** |
| T2 Research | 4 | 4 | 4 | 3 | — | — | — | 5 | 4 | — | **4.0** |
| T3 Create page | 5 | 5 | 5 | — | — | 4 | 4 | 5 | — | — | **4.7** |
| T4 Cross-refs | 5 | 5 | 5 | 5 | — | 5 | — | — | — | — | **5.0** |
| T5 Build | 5 | 4 | 4 | 4 | — | — | — | 5 | — | — | **4.4** |
| T6 Release notes | 5 | — | 5 | — | — | — | 4 | 5 | — | — | **4.8** |
| T7 Validation | 5 | — | — | 3 | — | — | — | 5 | 4 | — | **4.3** |
| T8 Review | 5 | — | 5 | — | — | — | — | 5 | 5 | — | **5.0** |
| T9 Commit & push | 5 | 5 | 4 | 5 | 5 | — | — | 5 | — | — | **4.8** |
| T10 Pull request | 5 | — | 5 | — | — | — | — | 5 | — | — | **5.0** |
| T11 Handoff & exit | 5 | 5 | 5 | — | — | — | — | 5 | — | 5 | **5.0** |

### Dimension Averages

| Dimension | Scores | Average |
|---|---|---|
| D1 Tool Selection | 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5 | **4.7** |
| D2 Tool Ordering | 3, 4, 5, 5, 4, 5, 5, 5 | **4.5** |
| D3 Argument Quality | 3, 4, 5, 5, 4, 5, 5, 4, 5, 5 | **4.5** |
| D4 Efficiency | 3, 3, 5, 4, 3, 5 | **3.8** |
| D5 Error Recovery | 4, 5 | **4.5** |
| D6 Content Accuracy | 4, 5 | **4.5** |
| D7 Style & Structure | 4, 4 | **4.0** |
| D8 Workflow Compliance | 4, 5, 5, 5, 5, 5, 5, 5, 5, 5 | **4.9** |
| D9 Sub-agent Utilization | 4, 4, 5 | **4.3** |
| D10 Stopping Point | 5 | **5.0** |

### Overall Score

**All 53 individual scores sum to 238 → Overall average: 4.49 / 5.00**

---

## Summary of Strengths

1. **Workflow compliance (4.9)**: Near-perfect adherence to the 8-phase workflow. Every skill loaded at the right boundary, every `report_intent` fired, state.md tracked throughout.
2. **Stopping point (5.0)**: Clean exit — all deliverables submitted before `===RALPH_RESULT_START===`. No premature termination, no wasted post-completion work.
3. **Cross-reference quality (T4 = 5.0)**: Identified all 4 pages needing updates, used contextually appropriate link styles, all identifiers verified correct.
4. **PR description quality (T10 = 5.0)**: Exceptionally detailed — per-file changes, architectural context, and 6 technical review notes. Well above average for automated PRs.
5. **Error recovery (4.5)**: Both the git push proxy failure and the early setup failures were handled cleanly without diagnostic spirals.
6. **Content accuracy (4.5)**: API signatures verified against source code. Namespace, types, methods, attributes all correct. Code examples demonstrate realistic patterns.

## Summary of Weaknesses

1. **Efficiency (3.8)**: This is the weakest dimension.
   - 5 combined ralphchives queries for a topic with zero prior coverage (2 by main agent + 3 by researcher sub-agent)
   - Validator sub-agent re-reading all 5 files already known to main agent
   - 3 builds when 2 would suffice for most cases
   - Setup phase used 10 tool calls where 5 would work
2. **Setup phase (T1 = 3.3)**: Weakest task. Brittle `&&`-chained bash commands, wrong precondition assumptions (parent dir exists), JIRA ack before workspace ready.
3. **Style consistency (4.0)**: Minor deviations — `maxHeadingLevel: 6` vs siblings' `2`–`3`, and the "invokable" non-word that needed reviewer correction.
4. **Sub-agent duplication (D9 = 4.3)**: Researcher searched ralphchives for the same terms the main agent had already searched. Researcher tried a nonexistent skill name. Validator re-read all project files.

## Actionable Improvement Areas

| Priority | Area | Recommendation |
|---|---|---|
| **High** | Setup robustness | Don't chain git + mkdir in a single bash call. Verify preconditions (does parent dir exist?) before `create`. Post JIRA ack only after workspace is confirmed ready. |
| **High** | Sub-agent context passing | When spawning researcher, include the main agent's ralphchives results in the prompt to avoid duplicate queries. Consider passing file contents to validator in prompt to skip re-reads. |
| **Medium** | Build frequency | Two builds are sufficient: one after all content changes (page + cross-refs), one before commit. The early single-page build is low-value for most tasks. |
| **Low** | Frontmatter consistency | Copy `toc.maxHeadingLevel` from the nearest sibling page rather than defaulting to 6. |
| **Low** | Researcher skill loading | Researcher sub-agent should receive a list of available skills in its prompt, or the workflow skill should document that `ralph-research-guide` doesn't exist. |
