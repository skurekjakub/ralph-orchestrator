# TEST-003: Auditor rejection concept phase retry

**Priority**: P0  
**Category**: auditor-rejection

## Description

Concept-auditor rejects first attempt (genre balance too fantasy-heavy), accepts on retry after concept-developer adjusts.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-003
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-003/context.json .romantic-fantasy-writer/stories/test-book-003/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
