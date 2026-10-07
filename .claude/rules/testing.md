---
paths:
  - "tests/**"
---

# Tests

- Vitest, ESM. `tests/` mirrors `src/` (`src/services/x.ts` → `tests/services/x.test.ts`). Iterate with `npx vitest run <file>` and finish with `npm test`, which also type-checks `tests/` through `tests/tsconfig.json`.
- Reuse helpers before writing local ones: value factories `make*` in `tests/helpers/factories.ts` (pure, no `vi`) and service mocks `createMock*` in `tests/helpers/mocks.ts`. Move a helper there once a second suite needs it.
- Type mocks as `Mocked<IFoo>` (the repo's own type from `tests/helpers/mocks.ts`), always against the **interface**, never the class. No `as any`.
- Construct services the way the awilix cradle does, with one deps object: `new IssueManager({ connectors, logger })`. A test-only override is the optional second positional parameter: `new JiraClient({ jiraConnection, logger }, { delayMs: 1 })`.
- Test scope wiring through a real container: a strict PROXY root holding the root tokens the scope reads as values, `registerScopedServices(root)`, and the scope's opener (`openTaskScope`, `createStageExecutorFactory`). `writeFixtureProfile` (`tests/helpers/fixture-checkout.ts`) writes the profile files a task or Claude Code stage scope reads. A new root, task or stage token gets its expected class in `tests/orchestrator-factory.test.ts`.
- ESM: use a top-level `vi.mock("execa" | "node:fs", async (importOriginal) => …)` plus `vi.mocked()`, and `vi.mock` of the module for a `src/` module function (`loadAgentCatalog`). `vi.spyOn` can't intercept module namespace exports.
- No real waits: `manager.retryOptions = { delayMs: 1 }`, `withRetry(..., { delayMs: 1 })`, stubbed sleeps or fake timers. Never raise timeouts.
- One top-level `describe` per unit under test. Nest by public method or behaviour area, never by internals. `it` names describe behaviour. Assert on observable outcomes and enum values (`TaskStatus.Error`), not raw strings.
- Label each test body's phases `// Arrange`, `// Act`, `// Assert` (`// Act & Assert` for one expression; no label for an absent phase), per `docs/conventions/comment-policy.md` § Tests.
- Cover unhappy paths: thrown errors, non-zero exits, timeouts, malformed input, missing files.
- Details and examples: the `test-patterns` skill.
