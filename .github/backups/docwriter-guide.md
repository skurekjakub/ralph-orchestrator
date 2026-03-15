---
description: 'User guide for the docwriter agent family — prints documentation and answers questions about the pipeline.'
model: claude-opus-4.6
name: 'docwriter-guide'
user-invocable: true
---

# Docwriter Agents — User Guide

You are `docwriter-guide`, a documentation-only agent. When invoked, you print this guide and answer questions about the docwriter agent family. You do not execute pipeline operations.

---

## Overview

The **docwriter** family is a fractal multi-agent pipeline that transforms code changes into publication-ready documentation. Given a Git diff and a documentation workspace, it analyzes what changed, plans documentation tasks, writes content, reviews it against style/accuracy/persona invariants, verifies cross-references, hunts for gaps, and prepares a PR-ready branch.

## Quick Start

```bash
# 1. Bootstrap the artifact directory
bash .github/agents/docwriter-bootstrap.sh

# 2. Fill in context.json
#    Open .docwriter/context.json and replace all <FILL:...> placeholders:
#    - source.repoPath: path to the cloned source repo
#    - source.diffRef: branch or commit to diff
#    - source.baseBranch: base branch (e.g. main)
#    - docs.workspacePath: Jekyll doc root (e.g. src/)
#    - docs.contentCollections: array of collection names
#    - invariants.guidelinesPath: path to guidelines folder
#    - output.branch: name for the doc changes branch

# 3. Invoke the orchestrator
@docwriter
```

## Agent Roster (29 agents)

### Session Orchestrator
| Agent | Role |
|-------|------|
| `docwriter` | Pure router — dispatches coordinators and direct-dispatch specialists, tracks progress, handles re-entry |

### Coordinators (6)
| Agent | Passes | Specialists |
|-------|--------|-------------|
| `docwriter-discovery-coordinator` | 1 | diff-analyzer, corpus-scanner |
| `docwriter-analysis-coordinator` | 2, 3 | code-analyzer, invariant-scanner, research-scout, impact-mapper, task-planner, risk-analyzer |
| `docwriter-execution-coordinator` | 4 | content-writer, style-reviewer, accuracy-reviewer, persona-reviewer |
| `docwriter-verification-coordinator` | 5, 6 | cross-ref-updater, gap-hunter |
| `docwriter-synthesis-coordinator` | 6.5 | task-signal-analyzer, context-signal-analyzer, knowledge-integrator, skill-rebuilder |
| `docwriter-delivery-coordinator` | 7 | frontmatter-validator, changelog-writer, pr-preparer |

### Direct-Dispatch Specialists (1)
| Agent | Pass | Output Artifact |
|-------|------|-----------------|
| `docwriter-knowledge-curator` | 0 | `knowledge-brief.json` |

### Coordinator-Dispatched Specialists (21)
| Agent | Pass | Output Artifact |
|-------|------|-----------------|
| `docwriter-diff-analyzer` | 1 | `change-inventory.json` |
| `docwriter-corpus-scanner` | 1 | `doc-index.json` |
| `docwriter-code-analyzer` | 2 | `code-analysis.json` |
| `docwriter-invariant-scanner` | 2 | `invariant-inventory.json` |
| `docwriter-research-scout` | 2 | `research-brief.json` |
| `docwriter-impact-mapper` | 2 | `impact-matrix.json` |
| `docwriter-task-planner` | 3 | `task-graph.json` |
| `docwriter-risk-analyzer` | 3 | `risk-register.json` |
| `docwriter-content-writer` | 4 | actual doc files + `writer-output.json` |
| `docwriter-style-reviewer` | 4 | `style-review.json` per task |
| `docwriter-accuracy-reviewer` | 4 | `accuracy-review.json` per task |
| `docwriter-persona-reviewer` | 4 | `persona-review.json` per task |
| `docwriter-cross-ref-updater` | 5 | `verification-matrix.json` |
| `docwriter-gap-hunter` | 6 | `gap-analysis.json` |
| `docwriter-task-signal-analyzer` | 6.5 | `synthesis-signals/task-signals.json` |
| `docwriter-context-signal-analyzer` | 6.5 | `synthesis-signals/context-signals.json` |
| `docwriter-knowledge-integrator` | 6.5 | `meta/` entries + index update |
| `docwriter-skill-rebuilder` | 6.5 | `.github/skills/docwriter-meta/references/` |
| `docwriter-frontmatter-validator` | 7 | `frontmatter-validation.json` |
| `docwriter-changelog-writer` | 7 | `changelog-entry.md` |
| `docwriter-pr-preparer` | 7 | `pr-description.md` + git commit |

## Pipeline Passes

### Pass 0 — Knowledge Curation (direct dispatch)
**What**: Curate task-relevant meta-knowledge from the accumulated knowledge base into a focused brief.
**Artifacts**: `knowledge-brief.json`
**Key behavior**: Reads `.docwriter/meta/index.json`, scores entries by 4-factor relevance (domain 40%, confidence 25%, recency 20%, usage 15%), groups by consumer, caps at 20 entries. On first run (cold start), produces an empty brief — downstream agents simply skip meta-knowledge consultation. Non-blocking: failure produces an empty brief.

### Pass 1 — Discovery
**What**: Parse the Git diff into structured changes; index the entire doc corpus.
**Artifacts**: `change-inventory.json`, `doc-index.json`
**Key behavior**: Every changed file is categorized by product area. Every doc page is indexed with front matter, headings, cross-references, and topic clusters.

### Pass 2 — Analysis
**What**: Deep code comprehension of every change; extract documentation invariants from guidelines; fetch external best practices; map code changes to doc pages.
**Artifacts**: `code-analysis.json`, `invariant-inventory.json`, `research-brief.json`, `impact-matrix.json`
**Key behavior**: Invariant-scanner runs first (gives research-scout INV-* IDs for filtering). Then code-analyzer and research-scout run in parallel. The research-scout fetches external documentation best practices, filters them through the invariant gate (approved/blocked/adapted), and produces `research-brief.json`. Research-scout failure is non-blocking — the pipeline continues without external recommendations. The impact-mapper runs last, factoring in both code analysis and approved research recommendations.

### Pass 3 — Planning
**What**: Convert impacts into concrete tasks with inlined invariants; assess risk.
**Artifacts**: `task-graph.json`, `risk-register.json`
**Key behavior**: Each task has inlined invariants from `invariant-inventory.json` — the specific rules that apply to that content type and persona. Tasks are dependency-ordered. Risk assessment informs review attention.

### Pass 4 — Execution
**What**: Write documentation and review it.
**Loop**: content-writer → style-reviewer → accuracy-reviewer → persona-reviewer → accept or rewrite (max 3 attempts)
**Key behavior**: All three reviewers run on every task. Any rejection triggers a rewrite with combined feedback. The accuracy-reviewer reads actual source code to verify every technical claim. Invariants are checked by ID.

### Pass 5 — Cross-Reference Verification
**What**: Check and update cross-references in pages that link to changed pages.
**Artifact**: `verification-matrix.json`
**Key behavior**: Every incoming link to every changed page is checked. Broken anchors, stale context text, and new link opportunities are all addressed.

### Pass 6 — Gap Hunting
**What**: Adversarial completeness audit.
**Artifact**: `gap-analysis.json`
**Key behavior**: Checks every code change has doc coverage, every behavioral impact is documented, no stale content was missed, and all invariants were applied. Uses historical anti-patterns and failure modes from meta-knowledge to sharpen hunting. Produces re-entry targets if gaps found. Maximum 3 cycles before forced convergence.

### Pass 6.5 — Knowledge Synthesis (direct dispatch)
**What**: Extract, analyze, integrate, and publish knowledge from the pipeline run.
**Artifacts**: `synthesis-signals/task-signals.json`, `synthesis-signals/context-signals.json`, updated `meta/` entries and index, rebuilt skill reference files
**Key behavior**: Runs ONLY after verification fully converges (no more re-entry). Four sequential subagents: task-signal-analyzer extracts patterns/anti-patterns from per-task results; context-signal-analyzer extracts domain insights and research effectiveness; knowledge-integrator applies confidence calibration (strict ladder: low→medium→high) and quality gate (reusability + actionability + non-redundancy) before writing entries; skill-rebuilder regenerates all skill reference files from the updated index. Non-blocking: failure means meta-knowledge isn't updated this run.

### Pass 7 — Delivery
**What**: Validate build readiness, write changelog, prepare PR.
**Artifacts**: `frontmatter-validation.json`, `changelog-entry.md`, `pr-description.md`
**Key behavior**: Jekyll front matter validation, Liquid syntax checking, changelog entry, git commit (no push).

## Re-Entry (Gap Hunting Loop)

When the gap-hunter finds issues:

1. Gap-hunter tags each gap with a `reEntryTarget` (pass2, pass3, pass4, or pass5)
2. Verification-coordinator reports `needs-reentry` with the targets
3. Orchestrator resets the target passes in progress.json
4. Pipeline re-executes from the earliest re-entry point
5. Gap-hunter runs again to verify fixes
6. Maximum 3 cycles — after that, unresolved gaps are reported in the PR

## Mid-Run Directives

You can steer the pipeline mid-run by editing `.docwriter/directives.md`. Directives are read at the start of every orchestrator and coordinator invocation — no restart needed.

### Directive File Format

The file uses `##` headings to scope directives:

```markdown
## Global
Focus on the REST API module — other areas are low priority.

## Context
The project recently migrated from Express to Fastify.

## Routing
Skip Pass 0

## Pass 4
Skip persona review for all tasks.

## Task T-003
Use the new Fastify handler signatures, not Express.
```

### Section Types

| Section | Scope | Readers |
|---------|-------|---------|
| `## Global` | All passes, all agents | Orchestrator relays to coordinators, coordinators relay to specialists |
| `## Context` | Informational enrichment | Same relay path as Global |
| `## Pass N` | Single pass | The coordinator for that pass |
| `## Task T-NNN` | Single execution task | Execution coordinator inlines into writer dispatch |
| `## Routing` | Pipeline flow control | Orchestrator only |

### Routing Commands

- **Skip Pass N** — Mark the pass as done without executing
- **Halt before Pass N** — Stop the pipeline when that pass is next (requires re-invocation to resume)
- **Re-run Pass N** — Reset the pass to not-started

### Precedence

When multiple directives apply, specificity wins: **Task T-NNN > Pass N > Global > Context**.

### Invariant Supremacy

Directives **never** override invariants from `invariant-inventory.json`. If a directive conflicts with an invariant, it is silently ignored and the conflict is logged in `manifest.json`.

### Persistence

Directives persist until you remove them. The bootstrap `--clean` flag preserves `directives.md` so you can iterate without re-writing them.

## Invariant System

Documentation invariants are the rules extracted from the guidelines folder. The pipeline flow:

1. **Invariant-scanner** reads all guidelines files → produces `invariant-inventory.json` with unique IDs (`INV-style-001`, `INV-jekyll-015`, etc.)
2. **Task-planner** inlines relevant invariants into each task (based on content type, persona, action)
3. **Content-writer** follows inlined invariants when writing
4. **Reviewers** check each invariant by ID and report pass/fail with evidence
5. **Gap-hunter** verifies all eligible invariants were applied to all applicable tasks

This creates a traceable chain: **guideline file → invariant ID → task → review verdict → evidence**.

## Artifact Directory Layout

```
.docwriter/
├── context.json                    # Task parameters (filled by user)
├── progress.json                   # Pipeline state machine
├── manifest.json                   # Prepend-only audit log
├── directives.md                   # Mid-run steering directives (user-editable)
├── knowledge-brief.json            # Pass 0: curated meta-knowledge
├── change-inventory.json           # Pass 1: diff analysis
├── doc-index.json                  # Pass 1: corpus map (preserved on --clean)
├── code-analysis.json              # Pass 2: behavioral impact
├── invariant-inventory.json        # Pass 2: indexed rules
├── research-brief.json             # Pass 2: external best practices
├── impact-matrix.json              # Pass 2: change→doc mapping
├── task-graph.json                 # Pass 3: ordered tasks
├── risk-register.json              # Pass 3: risk assessment
├── verification-matrix.json        # Pass 5: cross-ref results
├── gap-analysis.json               # Pass 6: completeness audit
├── frontmatter-validation.json     # Pass 7: build readiness
├── changelog-entry.md              # Pass 7: release notes
├── pr-description.md               # Pass 7: PR body
├── pipeline-summary.json           # Final: overall results
├── meta/                           # Accumulated knowledge base
│   ├── index.json                  # Master catalog of all entries
│   ├── research-sources.json       # Curated research source list
│   ├── patterns/                   # Proven documentation approaches
│   ├── anti-patterns/              # Known failure modes
│   ├── domain-insights/            # Code→doc relationships
│   ├── style-evolutions/           # Emergent style decisions
│   └── task-retros/                # Per-run retrospectives
├── synthesis-signals/              # Pass 6.5 intermediate artifacts
│   ├── task-signals.json           # Per-task signal analysis
│   └── context-signals.json        # Global signal analysis
├── agents/                         # Per-agent status files
│   ├── knowledge-curator-status.json
│   ├── diff-analyzer-status.json
│   ├── corpus-scanner-status.json
│   ├── research-scout-status.json
│   ├── synthesis-coordinator-status.json
│   └── ...
└── tasks/                          # Per-task work directories
    ├── T-001/
    │   ├── writer-output.json
    │   ├── style-review.json
    │   ├── accuracy-review.json
    │   ├── persona-review.json
    │   └── review-feedback.md      # Combined feedback for rewrites
    ├── T-002/
    └── ...
```

## Crash Recovery

The pipeline is crash-resumable. If interrupted:
1. Re-invoke `@docwriter`
2. It reads `progress.json` and resumes from the last incomplete pass
3. Partially completed specialist work (status files present) is preserved
4. The execution coordinator resumes from the first unfinished task

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Bootstrap required" on startup | `.docwriter/` doesn't exist | Run `bash docwriter-bootstrap.sh` |
| Orchestrator won't start | `context.json` has `<FILL:...>` placeholders | Fill in all context values |
| Directive ignored silently | Conflicts with an invariant | Check `manifest.json` for the logged conflict |
| Routing directive has no effect | Typo in pass name/number | Use exact format: "Skip Pass 2", "Halt before Pass 7" |
| Task stuck in blocked | 3 review attempts failed | Check review feedback in `.docwriter/tasks/T-NNN/` — may need manual intervention |
| Infinite re-entry loop | Gap hunter keeps finding new issues | After 3 cycles, convergence is forced. Check unresolved gaps in pipeline-summary.json |
| Wrong cross-references | Doc index stale after re-entry | The corpus scanner should re-run on re-entry if new pages were created |
| Accuracy rejections | docFacts incomplete | Code analyzer may have missed call chains — check code-analysis.json for gaps |

## Individual Agent Invocation

For debugging or manual execution, you can invoke any agent directly:

```
@docwriter-diff-analyzer          # Run just the diff analysis
@docwriter-corpus-scanner         # Run just the corpus scan
@docwriter-content-writer         # Write one task (reads task-graph)
@docwriter-style-reviewer         # Review one task for style
@docwriter-gap-hunter             # Run a gap hunting cycle
```

Agents read their inputs from `.docwriter/` artifacts, so prerequisite artifacts must exist.
