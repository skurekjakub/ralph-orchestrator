# TEST-017: Specialist — Romance Arc Designer Dual Arc

**Priority**: P2  
**Category**: specialist-behavior  

## Scenario
The romance-arc-designer specialist creates the romance arc design referencing both protagonist profiles.

## Expected Behavior
1. romance-arc-designer reads protagonist-a.json and protagonist-b.json
2. Designs a romance arc with emotional spine stages (per INV-021)
3. Maps conflict points between the two characters
4. Ensures arc reaches at minimum HFN resolution (per INV-001)
5. Writes `characters/romance-arc.json`

## Setup
1. Bootstrap a story: `./bootstrap.sh test-book-017`
2. Provide `characters/protagonist-a.json` and `characters/protagonist-b.json`
3. Invoke `romantic-fantasy-writer-romance-arc-designer`

## Verification
- [ ] `characters/romance-arc.json` exists and is valid JSON
- [ ] References both protagonist IDs
- [ ] Contains emotional spine stages with at least 4 stages
- [ ] Conflict points are present and tied to character wounds/desires
- [ ] Resolution type is HFN or HEA
