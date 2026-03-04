---
name: test-mocking-strategy
description: "Guide for when and how to mock dependencies in tests — choosing between mocks, fakes, and real collaborators, and keeping tests decoupled from implementation. Use this skill when deciding what to mock, when tests have too many mocks, when mocking makes tests fragile or hard to read, when setting up test doubles for external services, or when you need to mock at architectural boundaries. Also use when the user mentions 'mock hell', excessive stubbing, or when every refactor breaks mock expectations."
---

# Test Mocking Strategy

## The Problem With Over-Mocking

Mocks that verify internal call sequences create tight coupling to implementation. When you assert that `mockDep.someMethod.was_called_with(args)`, you're not testing behavior — you're testing wiring. Change the wiring (even if the outcome is identical) and the test breaks.

Heavy mocking also makes tests hard to read. A test with 8 mock setups and 5 call-order assertions tells you nothing about what the system *does* — only how it's currently *wired*.

## When Mocking Is Appropriate

Mock at **architectural boundaries** — where your code meets the outside world:

| Mock this (boundary)              | Don't mock this (internal)         |
|-----------------------------------|------------------------------------|
| External HTTP APIs                | Internal service collaborators     |
| Database calls                    | Private helper methods             |
| File system operations            | Internal data transformations      |
| Message queues / event buses      | Utility functions within your code |
| Clocks / time                     | One class calling another class    |
| Process execution (execa, spawn)  | Factory or builder internals       |

The distinction: you're mocking the *boundary*, not the internal collaborators within your own codebase.

## Fakes Over Mocks

When a dependency is complex, prefer a **fake** (a lightweight in-memory implementation) over a mock with elaborate setup. Fakes behave like the real thing — they maintain state, validate inputs, return realistic responses — without hitting real infrastructure.

```ts
// Fake — maintains behavior, not just call recording
class InMemoryUserStore implements IUserStore {
  private users = new Map<string, User>();
  
  async save(user: User) { this.users.set(user.id, user); }
  async findById(id: string) { return this.users.get(id) ?? null; }
}

// vs. Mock — records calls but doesn't actually behave like a store
const mockStore = { save: vi.fn(), findById: vi.fn() };
```

Fakes are reusable across many tests without per-test setup. They also catch bugs that mocks miss — if your code calls `findById` before `save`, a fake returns `null` (catching the bug), while a mock returns whatever you pre-programmed.

## When You Must Mock: Keep It Minimal

If you need mocks (e.g., verifying that a side effect happened), keep them focused:

**Mock the boundary, assert the output.** Set up the mock to return data, then assert on what your code *did* with that data — not that it called the mock in a specific way.

```ts
// Good — mock provides data, assertion checks the output
mockFetch.mockResolvedValue({ status: 200, json: () => ({ name: "test" }) });
const result = await service.getUser("123");
expect(result.name).toBe("test");

// Bad — assertion is on mock call details
mockFetch.mockResolvedValue({ status: 200, json: () => ({ name: "test" }) });
await service.getUser("123");
expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/users/123", {
  headers: { Authorization: "Bearer token" },
});
```

The second test breaks if you change the URL format, add a query param, or switch auth strategies — even if the result is identical.

**Exception:** Sometimes asserting on mock calls is the *only* way to verify a side effect (e.g., "did we send the email?"). That's fine — just assert on the *what* (email was sent to this address with this subject) not the *how* (the SMTP client's `.send()` was called with these exact internal args).

## The Design Smell Test

If a class is so deeply nested that you can't test it without extensive mocking, that's a design smell. The code probably needs restructuring — extract the logic into a testable unit with clear inputs/outputs, rather than adding more mocks to test it in place.

Signs you're over-mocking:
- More than 3-4 mocks in a single test setup
- Mock return values that set up other mocks
- Assertions on call order between mocks
- `mockImplementation` that reimplements business logic
- Tests that are longer than the code they test
