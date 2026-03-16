# TEST-015: Edge case missing chapter outline

**Priority**: P1  
**Category**: edge-case

## Description

Drafting-coordinator has outline for ch1 but not ch2. Ch1 drafts successfully, ch2 blocks due to missing prerequisite (INV-010).

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-015
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-015/context.json .romantic-fantasy-writer/stories/test-book-015/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
