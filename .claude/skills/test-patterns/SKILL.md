---
name: test-patterns
description: "Writes and reviews Vitest tests for the Ralph Orchestrator codebase (tests/ mirroring src/): behaviour-focused assertions, Mocked<IInterface> service mocks from tests/helpers/mocks.ts, pure value factories from tests/helpers/factories.ts, ESM module mocking with vi.mock, fast retry injection, and unhappy-path coverage. Use when adding or fixing a test, deciding what to mock, structuring describe/it blocks, testing a new service or awilix-registered class, or when tests are brittle, slow, or break on refactor. Trigger on 'write tests for', 'add a test', 'this test is flaky', 'how do I mock execa / node:fs', 'mock the connector', 'test the error path'."
---

# Testing the orchestrator

Vitest runs in ESM mode. `vitest.config.ts` includes only `tests/**/*.test.ts` and excludes `shared/mcp-servers`, the dashboards and `ralphchives` (each of those has its own tests). The runtime copies under `shared/skills/domain/test-*` are for container agents working on _other_ repos. Don't edit them for orchestrator conventions.

```bash
npx vitest run tests/services/task-runner.test.ts   # one file while iterating
npm run test:watch                                  # watch, no lint/build
npm test                                            # lint (src, tests and scripts tsconfigs + eslint + prettier --check) → build → vitest; run before finishing
```

## Layout and naming

- `tests/` mirrors `src/`: `src/services/issue-manager.ts` → `tests/services/issue-manager.test.ts`. Import source, and name `vi.mock` targets, with extensionless relative paths (`../../src/services/issue-manager`).
- One top-level `describe` per unit under test (class or exported function name). Nested `describe` blocks group **public** methods (`tests/services/issue-manager.test.ts`) or behaviour areas (`"crash recovery"`, `"persistence"` in `tests/services/operation-ledger.test.ts`). Never group by private method or internal call.
- `it(...)` names state behaviour as a sentence: `"posts failure comment when connector throws"`, not `"calls transitionWorkItem"`.

## Helpers (check before writing a local one)

- `tests/helpers/factories.ts`: pure value constructors with `overrides`, no mocks or `vi` (`makeWorkItem`, `makeProfile`, `makeResult`, `makeTaskContext`, `makeTemplateContext`, `makeConfig`, …).
- `tests/helpers/mocks.ts`: the repo's own `Mocked<T>` type plus `createMock*` factories returning `Mocked<IInterface>` with `vi.fn()` spies and per-method overrides (`createMockLogger`, `createSilentLogger`, `createMockConnector`, `createMockIssueManager`, `createMockResources`, `createMockCompose`, `createMockContainer` → `{ container, spies }`, `createMockTaskRunner`, `fakeExecResult`, …).
- `tests/helpers/mcp-fs.ts`: temp dirs and manifest writers for MCP setup tests.
- When a second suite needs the same mock or factory, move it into `tests/helpers/`.

## Rules

- **Mock interfaces, not classes.** Type mocks as `Mocked<IFoo>` imported from `tests/helpers/mocks.ts`. Class types carry private-member identity, so plain objects never satisfy them and you end up casting. No `as any`.
- **Construct like the cradle does.** Services take a single deps object (`new IssueManager({ connectors, logger })`), so pass mocks there; don't patch internals.
- **ESM module mocking** uses a top-level `vi.mock("execa" | "node:fs", async (importOriginal) => ({ ...await importOriginal(), fn: vi.fn() }))` followed by `vi.mocked(fn)`. `vi.spyOn` cannot intercept ESM namespace exports. It is fine on plain objects and static methods (`console`, `ContinuationRunner.sleep`). Example: `tests/container/cli-executors/local-claude-code-executor.test.ts`.
- **No real waits.** Set `manager.retryOptions = { delayMs: 1 }` (`IssueManager`, `TaskResourceManager`). Pass `{ delayMs: 1 }` as `JiraClient`'s second constructor argument, or to `withRetry(fn, label, logger, { attempts, delayMs: 1 })`. Stub sleeps (`vi.spyOn(ContinuationRunner, "sleep")`) or use `vi.useFakeTimers()`. Never raise a test timeout to absorb a delay.
- **Assert on enums** (`TransitionPhase.BeforeAgent`, `TaskStatus.Error`, `StageMode.Local`), not their string values.
- **Test unhappy paths for every behaviour:** connector/API throws, non-zero exit or `ExecaError`, timeout, malformed JSON or Liquid, missing files, empty inputs. Assert on what the caller observes (status, logged warning, posted error comment, thrown message).

For principles on what to assert, when to mock vs fake, and Given/When/Then, read `references/principles.md`.
