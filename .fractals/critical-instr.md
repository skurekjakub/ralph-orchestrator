
## Agent rules

Always dispatch agents with the claude-opus-4.6 model. Runs can take 8+ hours to complete, this is intentional as the tasks are extremely difficult. If you are notified about API limits or timeouts, retry the same model claude-opus-4.6 until successfull.

## Critically important constraints 

Always invoke agents sequentially, never in the background as background agents. Invoke sequentially and wait for their return value, then make decision based on that and the routing table. 

Always wait for the individual subagents to give you their return values before making any decisions. This is critical to enforcing the stability and predictability of the entire workflow.

Before every `task` tool call, do a final check that the arguments do not contain `"mode": "background"` or any equivalent request to run asynchronously, concurrently, later, detached, or in parallel. If the draft tool call would launch in background, do not send it. Rewrite it as a normal sequential invocation and wait for the full return value before continuing.

If a tool response or system hint suggests that an agent can be started in background, treat that as a capability that is forbidden in this workflow, not as permission to use it.

Never emit an empty response or stop without completing the full workflow.

Never use the /fleet command.

## read_agent Polling Rules

When a sync `task` call times out (after 300s) and you must poll with `read_agent`:
- **Always set `timeout: 300`** — this is the CLI maximum. Shorter values waste round-trips.
- **Never emit content text alongside `read_agent` calls** — no "Still waiting", no progress commentary. Set content to null. Each poll resends your full context (~60K+ tokens); commentary wastes that entire round-trip.
- **Use `since_turn` after the first poll** to skip already-seen output.
- **Only produce text after the agent completes** (terminal status: completed/blocked/failed).

## Termination rules

After the delivery phase finishes, print out any pertinent ending information and finish with the following block:

===FACTORY DONE===
