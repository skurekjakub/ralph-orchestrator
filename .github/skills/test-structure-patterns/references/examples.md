# Test Structure Patterns — Code Examples

How to organize tests, name them, and apply Given/When/Then.

## Organizing by Behavior

### Bad — mirrors code structure

```ts
describe("OperationLedger", () => {
  describe("save", () => {
    it("writes to disk", ...);
    it("creates directory if missing", ...);
  });
  describe("get", () => {
    it("reads from disk", ...);
    it("returns null for missing", ...);
  });
  describe("findPending", () => {
    it("filters by status", ...);
  });
  describe("markError", () => {
    it("updates status field", ...);
  });
});
```

This is a 1:1 map of the class methods. The test names describe *what the method does internally* rather than *what behavior the caller gets*.

### Good — organized by use case

```ts
describe("OperationLedger", () => {
  it("persists operations and retrieves them by ID", ...);
  it("returns null for unknown operation IDs", ...);
  it("finds all pending operations across issues", ...);
  it("transitions operation to error state", ...);
  it("recovers active operations from crashed sessions on startup", ...);
  it("deduplicates triggers so each comment is consumed once", ...);
});
```

Each test describes a capability — something a user of the ledger cares about. The internal structure (disk writes, directory creation) is an implementation detail.

---

## Given / When / Then Flow

### Clean separation with whitespace

```ts
it("deduplicates triggers so each comment is consumed once", async () => {
  const ledger = new OperationLedger(tempDir);
  await ledger.save(makeOperation({
    issueKey: "DOC-100",
    commentId: "comment-42",
    status: "completed",
  }));

  const isDuplicate = await ledger.isConsumed("DOC-100", "comment-42");

  expect(isDuplicate).toBe(true);
});
```

Three visual blocks: setup, action, assertion. No comments needed — the whitespace does the work.

### When setup is shared, use `beforeEach` for the "Given"

```ts
describe("when credentials are configured", () => {
  beforeEach(() => {
    vi.stubEnv("ADO_PAT", "test-pat");
  });

  it("syncs repo and creates task branch", async () => {
    await hook.execute(container, taskCtx, logger);

    const allArgs = mockExeca.mock.calls.map(c => c[1]).flat();
    expect(allArgs).toContain("-b");
  });

  it("uses authenticated fetch for git operations", async () => {
    await hook.execute(container, taskCtx, logger);

    const allArgs = mockExeca.mock.calls.map(c => c[1]).flat();
    expect(allArgs).toContain(expect.stringContaining("Authorization:"));
  });
});

describe("when credentials are missing", () => {
  it("throws a descriptive error", async () => {
    await expect(hook.execute(container, taskCtx, logger))
      .rejects.toThrow(/must be set/);
  });
});
```

The nested `describe` blocks group tests by precondition — a natural "Given" that applies to all tests inside.

---

## Test Naming

### Pattern: behavior in plain language

```ts
// Scenario-based names that read as sentences
"finds trigger comments matching the configured trigger string"
"extracts key-value parameters from trigger parentheses"
"returns empty array when no comments match"
"rejects operations for issues in an invalid state"
"recovers active operations from crashed sessions on startup"
"switches to existing branch on revision without creating a new one"

// Avoid: method names and implementation details in test names
"execute calls git fetch then checkout"
"findTriggers uses regex matching"
"save writes JSON to disk"
"constructor sets default values"
```

Someone reading just the test names should understand what the system does — without looking at any code.

---

## Factories for Clean Setup

Factories keep the "Given" phase focused on what matters for this specific test.

### Bad — verbose inline setup

```ts
it("transitions issue to In Progress on pickup", async () => {
  const workItem = {
    id: "DOC-100",
    title: "Update page permissions docs",
    description: "We need to update ...",
    status: "To Do",
    type: "Task",
    priority: "Medium",
    labels: [],
    components: [],
    project: "DOC",
    created: "2026-01-01",
    updated: "2026-01-15",
    comments: [],
    attachments: [],
    url: "https://jira.example.com/DOC-100",
  };
  // ... 15 more lines of setup
});
```

### Good — factory with relevant overrides only

```ts
it("transitions issue to In Progress on pickup", async () => {
  const workItem = makeWorkItem("DOC-100", { status: "To Do" });
  const ctx = makeTaskContext({ workItem });

  await runner.execute(ctx);

  expect(issueManager.transitionIssue).toHaveBeenCalledWith("DOC-100", "In Progress");
});
```

The factory provides sensible defaults. The test override highlights *only* the field that matters for this specific behavior — status is "To Do" because we're testing the transition from that state.

---

## Edge Cases Through the Public Interface

### Bad — testing internal validation directly

```ts
import { validateBranchName } from "../src/util/branch-internals.js";

it("rejects branch names with spaces", () => {
  expect(validateBranchName("my branch")).toBe(false);
});

it("rejects branch names over 100 chars", () => {
  expect(validateBranchName("a".repeat(101))).toBe(false);
});
```

### Good — edge cases through the public API

```ts
it("handles titles with spaces and special characters", () => {
  const result = slugifyBranchName("DOC-100", "What's new in v14.0?");
  expect(result).toMatch(/^ralph\/DOC-100-[a-z0-9-]+$/);
});

it("handles empty title gracefully", () => {
  const result = slugifyBranchName("DOC-100", "");
  expect(result).toBe("ralph/DOC-100");
});

it("handles extremely long titles without producing invalid branch names", () => {
  const result = slugifyBranchName("DOC-100", "A".repeat(500));
  expect(result.length).toBeLessThan(120);
  expect(result).toMatch(/^ralph\/DOC-100-/);
});
```

The public function (`slugifyBranchName`) handles validation internally. We test the edge cases through it — verifying the *output* is valid rather than testing the validation helper in isolation.
