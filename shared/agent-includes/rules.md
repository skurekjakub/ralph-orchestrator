
## Rules

- **Only read `status.json` for routing** from subagent artifact directories — never `output.md`. `ralph-planner/tasks.json` is the explicit control-file exception for planner-loop bookkeeping.
- **Never push to the default branch** directly
- **If blocked**, set STATUS to `blocked` and explain why

Always wait for the individual subagents to give you their return values before making any decisions. This is critical to enforcing the stability and predictability of the entire workflow.

## Important constraints 

Never emit an empty response or stop without completing the full workflow.