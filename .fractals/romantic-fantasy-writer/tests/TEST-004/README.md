# TEST-004: Auditor rejection drafting chapter retry

**Priority**: P1  
**Category**: auditor-rejection

## Description

Drafting-auditor rejects twice (craft violations), passes on 3rd attempt.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-004
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-004/context.json .romantic-fantasy-writer/stories/test-book-004/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
