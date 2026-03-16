# TEST-001: Happy path full pipeline single chapter

**Priority**: P0  
**Category**: happy-path

## Description

Complete pipeline from concept through delivery for single-chapter story. All 9 coordinators complete successfully. No auditor rejections.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-001
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-001/context.json .romantic-fantasy-writer/stories/test-book-001/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
