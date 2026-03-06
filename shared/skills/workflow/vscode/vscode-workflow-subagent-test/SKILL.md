---
name: vscode-workflow-subagent-test
description: "Test-writing guide for the VS Code extension coder agent. Covers Mocha TDD patterns, sinon sandbox mocking, Node assert assertions, test file placement, and what to test for each change type. Read this skill after implementing code changes and before running final validation."
---

# Writing Tests for kentico-docs-autocomplete-vscode

Write tests for the code you implemented. The analyst's plan includes a **Testing** section that specifies which test files to update and what new tests to add — use it as your starting point.

## Framework & Commands

- **Test framework:** Mocha (TDD style — `suite`/`test`, **not** `describe`/`it`)
- **Assertions:** `import * as assert from 'assert'` (Node built-in strict assertions)
- **Mocking:** `import * as sinon from 'sinon'` (sandbox pattern for isolation)
- **VS Code API:** `import * as vscode from 'vscode'` (stubs via sinon)
- **Run tests:** `npm run test:xvfb` (headless) — **never** `npm test` directly

## File Placement

Tests live in `src/test/` with subdirectories per feature area:

```
src/test/
├── extension.test.ts          # Smoke test
├── codeLink/                  # 17 test files — reference implementation
│   ├── codeLinkService.test.ts
│   ├── validation.test.ts
│   ├── integrationPipeline.test.ts
│   └── ...
├── image/
│   └── imageService.test.ts
├── pageLink/
│   ├── pageLinkService.test.ts
│   └── pageLinkDefinitionProvider.test.ts
└── misc/
    └── tagUtils.test.ts
```

**Rules:**
- Name files `<feature>.test.ts` or `<featureService>.test.ts`
- Place in the existing subdirectory for the feature area (e.g. `codeLink/`, `pageLink/`)
- Create a new subdirectory when adding a test for a feature area that has none yet
- Mocha discovers all `out/test/**/*.test.ts` automatically — no registration needed

## Test Structure Template

Every test file follows this pattern:

```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
// Import the specific functions/classes under test
import { myFunction } from '../../path/to/module';

suite('Feature Name Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should handle the basic case', () => {
        const result = myFunction('input');
        assert.strictEqual(result, 'expected');
    });

    suite('Edge cases', () => {
        test('should handle empty input', () => {
            const result = myFunction('');
            assert.strictEqual(result, undefined);
        });

        test('should handle undefined', () => {
            const result = myFunction(undefined);
            assert.deepStrictEqual(result, []);
        });
    });
});
```

**Key points:**
- `suite()` + `test()` — TDD style, never `describe`/`it`
- `sinon.createSandbox()` in `setup()`, `sandbox.restore()` in `teardown()`
- Use `suiteSetup()` / `suiteTeardown()` only for one-time expensive setup (e.g. tag registration)
- Nest `suite()` blocks for logical grouping

## Assertion Patterns

```typescript
// Exact equality
assert.strictEqual(actual, expected);

// Deep equality (objects, arrays)
assert.deepStrictEqual(result, { key: 'value' });

// Truthy / existence
assert.ok(result !== null);
assert.ok(array.length > 0);

// Negation
assert.strictEqual(result, undefined);
assert.strictEqual(result, false);

// Array contents
assert.strictEqual(results.length, 3);
assert.strictEqual(results[0], 'first');

// Throws
assert.throws(() => riskyFunction(), /expected error message/);
```

**Never use:** `chai`, `expect()`, `should`, or any other assertion library.

## Mocking Patterns

### Stub VS Code workspace

```typescript
sandbox.stub(vscode.workspace, 'workspaceFolders').value([
    { uri: { fsPath: '/test/workspace' }, index: 0, name: 'root' }
]);
```

### Stub module state (e.g. cached data)

```typescript
// If a module exports mutable state (e.g. workspaceFileLoader.pageFileHeaders),
// clear and populate it directly:
const workspaceFileLoader = require('../../logic/filesystem/workspaceFileLoader');
workspaceFileLoader.pageFileHeaders.length = 0;
workspaceFileLoader.pageFileHeaders.push(...mockData);
```

### Stub functions

```typescript
sandbox.stub(myModule, 'fetchData').resolves({ items: [] });
sandbox.stub(fs, 'existsSync').returns(true);
sandbox.stub(fs, 'readFileSync').returns('file content');
```

### Dynamic require with cache clearing

When testing modules with side effects or singleton state, use `require()` in `setup()` and clear the cache in `teardown()`:

```typescript
let moduleUnderTest: typeof import('../../path/to/module');

setup(() => {
    sandbox = sinon.createSandbox();
    moduleUnderTest = require('../../path/to/module');
});

teardown(() => {
    sandbox.restore();
    delete require.cache[require.resolve('../../path/to/module')];
});
```

### Create test documents

```typescript
async function createTestDocument(content: string): Promise<vscode.TextDocument> {
    return await vscode.workspace.openTextDocument({
        content: content,
        language: 'markdown'
    });
}
```

## What to Test by Change Type

| What you changed | Test to write |
|---|---|
| New pure function / utility | Unit test: call with various inputs, assert outputs. Cover normal, empty, undefined, and edge cases |
| New validation rule | Test: valid input passes, each invalid case returns the correct diagnostic message and range |
| New tag definition | Test: snippet provider returns correct `CompletionItem`, attributes are parsed correctly |
| Modified existing function | Update existing tests if behavior changed. Add new test cases for the new behavior |
| New service (e.g. `*Service.ts`) | Test the public methods: normal case, error case, edge cases. Stub external deps (VS Code API, filesystem) |
| New CodeLens provider | Test: returns correct lenses for documents with/without matching content |
| New decoration provider | Test the underlying logic (what ranges to decorate), not the VS Code decoration API itself |
| Bug fix | Add a regression test that reproduces the original bug — it should fail without the fix and pass with it |

## What NOT to Test

- **VS Code API rendering** — don't test that decorations visually appear or that completions show in the UI. Test the logic that _determines_ what to show.
- **Webpack bundling** — that's build validation, not unit testing.
- **Third-party library internals** — don't test that sinon stubs work or that Mocha runs suites.
- **Trivial getters/setters** — if a method just returns a property, it doesn't need a test.

## Test Data

Use inline test data — **no fixture files**. Embed test content as template literals:

```typescript
test('should find section IDs in content', () => {
    const content = `
//Include:section1
some content here
//EndInclude:section1
//Include:section2
other content
//EndInclude:section2
`;
    const ids = findSectionIdsInContent(content);
    assert.deepStrictEqual(ids, ['section1', 'section2']);
});
```

For mock objects, construct them inline:

```typescript
const mockHeaders = [
    {
        identifier: 'test_page_id',
        title: 'Test Page',
        collection: 'XPERIENCE',
        collectionId: '_xperience',
        fsPath: '/workspace/src/_documentation/_xperience/test.md',
        content: '---\nidentifier: test_page_id\n---\n# Content'
    }
];
```

## Reference: codeLink Test Suite

The `src/test/codeLink/` directory is the most comprehensive test suite in the project — **use it as your model**. Study these files when writing tests for similar patterns:

- `validation.test.ts` — pure function testing with combinatorial inputs
- `codeLinkService.test.ts` — service methods with VS Code API stubs
- `integrationPipeline.test.ts` — full pipeline: extract → exclude → strip
- `sectionExtraction.test.ts` — language-aware behavior with multiple languages

## Checklist

Before moving on, verify:

- [ ] Every new public function has at least one test
- [ ] Edge cases are covered (empty input, undefined, missing data)
- [ ] Bug fixes have a regression test
- [ ] Test file is in the correct `src/test/<feature>/` subdirectory
- [ ] File uses `suite`/`test` (TDD), not `describe`/`it` (BDD)
- [ ] Sandbox created in `setup()`, restored in `teardown()`
- [ ] All tests pass: `npm run test:xvfb`
