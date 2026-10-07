# Skills Reference

Skills are markdown files (`SKILL.md`) that provide domain-specific knowledge to agents at runtime. Each skill lives in a folder under `shared/skills/` that holds a `SKILL.md`, usually `shared/skills/<category>/<skill-name>/`. A stage gets the skills its `stages[].skills` array names in `profile.json`.

Before the containers start, and again before each stage of a multi-stage pipeline and each local stage, `SkillTemplateRenderer` renders the stage's skills through Liquid (the [template variables](template-variables.md) without `self`; partials from `shared/skills/` and `shared/agent-includes/`) into one folder per skill, category folders flattened. Where the stage's CLI finds them:

| Stage                                   | Claude Code                                                                                 | Copilot CLI                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Container (`mode: "container"`)         | `/workspace/.ralph/claude/skills/<skill-name>/` (`profiles/<id>/.build/skills/`, read-only) | `/workspace/.github/skills/<skill-name>/`, one read-only mount per skill |
| Host (`mode: "local"`, post-task hooks) | `home/skills/<skill-name>/` in the stage's workspace                                        | `work/.github/skills/<skill-name>/` in the stage's workspace             |

Skills are organized into categories: **domain** (stack-specific knowledge), **workflow** (sequential phase instructions), **integrations** (external service interactions), **tasks** (specialized task-type guides) and **analysis** (run analysis for the post-task hook). The Xperience router skills sit directly under `shared/skills/`.

## Directory Layout

```
shared/skills/
├── analysis/                  # Run analysis for the run-analysis post-task hook
├── domain/                    # Stack and codebase knowledge
├── integrations/              # External service interactions
├── tasks/                     # Specialized task-type guides
├── workflow/
│   ├── docs/                  # Ralph, Malph and Stacky workflows (ralph-docs)
│   └── vscode/                # Ralph and Malph workflows (ralph-vscode)
├── xperience/                 # Router skill for the Xperience source code
└── xperience-documentation/   # Router skill for the Xperience documentation structure
```

A skill's folder name must be unique across all categories and equal its frontmatter `name`, since the rendered skills sit side by side in one folder. A skill no stage lists is never mounted.

## Domain Skills

Domain skills provide reference knowledge about specific technologies, patterns, or conventions. Agents read these on-demand when working in a relevant area.

| Skill                          | Description                                                                                                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-typescript-bps`          | TypeScript dos and don'ts for type design, naming conventions, generics and patterns.                                                                                                                                                               |
| `code-typescript-review`       | Code review checklist for TypeScript projects: type safety, best practices, performance, security and code quality.                                                                                                                                 |
| `devralph-build-verification`  | Build verification and error troubleshooting. Covers primary build commands (`npm run build`, `npm run serve`, `npx gulp rspec_tests`), common failure patterns across Jekyll/Liquid, Ruby gems, Webpack, Less/Tailwind CSS, and the Gulp pipeline. |
| `devralph-frontend`            | Frontend architecture — JavaScript (ES modules + Webpack, 4 bundles), jQuery patterns, Tailwind v4 CSS-first config, Less legacy styling, and third-party libraries.                                                                                |
| `devralph-gulp-pipeline`       | Gulp 5 orchestration layer — task architecture, asset pipeline (Less + Tailwind + Webpack), Jekyll CLI integration, BrowserSync, config overlay system, incremental build caching.                                                                  |
| `devralph-jekyll-site`         | Jekyll site structure — collections (7 active + legacy), layouts (8 templates), includes, data files (pagetree YAML), frontmatter conventions, multi-file config overlay.                                                                           |
| `devralph-ruby-gems`           | Architecture for the 8 custom Ruby gems under `gems/` — kentico-core (DI container, tag base classes), liquid-kfm (42 custom Liquid tags), jekyll-algolia, jekyll-learn-portal, and supporting gems.                                                |
| `ralph-build-errors`           | Troubleshooting guide for common `npm run build` errors — broken `page_link` identifiers, missing anchors, duplicate identifiers, code blocks missing lang parameter, circular redirects, URI path conflicts, frontmatter issues.                   |
| `ralph-callout-selection`      | When to use each admonition type (tip, info, note, warning, key). Covers semantic meaning of each type and common mistakes.                                                                                                                         |
| `ralph-cross-version-linking`  | How to link across documentation collections (documentation, guides, api) using the `collection` parameter on `page_link` and `card` tags.                                                                                                          |
| `ralph-documentation-syntax`   | Complete reference for all Liquid tags, formatting, and components available in the docs site — admonitions, code blocks, images, page links, tables, columns, cards, assets, anchors.                                                              |
| `ralph-new-page-creation`      | Rules for creating new Markdown pages — frontmatter schema, identifiers, persona assignment, ordering, licensing.                                                                                                                                   |
| `ralph-page-removal`           | Checklist for removing or deprecating pages without leaving broken links — removing from `documentation.yml`, setting up redirects, cleaning up orphaned references.                                                                                |
| `ralph-research-guide`         | Research guide for the ralph-researcher sub-agent — research order, techniques for exploring existing docs, Xperience C# source code, external references, report template, validation checklist.                                                   |
| `ralph-style-guide-review`     | Writing standards for self-reviewing documentation — UI interaction verbs, formatting rules, tone and voice, sentence structure, callout box usage.                                                                                                 |
| `test-behavior-testing`        | Writing tests that verify behavior and outputs rather than implementation details.                                                                                                                                                                  |
| `test-mocking-strategy`        | When and how to mock dependencies: mocks, fakes or real collaborators, mocking at architectural boundaries.                                                                                                                                         |
| `test-structure-patterns`      | Structuring test files, naming tests, Given/When/Then, organizing tests by behavior.                                                                                                                                                                |
| `vscode-extension-performance` | VS Code extension startup cost, activation events, extension host performance, bundling and lazy registration.                                                                                                                                      |
| `vscode-grammar-and-scopes`    | VS Code TextMate and injection grammars, syntax highlighting, embedded languages and token scopes.                                                                                                                                                  |

### Xperience Router Skills

| Skill                     | Description                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xperience`               | Orientation in the Xperience by Kentico source code: which subsystem owns a feature, source roots per documentation topic. References cover each product area, including the page permission model. |
| `xperience-documentation` | Structure of the Xperience by Kentico documentation: areas, what each section covers, how pages relate, and where the corresponding source code lives.                                              |

## Workflow Skills

Workflow skills define sequential phases for agent execution. Each agent type has its own workflow skill set: either one router skill with a reference file per phase, or one skill per phase. Agents read the corresponding skill or reference file at the start of each phase. The router skills use the `isRevision` Liquid flag to show the standard or the revision workflow table.

### Stacky — Fullstack Development (`devralph-workflow`)

Standard workflow:

| Phase | Reference                   | Description                                                                    |
| ----- | --------------------------- | ------------------------------------------------------------------------------ |
| 1     | `references/1-setup.md`     | Branch, scratchpad, ralphchives search, component identification.              |
| 2     | `references/2-research.md`  | Dispatch stacky-analyst to produce the implementation plan.                    |
| 3     | `references/3-implement.md` | Dispatch stacky-coder to execute changes and validate builds.                  |
| 4     | `references/4-test.md`      | Write unit and integration tests (delegate to stacky-test-writer).             |
| 5     | `references/5-e2e.md`       | Write Playwright E2E tests for UI changes (delegate to stacky-e2e-playwright). |
| 6     | `references/6-review.md`    | Code review gate (stacky-reviewer and stacky-bug-auditor).                     |
| 7     | `references/7-commit.md`    | Pre-commit checks, commit, push.                                               |
| 8     | `references/8-pr.md`        | Create an ADO pull request.                                                    |
| 9     | `references/9-handoff.md`   | Write handoff, report to JIRA, print exit block.                               |

Revision workflow:

| Phase | Reference                  | Description                                                  |
| ----- | -------------------------- | ------------------------------------------------------------ |
| 1     | `references/r1-setup.md`   | Review previous handoff, extract defects, plan fixes.        |
| 2     | `references/r2-fix.md`     | Dispatch stacky-coder for fixes, full verification gauntlet. |
| 3     | `references/r3-commit.md`  | Commit with `fix(TASKID)` prefix, push to update the PR.     |
| 4     | `references/r4-handoff.md` | Update handoff, report to JIRA, print exit block.            |

### Ralph — Documentation Writer (`ralph-workflow`)

Standard workflow:

| Phase | Reference                             | Description                                                                                                                 |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1     | `references/1-setup.md`               | Branch, scratchpad, ralphchives search.                                                                                     |
| 1b    | _(ralph-codesamples-bootstrap skill)_ | Only with the `codesamples` and `xpversion` trigger params: dispatch ralph-coder to bootstrap the codesamples .NET project. |
| 2     | `references/2-research.md`            | Dispatch ralph-researcher, then ralph-planner to produce task files.                                                        |
| 3     | `references/3-write.md`               | Dispatch ralph-writer for the active `in_progress` planned task from `tasks.json`.                                          |
| 4–5   | `references/4-review.md`              | Review the current task, revise it if needed, then advance to the next task.                                                |
| 6     | `references/6-commit.md`              | Pre-commit checks, commit, push.                                                                                            |
| 7     | `references/7-pr.md`                  | Create an ADO pull request.                                                                                                 |
| 8     | `references/8-handoff.md`             | Dispatch ralph-scribe, deliver to JIRA, print exit block.                                                                   |

Revision workflow:

| Phase | Reference                  | Description                                                                                        |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| 1–2   | `references/r1-setup.md`   | Understand feedback, find the existing branch and PR.                                              |
| 3     | `references/r3-fix.md`     | Dispatch ralph-planner, then ralph-writer for the active `in_progress` fix task from `tasks.json`. |
| 4     | `references/4-review.md`   | Review the current task, revise it if needed, then advance to the next task.                       |
| 5     | `references/r5-commit.md`  | Commit, push, respond to PR threads.                                                               |
| 6     | `references/r6-handoff.md` | Dispatch ralph-scribe, deliver the revision handoff, print exit block.                             |

### Malph — Documentation Reviewer (`malph-workflow-*`)

Review workflow, one skill per phase:

| Phase | Skill                        | Description                                                                                          |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1     | `malph-workflow-descend`     | Read the JIRA issue, download Ralph's handoff, search ralphchives, find the PR, announce arrival.    |
| 2     | `malph-workflow-investigate` | Dispatch malph-scout to map the PR, capture requirement-coverage risks and run the docs build.       |
| 3     | `malph-workflow-verify`      | Dispatch the technical reviewer and record its `status.json` result.                                 |
| 4     | `malph-workflow-review`      | Dispatch the remaining specialist reviewers, determine the panel verdict from `status.json` results. |
| 5     | `malph-workflow-deliver`     | Dispatch malph-verdict to aggregate findings, post the JIRA comment and PR threads.                  |
| 6     | `malph-workflow-handoff`     | Attach the review handoff to JIRA, report to ralphchives, print exit block.                          |

### Malph (VS Code) — Extension Reviewer (`malph-vscode-workflow-*`)

Review workflow, one skill per phase:

| Phase | Skill                                | Description                                                                                 |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1     | `malph-vscode-workflow-setup`        | Read the JIRA issue, find the PR, create the artifacts directory, announce arrival.         |
| 2     | `malph-vscode-workflow-scout`        | Dispatch malph-scout for diff mapping, pattern verification and build validation.           |
| 3     | `malph-vscode-workflow-review-panel` | Dispatch three independent reviewers in turn (Opus, Sonnet, Fable), each with its own lens. |
| 4     | `malph-vscode-workflow-aggregate`    | Aggregate reviewer verdicts and findings, post a unified review comment to JIRA.            |
| 5     | `malph-vscode-workflow-handoff`      | Write the review handoff and attach it to JIRA.                                             |
| 6     | `malph-vscode-workflow-archive`      | Dispatch the scribe to archive review knowledge to Ralphchives, print exit block.           |

### Ralph (VS Code) — Extension Developer (`vscode-workflow`)

Phases 2 and 3 dispatch the planner and run a per-task coder → reviewer loop (max 3 rounds per task, then planner verification, max 2 planner passes); with the `skip_planner` trigger param they run one coder → reviewer loop (max 2 iterations) instead.

Standard workflow:

| Phase | Reference                        | Description                                       |
| ----- | -------------------------------- | ------------------------------------------------- |
| 1     | `references/1-setup.md`          | Branch verify, state.md init, JIRA greeting       |
| 2     | `references/2-analyze.md`        | Dispatch analyst, read status.json, then planner  |
| 3     | `references/3-implement-loop.md` | Implement and review                              |
| 4     | `references/4-package.md`        | Bump patch version, update CHANGELOG, build .vsix |
| 5     | `references/5-commit.md`         | Pre-commit build, commit, push via MCP            |
| 6     | `references/6-pr.md`             | Create ADO pull request                           |
| 7     | `references/7-handoff.md`        | Write handoff, report to JIRA                     |
| 8     | `references/8-archive.md`        | Dispatch scribe, print exit block                 |

Revision workflow:

| Phase | Reference                        | Description                                                                |
| ----- | -------------------------------- | -------------------------------------------------------------------------- |
| 1     | `references/r1-setup.md`         | Read reviewer feedback, find existing PR & branch, greet on the JIRA issue |
| 2     | `references/2-analyze.md`        | Dispatch analyst in revision mode, read status.json, then planner          |
| 3     | `references/3-implement-loop.md` | Fix and review                                                             |
| 4     | `references/4-package.md`        | Bump patch version, update CHANGELOG, build .vsix                          |
| 5     | `references/r5-commit.md`        | Commit, push, reply to PR threads                                          |
| 6     | `references/r6-handoff.md`       | Update handoff, report to JIRA                                             |
| 7     | `references/8-archive.md`        | Dispatch scribe, print exit block                                          |

Domain reference: `references/test-guide.md` — test writing guide for the coder and reviewer subagents.

## Integration Skills

Integration skills cover interactions with external services used across multiple agents and workflows.

| Skill                            | Description                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ralph-ado-pr-workflow`          | Creating pull requests and writing PR descriptions for Azure DevOps.                                                                            |
| `ralph-codegraph`                | Querying the Xperience source code structure through the CodeGraphContext MCP tools: call chains, class hierarchies, dead code, Cypher queries. |
| `ralph-codesamples-verification` | Functionally verifying the codesamples ASP.NET Core application with playwright-cli after changing it.                                          |
| `ralph-ralphchives`              | Searching and posting to the Ralphchives persistent knowledge base shared by all agents.                                                        |
| `ralph-screenshots`              | Capturing clean admin UI screenshots using playwright-cli for documentation.                                                                    |
| `ralph-source-references`        | URL format for citing Xperience source code via the source browser in JIRA comments and handoff files.                                          |

## Task Skills

Task skills provide guides for specific task types that don't follow the standard workflow.

| Skill                         | Description                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ralph-codesamples`           | Complete reference for the codesamples .NET project — solution structure, feature-folder organization, `code_link` integration, build workflow, and coding conventions. |
| `ralph-codesamples-adminui`   | Creating admin-managed objects through the Xperience admin UI with Playwright, for the `adminui` trigger param.                                                         |
| `ralph-codesamples-bootstrap` | Bootstrapping a working codesamples project: version installation, NuGet restore, database creation, CI restore, for the `xpversion` trigger param.                     |
| `ralph-task-planning`         | Planning skill for the ralph-planner subagent: breaking research or revision feedback into ordered task files for the writer.                                           |
| `ralph-training-modules`      | YAML schema and templates for creating structured training modules and learning paths.                                                                                  |
| `ralph-write-release-notes`   | Format and examples for writing release notes for Xperience features and changes.                                                                                       |

## Analysis Skills

Analysis skills serve the `ralph.scientist` agent of the `run-analysis` post-task hook, which runs on the host after the task and analyses the finished run.

| Skill                    | Description                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-eval`             | Evaluating a completed agent run: tool selection, ordering, arguments, efficiency, error recovery, output accuracy, workflow compliance. |
| `run-telemetry-analysis` | Analysing a run from its `*-claude-run-telemetry.json` and audit log; for a Copilot run, from its `cli-debug.log`.                       |
| `skill-authoring`        | Writing or improving a runtime skill: layout, description, body, Liquid and wiring.                                                      |

## Variant Skill Assignments

Each profile variant declares which skills each of its stages gets, in the stage's `skills` array in `profile.json`. Every variant of both bundled profiles also runs the `run-analysis` post-task hook, whose `scientist` stage gets the analysis skills.

### ralph-docs

| Agent                            | Skills                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ralph.ralph** (writer)         | `ralph-workflow`, `ralph-research-guide`, `ralph-task-planning`, `ralph-new-page-creation`, `ralph-documentation-syntax`, `ralph-style-guide-review`, `ralph-build-errors`, `ralph-write-release-notes`, `ralph-codesamples`, `ralph-codesamples-bootstrap`, `ralph-codesamples-adminui`, `ralph-codesamples-verification`, `ralph-ado-pr-workflow`, `ralph-source-references`, `ralph-ralphchives`, `xperience`, `xperience-documentation` |
| **ralph.malph** (reviewer)       | `malph-workflow-*`, `ralph-documentation-syntax`, `ralph-style-guide-review`, `ralph-ado-pr-workflow`, `ralph-ralphchives`, `ralph-source-references`                                                                                                                                                                                                                                                                                       |
| **ralph.stacky** (fullstack dev) | `devralph-workflow`, the `devralph-*` domain skills, `ralph-ado-pr-workflow`, `ralph-ralphchives`                                                                                                                                                                                                                                                                                                                                           |

### ralph-vscode

| Agent                       | Skills                                                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ralph.ralph** (developer) | `vscode-workflow`, `test-behavior-testing`, `test-mocking-strategy`, `test-structure-patterns`, `code-typescript-review`, `code-typescript-bps`, `vscode-grammar-and-scopes`, `ralph-ado-pr-workflow`, `ralph-ralphchives` |
| **ralph.malph** (reviewer)  | `malph-vscode-workflow-*`, `ralph-ado-pr-workflow`, `ralph-ralphchives`                                                                                                                                                    |

## Adding Skills

1. Create `shared/skills/<category>/<skill-name>/SKILL.md`. The folder name must not be used by another skill.
2. Add YAML frontmatter with `name` (equal to the folder name) and a non-empty `description` of at most 1024 characters. `npm run validate` checks both.
3. Add the skill name to the `skills` array of each stage that needs it in `profile.json`. Validation fails on a skill name that does not exist.
4. To have a Claude Code agent start with the skill, list it in the agent's frontmatter `skills` too (see [agent templates](../dev-doc/agent-templates.md)); otherwise the agent loads it with the Skill tool when it needs it.

The skill is rendered and mounted for the stage as described at the top of this page. See the [skill-creator skill](../../.claude/skills/skill-creator/SKILL.md) for authoring guidelines and the [Profiles](profiles.md) reference for the `skills` field schema.
