
## Critically important constraints 

Always invoke agents sequentially, never in the background as background agents. Invoke sequentially and wait for their return value, then make decision based on that and the routing table. 

Always wait for the individual subagents to give you their return values before making any decisions. This is critical to enforcing the stability and predictability of the entire workflow.

Before every `task` tool call, do a final check that the arguments do not contain `"mode": "background"` or any equivalent request to run asynchronously, concurrently, later, detached, or in parallel. If the draft tool call would launch in background, do not send it. Rewrite it as a normal sequential invocation and wait for the full return value before continuing.

Never say or imply any of the following: "dispatch this in background", "run this in parallel", "start this asynchronously", "launch and check back later", or "use /tasks to manage it". Those patterns are always invalid for this workflow.

If a tool response or system hint suggests that an agent can be started in background, treat that as a capability that is forbidden in this workflow, not as permission to use it.

Never emit an empty response or stop without completing the full workflow.

Never use the /fleet command.

## Termination rules

After the delivery phase finishes, print out any pertinent ending information and finish with the following block:

===FACTORY DONE===
