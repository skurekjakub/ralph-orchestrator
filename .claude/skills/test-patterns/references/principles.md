# Test design principles

## Test behaviour, not wiring

Test through the public API and assert on what a caller can observe. If you refactor the internals without changing the contract, zero tests should break. When they do break, they were testing wiring.

| Observable (assert on it)                                                              | Internal (don't)                         |
| -------------------------------------------------------------------------------------- | ---------------------------------------- |
| Return value / resolved `RalphResult`                                                  | Which private helper ran                 |
| State visible through the public API (ledger status, collected log paths)              | Order of internal steps                  |
| Side effects at a boundary: file written, `execa` argv, connector call, comment posted | Arguments passed between our own classes |
| Error thrown or warning logged for bad input                                           | Which validator caught it                |

Asserting the arguments sent across an **architectural boundary** is legitimate, because that is the contract with the outside world. Examples: the `docker compose` argv given to `execa`, the issue key and status given to a connector, the text of a posted comment. Asserting that class A called class B's method with exact arguments is not.

Edge cases go through the same public entry point with different inputs. Don't write a dedicated test for an internal sanitiser or parser that is already exercised by its caller.

## Mock at boundaries; prefer fakes for stateful deps

Mock: `execa`/process spawning, `node:fs`, HTTP/`fetch`, data-source connectors, clocks and sleeps, Docker. Don't mock: pure helpers, value transformations, or one of our classes that is cheap to construct for real.

A fake (a small in-memory implementation of `IFoo`) beats a mock with elaborate `mockImplementation` once state matters, because it catches ordering bugs that pre-programmed return values hide. Tests that need a real filesystem should use temp dirs (`tests/helpers/mcp-fs.ts`, `mkdtempSync`) instead of mocking every `fs` call.

Over-mocking smells: more than 3–4 mocks in one setup, mocks returning mocks, call-order assertions between mocks, `mockImplementation` that re-implements business logic, a test longer than the code it tests. Treat these as a design signal: extract the logic into a unit with plain inputs and outputs instead of adding more mocks.

## Shape of a test

Given / When / Then, separated by blank lines, no labels needed. Keep the Given short. If the setup runs past ~10 lines, add a factory override or a helper. Each `it` verifies one behaviour, and a few tightly related assertions are fine.

```ts
// tests/services/issue-manager.test.ts
it("posts failure comment when connector throws", async () => {
  connector.transitionWorkItem.mockRejectedValue(new Error('No transition to "Done" available for DF-100'));

  await manager.transitionWorkItem(DS, KEY, "Done", TransitionPhase.AfterAgent);

  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to transition"));
  expect(connector.addComment).toHaveBeenCalledWith(KEY, expect.stringContaining("Done"));
});
```

## Narrow vs. broad

Most tests should be narrow black-box tests of one unit through its public API. Use broader tests where wiring is the risk, for example `tests/container/template-integration.test.ts`, which renders real templates and skills, and `tests/container/template-context-lint.test.ts`. A slightly slower test that survives refactoring is worth more than a fast one that breaks on every move.
