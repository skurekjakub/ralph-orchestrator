# Dependency Injection in Ralph Orchestrator

## This project uses DI — without a container

Dependency injection is a **principle**, not a framework. Every service receives its dependencies through constructor parameters instead of creating them internally:

```ts
class TaskRunner {
  constructor(
    private readonly logCollector: LogCollector,
    private readonly logger: Logger,
    private readonly containerFactory: ContainerManagerFactory,
    private readonly resources: IResourceManager,
    private readonly issueManager: IIssueManager,
  ) {}
}
```

The **composition root** is `createOrchestratorDeps()` in `orchestrator-factory.ts` — one function that builds every service and wires them together. This is manual constructor injection.

## Why not a DI container?

DI containers (Inversify, tsyringe, awilix) automate service resolution. They trade **visible, type-safe wiring** for **declarative registration + runtime resolution**. That tradeoff pays off under specific conditions — none of which apply here.

### What a container gives you

- **Automatic resolution** — register `A → B → C`, container figures out the instantiation order.
- **Scoped lifetimes** — per-request instances in web servers (new `DbContext` per HTTP request).
- **Plugin discovery** — services registered at runtime, not compile time.

### What a container costs you

| Concern | Manual (current) | Container |
|---|---|---|
| **Visibility** | One file shows all wiring | Scattered across decorators, tokens, registrations |
| **Type safety** | TypeScript checks constructor args at compile time | Misconfiguration is a runtime error ("No provider for token X") |
| **Debugging** | "Where does this come from?" → find the line in factory | Find token → find registration → check scope → check conditional bindings |
| **Ceremony** | 3 lines per service | `@injectable()`, `@inject(TOKEN)` on every param, token file, registration file |

### When each approach fits

| Situation | Recommendation |
|---|---|
| Single entry point, <30 services | Manual constructor injection |
| Multiple composition roots (CLI + API + worker) | Consider a container if shared service graphs diverge |
| Per-request scoping (web server) | Container or manual factory-per-request |
| Plugin architecture (runtime discovery) | Container |
| 50+ services with deep trees | Container reduces boilerplate |

**This project:** one entry point (`createOrchestratorDeps`), ~12 services, no scoping, no plugins. The factory is ~50 lines and grows linearly. A container would express the same wiring with more indirection.

## The factory "bloating" concern

The factory grows by ~3 lines per new service. Compare:

```ts
// Manual: 3 lines, visible, type-checked
const issueManager = new JiraIssueManager(jiraClient, logger);
const taskRunner = new TaskRunner(logCollector, logger, containerFactory, resources, issueManager);
const triggerScanner = new TriggerScanner(issueManager, router, ledger, logger, cachePath);
```

```ts
// Container: same information, more ceremony
container.register(TOKENS.IIssueManager, { useClass: JiraIssueManager });
container.register(TOKENS.TaskRunner, { useClass: TaskRunner });
container.register(TOKENS.TriggerScanner, { useClass: TriggerScanner });
// + @injectable() on each class
// + @inject(TOKENS.X) on each constructor param
// + token definition file
```

Linear growth in a single file is manageable. If the factory hits 100+ lines, consider grouping service creation into helper functions (e.g. `createJiraServices(config)`, `createContainerServices(config)`), not adding a container.

## Interfaces vs structural typing

TypeScript uses **structural typing** — any object with the right shape satisfies a type. In theory, you don't need an `interface IFoo` to substitute a mock for `Foo`. In practice, **class types carry private member identity** that breaks this.

### The private member problem

When a class has `private` fields, TypeScript treats them as part of the type's identity:

```ts
class JiraIssueManager {
  constructor(
    private readonly jiraClient: IJiraClient,  // private!
    private readonly logger: Logger,           // private!
  ) {}
  async getComments(key: string): Promise<JiraComment[]> { /* ... */ }
}
```

A mock object with only `getComments` is **not assignable** to `JiraIssueManager` — TypeScript requires the private `jiraClient` and `logger` fields to match. This is by design: private members prevent accidental structural matches between unrelated classes.

```ts
// ❌ TS error: Mocked<JiraIssueManager> is missing jiraClient, logger
const scanner = new TriggerScanner(mockIssueManager);

// ❌ Workaround: as unknown as JiraIssueManager — loses all type safety
const scanner = new TriggerScanner(mockIssueManager as unknown as JiraIssueManager);
```

### The solution: interfaces for dependencies

Extract an interface with only the public contract. The class implements it, and consumers depend on the interface:

```ts
// Public contract — no private members
export interface IIssueManager {
  getComments(key: string): Promise<JiraComment[]>;
  postAckComment(key: string, displayName: string): Promise<void>;
  // ... other public methods
}

// Implementation
export class JiraIssueManager implements IIssueManager { /* ... */ }

// Consumer depends on the interface
class TriggerScanner {
  constructor(private issueManager: IIssueManager) {}
}
```

Now `Mocked<IIssueManager>` is structurally compatible with `IIssueManager` because the interface has no private members. Mocks work without `as any` or `as unknown` casts.

### This project's approach

Every service class injected via `OrchestratorDeps` has a corresponding `I`-prefixed interface defined in the same file (e.g., `IJiraClient` alongside `JiraClient` in `src/jira/client.ts`). The class `implements` the interface, and all consumers depend on the interface.

`IContainerManager` also defines `IContainerLogs` and `IContainerCleaner` sub-interfaces for its `logs` and `cleaner` properties.

The **factory** (`orchestrator-factory.ts`) still imports and instantiates the concrete classes — it's the only place that knows about implementations.

### When you don't need an interface

- **Value types / config** — `AppConfig`, `ProfileMatch`, etc. are plain data, no private members.
- **Factory types** — `ContainerManagerFactory` is already an interface (function signature), not a class.

### Typed mocks using interfaces

Derive mock types from the interface, not the class:

```ts
type Mocked<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]:
    T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : never;
};

function createMockIssueManager(): Mocked<IIssueManager> {
  return {
    getComments: vi.fn().mockResolvedValue([]),
    transitionIssue: vi.fn().mockResolvedValue(undefined),
    // ...
  };
}
```

This catches mock drift at compile time: if `IIssueManager` adds a method, the mock factory fails to compile.

## Coming from web frameworks

If your background is ASP.NET / Spring / NestJS, you're used to `IServiceCollection` / `@Module` registrations and container-managed lifetimes. Those patterns exist because web frameworks need per-request scoping and control object creation through lifecycle hooks.

In a **long-running process** (daemon, CLI tool, orchestrator), there's no request scope. Services are created once at startup and live until shutdown. The composition root is a single function call, not a framework lifecycle hook. Manual wiring is simpler, faster, and just as testable.

This project extracts interfaces for all injected service dependencies — not because TypeScript lacks structural typing, but because classes with `private` fields need explicit interfaces to enable clean mock substitution without `as any` casts. The result: explicit public contracts, compile-time mock drift detection, and no type gymnastics in tests.
