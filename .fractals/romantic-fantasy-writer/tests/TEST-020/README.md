# TEST-020: Revision-beta loop one cycle

**Priority**: P0  
**Category**: revision-beta-loop

## Description

Beta returns revision-required on first pass. Orchestrator loops back to revision. Beta approves on second pass. Proceeds to polish.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-020
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-020/context.json .romantic-fantasy-writer/stories/test-book-020/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
