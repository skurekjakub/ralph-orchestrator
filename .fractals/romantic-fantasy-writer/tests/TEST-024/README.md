# TEST-024: Character Auditor Rejection with Depth-3 Cascade Reset

**Priority**: P1  
**Category**: auditor-rejection  

## Scenario
The character-auditor rejects the initial character development output. The character-coordinator must cascade-reset all 7 subordinate agent statuses, then re-dispatch with feedback. On retry, voice parameters must show measurably distinct values per character and the romance arc must have identifiable emotional spine stages.

## Expected Behavior
1. Character-coordinator dispatches core-characters-coordinator → ensemble-coordinator → character-auditor
2. Character-auditor returns `failed` (voice parameters too similar, emotional spine incomplete)
3. Character-coordinator deletes all 7 subordinate status files
4. Character-coordinator re-dispatches with feedback path
5. On retry: voice-designer produces distinctly different parameters per character
6. On retry: romance-arc-designer includes full emotional spine stages per INV-021
7. Character-auditor returns `passed`

## Setup
1. Complete concept and worldbuilding phases
2. Invoke `romantic-fantasy-writer-character-coordinator`
3. Configure character-auditor to return `failed` then `passed`

## Verification
- [ ] Character-coordinator status.json `result == "complete"`, iteration == 2
- [ ] `audit-reports/character/gate.json` has 2 entries (failed then passed)
- [ ] All 7 resetOnRetry statuses were deleted between attempts
- [ ] Feedback artifact path was passed to re-dispatched core-characters-coordinator
- [ ] Voice parameters show measurably distinct values per character
- [ ] Romance arc has identifiable emotional spine stages matching INV-021
- [ ] No stale status.json files from first attempt remain
