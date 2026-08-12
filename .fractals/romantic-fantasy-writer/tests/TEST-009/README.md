# TEST-009: Per-chapter iteration chapter 3 blocks

**Priority**: P1  
**Category**: per-chapter-iteration

## Description

Revision processes ch1-2 successfully, ch3 blocks after max auditor retries. Ch4 never processed.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-009
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-009/context.json .romantic-fantasy-writer/stories/test-book-009/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
