# TEST-023: Plotting Auditor Rejection with Sub-Coordinator Cascade

**Priority**: P1  
**Category**: auditor-rejection  

## Scenario
The plotting-auditor rejects the initial plotting output. The plotting-coordinator must cascade-reset all 8 subordinate agent statuses (2 sub-coordinators + 6 specialists), then re-dispatch the entire plotting phase with the auditor's feedback artifact path.

## Expected Behavior
1. Plotting-coordinator dispatches structural-design-coordinator → chapter-design-coordinator → plotting-auditor
2. Plotting-auditor returns `failed` (first entry in gate.json)
3. Plotting-coordinator deletes all 8 subordinate status files
4. Plotting-coordinator re-dispatches with feedback path `audit-reports/plotting/gate.json`
5. All specialists rewrite their artifacts incorporating feedback
6. Plotting-auditor returns `passed` (second entry in gate.json)
7. Plotting-coordinator writes own status as `complete`

## Setup
1. Complete concept, worldbuilding, and character phases
2. Invoke `romantic-fantasy-writer-plotting-coordinator`
3. Configure plotting-auditor to return `failed` on first call, `passed` on second

## Verification
- [ ] Plotting-coordinator status.json `result == "complete"`, iteration == 2
- [ ] `audit-reports/plotting/gate.json` has 2 entries (failed then passed)
- [ ] All 8 resetOnRetry statuses were deleted between attempts
- [ ] structural-design-coordinator received feedback artifact path on retry
- [ ] Final plotting artifacts are internally consistent
- [ ] No stale status.json files from first attempt remain
