# Skills Reference

Skills are markdown files (`SKILL.md`) that provide domain-specific knowledge to agents at runtime. Each skill lives in `shared/skills/<category>/<skill-name>/SKILL.md` and is mounted read-only into the container when declared in a variant's `stages[].skills` array.

Skills are organized into four categories: **domain** (stack-specific knowledge), **workflow** (sequential phase instructions), **integrations** (external service interactions), and **tasks** (specialized task-type guides).

## Directory Layout

```
shared/skills/
├── domain/          # Stack and codebase knowledge
├── workflow/        # Sequential phase instructions per agent
├── integrations/    # External service interactions
└── tasks/           # Specialized task-type guides
```

## Domain Skills

Domain skills provide reference knowledge about specific technologies, patterns, or conventions. Agents read these on-demand when working in a relevant area.

| Skill                              | Description                                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devralph-build-verification`      | Build verification and error troubleshooting. Covers primary build commands (`npm run build`, `npm run serve`, `npx gulp rspec_tests`), common failure patterns across Jekyll/Liquid, Ruby gems, Webpack, Less/Tailwind CSS, and the Gulp pipeline. |
| `devralph-frontend`                | Frontend architecture — JavaScript (ES modules + Webpack, 4 bundles), jQuery patterns, Tailwind v4 CSS-first config, Less legacy styling, and third-party libraries.                                                                                |
| `devralph-gulp-pipeline`           | Gulp 5 orchestration layer — task architecture, asset pipeline (Less + Tailwind + Webpack), Jekyll CLI integration, BrowserSync, config overlay system, incremental build caching.                                                                  |
| `devralph-jekyll-site`             | Jekyll site structure — collections (7 active + legacy), layouts (8 templates), includes, data files (pagetree YAML), frontmatter conventions, multi-file config overlay.                                                                           |
| `devralph-ruby-gems`               | Architecture for the 8 custom Ruby gems under `gems/` — kentico-core (DI container, tag base classes), liquid-kfm (42 custom Liquid tags), jekyll-algolia, jekyll-learn-portal, and supporting gems.                                                |
| `ralph-build-errors`               | Troubleshooting guide for common `npm run build` errors — broken `page_link` identifiers, missing anchors, duplicate identifiers, code blocks missing lang parameter, circular redirects, URI path conflicts, frontmatter issues.                   |
| `ralph-callout-selection`          | When to use each admonition type (tip, info, note, warning, key). Covers semantic meaning of each type and common mistakes.                                                                                                                         |
| `ralph-cross-version-linking`      | How to link across documentation collections (documentation, guides, api) using the `collection` parameter on `page_link` and `card` tags.                                                                                                          |
| `ralph-documentation-syntax`       | Complete reference for all Liquid tags, formatting, and components available in the docs site — admonitions, code blocks, images, page links, tables, columns, cards, assets, anchors.                                                              |
| `ralph-new-page-creation`          | Rules for creating new Markdown pages — frontmatter schema, identifiers, persona assignment, ordering, licensing.                                                                                                                                   |
| `ralph-page-removal`               | Checklist for removing or deprecating pages without leaving broken links — removing from `documentation.yml`, setting up redirects, cleaning up orphaned references.                                                                                |
| `ralph-research-guide`             | Research guide for the ralph-researcher sub-agent — research order, techniques for exploring existing docs, Xperience C# source code, external references, report template, validation checklist.                                                   |
| `ralph-style-guide-review`         | Writing standards for self-reviewing documentation — UI interaction verbs, formatting rules, tone and voice, sentence structure, callout box usage.                                                                                                 |
| `ralph-xperience-page-permissions` | Xperience page permission model — three-layer access control (application-level, page ACL, workflow roles), the Read prerequisite rule, and which ACL permission each admin operation checks.                                                       |

## Workflow Skills

Workflow skills define sequential phases for agent execution. Each agent type has its own workflow skill set, with each skill covering one phase. Agents read the corresponding skill at the start of each phase.

### Stacky — Fullstack Development (`devralph-workflow`)

Single consolidated router skill with per-phase reference files. The `isRevision` Liquid flag selects the appropriate workflow table.

Standard workflow (9 phases):

| Phase | Reference                   | Description                                                                                                                            |
| ----- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `references/1-setup.md`     | Create `state.md`, verify workspace/branch, search ralphchives, identify affected components.                                          |
| 2     | `references/2-research.md`  | Research the codebase — explore affected areas, trace cross-layer data flows, identify integration points, create implementation plan. |
| 3     | `references/3-implement.md` | Execute the implementation plan. Make code changes and build after every edit.                                                         |
| 4     | `references/4-test.md`      | Create and run tests. Delegate RSpec tests to the stacky-test-writer sub-agent.                                                        |
| 5     | `references/5-e2e.md`       | Write Playwright E2E tests for UI-facing changes. Delegate to the stacky-e2e-playwright sub-agent.                                     |
| 6     | `references/6-review.md`    | Code review gate. Delegate to stacky-reviewer and stacky-bug-auditor sub-agents.                                                       |
| 7     | `references/7-commit.md`    | Final build verification, staging, commit with `dev(TASKID)` prefix, push.                                                             |
| 8     | `references/8-pr.md`        | Create an ADO draft pull request.                                                                                                      |
| 9     | `references/9-handoff.md`   | Write handoff file, comment on JIRA, print exit block.                                                                                 |

Revision workflow (4 phases):

| Phase | Reference                  | Description                                                                            |
| ----- | -------------------------- | -------------------------------------------------------------------------------------- |
| 1     | `references/r1-setup.md`   | Review previous handoff, extract defects from JIRA/reviewer feedback, create fix plan. |
| 2     | `references/r2-fix.md`     | Implement fixes one at a time, building and testing after each.                        |
| 3     | `references/r3-commit.md`  | Commit with `fix(TASKID)` prefix, push to update existing PR.                          |
| 4     | `references/r4-handoff.md` | Update handoff with revision section, comment on JIRA, print exit block.               |

### Ralph — Documentation Writer (`ralph-workflow-*`)

Standard workflow — single consolidated skill `ralph-workflow` with reference files per phase:

| Phase | Reference                  | Description                                                                                                                      |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `references/1-setup.md`    | Initialize `state.md` with skill manifest, search ralphchives for prior work.                                                    |
| 2     | `references/2-research.md` | Delegate to ralph-researcher sub-agent, validate the 4-section report.                                                           |
| 3     | `references/3-write.md`    | Implement documentation changes based on researcher's report, validate builds.                                                   |
| 4–5   | `references/4-review.md`   | Delegate to six reviewer sub-agents (technical, style, IA × Claude + GPT), aggregate verdicts, run revision loop (max 3 cycles). |
| 6     | `references/6-commit.md`   | Pre-commit checkpoint, stage, commit, push.                                                                                      |
| 7     | `references/7-pr.md`       | Create ADO draft pull request.                                                                                                   |
| 8     | `references/8-handoff.md`  | Write handoff, attach to JIRA, post to ralphchives, print exit block.                                                            |

Revision workflow (same `ralph-workflow` skill, revision reference files):

| Phase | Reference                  | Description                                                                       |
| ----- | -------------------------- | --------------------------------------------------------------------------------- |
| 1–2   | `references/r1-setup.md`   | Read previous handoff and reviewer comments, find existing PR/branch, plan fixes. |
| 3     | `references/r3-fix.md`     | Implement targeted fixes for each feedback item.                                  |
| 5     | `references/r5-commit.md`  | Pre-commit build check, commit, push, respond to PR threads.                      |
| 6–7   | `references/r6-handoff.md` | Update handoff, attach to JIRA, post to ralphchives, print exit block.            |

### Malph — Documentation Reviewer (`malph-workflow-*`)

Review workflow (6 phases):

| Phase | Skill                        | Description                                                                       |
| ----- | ---------------------------- | --------------------------------------------------------------------------------- |
| 1     | `malph-workflow-descend`     | Read JIRA issue, download handoff, search ralphchives, find PR, announce arrival. |
| 2     | `malph-workflow-investigate` | Dispatch malph-scout, read status.json.                                           |
| 3     | `malph-workflow-verify`      | Dispatch technical reviewer, read status.json.                                    |
| 4     | `malph-workflow-review`      | Dispatch style + IA reviewers, determine panel verdict from status.json.          |
| 5     | `malph-workflow-deliver`     | Dispatch malph-verdict to aggregate findings and deliver.                         |
| 6     | `malph-workflow-handoff`     | Attach review handoff to JIRA, report to ralphchives, print exit block.           |

### Malph (VS Code) — Extension Reviewer (`malph-vscode-workflow-*`)

Review workflow (7 phases):

| Phase | Skill                               | Description                                                                                                                  |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | `malph-vscode-workflow-descend`     | Read JIRA issue, parse handoff, search ralphchives, find PR, announce arrival.                                               |
| 2     | `malph-vscode-workflow-orient`      | Read repo instructions and internalize definition-driven architecture.                                                       |
| 3     | `malph-vscode-workflow-investigate` | Delegate to investigator sub-agent, read full changed files, check existing PR threads.                                      |
| 4     | `malph-vscode-workflow-verify`      | Build, lint, and test validation. Any failure is an automatic blocker.                                                       |
| 5     | `malph-vscode-workflow-review`      | Comprehensive review: requirements, architecture, TypeScript quality, validation/diagnostics, completions, grammar, testing. |
| 6     | `malph-vscode-workflow-deliver`     | Post JIRA comment with verdict and issue codes, post file-level PR threads.                                                  |
| 7     | `malph-vscode-workflow-handoff`     | Write review-handoff, attach to JIRA, report to ralphchives, print exit block.                                               |

### Ralph (VS Code) — Extension Developer (`vscode-workflow`)

Single consolidated router skill with per-phase reference files. The `isRevision` Liquid flag selects the appropriate workflow table.

Standard workflow (8 phases):

| Phase | Reference                        | Description                                       |
| ----- | -------------------------------- | ------------------------------------------------- |
| 1     | `references/1-setup.md`          | Branch verify, state.md init, JIRA greeting       |
| 2     | `references/2-analyze.md`        | Dispatch analyst, read status.json                |
| 3     | `references/3-implement-loop.md` | Dispatch coder → reviewer loop (max 2 iterations) |
| 4     | `references/4-package.md`        | Bump patch version, update CHANGELOG, build .vsix |
| 5     | `references/5-commit.md`         | Pre-commit build, commit, push via MCP            |
| 6     | `references/6-pr.md`             | Create ADO pull request                           |
| 7     | `references/7-handoff.md`        | Write handoff, report to JIRA                     |
| 8     | `references/8-archive.md`        | Dispatch scribe, print exit block                 |

Revision workflow (7 phases):

| Phase | Reference                        | Description                                       |
| ----- | -------------------------------- | ------------------------------------------------- |
| 1     | `references/r1-setup.md`         | Read feedback, find existing PR & branch          |
| 2     | `references/2-analyze.md`        | Dispatch analyst in revision mode                 |
| 3     | `references/3-implement-loop.md` | Dispatch coder → reviewer loop (max 2 iterations) |
| 4     | `references/4-package.md`        | Bump patch version, update CHANGELOG, build .vsix |
| 5     | `references/r5-commit.md`        | Commit, push, reply to PR threads                 |
| 6     | `references/r6-handoff.md`       | Update handoff, report to JIRA                    |
| 7     | `references/8-archive.md`        | Dispatch scribe, print exit block                 |

Domain reference: `references/test-guide.md` — Mocha TDD test writing guide for the coder subagent.

## Integration Skills

Integration skills cover interactions with external services used across multiple agents and workflows.

| Skill                     | Description                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ralph-ado-pr-workflow`   | Creating pull requests and writing PR descriptions for Azure DevOps.                                   |
| `ralph-ralphchives`       | Searching and posting to the Ralphchives persistent knowledge base shared by all agents.               |
| `ralph-screenshots`       | Capturing clean admin UI screenshots using playwright-cli for documentation.                           |
| `ralph-source-references` | URL format for citing Xperience source code via the source browser in JIRA comments and handoff files. |

## Task Skills

Task skills provide guides for specific task types that don't follow the standard workflow.

| Skill                       | Description                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ralph-codesamples`         | Complete reference for the codesamples .NET project — solution structure, feature-folder organization, `code_link` integration, build workflow, and coding conventions. |
| `ralph-training-modules`    | YAML schema and templates for creating structured training modules and learning paths.                                                                                  |
| `ralph-write-release-notes` | Format and examples for writing release notes for Xperience features and changes.                                                                                       |

## Variant Skill Assignments

Each profile variant declares which skills are available to its agent. Skills are specified in the `stages[].skills` array in `profile.json`.

### ralph-docs

| Agent                              | Skills                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| **ralph.ralph** (writer)           | 28 skills — all domain + task + integration + `ralph-workflow-*`    |
| **ralph.malph** (reviewer)         | 15 skills — documentation domain + integration + `malph-workflow-*` |
| **ralph.overralph** (orchestrator) | 28 skills — same as ralph.ralph                                     |
| **ralph.stacky** (fullstack dev)   | 8 skills — `devralph-*` domain + `devralph-workflow` + integration  |

### ralph-vscode

| Agent                       | Skills                                             |
| --------------------------- | -------------------------------------------------- |
| **ralph.ralph** (developer) | 11 skills — integration + `vscode-workflow-*`      |
| **ralph.malph** (reviewer)  | 9 skills — integration + `malph-vscode-workflow-*` |

## Adding Skills

1. Create `shared/skills/<category>/<skill-name>/SKILL.md`
2. Add YAML frontmatter with `name` and `description`
3. Add the skill name to the relevant variant's `stages[].skills` array in `profile.json`
4. The skill is automatically mounted into the container at `.github/skills/<skill-name>/`

See the [skill-creator skill](../../.claude/skills/skill-creator/SKILL.md) for authoring guidelines and the [Profiles](profiles.md) reference for the `skills` field schema.
