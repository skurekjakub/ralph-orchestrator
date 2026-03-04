# Mocking Strategy — Code Examples

When and how to mock, illustrated with patterns from this project's domain.

## Boundary Mocking: `execa` (process execution)

Process execution is an architectural boundary — mock it.

### Good — mock the boundary, assert on outcomes

```ts
vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn().mockResolvedValue({ exitCode: 0 }) };
});
import { execa } from "execa";
const mockExeca = vi.mocked(execa);

it("creates a task branch for new work items", async () => {
  await hook.execute(container, taskCtx, logger);

  const allArgs = mockExeca.mock.calls.map(c => c[1]).flat();
  expect(allArgs).toContain("-b");
  expect(allArgs).toContain("ralph/DOC-100-some-title");
});
```

`execa` is the boundary to the OS. We mock it because we can't run real git in tests. But we assert on *what commands matter*, not on every argument of every call.

---

## Boundary Mocking: `fetch` (HTTP APIs)

### Good — mock returns data, assert on what your code does with it

```ts
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ issues: [makeJiraIssue("DOC-100")] }),
});

it("returns work items from JIRA response", async () => {
  const items = await client.fetchIssues("DOC");
  
  expect(items).toHaveLength(1);
  expect(items[0].id).toBe("DOC-100");
});
```

### Bad — asserting on the request details

```ts
it("calls the JIRA API with the right parameters", async () => {
  await client.fetchIssues("DOC");

  expect(mockFetch).toHaveBeenCalledWith(
    "https://api.atlassian.com/ex/jira/abc123/rest/api/3/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic dGVzdEB0ZXN0LmNvbTpzZWNyZXQ=",
      },
      body: JSON.stringify({
        jql: 'project = "DOC" AND status IN ("To Do")',
        fields: ["summary", "status", "description", "comment"],
        maxResults: 50,
      }),
    },
  );
});
```

This test is a copy of the implementation. Change the JQL format, switch from POST to GET with query params, add a field — test breaks even if the returned data is correct. Only assert on fetch details when the *request format itself* is the contract you're testing (e.g., you're writing an API client library).

---

## Boundary Mocking: File System

### Good — mock `fs`, verify the file was created

```ts
vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return { ...orig, mkdirSync: vi.fn(), writeFileSync: vi.fn() };
});
const mockWriteFile = vi.mocked(writeFileSync);

it("writes execution summary to the output directory", async () => {
  await writer.saveSummary(result, "/output/logs/DOC-100");

  expect(mockWriteFile).toHaveBeenCalledWith(
    expect.stringContaining("DOC-100"),
    expect.stringContaining('"status":"completed"'),
  );
});
```

File writes are a side effect at a system boundary — asserting that the write happened and the content is reasonable is fine. Don't assert on exact file content formatting or whitespace.

---

## Fakes: When Mocks Get Complicated

If your mock setup is getting elaborate, switch to a fake.

### Bad — mock with complex setup simulating state

```ts
const mockLedger = {
  getOperation: vi.fn(),
  saveOperation: vi.fn(),
  findPending: vi.fn(),
};

// Simulating stateful behavior through mock returns
mockLedger.findPending.mockResolvedValue([makeOperation({ status: "pending" })]);
mockLedger.getOperation.mockImplementation(async (id) => {
  if (id === "op-1") return makeOperation({ status: "active" });
  return null;
});
mockLedger.saveOperation.mockImplementation(async (op) => {
  // Now other mocks need to "see" this save... it gets complicated
});
```

### Good — use an in-memory fake

```ts
class InMemoryLedger implements IOperationLedger {
  private ops = new Map<string, Operation>();

  async save(op: Operation) { this.ops.set(op.id, op); }
  async get(id: string) { return this.ops.get(id) ?? null; }
  async findPending() { return [...this.ops.values()].filter(o => o.status === "pending"); }
}

it("transitions pending operations to active on pickup", async () => {
  const ledger = new InMemoryLedger();
  await ledger.save(makeOperation({ id: "op-1", status: "pending" }));
  const runner = new TaskRunner(ledger, ...);

  await runner.pickNext();

  const op = await ledger.get("op-1");
  expect(op?.status).toBe("active");
});
```

The fake maintains real state and real behavior. No mock wiring, no `mockImplementation` chains. Tests are shorter, clearer, and catch real bugs.

---

## The Design Smell: Too Many Mocks

If your test needs this many mocks, the code probably needs restructuring:

```ts
// 🚩 Design smell — 6 mocks to test one method
const mockJira = createMockJiraClient();
const mockLedger = createMockLedger();
const mockContainer = createMockContainer();
const mockLogger = createMockLogger();
const mockProfileRouter = createMockProfileRouter();
const mockResultWriter = createMockResultWriter();

const runner = new TaskRunner(mockJira, mockLedger, mockContainer, mockLogger, mockProfileRouter, mockResultWriter);
```

This is more likely a sign that `TaskRunner` has too many responsibilities than that you need better mocking tools. Consider whether some of these dependencies can be combined or whether the class should be split.
