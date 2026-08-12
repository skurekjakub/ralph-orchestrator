# TEST-016: Specialist — Geography Builder Creates Map

**Priority**: P2  
**Category**: specialist-behavior  

## Scenario
The geography-builder specialist is invoked to create the world's geography artifact from the story concept.

## Expected Behavior
1. geography-builder reads `story-config.json` and `story-concept.json`
2. Extracts any world hints from the concept
3. Creates `world-bible/geography.json` with regions, landmarks, climate, and terrain
4. Writes status.json as completed

## Setup
1. Bootstrap a story: `./bootstrap.sh test-book-016`
2. Provide a `story-concept.json` with geographic hints
3. Invoke `romantic-fantasy-writer-geography-builder`

## Verification
- [ ] `world-bible/geography.json` exists and is valid JSON
- [ ] Contains at least: regions array, landmarks, climate description
- [ ] Geographic details are consistent with concept world hints
- [ ] geography-builder status.json has `result: "completed"`
