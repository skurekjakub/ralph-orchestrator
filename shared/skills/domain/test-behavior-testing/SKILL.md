---
name: test-behavior-testing
description: "Guide for writing tests that verify behavior and outputs rather than implementation details. Use this skill whenever writing tests, reviewing test code, fixing test failures after refactoring, or when test code is tightly coupled to implementation. Also use when the user asks about testing strategy, test design, what to assert on, or when tests are 'too brittle' or 'break on every refactor'. Triggers on: writing tests, test design, test strategy, brittle tests, testing best practices, what should I test, how to test this, test review."
---

# Behavior-Focused Testing

## Core Principle

Test **what the code does** (observable outputs and side effects), not **how it does it** (internal mechanics). The guiding question: "Given this input, does the correct output come out?" — not "Did it call method X internally?"

## Why This Matters

Implementation-coupled tests create a vicious cycle: every internal refactor breaks tests, so developers avoid refactoring, so the code rots. Tests become a barrier to improvement rather than a safety net.

Behavior-focused tests give you freedom to refactor internals without rewriting tests. They serve as living documentation of what the system actually does, and they give higher confidence that things work from a caller's perspective.

## The Rules

### 1. Test the public API only

Only test through the public interface of a module, class, or function. Private or internal helpers get tested indirectly through the public surface that uses them. Never write a dedicated test for a private method.

### 2. Assert on outputs, not on call chains

Observable outputs include: return values, state changes visible through the public API, side effects like written files, emitted events, or sent messages.

```ts
// Good — asserts on outcome
expect(result.total).toBe(42);
expect(allArgs).not.toContain("-b");

// Bad — asserts on internal wiring
expect(mockService.calculateSubtotal).toHaveBeenCalledWith(items, taxRate);
```

### 3. Tests must survive refactoring

Litmus test: if you refactor a module's internals without changing its contract, zero tests should break. If they do, those tests were coupled to implementation.

### 4. Name tests after behaviors

Describe *what happens*, not *which method runs*.

```ts
// Good
"switches to existing branch on revision without creating a new one"
"returns empty array when no items match the filter"
"rejects registration with duplicate email"

// Bad  
"test_calculatePrice_method"
"RepoSyncHook.execute calls git checkout"
```

### 5. Keep assertions focused

Each test verifies one behavior. If you need 15 assertions to validate one test, you're probably testing multiple behaviors — split them up. A small number of closely related assertions is fine (e.g., checking a branch name is used AND `-b` flag is absent both verify "switches to existing branch").

## Quick Checklist

Before writing a test, ask:

1. Am I testing a public interface, or reaching into internals?
2. Am I asserting on an output/observable side effect, or on an internal call?
3. If I refactored the implementation tomorrow, would this test survive?
4. Does my test name describe a *behavior* or a *method name*?

## Deeper Skills

For specific guidance on these areas, consult the companion skills:

- **test-mocking-strategy** — When mocking is appropriate, fakes vs mocks, how to mock at boundaries without coupling to internals.
- **test-structure-patterns** — How to structure test files, the Given/When/Then pattern, organizing tests by behavior, what counts as "observable output".
