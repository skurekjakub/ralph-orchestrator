
## Save memory often to remember implementation details about the repository

## Coding Conventions

### No backward-compatibility wrappers

When refactoring, always update the original callsites directly. Never introduce thin wrapper methods, adapter layers, or re-exports to maintain backward compatibility. If a method moves to a new class, update every caller to use the new class directly.

### Use enums for fixed string sets

Never use bare string literal unions (`type Foo = "a" | "b"`) for values that represent a fixed, known set of options. Use TypeScript `enum` instead:

```typescript
// ✅ Correct
export enum AuditMode {
  Block = "block",
  Warn = "warn",
  Off = "off",
}

// ❌ Wrong — string literals scattered across the codebase
export type AuditMode = "block" | "warn" | "off";
```

### Keep classes focused on a single responsibility

Before adding functionality to an existing class or module, consider whether it belongs there. Each class should have one clear purpose. If new logic serves a different concern -a dedicated module for it rather than growing an existing one. When reviewing changes, assess the impact on the module's cohesion — if a class is accumulating unrelated methods, split it.

### Never handle git lifecycle

Do not stage, commit, push, or perform any git operations on behalf of the user. The user manages their own git workflow. Only run git commands when explicitly asked (e.g. `git diff`, `git status` for review purposes).

### Always include logging in modules that perform I/O or orchestration

Any module that performs file I/O, subprocess execution, network calls, or orchestrates multiple steps must accept a `Logger` parameter and log its progress. Pure functions that transform data don't need their own logging — the caller logs before and after invoking them.
