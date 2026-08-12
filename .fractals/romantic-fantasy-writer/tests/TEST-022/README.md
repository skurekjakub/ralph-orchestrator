# TEST-022: Delivered-with-Gaps — Polish Coordinator Blocked

**Priority**: P0  
**Category**: coordinator-routing  

## Scenario
All creative phases complete successfully through beta-reading. When the orchestrator dispatches the polish-coordinator, the polisher agent blocks (simulating a failure in final polishing). The orchestrator must handle this gracefully by delivering with gaps.

## Expected Behavior
1. Orchestrator dispatches polish-coordinator
2. Polish-coordinator dispatches polisher
3. Polisher blocks (e.g., cannot finalize chapter formatting)
4. Polish-coordinator propagates blocked status
5. Orchestrator detects polish blocked → writes `delivered-with-gaps`
6. Series-kb-manager is NOT dispatched (polish didn't complete)
7. All prior phase statuses remain unchanged in progress.json

## Setup
1. Bootstrap a story with complete phases through beta-reading
2. Set up all coordinator statuses as complete through beta-reading
3. Configure polisher to return blocked
4. Invoke the orchestrator (or resume at polish phase)

## Verification
- [ ] Orchestrator status.json `result == "delivered-with-gaps"`
- [ ] Orchestrator summary contains "Polish incomplete"
- [ ] Polish-coordinator status.json `result == "blocked"`
- [ ] No `agents/series-kb-manager/status.json` exists
- [ ] All phases before polish remain `complete` in progress.json
