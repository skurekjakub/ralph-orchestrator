# TEST-025: Series Sequel Production with Series KB Influence

**Priority**: P1  
**Category**: cross-cutting-agents  

## Scenario
A sequel book is produced. The system must integrate with the existing series knowledge base — reading predecessor data during concept/worldbuilding/character phases and extending it during delivery.

## Expected Behavior
1. Guide validates `story-config.json.sequelOf` and verifies series KB exists
2. concept-developer reads series KB unresolved threads, references them in concept
3. worldbuilding agents extend (not replace) world details, checking for contradictions
4. character agents include returning characters with voice parameters from book 1
5. plotting agents advance or resolve at least one unresolved thread
6. series-kb-manager appends new facts to all series KB files
7. No series KB facts from book 1 are removed (INV-070)

## Setup
1. Complete a full book-1 production first (or seed series KB directly)
2. Bootstrap book-2: `./bootstrap.sh test-book-025 series-001`
3. Configure story-config with `sequelOf: "test-book-001"`
4. Invoke the full pipeline

## Verification
- [ ] Orchestrator status `result == "delivered"`
- [ ] concept.json references `sequelOf` and lists addressed threads
- [ ] World artifacts don't contradict series KB world-facts.json
- [ ] Returning characters have consistent voice parameters
- [ ] At least one unresolved thread advanced or resolved
- [ ] series-kb world-facts.json has new entries appended
- [ ] series-kb unresolved-threads.json shows status changes
- [ ] series-kb timeline.json extends chronologically
- [ ] No facts from book 1 silently removed (INV-070)
