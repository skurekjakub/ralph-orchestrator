---
name: devralph-workflow-research
description: "Phase 2 of the standard development workflow — research the codebase before writing any code. Explore affected code areas, trace data flows across layers (gem → template → JS → CSS), identify integration points, check existing tests, and create a concrete implementation plan. This phase exists because the docs platform has deep cross-layer coupling — a Ruby tag change can break CSS targeting its HTML, or a JS module change can break search."
---
{% raw %}

# Phase 2: Research

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 2.
2. Read domain skills listed in `state.md` under "Skills for this phase" — these contain architecture knowledge for the affected components.

## Instructions

1. **Read the JIRA issue carefully** — identify exactly what needs to change and what the acceptance criteria are.

2. **Explore the affected code areas:**
   - For **Ruby gems**: Read the relevant gem's `lib/` directory, understand the class hierarchy, find the specific files that need changes
   - For **Gulp pipeline**: Read the task files in `gulp-utils/`, trace the build flow for the affected asset type
   - For **Frontend JS**: Read the relevant bundle entry point and its imports, understand the module interactions
   - For **CSS**: Determine if the change targets Less (legacy) or Tailwind (new), read the relevant stylesheet
   - For **Jekyll templates**: Read affected layouts/includes, understand the Liquid template flow
   - For **Learn Portal**: Read module/path configs, understand the orchestration flow

3. **Trace integration points** — Most changes touch multiple layers of the stack. A Ruby tag that changes its HTML output can break CSS selectors or JS event handlers targeting that structure. A Gulp task change can alter the order assets are processed. Map these connections:
   - If you modify a Ruby tag → check which templates use it and what CSS/JS depends on its output
   - If you change a JS module → check which bundle imports it and what DOM elements it targets
   - If you modify CSS → check which templates/components use those classes or selectors
   - If you change a layout/include → check which pages use it and what JS initializes on its elements

4. **Check for existing tests** — Look in `gems/<gem>/spec/` for Ruby tests, check if JS modules have test files.

5. **Document findings in `state.md`** under "Source References":
   - Exact file paths of code you'll modify
   - Key data flows and dependencies
   - Any constraints or edge cases discovered
   - Existing test coverage

6. **Create a technical plan** — Break the implementation into specific, ordered steps. Record in `state.md` under a new "Implementation Plan" section.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Implement`
- Set "Skills for this phase" to:
  - devralph-workflow-implement
  - (domain skills for the affected components)
- Add Phase 2 to "Completed Phases" with key findings
- Ensure "Implementation Plan" has concrete steps

{% endraw %}
