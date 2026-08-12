# TEST-012: Cross-cutting series-kb-manager updates

**Priority**: P1  
**Category**: cross-cutting-agents

## Description

Series-kb-manager reads completed book metadata and updates the series knowledge base.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-012
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-012/context.json .romantic-fantasy-writer/stories/test-book-012/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
