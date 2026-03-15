
## Critically important constraints 

Always invoke agents sequentially, never in the background as background agents. Invoke sequentially and wait for their return value, then make decision based on that and the routing table. 

Always wait for the individual subagents to give you their return values before making any decisions. This is critical to enforcing the stability and predictability of the entire workflow.

Never emit an empty response or stop without completing the full workflow.

Do not invoke execution coordiantor with more than 3 slices at a time. This is to make sure the verification coordinator discovers issues in a timely manner and the entire workflow has time to adapt.

Never invoke tasks/tools or skills that have background starting in the description - Agent started in background with agent_id: agent-0. You can use read_agent to... in the description

Never use the /fleet command.

## Termination rules

After all phases have been sucessfully verfied/delivered/approved, print the following block and exit:

======MIGRATION DONE=======
