---
name: test-structure-patterns
description: "Guide for structuring test files, naming tests, using Given/When/Then, organizing tests by behavior instead of by code structure, and understanding what counts as 'observable output'. Use this skill when organizing a test file, deciding how to group tests, naming test cases, structuring setup/act/assert blocks, or when tests mirror code structure too closely. Also triggers on: test file organization, describe blocks, test naming, arranging test suites, Given-When-Then."
---

# Test Structure Patterns

## Organize by Behavior, Not by Code

Avoid the trap of mirroring your source code structure in tests — one describe block per class, one test per method. This couples tests to implementation structure and leads to meaningless test names.

Instead, organize tests around **behaviors and use cases** — what does the system do from a caller's perspective?

```ts
// Good — organized by behavior
describe("RepoSyncHook", () => {
  it("syncs repo to default branch and creates task branch", ...);
  it("switches to existing branch on revision", ...);
  it("uses custom source branch from trigger params", ...);
  it("throws when credentials are missing", ...);
});

// Bad — organized by method internals
describe("RepoSyncHook", () => {
  describe("execute", () => {
    it("calls git fetch", ...);
    it("calls git checkout", ...);
    it("calls git reset --hard", ...);
    it("calls mkdirSync", ...);
  });
});
```

The first version tells you what the hook *does*. The second tells you what it *calls* — which is useless as documentation and fragile under refactoring.

## Given / When / Then

Structure each test in three clear phases. You don't need comments labeling them — the structure should be visually obvious through whitespace:

```ts
it("rejects registration with duplicate email", async () => {
  // Given — set up preconditions
  const existingUser = makeUser({ email: "taken@example.com" });
  await store.save(existingUser);

  // When — execute the action
  const result = await service.register({ email: "taken@example.com", name: "New" });

  // Then — verify outcome
  expect(result.success).toBe(false);
  expect(result.error).toBe("email_taken");
});
```

Keep each phase short. If the "Given" section is 20 lines of mock setup, that's a signal to use factories or fakes (see **test-mocking-strategy** skill).

## What Counts as Observable Output

This is the key distinction for deciding what to assert on:

| Observable (assert on this)                    | Internal (don't assert on this)                |
|------------------------------------------------|------------------------------------------------|
| Return value of a public method                | Which private methods were called              |
| State change visible via public getters/API    | Order of internal operations                   |
| Side effect: record written to DB/file         | Which specific query or write path was used    |
| Side effect: message published to a queue      | How the payload was assembled internally       |
| Error/exception thrown for invalid input       | Which validation helper caught it              |
| HTTP response status + body                    | Which internal service handled the request     |
| Arguments passed to an architectural boundary  | Arguments passed between internal collaborators|

The last row is subtle: asserting that your code called the *external* API with the right URL is reasonable (that's the contract with the outside world). Asserting that class A called class B's internal method with specific args is not.

## Test Naming

Test names should read as sentences describing behavior. Someone scanning the test output should understand what the system does without reading any code.

**Pattern:** `<action or condition> → <expected outcome>`

```
"returns total price with discount applied"
"switches to existing branch on revision without creating a new one"
"throws when credentials are missing"
"ignores comments that don't match the trigger pattern"
```

Avoid method names, class names, or technical jargon in test names — describe the *behavior* in plain language.

## The Testing Spectrum

Rather than rigidly thinking "unit vs integration vs e2e," think of tests on a spectrum:

- **Narrow / fast** — Test a single module's behavior through its public API, using fakes or mocks for external deps. These form the bulk of your suite.
- **Medium / integration** — Test multiple modules working together, possibly hitting a real database or service. Good for verifying wiring and contracts between components.
- **Broad / e2e** — Test the full system from the outside. Use sparingly — they're slow but give high confidence.

Favor **narrow black-box tests** over narrow white-box tests. A slightly slower test that survives refactoring is more valuable than a fast test that breaks every time you move code around.

## Edge Cases Through the Same Interface

Cover edge cases by calling the same public API with different inputs — not by testing internal validation helpers directly:

```ts
// Good — edge cases through the public interface
it("returns empty array when no items match", async () => {
  const result = await service.search("nonexistent-query");
  expect(result).toEqual([]);
});

it("handles special characters in search query", async () => {
  const result = await service.search("test & <script>");
  expect(result).toBeDefined(); // doesn't throw
});

// Bad — testing the internal validator directly
it("sanitizeInput removes angle brackets", () => {
  expect(sanitizeInput("<script>")).toBe("script");
});
```

The public interface tests survive if you swap out the sanitization approach. The internal test breaks.
