# TEST-026: Parallel Beta-Reader Fan-Out with Partial Failure

**Priority**: P1  
**Category**: coordinator-routing  

## Scenario
The beta-reading-coordinator dispatches genre-lens-coordinator and craft-lens-coordinator simultaneously. Within each, readers are dispatched in parallel. One reader (sensitivity-beta-reader) blocks. Tests that partial failure is handled correctly without corrupting completed work.

## Expected Behavior
1. Beta-reading-coordinator dispatches genre-lens and craft-lens simultaneously
2. Genre-lens dispatches romance + fantasy readers in parallel → both complete
3. Craft-lens dispatches craft + sensitivity + originality readers in parallel
4. Sensitivity reader blocks
5. Craft + originality readers complete
6. Craft-lens-coordinator detects partial failure → writes `blocked`
7. Genre-lens-coordinator writes `complete` (independent)
8. Beta-reading-coordinator propagates `blocked` from craft-lens
9. Beta-synthesizer is NOT dispatched (prerequisite not met)

## Setup
1. Complete all phases through revision
2. Provide `chapters/chapter-001-revised.md`
3. Configure sensitivity-beta-reader to return `blocked`
4. Invoke `romantic-fantasy-writer-beta-reading-coordinator`

## Verification
- [ ] Genre-lens and craft-lens dispatched simultaneously
- [ ] Within genre-lens: romance and fantasy dispatched simultaneously
- [ ] Within craft-lens: all 3 readers dispatched simultaneously
- [ ] Genre-lens completed despite craft-lens blocked
- [ ] Craft-lens detected partial failure → `blocked`
- [ ] Beta-reading-coordinator propagated `blocked`
- [ ] Beta-synthesizer NOT dispatched (no status.json)
- [ ] 4 of 5 beta feedback artifacts exist
- [ ] sensitivity-beta-reader status shows `blocked`
- [ ] No data corruption between parallel readers (distinct output paths)
