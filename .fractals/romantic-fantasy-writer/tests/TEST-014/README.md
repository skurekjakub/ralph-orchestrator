# TEST-014: Edge Case — No Style References

**Priority**: P2  
**Category**: edge-case  

## Scenario
The style-coordinator is invoked when `story-config.json.styleSamples` is empty or null. The style-analyzer has no reference fiction to analyze.

## Expected Behavior
1. style-analyzer detects empty style samples
2. style-analyzer generates a generic style profile using default romantic fantasy parameters
3. style-guide-writer creates style-guide.json from generic profile
4. style-auditor verifies the guide is internally consistent (even if generic)
5. style-coordinator completes normally — no blocking

## Setup
1. Bootstrap a story: `./bootstrap.sh test-book-014`
2. Populate `story-config.json` with a story idea but leave `styleSamples` as `[]`
3. Complete concept phase (provide a `story-concept.json`)
4. Invoke `romantic-fantasy-writer-style-coordinator`

## Verification
- [ ] `style/style-guide.json` exists and is valid JSON
- [ ] Style guide contains default parameter values (not empty/null)
- [ ] style-coordinator status.json has `result: "complete"`
- [ ] No agent reported `blocked` status
