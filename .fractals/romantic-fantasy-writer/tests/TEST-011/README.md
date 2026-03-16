# TEST-011: Cross-cutting continuity-tracker verification

**Priority**: P1  
**Category**: cross-cutting-agents

## Description

Continuity-tracker reads 3 chapters, finds 1 minor inconsistency, logs it without blocking.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-011
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-011/context.json .romantic-fantasy-writer/stories/test-book-011/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
