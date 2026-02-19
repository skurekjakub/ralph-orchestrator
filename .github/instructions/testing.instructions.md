---
applyTo: "tests/**"
---

# Unit Test Conventions — Ralph Orchestrator

## Framework & Runtime

- **Vitest** in ESM mode — `vitest run` for CI, `vitest` for watch mode.
- `npm test` runs the full pipeline: lint → build → vitest.
- Tests live in `tests/` mirroring the `src/` directory structure.

## Shared Factories

All shared test factories live in `tests/helpers/`. Check available factories before creating local ones.

**Naming conventions:**
- `createMock<Service>(overrides?)` — service mock returning `Mocked<I...>` (e.g., `createMockIssueManager()`, `createMockPoller()`)
- `make<DataType>(overrides?)` — data factory for value objects (e.g., `makeIssue()`, `makeProfile()`, `makeResult()`)

All `createMock*` factories accept optional overrides to customize individual methods. `createMockContainer()` returns `{ container, spies }` for fine-grained assertion.

If a mock is needed by more than one test suite, add it to `tests/helpers/`.

## ESM Module Mocking

`vi.spyOn` cannot intercept re-exported ESM namespace members because the module namespace object is sealed. Use `vi.mock` at the top level instead:

```ts
// ✅ Works in ESM
vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return { ...orig, readFileSync: vi.fn().mockReturnValue("content") };
});

// Then in tests:
const { readFileSync } = await import("node:fs");
vi.mocked(readFileSync).mockReturnValue("specific content");
```

```ts
// ❌ Fails silently in ESM
vi.spyOn(fs, "readFileSync");
```

## Retry Delays in Tests

Classes that use `withRetry` internally accept an optional `RetryOptions` in their constructor. Pass `{ delayMs: 1 }` in tests to eliminate retry wait time:

```ts
// ✅ Fast — retries complete in ~1ms each
const manager = new JiraIssueManager(jira, logger, { delayMs: 1 });
const resources = new TaskJiraResourceManager(jira, logger, { delayMs: 1 });
```

For direct `withRetry` calls in tests, pass `{ delayMs: 1 }`:

```ts
await withRetry(fn, "label", logger, { attempts: 3, delayMs: 1 });
```

Never rely on `{ timeout: 15000 }` to work around retry delays — inject a fast delay instead.

## Test Structure

- **One `describe` per class**, nested `describe` per method.
- **Constructor injection** — all dependencies are injected, making every class testable without Docker or network.
- Test file naming: `<module>.test.ts` matching the source file.

## Mock Factory Pattern

### Typed mocks via `Mocked<T>`

The `Mocked<T>` utility type maps each public method on an interface to a `vi.fn()` spy. Always use the **interface** type (not the class) as the type parameter:

```ts
// ✅ Mocked<IIssueManager> — structurally compatible, no casts needed
const mgr = createMockIssueManager();

// ❌ Mocked<JiraIssueManager> — class type has private members, won't match
```

All shared `createMock*` factories already use interface types. For one-off mocks, follow the same pattern with `Mocked<IFoo>`.

### Why interfaces, not classes?

TypeScript classes carry **private member identity**. A plain object can never satisfy a class type that has `private` fields. Interfaces strip this identity, so `Mocked<IFoo>` is assignable to `IFoo` without casts. See `DEPENDENCY-INJECTION.md` for details.

## Enums in Assertions

Use the enum value, not the raw string, in assertions and call arguments:

```ts
// ✅
expect(issueManager.transitionIssue).toHaveBeenCalledWith(
  "DF-100", "In Progress", TransitionPhase.BeforeAgent,
);

// ❌
expect(issueManager.transitionIssue).toHaveBeenCalledWith(
  "DF-100", "In Progress", "beforeAgent",
);
```
