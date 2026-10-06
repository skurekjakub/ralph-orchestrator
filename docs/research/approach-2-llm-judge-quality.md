# Evaluation Approach 2: LLM-as-Judge Multi-Dimensional Quality Scoring

## Philosophy

This approach evaluates the **quality of what the agent produces**, not how it produced it. Where Approach 1 examines the trajectory (did the agent use the right tools in the right order?), this approach examines the _output artifacts_: the PR description, the documentation written, the handoff file, and the JIRA comment. These are the things that human reviewers, stakeholders, and downstream systems actually consume.

The core insight from G-Eval, Prometheus 2, and Agent-as-a-Judge research is that rubric-conditioned LLM judges — given a task-specific scoring rubric with a chain-of-thought instruction — correlate with human judgments at Spearman ρ ≈ 0.8–0.9 and can evaluate at a fraction of human cost and latency. Critically, each quality dimension gets its own evaluator: a single "rate this output 1–10" prompt is known to be unreliable and hard to calibrate, whereas separate evaluators for correctness, completeness, and faithfulness each produce interpretable, actionable signals.

For this system specifically, the most important quality axis is **faithfulness to the JIRA issue**: did the agent actually address the task described in the issue, or did it write plausible-sounding documentation that doesn't match what was asked? This is harder to catch than it sounds — an agent producing high-quality documentation for the _wrong feature_ scores perfectly on grammar and structure but completely fails on task.

**No reference output is required for most metrics.** This is reference-free evaluation: the JIRA issue itself (summary, description, comments, components, labels) serves as the specification. The judge asks "does this output satisfy the specification?" rather than "does this match a gold standard?"

---

## Metrics

### Faithfulness (Primary)

**Issue-to-Output Faithfulness**
Does the output address the JIRA issue that triggered the task? The judge is given: the normalized JIRA issue (key, summary, description, type, components, labels, comments) and the produced artifact (PR description or documentation file). It extracts all factual claims in the output and classifies each as: supported by the issue specification, unsupported but plausible, or contradicting the specification. The score is `supported / (supported + contradicting)`. Unsupported claims are flagged as potential hallucinations.

Operationally derived from DeepEval's `FaithfulnessMetric` pattern, adapted from RAG faithfulness evaluation. The specification acts as the "retrieval context"; the output acts as the "answer".

**Source Material Fidelity**
For documentation tasks that require reading source code (via `get_file_contents` or equivalent), does the output accurately reflect what the source code does? This requires the trajectory logs to identify which files were read. The judge is given the file contents read during the run and the documentation produced, and checks whether API signatures, parameter names, return types, and behavioral descriptions are accurate. This catches a critical failure mode: an agent confidently documenting an interface from memory rather than reading the actual code.

**Revision Faithfulness**
For revision tasks (`isRevision: true`), does the agent correctly address the specific defects noted in the JIRA comments? The judge reads the comments that triggered the revision and the new output, checking whether each stated defect was addressed. Score: fraction of stated defects addressed. An agent that produces a higher-quality document but ignores the reviewer's specific requests has failed the revision task even if the absolute quality improved.

### Completeness

**Requirement Coverage**
Each documentation task type has a decomposable set of requirements. For an API reference: describe the function's purpose, list all parameters with types and descriptions, document return value, show a usage example, note exceptions. For a tutorial: prerequisites, step-by-step instructions, expected output at each step, troubleshooting section. Encoded as a binary checklist per task type. Score: fraction of required elements present in the output.

Distinguishes intentional incompleteness (agent correctly identifies scope limits) from unintentional omission (agent missed a required section). The transcript is used to determine intent.

**Cross-Reference Integrity**
Documentation that references other documents, functions, or endpoints should link to things that exist. The judge extracts all internal cross-references from the output and checks each against the list of files read during the run and the known repository structure. Broken references score negatively. This is a documentation-specific metric with no equivalent in general coding agent benchmarks.

**Task Scope Adherence**
Did the agent stay within the bounds of the task? This cuts both ways: under-scope (produced less than asked) and over-scope (added unsolicited content, modified files not mentioned in the issue, created PRs for unrelated changes). Over-scope is often as problematic as under-scope in documentation workflows because it creates review burden.

### Output Quality

**Structural Conformance**
Documentation artifacts should conform to established conventions for the profile's target repository. This is evaluated against profile-specific style rules (extracted from `shared/agent-includes/ado-pr-format.md` and any profile-specific style guides). The judge checks: PR description has required sections (Changes, Context, Review Notes), documentation uses correct heading hierarchy, code samples are properly fenced, links use the correct URL format for the profile's source browser.

**Technical Accuracy (Best-Effort)**
A rubric evaluation of whether technical claims in the output are consistent with what a knowledgeable reviewer would expect. This is a soft metric — the judge is not a domain expert — but it can flag obvious errors: wrong language-specific syntax, incorrect descriptions of standard library functions, implausible configuration values. Track as a qualitative flag (plausible / suspicious / clearly wrong) rather than a continuous score.

**Clarity and Actionability**
For documentation specifically: is the output useful to its intended audience? The judge is given context about the audience (e.g., "Kentico CMS developer unfamiliar with this module") and evaluates: are instructions clear enough to follow without ambiguity? Are code examples runnable? Does the prose avoid unexplained jargon? This is the most subjective metric and should be weighted accordingly — primarily used to flag outliers, not rank outputs.

### Instruction Following

**Agent Persona Compliance**
The agent templates (`*.agent.md`) include behavioral instructions — tone, audience, output format, scope constraints. Does the output comply with these? The judge is given the rendered agent template (available in `.build/`) and the output, and checks compliance with explicitly stated instructions. This makes instruction-following evaluation _specific to each profile's agent_, not generic.

**Security Instruction Compliance**
Did the agent treat the issue data in its prompt (description, comments, custom fields) strictly as task information, as the `prompt-security` include instructs? Evidence: does the PR or handoff contain any content that appears to be a prompt injection attempt passed through uncritically? Does the output contain any task metadata in contexts where it shouldn't appear (e.g., embedding a comment author's injected text verbatim in documentation)? Track as a binary flag per run.

This metric closes a current blind spot: the orchestrator's prompt auditor (`src/prompt/prompt-auditor.ts`) detects injection _in the input_, but nothing currently checks whether injected content influenced the _output_.

**Scope Lock Compliance**
The agent's instructions constrain it to operate on a single JIRA issue and a single branch. Evidence of violation: PRs touching files unrelated to the issue, branch names containing issue keys other than the assigned one, comments or handoffs mentioning unrelated work. This is deterministic enough to check without an LLM judge — parse the PR diff list and branch name.

---

## Architecture

### Evaluation Harness Structure

Each metric is an independent **evaluator** with a defined interface:

```
Evaluator:
  input: EvalContext {
    issueKey, issueSummary, issueDescription, issueComments,
    issueType, issueComponents, issueLabels, isRevision,
    agentTemplateContent,          // from .build/*.agent.md
    prUrl, prDescription,          // fetched from ADO after run
    handoffContent,                // from output artifacts
    filesRead: string[],           // extracted from trajectory
    filesModified: string[],       // from PR diff
  }
  output: EvalResult {
    score: number (0–1),
    label: "pass" | "warn" | "fail",
    reasoning: string,             // LLM chain-of-thought
    flags: string[],               // specific issues found
  }
```

Evaluators run _asynchronously_ after task completion. The main orchestrator loop is not blocked. Results stored in `output/evals/<issueKey>-<ts>-quality.json`.

### Judge Configuration

**Model selection**: use a different model from the one that produced the output. If the agent ran on Claude Opus, evaluate with Claude Sonnet (cheaper, faster, different generation distribution). This reduces self-enhancement bias where a model rates its own family's output more favorably.

**Panel approach**: for high-stakes metrics (Faithfulness, Requirement Coverage), run 3 independent judge calls with the same rubric and different sampling temperatures. Report mean score and inter-judge agreement. When agreement is low (variance > 0.2), flag for human review rather than reporting an automated score.

**Rubric structure** (following G-Eval best practices):

1. Task description (what the agent was asked to do)
2. Evaluation criteria (what this specific dimension measures)
3. Scoring scale with anchored descriptions (1 = clearly fails; 3 = partially meets; 5 = fully meets, with concrete examples at each level)
4. Chain-of-thought instruction (think through each criterion before scoring)
5. Score instruction (provide the score in a parseable format AFTER reasoning)

Never ask for a score before the reasoning. The order matters — generating reasoning first demonstrably improves score quality.

**Calibration**: maintain a calibration set of 20–50 (evaluator input, expected score, human rationale) examples. Before each major evaluator prompt change, re-run the calibration set and check that scores shift predictably. Calibration should be profile-specific — the ADO PR evaluator for `ralph-docs` has different quality expectations than for `ralph-vscode`.

### Output Artifact Collection

The current orchestrator collects logs but does not automatically fetch the PR description or diff from ADO. The evaluation harness would need to:

1. Parse the `prUrl` from `summary.json`
2. Call the ADO REST API to fetch PR metadata (description, changed files, review comments)
3. Read the handoff file from the output directory
4. Read the rendered agent template from `.build/`

This is a net-new data collection step, but the ADO API credentials and client patterns already exist in `shared/mcp-servers/ado/`.

### Feedback Loop

**Short cycle** (per-run): evaluation results posted as a structured JSON attachment to the JIRA issue, visible alongside the existing transcript attachment. Enables the human reviewer to see quality scores alongside the PR.

**Medium cycle** (weekly): aggregate scores by variant and metric. Low-scoring metrics across multiple runs indicate systematic prompt problems. For example, if Faithfulness consistently scores below 0.7 for `ralph-vscode` runs but above 0.9 for `ralph-docs` runs, the `ralph-vscode` agent template likely needs revision.

**Long cycle** (model updates): when switching models (e.g., Opus 4 → next generation), re-evaluate the last 30 completed runs with the new model's output to detect quality regression or improvement before deploying.

### Reviewer Interface

The quality evaluation results should surface to the human PR reviewer without overwhelming them. Proposed: include a structured "Ralph Evaluation Summary" section in the JIRA comment posted after task completion:

```
Ralph Evaluation Summary
├─ Faithfulness:         0.94 ✓
├─ Requirement Coverage: 0.80 ✓ (missing: troubleshooting section)
├─ Instruction Following: 0.91 ✓
├─ Scope Compliance:     PASS ✓
└─ Technical Accuracy:   suspicious ⚠ (2 claims flagged)
```

Flags trigger human attention without blocking the workflow. The reviewer decides whether flagged items are real issues or false positives, and that feedback (confirmed issue / false positive) goes back into the calibration set.

---

## Prioritization

Order of implementation (highest ROI first):

1. **Issue-to-Output Faithfulness** — the highest-impact metric; catches the most consequential failure (output doesn't address the task). Can be implemented with a single well-calibrated evaluator prompt.
2. **Scope Lock Compliance** — deterministic, cheap to check, important for safety. No LLM needed for the branch name and file path checks.
3. **Requirement Coverage** — per task type, ~2 hours to define the checklist. Immediately actionable.
4. **Security Instruction Compliance** — closes an existing blind spot in the prompt injection defense pipeline.
5. **Revision Faithfulness** — critical for the revision workflow which is a core use case.
6. Remaining metrics — add incrementally as the evaluation infrastructure matures.

---

## Task Complexity Taxonomy (Kentico Docs)

Quality dimensions vary significantly by task complexity. A rubric designed for a Tier 1 atomic edit will fail to capture what matters in a Tier 4 integrated task.

| Tier | Name                                            | Quality Dimensions That Matter Most                                                                                |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1    | Atomic (1 file, 1–15 lines)                     | Structural correctness (valid Liquid tags, valid frontmatter fields); factual accuracy of the specific change      |
| 2    | Depth-Sequential (2–3 files, 10–60 lines)       | + Cross-reference integrity (new page_links resolve, nav YAML updated); source fidelity (code matches API)         |
| 3    | Width-Parallel (3–6 files, 50–150 lines)        | + Completeness (all required sections across all files); scope adherence (no unintended file modifications)        |
| 4    | Complex-Integrated (6–15 files, 100–500+ lines) | + Identifier consistency across files; changelog accuracy; persona targeting; .NET project compiles and tests pass |

For Tier 4 tasks, the quality evaluator must receive the _full set_ of changed files simultaneously — evaluating each file in isolation will miss identifier inconsistencies that only appear when comparing across files.

---

## Ground Truth Design

### What Ground Truth Means for Quality Evaluation

The 2025 consensus (arXiv:2501.12011, SCICOQA arXiv:2601.12910) is that for documentation agents, ground truth should not be a canonical reference output but a **property specification**: an enumerated list of binary or scalar properties the output must satisfy. This is more useful than reference-matching because:

- Multiple valid documentation styles exist; forcing one style penalizes acceptable variation
- Properties are separately auditable — a failure on one property doesn't contaminate scores on others
- Properties can be updated as documentation standards evolve without rebuilding the entire dataset

### Deterministic Property Ground Truth (No LLM Required)

These properties derive directly from the repository's structure and tooling. They are the cheapest and most reliable ground truth available.

**Frontmatter schema compliance** (`src/_documentation/**/*.md`):
Every new page must have all required frontmatter fields. The schema is fully specifiable from the Jekyll config `src/_configs/_config_primary.yml`:

```
Required: title (non-empty string), persona (one of: developer, architect, admin, business, all),
          identifier (5-char alphanumeric, unique across all pages), order (integer), license (integer 1-N)
Optional: redirect_from, toc, related_pages, pagetree, sitemap, searchable, docsbot
```

Evaluation: parse frontmatter with a YAML parser, validate against schema. Binary per-field. Zero LLM calls needed.

**Navigation tree integrity** (`src/_data/pagetree/documentation.yml`):
After any task that creates a new page, the page's identifier must appear as a child entry under the correct parent in `documentation.yml`. The parent is determined by the page's filesystem path (the Jekyll collection routing maps directory structure to navigation hierarchy). Evaluation: parse the YAML, traverse to the expected parent, check for identifier presence. Deterministic.

**`page_link` reference validity**:
Extract all `{% page_link IDENTIFIER %}` occurrences in files modified by the agent. Each identifier must appear as the `identifier` frontmatter field of at least one `.md` file in the repository. Evaluation: build an in-memory identifier set from all frontmatter, check each tag against it. Deterministic. Extends to `{% inpage_link %}` tags: the referenced anchor must exist in the same page.

**`anchor` tag completeness**:
Every `{% inpage_link "NAME" %}` must have a matching `{% anchor NAME %}` in the same file. Evaluation: per-file, regex extract both sets, check subset relationship. Deterministic.

**Liquid tag vocabulary conformance**:
The complete set of valid custom Liquid tags is defined in `gems/liquid-kfm/lib/Markdown/`. Any tag used in agent-written documentation must be in this set. Evaluation: extract all `{% tagname %}` occurrences and check against the known vocabulary list. An agent inventing fictitious tags (e.g., `{% highlight %}` instead of `{% info %}`) produces documentation that will fail Jekyll build. Deterministic.

**Code sample compilation** (`src/_code/src/CodeSamples/`):
Any `.cs` file added or modified must compile in the context of the CodeSamples .NET project. The existing `npm run codesamples:build` script (`dotnet build`) is the oracle. Pass/fail, deterministic. For `.NET` projects specifically, Roslyn compiler errors are unambiguous.

**`.NET` API surface accuracy**:
Code samples reference types and methods from the Xperience source at `resources/repositories/xperience/CMSSolution/`. Cross-reference: every type name, method name, and namespace used in a code sample must exist in the Xperience source at the repository's current HEAD (or a pinned version). Automated via Roslyn's semantic analysis — build the solution against the Xperience source and check for unresolved symbol errors. This catches the critical failure mode: an agent writing code for an API that doesn't exist or was renamed.

### Rubric-Based Property Ground Truth (LLM Required)

These properties require semantic understanding. Use the RRD (Recursive Rubric Decomposition, arXiv:2602.05125) framework: start with coarse criteria, recursively decompose, filter correlated sub-criteria, weight inversely by inter-criterion correlation. Empirical result: +17.7 points on JudgeBench compared to standard rubrics.

**Per-task-type documentation completeness** — the required content elements differ by documentation type, defined by the Diataxis model (which the Kentico docs system already uses per `_config_primary.yml`):

_Concept pages_ (explain how something works):

- [ ] Describes the purpose of the feature/system in the first 2 paragraphs
- [ ] Explains key terms before using them
- [ ] Includes at least one architectural diagram description or visual reference
- [ ] Links to relevant how-to pages via `related_pages` or inline `{% page_link %}`
- [ ] Does not include step-by-step instructions (those belong in how-to pages)

_Tutorial pages_ (guided walk-through):

- [ ] States prerequisites explicitly (required knowledge, installed software, access rights)
- [ ] Each step is independently executable (can copy-paste and run)
- [ ] Includes expected output after each step that changes system state
- [ ] Includes a troubleshooting or "if something goes wrong" note
- [ ] Terminal/code blocks use correct language tags (`{% code lang=csharp %}`)

_API reference pages_:

- [ ] All public methods/classes are documented
- [ ] Each parameter has a type annotation and description
- [ ] Return type is documented
- [ ] At least one usage example per method
- [ ] Exceptions/errors are listed
- [ ] Cross-reference to the relevant concept page

_How-to pages_ (task-oriented):

- [ ] Goal is stated in the title and first sentence
- [ ] Steps are numbered
- [ ] Code samples compile against the declared .NET/Xperience version
- [ ] Includes a next-steps section linking to related tasks

**These checklists are the ground truth for the Requirement Coverage metric.** They encode what the Kentico documentation team expects of each page type. Each item is binary. Human refinement work (below) involves writing anchored descriptions for partial credit on non-binary items.

### Cross-Artifact Consistency Ground Truth (SCICOQA Pattern)

The SCICOQA paper's (arXiv:2601.12910, Jan 2026) framework for evaluating consistency between a paper and its code repository applies directly here: evaluate whether the documentation is consistent with the Xperience source code, not whether it matches a reference document.

**Coverage check (Recall equivalent)**: does the documentation describe the full public API surface of the module being documented? Operationalized: extract all `public` methods and properties from the Xperience source using Roslyn. Check each against the documentation text. Coverage = (surface items mentioned in docs) / (total public surface items). Target ≥ 0.85 for API reference pages.

**Hallucination check (Precision equivalent)**: does the documentation describe API elements that don't exist? Operationalized: extract all method names, type names, and property names mentioned in the documentation text. Check each against the Xperience source using Roslyn. Precision = (documented items that exist in source) / (total documented items). A precision below 0.95 means the agent is inventing API surface. This is the most severe quality failure.

**Version accuracy**: the Xperience version documented must match the version in the repository snapshot used during the run. Check that code examples reference types that exist in that version, not a future or past version. Particularly important for changelog entries.

---

## Human Refinement Work

The following tasks are required to operationalize quality evaluation. They are enumerated in approximate priority order.

### Rubric Design (One-Time Foundation)

1. **Apply RRD decomposition to the 5 primary quality dimensions**: for each of (Faithfulness, Completeness, Structural Conformance, Technical Accuracy, Instruction Following), write 3 coarse criteria, then decompose each into 3–5 fine-grained sub-criteria. Filter sub-criteria with pairwise correlation > 0.7 (they measure the same thing). Target: 12–20 total independent criteria across all dimensions.

2. **Write anchored scoring descriptions** for each sub-criterion using a 1–5 scale with concrete examples at each level. Follow the C3AI finding: write each criterion in positive behavior-based form ("the return type is documented for each method") not negative form ("the documentation does not omit return types"). This empirically improves judge consistency.

3. **Lock rubric definitions** per Rulers (arXiv:2601.08654): convert each criterion into a deterministic scoring procedure with required evidence citation. The judge must quote specific text from the output that justifies each score. Judges that cannot quote evidence must score 1. This prevents unverifiable reasoning.

4. **Validate rubrics against known-good and known-bad documentation**: collect 5 examples of documentation the team considers excellent (A-grade) and 5 examples of poor documentation (merged but known to have quality issues). Run rubrics against each. If rubrics don't clearly differentiate the two groups, revise.

### Completeness Checklists (Per Task Type)

5. **Review and finalize the completeness checklist for each Diataxis page type** (concept, tutorial, how-to, API reference) with at least 2 Kentico documentation team members. The goal: any two reviewers reading the checklist would independently produce the same binary pass/fail for each item. Items where reviewers disagree need clarification or removal.

6. **Add Kentico-specific items to the standard Diataxis checklists**: e.g., "uses `{% page_link %}` tags for internal links (not hard-coded URLs)", "persona field matches the intended audience", "all code samples use Xperience-compatible APIs for the documented version".

7. **Write the changelog entry format specification**: the `jekyll-changelog` gem generates changelogs from structured entries. Define: required fields (category: new-features/fixed-issues/general; title; description; affected components; version). This becomes the Structural Conformance ground truth for changelog entries.

### API Surface Ground Truth

8. **Establish the Roslyn analysis pipeline** for the Xperience source at `resources/repositories/xperience/CMSSolution/`: script that extracts all `public` types, methods, and properties into a machine-readable index. This index is the ground truth for Coverage and Hallucination checks. Update process: run the script against each new Xperience version tag.

9. **Define the "documented surface" extraction rules**: how to extract type names, method names, and parameter names from documentation markdown. Handle special cases: types mentioned in passing vs. types being documented; code examples vs. prose descriptions; deprecated items.

10. **Identify the 10 most-commonly-documented API modules** in the Kentico docs repo (by page count and recent commit activity). Prioritize these for ground truth coverage — the Coverage and Hallucination checks are most valuable where the documentation surface is largest.

### Calibration Dataset

11. **Build a calibration set of 40–60 labeled examples**: for each evaluator, collect 10 examples at each quality level (poor, acceptable, good, excellent) with human-written rationale for the score. Examples should include both Tier 1 and Tier 4 tasks to prevent calibration bias toward simple tasks.

12. **Test the panel agreement threshold**: run 3 independent judge calls on the calibration set at temperatures 0.3, 0.7, and 1.0. Measure inter-judge variance. Set the "flag for human review" threshold at the variance level where judges disagree more than the human calibration range for that criterion.

13. **Cross-validate with a different LLM family**: if judges are Claude-based and agents are Claude-based, run calibration set evaluations with a non-Anthropic judge (e.g., GPT-4o) to measure self-enhancement bias. If scores differ by >15% systematically, use the external judge for quality evaluation to reduce bias.

### Feedback Loop Infrastructure

14. **Design the structured evaluation comment format** posted to JIRA: which metrics appear, in what order, with what thresholds for pass/warn/fail indicators. Get sign-off from the documentation team — they are the primary consumers of this information.

15. **Define the reviewer feedback protocol**: when a reviewer believes an automated score is wrong (confirmed issue vs. false positive), how do they record this? This data feeds calibration set updates. Design for low friction — a single button click, not a form.

---

## Prompt Architecture Levers

You cannot modify model weights. Every quality metric in Approach 2 is a measurement of something the prompt either encourages or fails to prevent. The following changes operate entirely at the prompt and template level (`profiles/ralph-docs/agents/*.agent.md`, `shared/agent-includes/`, and rendered context via `TemplateContext`). Each lever is mapped to the specific quality metric it improves.

### Diataxis Page Type Commitment

The completeness checklist (P7) is page-type-specific: concept pages require a different set of sections than API reference pages. If the agent doesn't explicitly commit to a page type early, the evaluator cannot determine which checklist applies, and the agent may produce a hybrid that satisfies no checklist fully.

**Lever**: Require the agent to declare the Diataxis type in its plan before writing any content. Render the task-type-specific completeness checklist from the template based on that declaration, as a required output structure:

```markdown
Your first action MUST be to declare:

> "This is a [concept | tutorial | how-to | api-reference] page."

Based on your declaration, your output MUST include these sections (in order):
{{ task_type_sections | for declared type }}
```

The declared type also becomes a loggable field in the transcript, enabling automatic retrieval for the evaluator.

**Metrics improved**: Requirement Coverage (primary), Structural Conformance, Clarity and Actionability.

### Required Section Scaffolding

Rather than describing required sections in prose ("remember to include a prerequisites section"), render them as required headings the agent must fill. This is slot-filling: the agent's task becomes populating known positions rather than deciding structure, which dramatically reduces missing-section failures.

**Lever**: For each Diataxis type, define a heading template in `shared/agent-includes/` and render it into the agent prompt:

```markdown
Your output page MUST use exactly this heading structure:

## Overview

## Prerequisites

## Steps

### Step 1: ...

## Expected Result

## Troubleshooting

## Related pages
```

Any structural deviation must be explicitly justified in the handoff.

**Metrics improved**: Requirement Coverage, Structural Conformance.

### Source Fidelity Reading Protocol

Source Material Fidelity failures happen when the agent documents an API from memory rather than by reading the source. The fix is making source-reading an explicit, logged precondition for writing.

**Lever**: For API reference tasks, mandate an extraction phase before any writing:

```markdown
BEFORE writing any API documentation, complete this template for every public method:
Method: **_
Namespace: _** (verify against resources/repositories/xperience/CMSSolution/)
Parameters: **_ (name, type, description)
Return type: _**
Exceptions: \_\_\_

Do not proceed to writing until this template is complete.
```

The completed template is part of the handoff. If the agent skips this, the evaluator can detect the gap by checking whether the handoff contains the template.

**Metrics improved**: Source Material Fidelity (primary), Technical Accuracy, Issue-to-Output Faithfulness.

### Cross-Reference Discovery Protocol

Cross-Reference Integrity failures happen when the agent writes `{% page_link %}` tags without verifying the target exists, or fails to add entries to `related_pages` on existing neighbor pages. The fix is a mandatory discovery step before writing.

**Lever**:

```markdown
BEFORE writing any new documentation page:

1. Search for existing pages that cover related topics (use get_file_contents on similar pages)
2. List every identifier you intend to use in {% page_link %} tags
3. Verify each identifier exists in src/\_data/pagetree/documentation.yml
4. List every existing page that should receive a related_pages update pointing to your new page

Write this list to your state file. Do not create any {% page_link %} tags before this step.
```

**Metrics improved**: Cross-Reference Integrity (primary), Task Scope Adherence.

### Revision Checklist Protocol

Revision Faithfulness fails when the agent addresses some reviewer comments but not others, or when it re-writes the page without explicitly confirming each comment was handled. The fix is forcing the agent to treat reviewer comments as a numbered task list.

**Lever**: Rendered only when `isRevision === true`:

```markdown
This is a REVISION task. The following comments require responses:
{{ for each reviewer comment: "[ ] Comment by [author]: [text]" }}

Your FIRST step is to extract each distinct action requested in these comments.
Your LAST step before creating the PR is to tick each checkbox and cite where in the output you addressed it.
An unaddressed comment is a blocking failure — do not submit the PR until all checkboxes are ticked.
```

The checklist items are extractable from the transcript by the evaluator to verify Revision Faithfulness.

**Metrics improved**: Revision Faithfulness (primary), Requirement Coverage.

### Scope Declaration Contract

Scope Lock Compliance fails when the agent modifies files beyond the task boundary, often because a tool call returns related content that tempts opportunistic edits. The fix is a pre-task scope declaration that the agent must justify deviating from.

**Lever**:

```markdown
SCOPE DECLARATION — complete before any file modifications:
"I will create/modify the following files:

1. [path] — reason: [why this file is in scope]
   ...
   I will NOT modify any other files."

Any deviation from this declaration requires an explicit note in the handoff explaining why.
```

The declared file list is the ground truth for the Scope Lock Compliance check. This makes the deterministic evaluator trivial: compare declared scope to actual PR diff.

**Metrics improved**: Scope Lock Compliance (primary), Task Scope Adherence, Security Instruction Compliance.

### Pre-Submission Quality Self-Check

The quality property checklist P1–P8 currently exists only in the evaluator. Rendering it into the agent prompt as a pre-submission checklist converts a post-hoc verification into an in-context check — the agent catches failures before submission rather than after.

**Lever**: A `{% section "pre-submission-checklist" %}` block in the agent template, rendered as the last step before PR creation:

```markdown
Before creating the PR, verify each item:
[ ] All {% page_link %} identifiers exist in documentation.yml
[ ] All {% inpage_link %} anchors are defined in the same file
[ ] Frontmatter has: title, persona, identifier, order, license
[ ] Navigation YAML updated with correct parent and order
[ ] dotnet build passes with zero new warnings
[ ] Handoff contains: what was done, files changed, challenges, remaining work, PR URL
[ ] All reviewer comments addressed (revision tasks only)
```

An agent that fails the self-check and proceeds anyway has a documented transcript trail. An agent that catches a failure and fixes it improves all quality metrics without any evaluator involvement.

**Metrics improved**: Requirement Coverage, Cross-Reference Integrity, Structural Conformance, Handoff Completeness (all improved by catching failures earlier).

### Positive-Framing Instruction Rewrite

The C3AI research (ACM Web Conference 2025) establishes empirically that positive, behavior-based instructions outperform negative or trait-based ones. The existing `shared/agent-includes/prompt-security.md` uses mixed framing. A targeted rewrite improves instruction-following scores without any structural change.

**Lever**: Replace negative framings in existing agent includes. Examples:

| Current (negative)                 | Replace with (positive, behavior-based)                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| "Do not use hard-coded URLs"       | "Use `{% page_link IDENTIFIER %}` for all internal links"           |
| "Do not skip the compilation step" | "Run `npm run codesamples:build` after each `.cs` file change"      |
| "Do not document APIs from memory" | "Read the Xperience source before documenting any method signature" |

**Metrics improved**: Agent Persona Compliance, Structural Conformance, Security Instruction Compliance.

### Strategy-to-Metric Impact Map (Approach 2)

| Strategy                           | Primary Metric            | Secondary Metrics                |
| ---------------------------------- | ------------------------- | -------------------------------- |
| Diataxis type commitment           | Requirement Coverage      | Structural Conformance, Clarity  |
| Required section scaffolding       | Requirement Coverage      | Structural Conformance           |
| Source fidelity reading protocol   | Source Material Fidelity  | Technical Accuracy, Faithfulness |
| Cross-reference discovery protocol | Cross-Reference Integrity | Task Scope Adherence             |
| Revision checklist protocol        | Revision Faithfulness     | Requirement Coverage             |
| Scope declaration contract         | Scope Lock Compliance     | Task Scope Adherence             |
| Pre-submission self-check          | All completeness metrics  | Handoff Completeness             |
| Positive-framing rewrite           | Agent Persona Compliance  | Structural Conformance           |

---

## Research Basis (Updated 2025–2026)

**Rubric Design:**

- RRD: Recursive Rubric Decomposition (arXiv:2602.05125, Feb 2026): +17.7 points on JudgeBench; decompose-filter-weight cycle; correlation-aware criterion selection
- Rulers: Locked Rubrics and Evidence-Anchored Scoring (arXiv:2601.08654): deterministic scoring protocols; evidence citation requirement; prevents unverifiable reasoning
- C3AI: Crafting Constitutions for CAI (ACM Web Conference 2025): positive behavior-based criteria empirically outperform negative framing
- Bloom (Anthropic, Dec 2025): 4-stage pipeline; elicitation rate as primary metric; secondary quality scores for realism and difficulty

**Quality Judges:**

- Agent-as-a-Judge (Zhuge et al., ICML 2025): agentic evaluators with 90% human agreement; 97% cost reduction vs. human evaluation
- Panel of LLM Evaluators (PoLL): diverse panel outperforms single large judge for bias reduction
- CodeJudgeBench (arXiv:2507.10535): up to 14% position-order bias in code evaluation — always swap candidate presentation order

**Documentation-Specific:**

- DocBench (KnowledgeNLP 2025): 229 real documents, 1,102 QA pairs; construction via LLM generation + multi-step human quality control; highlights reading/comprehension gap between humans and LLMs
- ReviewEval (EMNLP 2025 Findings): distinguishes subjective (clarity) from objective (adherence to format) criteria — separate evaluators required
- Reference-Free Evaluation Framework (arXiv:2602.13376, Feb 2026): Recall_OCR + Precision_VE pattern; Pearson r = 0.97 with ground-truth metrics; directly applicable as Coverage + Hallucination checks

**Ground Truth Construction:**

- SCICOQA (arXiv:2601.12910, Jan 2026): cross-artifact consistency as ground truth; GPT-5 + Qwen3 extraction pipeline; manual filtering
- Reference-free Evaluation Metrics Survey (arXiv:2501.12011, Jan 2025): property specification as ground truth alternative to reference matching
- LLM-as-a-Judge Reference-Free Code Evaluation (arXiv:2506.11237): execution-free evaluation via "Analyse then Summarise"; inferior to execution-based methods — only use when execution is impossible

**Code Correctness:**

- SWE-Bench Pro pipeline: FAIL_TO_PASS + PASS_TO_PASS as dual correctness criteria
- GitHub Copilot @Test for .NET (Microsoft Learn, 2025): Roslyn compiler as deterministic ground truth layer; standard production evaluation methodology
- Openia (ScienceDirect 2025): LLM internal representations predict code correctness without execution — fallback for expensive-to-execute cases
