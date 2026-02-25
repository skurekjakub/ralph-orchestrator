# Dependency Injection — Ralph Orchestrator

## Pattern

Every service class registered in the awilix cradle has a corresponding `I`-prefixed interface defined **in the same file** as the implementation:

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

1. **Consumers depend on the interface** — never the concrete class. All constructor parameters, `OrchestratorCradle` entries, and function arguments use `IJiraClient`, `ITaskRunner`, etc.

2. **Only the cradle factory imports concrete classes** — `awilix-cradle.ts` is the single file that imports `JiraClient`, `TaskRunner`, and other implementations for registration with awilix. Everything else imports only the `I`-prefixed interface.

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

## OrchestratorCradle

The `OrchestratorCradle` interface (defined in `src/container/cradle.ts`) is the type of the awilix container cradle. It contains all service interfaces and config slices:

```typescript
interface OrchestratorCradle {
  // Config slices
  jiraConfig: IJiraConfig;
  outputConfig: IOutputConfig;
  profiles: readonly IAgentProfile[];
  secrets: ISecretsConfig;
  // ... etc.

  // Services
  poller: IJiraPoller;
  triggerScanner: ITriggerScanner;
  taskRunner: ITaskRunner;
  resultWriter: ITaskResultWriter;
  ledger: IOperationLedger;
  // ... etc.
}
```

The cradle factory (`awilix-cradle.ts`) registers all concrete classes with awilix using `InjectionMode.PROXY` and `strict: true`. Configuration is injected as individual **config slices** rather than a monolithic config object. The orchestrator and all services destructure their dependencies from the cradle — they never know which classes were instantiated.

## Adding a New Service

1. Define the `I`-prefixed interface and the implementation class in the same file.
2. Add the interface to `OrchestratorCradle` (if other services need it).
3. Import the concrete class **only** in `awilix-cradle.ts` and register it with `asClass(...).singleton()`.
4. Add a `createMock<Service>()` factory in `tests/helpers/` using `Mocked<IService>`.
