# Improvement Summary: DOC-3200 (All Subagents)

## Changes Made

### 1. manifest.json cumulative artifact listing for iterative agents
- **File:** `shared/agent-includes/agent-as-function-contract.md`
- **Finding:** Analysis §Issues Found #3 — manifest.json entries for iterative agents (ralph-coder iteration 2) listed only the current iteration's artifact instead of cumulative list
- **Root cause:** Rule gap — the `status.json` section explicitly requires cumulative artifact listing ("must list ALL output files written across all iterations, not just the latest"), but the `manifest.json` section had no corresponding instruction. The JSON example shows a single artifact, and iterative agents had no guidance to behave differently.
- **Change:** Added a `⚠️ Iterative agents` callout after the manifest.json JSON template, explicitly requiring cumulative artifact listing and referencing the matching status.json rule. This closes the gap between the two sections.

### 2. Phase 8 final state.md update (Archive & Exit)
- **File:** `shared/skills/workflow/vscode/vscode-workflow/references/8-archive.md`
- **Finding:** Analysis §Issues Found #1 — state.md last updated to "Phase 4: Package" but the run completed through Phase 8
- **Root cause:** Rule gap — Phases 5, 6, and 7 all have explicit "Before moving to Phase X — Update state.md" sections, but Phase 8 (the final phase) had no state.md update instruction at all. This meant there was no catch-all to detect missed updates from earlier phases.
- **Change:** Inserted a new step 3 ("Final state.md update") between the scribe status read and the exit block print. It instructs the orchestrator to set "Current Phase" to `Completed`, add Phase 8 to "Completed Phases", and includes a backfill warning: if any transitions since Phase 4 were missed, backfill them before exiting. Renumbered the exit block step from 3 to 4.

### 3. Strengthened state.md update emphasis in workflow SKILL.md
- **File:** `shared/skills/workflow/vscode/vscode-workflow/SKILL.md`
- **Finding:** Analysis §Issues Found #1 — orchestrator stopped updating state.md after Phase 4 despite instructions existing in each phase reference file
- **Root cause:** Agent behavior gap — the instructions exist in every phase reference file (5-commit.md lines 23-29, 6-pr.md lines 21-28, 7-handoff.md lines 56-62), but the orchestrator ignored them for the final four phases. The "How to Use" section's step 4 used passive phrasing ("Update state.md as directed") that may have contributed to the agent treating it as optional.
- **Change:** Made step 4 in the "How to Use" section more emphatic: bolded "Update `state.md`", referenced the specific section name ("Before moving to"), added "mandatory at **every** phase transition, including Phases 5–8", and added an explicit anti-skip instruction.

## Proposed (Not Implemented)

### Infrastructure Issues

None identified. All issues were addressable through template and include changes.

### New Skills / MCP Servers

None needed. The existing skill and template infrastructure is sufficient — the gaps were in instruction clarity, not capability.

### Alternative Flow Proposals

None. The 8-phase serial workflow executed cleanly with zero errors and zero compactions. The orchestrator's routing behavior was rated "Perfect (5/5)" for purity. No structural changes warranted.

### SOTA Suggestions

None. This was a clean pass with minor documentation/emphasis gaps. No novel techniques needed.

## No Action Needed

### Finding #2: Exit Block Glob Inaccuracy (Very low severity — cosmetic)
The exit block's `SUMMARY` field showed `**/_config_primary.yml` instead of `**/_configs/_config_primary.yml`. The analyzer explicitly marked this as "No action needed — this is a one-line summary truncation." The summary.json and PR had correct information. The exit block is a human-readable summary, not a machine-consumed artifact — minor truncation is acceptable.

### Finding #4: Proxy Denials for VS Code CDN (Infrastructure — expected)
37 TCP_DENIED entries for VS Code update CDNs during test execution. The analyzer confirmed this is expected and by design — the proxy allowlist intentionally excludes non-essential domains. Tests pass regardless.
