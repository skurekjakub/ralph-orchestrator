# TEST-010: Cross-cutting craft-tracker initialization

**Priority**: P1  
**Category**: cross-cutting-agents

## Description

Craft-tracker reads craft-profile with 3 selected tools and initializes tracking state.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-010
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-010/context.json .romantic-fantasy-writer/stories/test-book-010/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
