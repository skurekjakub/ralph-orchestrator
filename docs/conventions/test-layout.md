# Test layout

> **Adapt me.** Where tests live, so `rubber-duk-tests` puts new files where a
> teammate would look for them. Replace the defaults below with your layout.

- **Unit and integration tests:** the root suite is `tests/**/*.test.ts`, the
  only pattern `vitest.config.ts` includes (a `.test.tsx` there never runs).
  Each sub-project runs its own tests, and the root `npm test` skips them:
  - `dashboard-local/src/**/*.test.ts(x)`, colocated, jsdom; shared test data
    in `dashboard-local/src/test/factories.ts` and `fakes.ts`.
  - `shared/mcp-servers/<name>/tests/*.test.ts` (ado, jira-kentico,
    ralphchives-read, ralphchives-write).
  - `ralphchives/sync/tests/*.test.ts`.
- **Placement rule:** root tests mirror `src/` under `tests/`
  (`src/services/task-runner.ts` → `tests/services/task-runner.test.ts`);
  `src/container/setup/*` is tested flat in `tests/container/`.
  dashboard-local tests sit next to the module (`ToolTimeline.tsx` →
  `ToolTimeline.test.tsx`, `*-parser.ts` → `*-parser.test.ts`); new tests
  don't go in its two leftover `__tests__/` folders.
- **Integration tests** (several real modules together, fakes only at the
  process boundary): no separate tree — they sit in the mirrored `tests/`
  tree, named for their scope: `tests/orchestrator/orchestrator-e2e.test.ts`
  (the real `Orchestrator` loop, boundary deps faked by
  `tests/orchestrator/e2e-helpers.ts`), `tests/prompt/prompt-pipeline.test.ts`
  (JIRA fixture → mapper → `PromptBuilder` → auditor, snapshot in
  `tests/prompt/fixtures/`) and `tests/container/template-integration.test.ts`
  (renders the shipped templates and skills). Live-service tests exist only as
  `shared/mcp-servers/ralphchives-read|write/tests/*-integration.test.ts`;
  they skip without a live NodeBB and run in the manual
  `.github/workflows/ralphchives-integration.yml`.
- **Fixtures** live beside the tests that use them, frozen
  (`tests/prompt/fixtures/`); value builders go in
  `tests/helpers/factories.ts`. Tests never read production data — except
  `tests/container/template-integration.test.ts` and
  `template-context-lint.test.ts`, which read the shipped `profiles/*/agents/`,
  `shared/agent-includes/` and `shared/skills/` on purpose to lint their
  Liquid structure.
- **Run one file:** `npx vitest run` with the file path appended — from the
  repo root for `tests/**`, from inside the sub-project for the others. The
  root gate is `npm test` (lint + build + vitest).
