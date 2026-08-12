# TEST-019: Coordinator routing drafting creative-writing

**Priority**: P1  
**Category**: coordinator-routing

## Description

Drafting-coordinator dispatches creative-writing-coordinator and quality-integration-coordinator for chapter 1.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-019
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-019/context.json .romantic-fantasy-writer/stories/test-book-019/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
