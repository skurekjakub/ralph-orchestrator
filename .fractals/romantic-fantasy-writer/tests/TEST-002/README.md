# TEST-002: Happy path multi-chapter book

**Priority**: P0  
**Category**: happy-path

## Description

Complete pipeline for 3-chapter book with per-chapter iteration through drafting, revision, beta-reading, and polish.

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-002
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-002/context.json .romantic-fantasy-writer/stories/test-book-002/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
