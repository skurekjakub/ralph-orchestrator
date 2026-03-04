---
name: malph-vscode-workflow-orient
description: "VS Code extension review workflow Phase 2. Read this skill after descending. Covers reading the repo instructions and internalizing the definition-driven architecture before reviewing any code."
---

# Phase 2: Orient in the Codebase

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 2.

## Instructions

Read `.github/copilot-instructions.md` in the target repo. This is the project's architectural bible — definition-driven patterns, naming conventions, build commands. Internalize it before reviewing.

Key concepts to understand:
- **Definition-driven architecture** — tags, headers, YAML definitions
- **Central registry** — `definitionRegister.ts` + `definitionInit.ts`
- **Rigid patterns** for new tags, rules, decorations, header attributes
- **Build & CI** — compile, lint:ci (zero warnings), test:xvfb

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Investigate`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-investigate
- Add Phase 2 to "Completed Phases"
