# TEST-007: Re-entry from gap hunting

**Priority**: P1  
**Category**: re-entry

## Description

Gap-hunting detects missing character detail, orchestrator re-dispatches character-coordinator to fill the gap.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-007
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-007/context.json .romantic-fantasy-writer/stories/test-book-007/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
