# Behavior Testing — Code Examples

Examples using this project's domain. Each pair shows the same scenario tested two ways.

## Example 1: Testing a branch name generator

The function takes an issue key and title, returns a slugified branch name.

### Bad — testing internal mechanics

```ts
it("calls sanitize, then truncate, then join", () => {
  const sanitizeSpy = vi.spyOn(internals, "sanitize");
  const truncateSpy = vi.spyOn(internals, "truncate");

  slugifyBranchName("DOC-100", "Add publish permissions page");

  expect(sanitizeSpy).toHaveBeenCalledWith("Add publish permissions page");
  expect(truncateSpy).toHaveBeenCalledWith("add-publish-permissions-page", 60);
  expect(sanitizeSpy).toHaveBeenCalledBefore(truncateSpy);
});
```

This test breaks if you inline the sanitize step, reorder operations, or change the truncation threshold — even if the output is identical.

### Good — testing the output

```ts
it("produces a lowercase kebab-case branch from issue key and title", () => {
  const result = slugifyBranchName("DOC-100", "Add Publish Permissions Page");
  expect(result).toBe("ralph/DOC-100-add-publish-permissions-page");
});

it("truncates long titles to keep branch names manageable", () => {
  const longTitle = "A".repeat(200);
  const result = slugifyBranchName("DOC-100", longTitle);
  expect(result.length).toBeLessThan(100);
  expect(result).toMatch(/^ralph\/DOC-100-/);
});

it("strips special characters from the title", () => {
  const result = slugifyBranchName("DOC-100", "What's new in v14.0 (preview)? — Release notes!");
  expect(result).toBe("ralph/DOC-100-whats-new-in-v14-0-preview-release-notes");
});
```

These tests survive any internal refactoring — swap regex for a char-by-char loop, change helper functions, doesn't matter. The contract is: key + title → clean branch name.

---

## Example 2: Testing a trigger scanner

The scanner finds trigger comments (like `@Ralph`) in work item comments.

### Bad — asserting on the scanning process

```ts
it("scans each comment with regex and filters matches", async () => {
  const regexSpy = vi.spyOn(RegExp.prototype, "exec");
  const workItem = makeWorkItem("DOC-100", {
    comments: [
      makeComment("Please fix the links"),
      makeComment("@Ralph please update this page"),
    ],
  });

  await scanner.findTriggers(workItem);

  expect(regexSpy).toHaveBeenCalledTimes(2);
  expect(regexSpy).toHaveBeenCalledWith("Please fix the links");
  expect(regexSpy).toHaveBeenCalledWith("@Ralph please update this page");
});
```

### Good — asserting on what triggers were found

```ts
it("finds trigger comments matching the configured trigger string", async () => {
  const workItem = makeWorkItem("DOC-100", {
    comments: [
      makeComment("Please fix the links"),
      makeComment("@Ralph please update this page"),
      makeComment("Thanks for the update"),
    ],
  });

  const triggers = await scanner.findTriggers(workItem, "@Ralph");

  expect(triggers).toHaveLength(1);
  expect(triggers[0].text).toContain("@Ralph");
});

it("extracts parenthesized parameters from trigger comments", async () => {
  const workItem = makeWorkItem("DOC-100", {
    comments: [makeComment("@Ralph(codesamples, verbose)")],
  });

  const triggers = await scanner.findTriggers(workItem, "@Ralph");

  expect(triggers[0].params).toEqual({ codesamples: "true", verbose: "true" });
});

it("returns empty array when no comments match", async () => {
  const workItem = makeWorkItem("DOC-100", {
    comments: [makeComment("Just a regular comment")],
  });

  const triggers = await scanner.findTriggers(workItem, "@Ralph");

  expect(triggers).toEqual([]);
});
```

---

## Example 3: Testing a repo sync hook

The hook syncs a git repo before agent execution. It shells out to `git` via `execa`.

### Bad — verifying exact git command sequences

```ts
it("runs the correct git commands in order", async () => {
  await hook.execute(container, taskCtx, logger);

  const calls = mockExeca.mock.calls.map(c => c[1]);
  expect(calls[0]).toEqual(["-C", "/repo", "-c", "http.extraHeader=Authorization: Basic dGVzdA==", "fetch", "origin", "main"]);
  expect(calls[1]).toEqual(["-C", "/repo", "checkout", "main"]);
  expect(calls[2]).toEqual(["-C", "/repo", "reset", "--hard", "origin/main"]);
  expect(calls[3]).toEqual(["-C", "/repo", "checkout", "-b", "ralph/DOC-100-some-title"]);
});
```

This test breaks if you add a `git clean` step, change the order of auth setup, or restructure the arguments. It's essentially a line-by-line copy of the implementation encoded as assertions.

### Good — verifying the meaningful outcomes

```ts
it("creates a task branch from the default branch", async () => {
  await hook.execute(container, taskCtx, logger);

  const allArgs = mockExeca.mock.calls.map(c => c[1]).flat();
  expect(allArgs).toContain("ralph/DOC-100-some-title");
  expect(allArgs).toContain("-b"); // new branch, not existing
});

it("switches to existing branch on revision without creating a new one", async () => {
  const revisionCtx = makeTaskContext({ isRevision: true });

  await hook.execute(container, revisionCtx, logger);

  const allArgs = mockExeca.mock.calls.map(c => c[1]).flat();
  expect(allArgs).toContain("ralph/DOC-100-some-title");
  expect(allArgs).not.toContain("-b");
});

it("uses authenticated fetch", async () => {
  await hook.execute(container, taskCtx, logger);

  const allArgs = mockExeca.mock.calls.map(c => c[1]).flat();
  expect(allArgs).toContain(expect.stringContaining("Authorization:"));
});

it("throws when git credentials are missing", async () => {
  delete process.env.ADO_PAT;
  await expect(hook.execute(container, taskCtx, logger)).rejects.toThrow(/must be set/);
});
```

The first version is a mirror of the implementation. Change anything internally and it breaks. The second version tests four distinct behaviors that matter to callers — and survives refactoring.
