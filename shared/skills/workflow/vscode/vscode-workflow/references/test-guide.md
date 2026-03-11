# Testing Reference

You have three mounted testing skills that cover everything you need. Read all three before writing or reviewing tests:

| Skill | What it covers |
|-------|---------------|
| **test-behavior-testing** | What to test, what not to test, testing behavior over implementation, change-type → test-type mapping |
| **test-mocking-strategy** | When and how to mock, choosing between mocks/fakes/real collaborators, avoiding mock hell |
| **test-structure-patterns** | Test file organization, naming, Given/When/Then, grouping by behavior |

## Project-specific details

These details are specific to `kentico-docs-autocomplete-vscode` and supplement the general skills above:

- **Run tests:** `npm run test:xvfb` (headless) — **never** `npm test` directly
- **Test location:** `src/test/<feature>/` subdirectories
- **File naming:** `<feature>.test.ts` or `<featureService>.test.ts`
- **Reference suite:** `src/test/codeLink/` — the most comprehensive test suite in the project, use as a model
- **Test data:** inline only — no fixture files
