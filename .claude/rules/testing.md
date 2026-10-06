---
paths:
  - "tests/**"
---

# Tests

- Vitest, ESM. `tests/` mirrors `src/` (`src/services/x.ts` → `tests/services/x.test.ts`). Iterate with `npx vitest run <file>` and finish with `npm test`, which also type-checks `tests/` through `tests/tsconfig.json`.
- Reuse helpers before writing local ones: value factories `make*` in `tests/helpers/factories.ts` (pure, no `vi`) and service mocks `createMock*` in `tests/helpers/mocks.ts`. Move a helper there once a second suite needs it.
- Type mocks as `Mocked<IFoo>` (the repo's own type from `tests/helpers/mocks.ts`), always against the **interface**, never the class. No `as any`.
- Construct services the way the awilix cradle does, with one deps object: `new IssueManager({ connectors, logger })`.
- ESM: use a top-level `vi.mock("execa" | "node:fs", async (importOriginal) => …)` plus `vi.mocked()`. `vi.spyOn` can't intercept module namespace exports.
- No real waits: `manager.retryOptions = { delayMs: 1 }`, `withRetry(..., { delayMs: 1 })`, stubbed sleeps or fake timers. Never raise timeouts.
- One top-level `describe` per unit under test. Nest by public method or behaviour area, never by internals. `it` names describe behaviour. Assert on observable outcomes and enum values (`TaskStatus.Error`), not raw strings.
- Cover unhappy paths: thrown errors, non-zero exits, timeouts, malformed input, missing files.
- Details and examples: the `test-patterns` skill.
