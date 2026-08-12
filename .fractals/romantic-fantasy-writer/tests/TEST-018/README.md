# TEST-018: Coordinator routing worldbuilding sub-coordinators

**Priority**: P1  
**Category**: coordinator-routing

## Description

Worldbuilding-coordinator dispatches physical-world-coordinator (3 specialists) and systems-world-coordinator (2 specialists), then runs auditor.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-018
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-018/context.json .romantic-fantasy-writer/stories/test-book-018/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
