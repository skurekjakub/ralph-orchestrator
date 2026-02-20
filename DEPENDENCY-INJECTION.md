# Dependency Injection — Ralph Orchestrator

## Pattern

Every service class injected via `OrchestratorDeps` has a corresponding `I`-prefixed interface defined **in the same file** as the implementation:

```typescript
// src/jira/client.ts
export interface IJiraClient {
  searchIssues(jql: string): Promise<JiraIssue[]>;
  getIssue(key: string): Promise<JiraIssue>;
  // ...
}

export class JiraClient implements IJiraClient {
  // ...
}
```

## Rules

1. **Consumers depend on the interface** — never the concrete class. All constructor parameters, `OrchestratorDeps` fields, and function arguments use `IJiraClient`, `ITaskRunner`, etc.

2. **Only the factory imports concrete classes** — `orchestrator-factory.ts` is the single file that imports `JiraClient`, `TaskRunner`, and other implementations for instantiation. Everything else imports only the `I`-prefixed interface.

3. **No re-exports** — if a consumer needs the interface, import it directly from the file that defines it. Never re-export interfaces through barrel files or intermediaries.

## Why Interfaces, Not Classes?

TypeScript classes carry **private member identity**. A plain object (like a test mock) can never satisfy a class type that has `private` or `#private` fields — even if it implements every public method with the correct signature.

Interfaces strip this identity. `Mocked<IFoo>` (which maps every method to a `vi.fn()` spy) is structurally assignable to `IFoo` without casts:

```typescript
// ✅ Works — Mocked<ITaskRunner> satisfies ITaskRunner
const runner: Mocked<ITaskRunner> = createMockTaskRunner();

// ❌ Fails — Mocked<TaskRunner> won't satisfy TaskRunner (private fields missing)
const runner: Mocked<TaskRunner> = createMockTaskRunner(); // type error
```

This eliminates `as any` casts in tests and ensures mocks are type-safe.

## OrchestratorDeps

The `OrchestratorDeps` interface (defined in `orchestrator-types.ts`) is the dependency bag injected into the `Orchestrator` constructor. It contains all service interfaces:

```typescript
interface OrchestratorDeps {
  poller: IPoller;
  triggerScanner: ITriggerScanner;
  taskRunner: ITaskRunner;
  ledger: IOperationLedger;
  // ... etc.
}
```

The factory (`orchestrator-factory.ts`) builds the concrete instances and returns the bag. The orchestrator never knows which classes were instantiated.

## Adding a New Service

1. Define the `I`-prefixed interface and the implementation class in the same file.
2. Add the interface to `OrchestratorDeps` (if the orchestrator needs it).
3. Import the concrete class **only** in `orchestrator-factory.ts`.
4. Add a `createMock<Service>()` factory in `tests/helpers/` using `Mocked<IService>`.
