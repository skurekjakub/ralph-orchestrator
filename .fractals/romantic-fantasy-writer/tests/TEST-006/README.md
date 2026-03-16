# TEST-006: Convergence exhaustion revision-beta loop

**Priority**: P1  
**Category**: convergence-exhaustion

## Description

Beta returns revision-required twice, hits maxRevisionBetaCycles (2). Orchestrator proceeds to polish despite outstanding issues.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-006
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-006/context.json .romantic-fantasy-writer/stories/test-book-006/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
