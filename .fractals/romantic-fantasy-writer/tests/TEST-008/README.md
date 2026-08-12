# TEST-008: Per-chapter iteration drafting 5 chapters

**Priority**: P1  
**Category**: per-chapter-iteration

## Description

Drafting-coordinator iterates through 5 chapters sequentially. Each chapter must complete before next starts (INV-012).

## How to Run

1. Bootstrap a test story:
   ```bash
   ./bootstrap.sh test-book-008
   ```

2. Seed the test context:
   ```bash
   cp tests/TEST-008/context.json .romantic-fantasy-writer/stories/test-book-008/story-config.json
   ```

3. Pre-populate any required artifacts listed in `context.json.existingArtifacts`.

4. Invoke the entry-point agent and observe routing behavior.

5. Compare final state against `expected-status.json`.

## Verification Criteria

- Compare orchestrator/coordinator status.json files against expected-status.json
- Verify artifact existence and structure against schemas/
- Check manifest.json for expected agent execution order
