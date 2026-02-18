# Agent Instructions — Ralph Orchestrator

## MANDATORY: Always gather follow-up context

**After completing ANY task or set of tasks, you MUST use the `ask_questions` tool to prompt the user for additional tasks, context, or instructions.** This is non-negotiable and applies to every interaction.

### Rules

1. **Never end your turn without calling `ask_questions`.** Even if you believe the work is complete, ask what's next.
2. **Ask after every logical completion point** — after finishing a feature, fixing a bug, running tests, writing docs, or any other unit of work.
3. **Include actionable options** — suggest 3-4 concrete next steps the user might want, with freeform input enabled for custom instructions.
4. **Keep options relevant** — base suggestions on what was just completed, what's pending, and what would logically follow.
5. **Allow freeform input** — always set `allowFreeformInput: true` so the user can provide custom direction.

### Example pattern

```
// After completing work:
ask_questions([{
  header: "Next tasks",
  question: "What should we focus on next?",
  multiSelect: true,
  allowFreeformInput: true,
  options: [
    { label: "Related follow-up 1", description: "..." },
    { label: "Related follow-up 2", description: "..." },
    { label: "Run tests / validate", description: "..." },
  ]
}])
```

### Why this matters

The orchestrator project evolves through iterative refinement. The user works in a continuous flow where each task leads to the next. Ending without asking for follow-up breaks this flow and wastes time.

**DO NOT** skip this step. **DO NOT** end with "Let me know if you need anything else." **DO** use `ask_questions` every single time.

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

### Be vigilant about unused imports
