# TEST-005: Convergence exhaustion worldbuilding blocked

**Priority**: P0  
**Category**: convergence-exhaustion

## Description

Worldbuilding-auditor rejects 3 times (max retries), coordinator escalates to blocked. Orchestrator halts.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-005
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-005/context.json .romantic-fantasy-writer/stories/test-book-005/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
