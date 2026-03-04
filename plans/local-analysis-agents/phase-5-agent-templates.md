# Phase 5: Agent Templates

**Goal:** Create the Run Analyzer and Agent Improver agent templates.

*Independent of Phases 1–4 (templates can be written before the infrastructure is ready). Phase 6 wires them into a profile variant.*

## 5a. Run Analyzer — `profiles/ralph-docs/agents/ralph.run-analyzer.agent.md`

### Purpose

Analyzes a completed Ralph agent execution by reading its collected log artifacts. Produces a structured quality analysis report covering tool usage patterns, errors, efficiency, workflow compliance, and improvement suggestions.

### Template design

- **Identity:** "You analyze completed Ralph agent executions to identify quality issues and improvement opportunities."
- **Input:**
  - `{{ outputDir }}` — absolute path to the task's main log directory
  - `{{ hookOutputDir }}` — `outputDir/hooks/run-analysis/` — where this hook writes its output
  - `{{ collectedLogs }}` — map of log file IDs to paths from the main pipeline
- **Analysis checklist:**
  1. Read `*-summary.json` for status, duration, exit code, stage results
  2. Read `*-transcript.md` for tool call sequence, reasoning quality, dead ends
  3. Read `*-tool-output.log` for failed tool calls, excessive retries
  4. Read `*-proxy.log` for blocked domains, unexpected egress
  5. Read `*-sidecar.log` for MCP server errors, tool timeouts
  6. Cross-reference with operation ledger at `output/logs/history/{{ workItem.id }}.json`
- **Output format:** Structured Markdown report saved to `{{ hookOutputDir }}/analysis.md`. Sections: Summary, Tool Usage Patterns, Error Recovery, Workflow Compliance, Proxy & MCP, Improvement Suggestions.
- **Model:** `claude-sonnet-4-20250514` (cheaper/faster — analysis doesn't need creative capability)
- **Leverage:** The `.github/skills/agent-eval/SKILL.md` framework as the analysis backbone.

### Collected log files available via `{{ collectedLogs }}`

The template can reference specific files:
- `{{ collectedLogs.primary-audit }}` — audit trail
- `{{ collectedLogs.primary-transcript }}` — session transcript
- `{{ collectedLogs.primary-proxy }}` — proxy access log
- `{{ collectedLogs.primary-sidecar }}` — sidecar output
- `{{ collectedLogs.primary-tool-output }}` — untruncated tool output

(Prefixed with stage role `primary-` from the main pipeline's per-stage log collection.)

---

## 5b. Agent Improver — `profiles/ralph-docs/agents/ralph.agent-improver.agent.md`

### Purpose

Reads the Run Analyzer's report and proposes concrete improvements to the orchestrator's agent infrastructure — templates, skills, shared includes, instructions, and MCP server configs.

### Template design

- **Identity:** "You improve Ralph agent templates, skills, shared includes, and MCP server configurations based on execution analysis."
- **Input:** `{{ hookOutputDir }}/analysis.md` — the analyzer's report (from the previous stage in the same hook).
- **Scope of changes:**
  - `profiles/*/agents/` — agent templates
  - `shared/agent-includes/` — shared Liquid partials
  - `shared/skills/` — agent skill definitions
  - `shared/mcp-servers/` — MCP server manifests and custom server code
  - `.github/instructions/` — codebase instructions
  - `.github/skills/` — Copilot skills
- **Rules:**
  - Make targeted, focused changes — don't rewrite entire files
  - Every change must cite a specific finding from the analysis report
  - Propose new skills when a recurring pattern is identified
  - Architect new MCP servers when the agent needs a capability it currently lacks
  - Never delete existing functionality — only extend or refine
- **Output:** Improvement summary saved to `{{ hookOutputDir }}/improvements.md` listing each change with rationale.
- **Model:** default (opus) — needs creative understanding of documentation quality and agent architecture

## Files

- `profiles/ralph-docs/agents/ralph.run-analyzer.agent.md` — new file
- `profiles/ralph-docs/agents/ralph.agent-improver.agent.md` — new file
- Optionally: `shared/agent-includes/analysis-format.md` — shared partial for the analysis report format

## Verification

1. Templates render without Liquid errors — run `AgentTemplateRenderer.render()` in a test or via `npm run dev` dry-run.
2. Manual review: templates reference `{{ outputDir }}`, `{{ hookOutputDir }}`, `{{ collectedLogs }}`, and `{{ workItem.id }}` correctly.
