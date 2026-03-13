# Improvement Summary: ralph-planner (DOC-3193)

## Changes Made

### 1. Enriched planner dispatch prompt with trigger parameters and artifact paths
- **File:** `shared/skills/workflow/docs/ralph-workflow/references/2-research.md`
- **Finding:** Analysis § Dispatch Prompt Gaps — "the dispatch could include: explicit mention of state.md path, the trigger parameters (codesamples=true, adminui=true) to help the planner select supplementary skills without re-reading state.md"
- **Root cause:** Rule gap — the workflow reference instructed the orchestrator to dispatch the planner with only "a one-line directive" (e.g., `Break research into headless execution tasks for DOC-3193`). This forced the planner to independently discover trigger parameters from state.md.
- **Change:** Expanded the dispatch instructions to include:
  - Researcher artifact paths (from status.json artifacts array) — eliminates guesswork
  - Artifact directory path explicitly
  - Active trigger parameters (`codesamples`, `adminui`, `release_notes`) rendered via Liquid conditionals — the planner can immediately load the correct supplementary skills without first reading state.md
  
  This saves the planner 1-2 tool calls per run (reading state.md to discover trigger params) and eliminates the risk of the planner missing a supplementary skill that should be loaded.

### 2. Promoted trigger-activated skills from optional to required
- **File:** `profiles/ralph-docs/agents/ralph.ralph-planner.agent.md`
- **Finding:** Analysis § Skill Gaps — "Verify the planner loaded ralph-codesamples given the codesamples trigger parameter was active" and the ambiguity between "Load when relevant" optional language and trigger-activated skills that should be mandatory.
- **Root cause:** Rule gap — trigger-activated skills (`ralph-codesamples`, `ralph-codesamples-adminui`, `ralph-write-release-notes`) were listed in the "Load when relevant (supplementary skills)" section with soft language ("when the research scope or task complexity warrants them"). This made them appear optional even when the orchestrator had already confirmed their relevance via trigger parameters.
- **Change:** Separated trigger-activated skills into their own section: **"Load for this task (trigger-activated skills)"** with:
  - Explicit **Required** labels and directive language ("Load these before planning — they affect task boundaries and decomposition")
  - The section only renders when at least one trigger is active (via Liquid conditional)
  - General supplementary skills remain in the existing "Load when relevant" section with unchanged optional semantics
  
  This eliminates the ambiguity that caused the analysis to flag a potential skill gap. When `triggerParams.codesamples` is set, the planner will now treat `ralph-codesamples` as mandatory, not discretionary.

## Proposed (Not Implemented)

### Infrastructure Issues

_None identified. The planner execution had zero errors, zero tool failures, and all template variables resolved correctly._

### Model Cost Optimization

**Consider Sonnet for the planner role.** The analysis notes (§ Improvement Suggestions, #1):

> "Consider using Sonnet instead of Opus for the planner — the task is well-bounded (read inputs → produce structured output) and doesn't require deep reasoning. Opus cost is high for a ~4 minute structured planning job that completed without difficulty."

Supporting evidence:
- Zero compaction events (well within context limits)
- Zero errors (clean first-pass output)
- Task is inherently structured: read fixed inputs → produce formatted task files
- ~4 minute execution with no retries

**Counterargument:** The planner's dependency reasoning and deferred-work judgment were rated "excellent" — this quality may partially stem from Opus's stronger reasoning. A controlled comparison (same task on Sonnet vs Opus) would be needed before changing the default.

**Recommendation:** Run 3-5 planner tasks on `claude-sonnet-4.6` and compare task decomposition quality, dependency correctness, and deferred-work handling before changing the profile default. If quality is equivalent, switch to save ~60-70% on planner token costs.

### New Skills / MCP Servers

_None needed. The analysis identified no tool or MCP gaps for the planner role._

### Alternative Flow Proposals

_None. The planner's serial position in the pipeline (after researcher, before writer) is appropriate for its role._

### SOTA Suggestions

_None for this run. The planner's structured input→output pattern is well-suited to current template-based approaches._

## No Action Needed

### Mapper extraction sparseness (Suggestion #3)
The analysis noted that "the mapper extraction was sparse — it listed only 7 numbered tool calls with '... (additional planning tool calls)' eliding most of the sequence." This is a finding about the **subagent-mapper**, not the **ralph-planner**. Improving mapper extraction quality is outside the scope of this planner-focused improvement pass. If the mapper is dispatched for improvement separately, that finding should be addressed in the mapper's own agent-improver run.

### Overall execution quality
The analysis rated the planner's execution as "pass" with "excellent" task decomposition, "good" tool selection, "good" efficiency, and full artifact compliance. The two changes above address the only actionable gaps identified. No further template changes are warranted for this run.
